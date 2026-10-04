const puppeteer = require('puppeteer');
const path = require('path');
const { PNG } = require('pngjs');

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// Калибровка по замерам реальных тайлов OSM в районе Ташкента:
// OSM main/DE/Fr -> 24-38 границ на пиксель, 28-36% насыщенных цветов
// CyclOSM -> 24-33 / 7-12%, HOT -> 14-24 / 9-11%, Esri Street (пусто) -> пусто
const MIN_EDGES = 12;
const MIN_COLOR_LIGHT = 20;
const MIN_COLOR_DARK = 12;
const SATELLITE_COLOR_CEIL = 9;

// Метрика должна работать и для светлой карты, и для тёмной (инверсия меняет яркость),
// поэтому цвет считаем по насыщенности без порога яркости.
function analyze(buf) {
  const png = PNG.sync.read(buf);
  let edges = 0, n = 0, colored = 0;
  for (let y = 1; y < png.height - 1; y += 2) {
    for (let x = 1; x < png.width - 1; x += 2) {
      const i = (y * png.width + x) * 4;
      const L = (p) => 0.2126 * png.data[p] + 0.7152 * png.data[p + 1] + 0.0722 * png.data[p + 2];
      const c = L(i);
      edges += Math.abs(c - L(i + 4)) + Math.abs(c - L(i + png.width * 4)) + Math.abs(c - L(i + 4 + png.width * 4));
      n++;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn > 45) colored++;
    }
  }
  return {
    edges: Math.round((edges / n) * 10) / 10,
    colorPct: Math.round((colored / n) * 1000) / 10
  };
}

