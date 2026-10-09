const fs = require('fs');

const svg = fs.readFileSync('favicon.svg', 'utf8').replace(/\s+/g, ' ').trim();
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

let html = fs.readFileSync('index.html', 'utf8');
const re = /href="data:image\/svg\+xml;base64,[^"]*"/;

if (!re.test(html)) {
  console.error('в index.html нет встроенной иконки');
  process.exit(1);
}

html = html.replace(re, 'href="' + dataUri + '"');
fs.writeFileSync('index.html', html, 'utf8');

console.log('встроенная иконка обновлена, размер data URI:', dataUri.length, 'символов');