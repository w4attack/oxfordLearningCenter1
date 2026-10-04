const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'dist', 'app.css');
const marker = '<link rel="stylesheet" href="assets/app.css">';

if (!fs.existsSync(cssPath)) {
  console.error('Нет dist/app.css — сначала выполните: npx tailwindcss -c tailwind.config.js -i src/input.css -o dist/app.css --minify');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8').trim();

const re = new RegExp(
  marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|<style id="app-css">[\\s\\S]*?<\\/style>'
);

if (!re.test(html)) {
  console.error('В index.html не найден плейсхолдер ' + marker);
  process.exit(1);
}

html = html.replace(re, '<style id="app-css">\n' + css + '\n</style>');
fs.writeFileSync(htmlPath, html, 'utf8');

console.log('CSS встроен в index.html (' + Math.round(css.length / 1024) + ' КБ)');
