const puppeteer = require('puppeteer');
const path = require('path');

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667, dsf: 2 },
  { name: 'iPhone 12/13', width: 390, height: 844, dsf: 3 },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932, dsf: 3 },
  { name: 'Android 360dp', width: 360, height: 800, dsf: 3 },
  { name: 'Android 412dp', width: 412, height: 915, dsf: 2.6 },
  { name: 'iPad mini', width: 768, height: 1024, dsf: 2 }
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  let bad = 0;

  for (const d of DEVICES) {
    const page = await browser.newPage();
    await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: d.dsf, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.evaluate(async () => {
      const html = document.documentElement;
      html.style.scrollBehavior = 'auto';
      let y = 0;
      await new Promise((res) => {
        const step = () => {
          y += window.innerHeight * 0.6;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) setTimeout(step, 100);
          else setTimeout(res, 600);
        };
        step();
      });
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 1200));

    const res = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      const offenders = [];

      function isClipped(el) {
        let p = el.parentElement;
        while (p && p !== document.documentElement) {
          const cs = getComputedStyle(p);
          if (/hidden|clip|auto|scroll/.test(cs.overflowX) || /hidden|clip|auto|scroll/.test(cs.overflowY)) return true;
          if (cs.position === 'fixed') return true;
          p = p.parentElement;
        }
        return false;
      }

      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.visibility === 'hidden') return;
        const overRight = r.right - vw;
        const overLeft = -r.left;
        if (overRight <= 1 && overLeft <= 1) return;
        if (isClipped(el)) return;
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60),
          id: el.id || '',
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
          overRight: Math.round(overRight),
          overLeft: Math.round(overLeft),
          pos: cs.position
        });
      });
      offenders.sort((a, b) => (b.overRight + b.overLeft) - (a.overRight + a.overLeft));
      return {
        innerWidth: window.innerWidth,
        clientWidth: vw,
        docScrollW: de.scrollWidth,
        bodyScrollW: document.body.scrollWidth,
        canScrollX: de.scrollWidth > de.clientWidth,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        offenders: offenders.slice(0, 12)
      };
    });

    // проверяем, что страницу нельзя увести вправо
    const pan = await page.evaluate(() => {
      const de = document.documentElement;
      de.scrollLeft = 600;
      window.scrollTo(600, window.scrollY);
      const x = Math.round(window.scrollX);
      window.scrollTo(0, window.scrollY);
      return { scrollX: x, blocked: x === 0 };
    });

    const overflow = res.docScrollW - res.clientWidth;
    const ok = !res.canScrollX && res.offenders.length === 0 && pan.blocked;
    if (!ok) bad++;

    console.log('\n=== ' + d.name + ' (' + d.width + 'px) === ' + (ok ? 'OK' : 'ПРОБЛЕМА'));
    console.log('  clientWidth:', res.clientWidth, '| docScrollWidth:', res.docScrollW, '| bodyScrollWidth:', res.bodyScrollW);
    console.log('  прокрутка по X:', res.canScrollX, '| сдвиг вправо:', pan.scrollX, '| overflow-x у body:', res.bodyOverflowX);
    if (overflow > 0) console.log('  ВНИМАНИЕ: документ шире экрана на', overflow, 'px');
    if (res.offenders.length) {
      console.log('  элементы за границей экрана (не обрезанные):');
      res.offenders.forEach((o) => {
        console.log('    ' + o.tag + (o.id ? '#' + o.id : '') + (o.cls ? '.' + o.cls.split(' ').slice(0, 3).join('.') : ''),
          '| left:', o.left, 'right:', o.right, 'w:', o.w,
          '| вылезает: +' + o.overRight + '/-' + o.overLeft, '| position:', o.pos);
      });
    } else {
      console.log('  непокрытых элементов за границей экрана: нет');
    }
    await page.close();
  }

  await browser.close();
  console.log('\n' + (DEVICES.length - bad) + '/' + DEVICES.length + ' устройств без горизонтального выхода за экран');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
