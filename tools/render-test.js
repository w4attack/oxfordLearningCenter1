const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const outDir = path.resolve(__dirname, '..', '.preview');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false }
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--allow-file-access-from-files', '--no-sandbox'] });
  const report = {};

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate(async () => {
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      await new Promise((resolve) => {
        let y = 0;
        const step = () => {
          y += window.innerHeight * 0.6;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) setTimeout(step, 120);
          else { window.scrollTo(0, 0); setTimeout(resolve, 700); }
        };
        step();
      });
      html.style.scrollBehavior = prev;
    });
    await new Promise((r) => setTimeout(r, 800));

    const data = await page.evaluate(() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const bg = (sel) => { const el = document.querySelector(sel); return el ? cs(el).backgroundColor : 'MISSING'; };
      const fg = (sel) => { const el = document.querySelector(sel); return el ? cs(el).color : 'MISSING'; };
      const hidden = [...document.querySelectorAll('.reveal')].filter((e) => cs(e).opacity !== '1').length;
      const doc = document.documentElement;
      return {
        title: document.title,
        lang: document.documentElement.lang,
        bodyBg: cs(document.body).backgroundColor,
        bodyFont: cs(document.body).fontFamily.split(',')[0],
        headerBg: bg('#header'),
        heroBg: bg('section'),
        leadCardBg: bg('#lead-form > div'),
        whySectionBg: bg('#why'),
        whyCardBg: bg('#why article'),
        courseSectionBg: bg('#courses'),
        ctaBg: bg('main section:last-of-type'),
        ctaCardBg: bg('main section:last-of-type > div > div'),
        footerBg: bg('footer'),
        h1Color: fg('h1'),
        h1Font: cs(document.querySelector('h1')).fontFamily.split(',')[0],
        ribbonBg: bg('.promo-ribbon'),
        staticTagCursor: cs(document.querySelector('.static-tag')).cursor,
        staticTagTag: document.querySelector('.static-tag').tagName,
        staticTagHasLink: !!document.querySelector('.static-tag a, a.static-tag'),
        enrollButtons: [...document.querySelectorAll('.enroll')].map((a) => ({ tag: a.tagName, href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 40) })),
        leafletLoaded: typeof L !== 'undefined',
        mapTiles: document.querySelectorAll('#map img.leaflet-tile').length,
        tilesReal: [...document.querySelectorAll('#map img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 100).length,
        tilesBlank: [...document.querySelectorAll('#map img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth <= 100).length,
        mapCls: document.getElementById('map').className,
        tileFilter: getComputedStyle(document.querySelector('#map .leaflet-tile-pane')).filter,
        styleBtns: [...document.querySelectorAll('.map-style-btn')].map((b) => b.textContent + (b.classList.contains('is-active') ? '*' : '')),
        mapBg: cs(document.getElementById('map')).backgroundColor,
        markerPresent: !!document.querySelector('.map-pin'),
        attribution: (document.querySelector('.leaflet-control-attribution') || {}).textContent || 'MISSING',
        osmWatermark: document.body.innerHTML.includes('openstreetmap.org/export/embed'),
        revealsNotVisible: hidden,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
        widest: [...document.querySelectorAll('body *')]
          .map((e) => ({ w: Math.round(e.getBoundingClientRect().width), r: e.getBoundingClientRect().right, tag: e.tagName + '.' + (e.className || '').toString().slice(0, 40) }))
          .filter((o) => o.r > doc.clientWidth + 2)
          .slice(0, 6)
      };
    });

    data.errors = errors;
    data.horizontalOverflowPx = data.scrollWidth - data.clientWidth;

    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(outDir, vp.name + '.png'), fullPage: false });
    await page.screenshot({ path: path.join(outDir, vp.name + '-full.png'), fullPage: true });

    await page.evaluate(() => document.getElementById('location').scrollIntoView());
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(outDir, vp.name + '-map-dark.png') });
    await page.click('.map-style-btn[data-map-style="satellite"]');
    await new Promise((r) => setTimeout(r, 2500));
    data.satellite = await page.evaluate(() => ({
      cls: document.getElementById('map').className,
      real: [...document.querySelectorAll('#map img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 100).length,
      filter: getComputedStyle(document.querySelector('#map .leaflet-tile-pane')).filter,
      attr: document.querySelector('.leaflet-control-attribution').textContent,
      status: document.getElementById('map-status-text').textContent
    }));
    await page.screenshot({ path: path.join(outDir, vp.name + '-map-satellite.png') });
    await page.click('.map-style-btn[data-map-style="light"]');
    await new Promise((r) => setTimeout(r, 2500));
    data.light = await page.evaluate(() => ({
      cls: document.getElementById('map').className,
      real: [...document.querySelectorAll('#map img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 100).length,
      filter: getComputedStyle(document.querySelector('#map .leaflet-tile-pane')).filter,
      status: document.getElementById('map-status-text').textContent,
      loadingHidden: document.getElementById('map-loading').classList.contains('is-hidden')
    }));
    await page.screenshot({ path: path.join(outDir, vp.name + '-map-light.png') });

    report[vp.name] = data;
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
