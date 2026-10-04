const fs = require('fs');
const css = fs.readFileSync('dist/app.css', 'utf8');
const names = [
  'texture-dark', 'heraldic-line', 'crest-frame', 'crest-frame-light', 'crest-frame-glass',
  'promo-ribbon', 'badge-british', 'badge-british-light', 'card-heraldic', 'static-tag',
  'reveal', 'is-visible', 'divider-crest', 'field-focus', 'field-error', 'form-ok',
  'to-top', 'toast', 'toast-wrap', 'btn-gold', 'btn-burgundy', 'nav-scrolled',
  '#map', 'map-shell', 'leaflet-container', 'leaflet-control-attribution', 'leaflet-bar',
  'leaflet-popup-content-wrapper', 'map-pin', 'map-pin-ring', 'map-pin-pulse', 'map-fallback-pin', 'pin-pulse'
];
for (const n of names) {
  const re = new RegExp('(\\.?' + n.replace('#', '\\#').replace(':', '\\:') + ')\\s*[,{]');
  console.log(re.test(css) ? 'OK   ' : 'LOST ', n);
}
