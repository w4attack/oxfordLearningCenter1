const puppeteer = require('puppeteer');
const path = require('path');

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const res = await page.evaluate(() => {
    const de = document.documentElement;
    const out = {};

    out.overflowXhtml = getComputedStyle(de).overflowX;
    out.overflowXbody = getComputedStyle(document.body).overflowX;
    out.bodyWidthRect = Math.round(document.body.getBoundingClientRect().width);
    out.htmlWidthRect = Math.round(de.getBoundingClientRect().width);

    de.scrollLeft = 500;
    out.scrolledAfterSettingHtml = de.scrollLeft;
    window.scrollTo(500, 0);
    out.windowScrollX = window.scrollX;
    document.body.scrollLeft = 500;
    out.bodyScrollLeftAfterSet = document.body.scrollLeft;

    // ищем элементы с фиксированной/непереносимой шириной
    const risky = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const note = [];
      if (cs.whiteSpace === 'nowrap') note.push('nowrap');
      if (cs.minWidth !== '0px' && parseFloat(cs.minWidth) > 40) note.push('min-width:' + cs.minWidth);
      if (cs.width.endsWith('vw')) note.push('width:' + cs.width);
      if (r.width > 360 && el.children.length < 40 && !el.closest('#map') && !el.classList.contains('texture-dark')) {
        note.push('ширина:' + Math.round(r.width));
      }
      if (note.length) risky.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 55), note: note.join(' | ') });
    });
    out.risky = risky.slice(0, 15);

    // проверяем секции: есть ли где-то пустое место (содержимое уже контейнера)
    const gaps = [];
    document.querySelectorAll('section, header, footer, main > div').forEach((sec) => {
      const r = sec.getBoundingClientRect();
      const inner = sec.querySelector(':scope > div');
      if (!inner) return;
      const ir = inner.getBoundingClientRect();
      const leftGap = ir.left - r.left;
      const rightGap = r.right - ir.right;
      if (rightGap > 25 || leftGap > 25) {
        gaps.push({
          sec: sec.tagName.toLowerCase() + (sec.id ? '#' + sec.id : ''),
          secW: Math.round(r.width),
          innerW: Math.round(ir.width),
          leftGap: Math.round(leftGap),
          rightGap: Math.round(rightGap)
        });
      }
    });
    out.gaps = gaps;

    return out;
  });

  console.log('=== Прокрутка вправо ===');
  console.log('  overflow-x у html:', res.overflowXhtml, '| у body:', res.overflowXbody);
  console.log('  ширина body:', res.bodyWidthRect, '| html:', res.htmlWidthRect);
  console.log('  после de.scrollLeft=500 ->', res.scrolledAfterSettingHtml);
  console.log('  после window.scrollTo(500,0) -> window.scrollX =', res.windowScrollX);
  console.log('  после body.scrollLeft=500 ->', res.bodyScrollLeftAfterSet);

  const sticky = await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 3000);
    await new Promise((r) => setTimeout(r, 700));
    const h = document.getElementById('header');
    const top = Math.round(h.getBoundingClientRect().top);
    const pos = getComputedStyle(h).position;
    window.scrollTo(0, 0);
    return { top: top, pos: pos };
  });
  const stickyOk = sticky.pos === 'sticky' && Math.abs(sticky.top) < 2;
  const panBlocked = res.windowScrollX === 0 && res.scrolledAfterSettingHtml === 0;
  console.log('\n=== Sticky-шапка ===');
  console.log('  position:', sticky.pos, '| top после прокрутки 3000px:', sticky.top);
  console.log('  результат:', stickyOk ? 'прилипает к верху — OK' : 'СЛОМАНО');
  console.log('\n=== Блокировка горизонтальной прокрутки ===');
  console.log('  прокрутка вправо заблокирована:', panBlocked);
  if (!stickyOk || !panBlocked) process.exitCode = 1;

  console.log('\n=== Элементы с риском переполнения ===');
  res.risky.forEach((r) => console.log('  ' + r.tag + '.' + r.cls, '->', r.note));

  console.log('\n=== Пустоты по краям секций ===');
  if (!res.gaps.length) console.log('  не найдено');
  res.gaps.forEach((g) => console.log('  ' + g.sec, '| секция:', g.secW, '| внутри:', g.innerW, '| слева:', g.leftGap, '| справа:', g.rightGap));

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