const log = [];
const ok = (name, pass, extra) => {
  log.push((pass ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
  return pass;
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // временные сетевые сбои загрузки ресурсов — не ошибки скриптов
    if (/ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|Failed to load resource/i.test(t)) return;
    errors.push('console: ' + t);
  });

  // ждём появления слоя тайлов Leaflet, чтобы не зависеть от скорости сети
  const waitForTiles = async (label) => {
    try {
      await page.waitForFunction(() => {
        const p = document.querySelector('#map .leaflet-tile-pane');
        return !!p && document.querySelectorAll('#map img.leaflet-tile').length > 0;
      }, { timeout: 30000, polling: 500 });
      return true;
    } catch (e) {
      log.push('FAIL ' + label + ' -> слой тайлов не появился за 30 с');
      return false;
    }
  };

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => document.getElementById('location').scrollIntoView());
  if (!(await waitForTiles('тайлы загрузились'))) {
    console.log(log.join('\n'));
    await browser.close();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2500));

  const shell = await page.$('.map-shell');

  const state = await page.evaluate(() => ({
    status: (document.getElementById('map-status-text') || {}).textContent || '',
    attr: (document.querySelector('.leaflet-control-attribution') || {}).textContent || '',
    activeBtn: (document.querySelector('.map-style-btn.is-active') || {}).textContent || 'нет',
    tiles: document.querySelectorAll('#map img.leaflet-tile').length,
    filter: getComputedStyle(document.querySelector('#map .leaflet-tile-pane')).filter,
    urls: [...document.querySelectorAll('#map img.leaflet-tile')].slice(0, 2).map((i) => i.src)
  }));

  ok('источник по умолчанию — OpenStreetMap', /openstreetmap/i.test(state.attr), state.attr.trim());
  ok('стиль Тёмная активна', state.activeBtn.trim() === 'Тёмная', state.activeBtn);
  ok('применён фильтр инверсии', /invert\(1\)/.test(state.filter), state.filter);
  ok('тайлы загружены', state.tiles > 4, state.tiles);

  const calibration = {};
  calibration.darkZ18 = analyze(await shell.screenshot({ type: 'png' }));
  await page.screenshot({ path: path.join(path.resolve(__dirname, '..', '.preview'), 'labels-z18.png') });

  const zoomOut = await page.evaluate(async () => {
    document.getElementById('map')._leaflet_mapRef = null;
    return null;
  });

  const setZoom = async (z) => {
    await page.evaluate((zz) => {
      const c = document.querySelector('#map');
      const ev = new WheelEvent('wheel', { deltaY: 0, clientX: 300, clientY: 300, bubbles: true });
      void ev;
      return null;
    }, z);
  };
  void zoomOut; void setZoom;

  await page.evaluate(() => {
    const map = window.__olcMap;
    if (map) map.setZoom(5);
  });
  await new Promise((r) => setTimeout(r, 4000));
  const far = await page.evaluate(() => ({
    zoom: (window.__olcMap && window.__olcMap.getZoom()) || null,
    tiles: document.querySelectorAll('#map img.leaflet-tile').length
  }));
  ok('отдаление до z5 работает (страна/город)', far.zoom === 5 && far.tiles > 0, far);
  await page.screenshot({ path: path.join(path.resolve(__dirname, '..', '.preview'), 'labels-z5.png') });

  await page.evaluate(() => { if (window.__olcMap) window.__olcMap.setZoom(20); });
  await new Promise((r) => setTimeout(r, 5000));
  const deep = await page.evaluate(() => ({
    zoom: (window.__olcMap && window.__olcMap.getZoom()) || null,
    tiles: document.querySelectorAll('#map img.leaflet-tile').length,
    maxSrcZ: Math.max(...[...document.querySelectorAll('#map img.leaflet-tile')].map((i) => {
      const m = i.src.match(/\/(\d+)\/\d+\/\d+\.png/);
      return m ? +m[1] : 0;
    }))
  }));
  ok('зум до z20 без запроса несуществующих тайлов', deep.maxSrcZ <= 20, deep);
  const deepShot = analyze(await shell.screenshot({ type: 'png' }));
  ok('z20: нет серой пустой плитки', deepShot.edges >= 6 && deepShot.colorPct >= 1, deepShot);
  await page.screenshot({ path: path.join(path.resolve(__dirname, '..', '.preview'), 'labels-z20.png') });

  await page.evaluate(() => { if (window.__olcMap) window.__olcMap.setZoom(18); });
  await new Promise((r) => setTimeout(r, 3500));
  await page.click('.map-style-btn[data-map-style="light"]');
  await new Promise((r) => setTimeout(r, 3000));
  await waitForTiles('стиль Светлая переключился');
  await new Promise((r) => setTimeout(r, 2000));
  const light = await page.evaluate(() => ({
    status: document.getElementById('map-status-text').textContent,
    filter: getComputedStyle(document.querySelector('#map .leaflet-tile-pane')).filter,
    attr: document.querySelector('.leaflet-control-attribution').textContent
  }));
  ok('стиль Светлая: OSM без фильтра', /openstreetmap/i.test(light.attr) && (light.filter === 'none' || light.filter === ''), light);
  calibration.lightZ18 = analyze(await shell.screenshot({ type: 'png' }));
  await page.screenshot({ path: path.join(path.resolve(__dirname, '..', '.preview'), 'labels-light.png') });

  await page.click('.map-style-btn[data-map-style="satellite"]');
  await new Promise((r) => setTimeout(r, 3000));
  await waitForTiles('стиль Спутник переключился');
  await new Promise((r) => setTimeout(r, 2000));
  const sat = await page.evaluate(() => ({
    status: document.getElementById('map-status-text').textContent,
    filter: getComputedStyle(document.querySelector('#map .leaflet-tile-pane')).filter,
    tiles: document.querySelectorAll('#map img.leaflet-tile').length,
    maxSrcZ: Math.max(...[...document.querySelectorAll('#map img.leaflet-tile')].map((i) => {
      const m = i.src.match(/\/(\d+)\/\d+\/\d+(?:\.png)?$/);
      return m ? +m[1] : 0;
    }))
  }));
  ok('стиль Спутник: Esri, тайлы грузятся', sat.tiles > 0, sat);
  ok('спутник не запрашивает z20+ (нет заглушки)', sat.maxSrcZ <= 19, sat);
  calibration.satelliteZ18 = analyze(await shell.screenshot({ type: 'png' }));
  await page.screenshot({ path: path.join(path.resolve(__dirname, '..', '.preview'), 'labels-satellite.png') });

  ok('нет ошибок JS', errors.length === 0, errors);

  ok('ПОДПИСИ: тёмная карта не беднее светлой', calibration.darkZ18.edges >= calibration.lightZ18.edges * 0.7, calibration);
  ok('ПОДПИСИ: детализация линий и подписей выше порога', calibration.lightZ18.edges >= MIN_EDGES && calibration.darkZ18.edges >= MIN_EDGES, calibration);
  ok('ПОДПИСИ: цветные иконки POI (светлая)', calibration.lightZ18.colorPct >= MIN_COLOR_LIGHT, calibration.lightZ18);
  ok('ПОДПИСИ: цветные иконки POI (тёмная)', calibration.darkZ18.colorPct >= MIN_COLOR_DARK, calibration.darkZ18);
  ok('МЕТРИКА ОТКАЛИБРОВАНА: спутник без подписей не проходит порог', calibration.satelliteZ18.colorPct < SATELLITE_COLOR_CEIL, calibration.satelliteZ18);

  console.log(log.join('\n'));
  const failed = log.filter((l) => l.startsWith('FAIL')).length;
  console.log('\n' + (log.length - failed) + '/' + log.length + ' passed');
  console.log('\nКАЛИБРОВКА МЕТРИКИ (z18):');
  console.log('  светлая OSM :', JSON.stringify(calibration.lightZ18));
  console.log('  тёмная OSM  :', JSON.stringify(calibration.darkZ18));
  console.log('  спутник Esri:', JSON.stringify(calibration.satelliteZ18), '(без подписей — баг-эталон)');
  console.log('  пороги      : edges >=', MIN_EDGES, ', colorPct: светлая >=', MIN_COLOR_LIGHT + '%', ', тёмная >=', MIN_COLOR_DARK + '%', ', спутник <', SATELLITE_COLOR_CEIL + '%');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
