const puppeteer = require('puppeteer');
const { PNG } = require('pngjs');
const path = require('path');

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

function makeBlockedBanner() {
  const png = new PNG({ width: 256, height: 256 });
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (256 * y + x) << 2;
      const border = x < 3 || y < 3 || x > 252 || y > 252;
      let v = 245;
      if (border) v = 150;
      else if (y > 112 && y < 122 && x > 60 && x < 196) v = 70;
      else if (y > 132 && y < 139 && x > 74 && x < 182) v = 110;
      else if (y > 146 && y < 153 && x > 84 && x < 172) v = 110;
      png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const BANNER = makeBlockedBanner();

function analyze(buf) {
  const png = PNG.sync.read(buf);
  const colors = new Set();
  let nonWhite = 0, total = 0;
  for (let i = 0; i < png.data.length; i += 4 * 13) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    colors.add((r >> 3) + ',' + (g >> 3) + ',' + (b >> 3));
    total++;
    if (r < 235 || g < 235 || b < 235) nonWhite++;
  }
  return { colors: colors.size, inkRatio: nonWhite / total };
}

async function scenario(browser, name, blockPatterns, expect) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  if (blockPatterns.length) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (blockPatterns.some((p) => u.includes(p))) {
        req.respond({
          status: 200,
          contentType: 'image/png',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: BANNER
        });
      } else {
        req.continue();
      }
    });
  }

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => document.getElementById('location').scrollIntoView());
  await new Promise((r) => setTimeout(r, 6000));

  const el = await page.$('.map-shell');
  let verdict = { colors: 0, inkRatio: 0 };
  if (el) {
    const shot = await el.screenshot({ type: 'png' });
    verdict = analyze(shot);
  }

  const state = await page.evaluate(() => ({
    status: (document.getElementById('map-status-text') || {}).textContent || '',
    statusError: !!(document.getElementById('map-status') || {}).classList?.contains('is-error'),
    activeBtn: (document.querySelector('.map-style-btn.is-active') || {}).textContent || 'нет',
    tiles: document.querySelectorAll('#map img.leaflet-tile').length,
    marker: !!document.querySelector('.map-pin'),
    fallback: !!document.querySelector('.map-fallback'),
    toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent.trim())
  }));

  // Баннер = равномерная светлая картинка с малым количеством краски
  const looksLikeBanner = verdict.colors < 30 && verdict.inkRatio > 0.02 && verdict.inkRatio < 0.3;

  console.log('\n=== ' + name + ' ===');
  console.log('  блокируется       :', blockPatterns.join(', ') || '—');
  console.log('  статус            :', state.status, state.statusError ? '(ОШИБКА)' : '');
  console.log('  активный стиль    :', state.activeBtn);
  console.log('  тайлов на карте   :', state.tiles);
  console.log('  маркер            :', state.marker);
  console.log('  запасной блок     :', state.fallback);
  console.log('  цветов в карте    :', verdict.colors, '| доля краски:', (verdict.inkRatio * 100).toFixed(1) + '%');
  console.log('  баннер на экране  :', looksLikeBanner ? 'ДА (БАГ)' : 'нет');
  console.log('  тосты             :', state.toasts.length ? JSON.stringify(state.toasts) : '—');
  console.log('  ошибки JS         :', errors.length ? errors.join('; ') : 'нет');

  const results = {
    banner_visible: looksLikeBanner,
    fallback_shown: state.fallback,
    has_tiles: state.tiles > 0,
    marker: state.marker,
    js_errors: errors
  };
  const pass = expect(results);
  console.log('  ИТОГ              :', pass ? 'PASS' : 'FAIL');
  await page.close();
  return { pass, results };
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  console.log('\n' + '='.repeat(60));
  console.log('ПРОВАЙДЕРЫ ТАЙЛОВ, КОТОРЫЕ БЛОКИРУЕМ В ТЕСТЕ:');
  console.log('  services.arcgisonline.com');
  console.log('  tile.openstreetmap.org');
  console.log('  tile.openstreetmap.de');
  console.log('  tile-cyclosm.openstreetmap.fr');
  console.log('  tile.openstreetmap.fr');
  console.log('='.repeat(60));

  const ALL_HOSTS = [
    'services.arcgisonline.com',
    'tile.openstreetmap.org',
    'tile.openstreetmap.de',
    'tile-cyclosm.openstreetmap.fr',
    'tile.openstreetmap.fr'
  ];

  const all = [];

  all.push(await scenario(browser, 'A. Ничего не блокируется (обычная работа)', [], (r) => !r.banner_visible && r.has_tiles && r.marker && !r.fallback_shown && r.js_errors.length === 0));

  all.push(await scenario(browser, 'B. Только OSM main заблокирован (ваш прошлый случай)', ['tile.openstreetmap.org'], (r) => !r.banner_visible && r.has_tiles && r.marker && !r.fallback_shown && r.js_errors.length === 0));

  all.push(await scenario(browser, 'C. Основное зеркало OSM DE заблокировано', ['tile.openstreetmap.de'], (r) => !r.banner_visible && r.has_tiles && !r.fallback_shown && r.js_errors.length === 0));

  all.push(await scenario(browser, 'D. Три зеркала OSM заблокированы', ['tile.openstreetmap.org', 'tile.openstreetmap.de', 'tile.openstreetmap.fr/osmfr'], (r) => !r.banner_visible && !r.fallback_shown && r.js_errors.length === 0));

  all.push(await scenario(browser, 'E. ВСЕ источники OSM заблокированы -> уход на Esri', ['tile.openstreetmap.org', 'tile.openstreetmap.de', 'tile.openstreetmap.fr', 'tile-cyclosm.openstreetmap.fr'], (r) => !r.banner_visible && !r.fallback_shown && r.js_errors.length === 0));

  all.push(await scenario(browser, 'F. ВСЕ источники заблокированы -> запасной блок', ALL_HOSTS, (r) => !r.banner_visible && r.fallback_shown && r.js_errors.length === 0));

  all.push(await scenario(browser, 'G. Баннер на ВСЕХ тайлах (жёсткий блок)', ALL_HOSTS, (r) => !r.banner_visible && r.fallback_shown && r.js_errors.length === 0));

  await browser.close();
  const failed = all.filter((a) => !a.pass).length;
  console.log('\n' + (all.length - failed) + '/' + all.length + ' сценариев прошли');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
