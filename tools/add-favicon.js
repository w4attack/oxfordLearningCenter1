const fs = require('fs');

const svg = fs.readFileSync('favicon.svg', 'utf8').replace(/\s+/g, ' ').trim();
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

let html = fs.readFileSync('index.html', 'utf8');

if (html.includes('rel="icon"')) {
  console.log('иконки уже подключены, ничего не меняю');
  process.exit(0);
}

const anchor = '<meta name="theme-color" content="#111111">';
if (!html.includes(anchor)) {
  console.error('не нашёл мета-тег theme-color');
  process.exit(1);
}

const block = [
  anchor,
  '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="' + dataUri + '" type="image/svg+xml">'
].join('\n');

html = html.replace(anchor, block);
fs.writeFileSync('index.html', html, 'utf8');

console.log('подключено 2 варианта иконки');
console.log('размер data URI:', dataUri.length, 'символов');