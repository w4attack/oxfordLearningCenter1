const puppeteer = require('puppeteer');
const path = require('path');

const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

const log = [];
const ok = (n, v, extra) => log.push((v ? 'PASS ' : 'FAIL ') + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));

  ok('1. mobile burger opens menu', await page.evaluate(() => {
    document.getElementById('burger').click();
    return !document.getElementById('mobile-menu').classList.contains('hidden');
  }));

  ok('2. burger aria-expanded=true', await page.evaluate(() => document.getElementById('burger').getAttribute('aria-expanded') === 'true'));

  ok('3. menu link closes menu', await page.evaluate(() => {
    document.querySelector('#mobile-menu a[href="#why"]').click();
    return document.getElementById('mobile-menu').classList.contains('hidden');
  }));

  ok('4. empty submit blocked + toast shown', await page.evaluate(async () => {
    document.getElementById('lead').requestSubmit();
    await new Promise((r) => setTimeout(r, 150));
    return document.querySelectorAll('#toasts .toast').length > 0 && document.getElementById('lead-ok').classList.contains('show') === false;
  }));

  ok('5. bad phone blocked', await page.evaluate(async () => {
    document.getElementById('name').value = 'Азиз';
    document.getElementById('name').dispatchEvent(new Event('input'));
    document.getElementById('phone').value = '+998 90 123';
    document.getElementById('phone').dispatchEvent(new Event('input'));
    document.getElementById('lead').requestSubmit();
    await new Promise((r) => setTimeout(r, 150));
    return document.getElementById('phone').classList.contains('field-error') && !document.getElementById('lead-ok').classList.contains('show');
  }));

  const phoneVal = await page.evaluate(() => {
    const p = document.getElementById('phone');
    p.value = '951959195';
    p.dispatchEvent(new Event('input'));
    return p.value;
  });
  ok('6. phone mask formats', phoneVal === '+998 95 195 91 95', phoneVal);

  ok('7. course card prefills select', await page.evaluate(() => {
    document.querySelector('.enroll[data-enroll="IELTS 7.0+"]').click();
    return document.getElementById('course').value;
  }));

  ok('8. valid submit shows success', await page.evaluate(async () => {
    const p = document.getElementById('phone');
    p.value = '+998 95 195 91 95';
    p.dispatchEvent(new Event('input'));
    document.getElementById('lead').requestSubmit();
    await new Promise((r) => setTimeout(r, 1400));
    return document.getElementById('lead-ok').classList.contains('show') && document.getElementById('lead').style.display === 'none';
  }));

  ok('9. honeypot field hidden', await page.evaluate(() => {
    const w = document.querySelector('input[name="website"]');
    return w.classList.contains('hidden') && w.getAttribute('tabindex') === '-1';
  }));

  ok('10. to-top appears after scroll', await page.evaluate(async () => {
    window.scrollTo(0, 3000);
    await new Promise((r) => setTimeout(r, 400));
    return document.getElementById('to-top').classList.contains('show');
  }));

  ok('11. no JS errors', errors.length === 0, errors);

  console.log(log.join('\n'));
  const failed = log.filter((l) => l.startsWith('FAIL')).length;
  console.log('\n' + (log.length - failed) + '/' + log.length + ' passed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
