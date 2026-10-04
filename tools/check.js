const fs = require('fs');
const t = fs.readFileSync('index.html', 'utf8');
const count = (re) => (t.match(re) || []).length;

const checks = {
  placeholder_left: t.includes('assets/app.css'),
  style_app_css: t.includes('<style id="app-css">'),
  no_tailwind_cdn: !t.includes('cdn.tailwindcss.com'),
  texture_dark_css: /\.texture-dark\{/.test(t),
  btn_burgundy_css: /\.btn-burgundy\{/.test(t),
  btn_gold_css: /\.btn-gold\{/.test(t),
  static_tag_css: /\.static-tag\{/.test(t),
  map_css: /#map\{/.test(t),
  leaflet_container_css: /\.leaflet-container\{/.test(t),
  crest_frame_css: /\.crest-frame\{/.test(t),
  bg_ink_rule: /\.bg-ink\{/.test(t),
  bg_cream_rule: /\.bg-cream\{/.test(t),
  font_display_css: /\.font-display\{/.test(t),
  h1_ok: t.includes('Учебный центр'),
  addr_ok: t.includes('Буюк Ипак йўли, 3'),
  tel_links: count(/tel:\+998951959195/g),
  coords_shown: t.includes('41.326273, 69.327321'),
  coords_js: t.includes('CENTER = [41.326273, 69.327321]'),
  leaflet_cdn: t.includes('leaflet@1.9.4'),
  carto_dark: t.includes('basemaps.cartocdn.com/dark_all'),
  osm_iframe_gone: !t.includes('openstreetmap.org/export/embed'),
  static_tags: count(/class="static-tag/g),
  static_tag_has_icon: /static-tag[^"]*"><i/.test(t),
  courses: ['Английский язык', 'IELTS 7.0+', 'Rus tili', 'CEFR'].every((c) => t.includes('>' + c + '<')),
  socials: t.includes('instagram.com/oxford_learning_centre') && t.includes('tiktok.com/@oxford_learning_centre'),
  tg_slot: t.includes('LEAD_CONFIG') && t.includes('endpoint'),
  discount_10: count(/>[^<]*10%/g),
  fake_contacts: /tel:\+1[0-9]{5}|\+12345/.test(t),
  ends_html: t.trimEnd().endsWith('</html>'),
  size_kb: Math.round(Buffer.byteLength(t) / 1024)
};

for (const [k, v] of Object.entries(checks)) console.log(k.padEnd(24), v);
