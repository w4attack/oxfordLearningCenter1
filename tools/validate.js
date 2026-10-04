const fs = require('fs');
const { parse } = require('node-html-parser');

const t = fs.readFileSync('index.html', 'utf8');
const root = parse(t, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const stack = [];
const problems = [];

(function walk(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === 1) {
      const tag = child.rawTagName.toLowerCase();
      if (VOID.has(tag)) continue;
      stack.push(tag);
      walk(child);
      const last = stack.pop();
      if (last !== tag) problems.push('mismatch: opened <' + tag + '> but closed </' + last + '>');
    }
  }
})(root);

if (stack.length) problems.push('unclosed: ' + stack.join(' > '));

const styleTags = root.querySelectorAll('style');
const css = styleTags.length ? styleTags[0].innerHTML : '';
let depth = 0, minDepth = 0;
for (const ch of css) {
  if (ch === '{') depth++;
  if (ch === '}') depth--;
  if (depth < minDepth) minDepth = depth;
}

const ids = root.querySelectorAll('[id]').map((n) => n.getAttribute('id'));
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);

const anchors = root.querySelectorAll('a[href^="#"]').map((a) => a.getAttribute('href'));
const brokenAnchors = anchors.filter((h) => h !== '#' && !ids.includes(h.slice(1)));

const classes = new Set();
root.querySelectorAll('[class]').forEach((n) => n.getAttribute('class').split(/\s+/).forEach((c) => c && classes.add(c)));
const cssHas = (c) => css.includes('.' + c) || css.includes('\\' + c);

const noAriaButtons = root.querySelectorAll('[onclick]').length;

console.log('structure      :', problems.length ? 'PROBLEMS -> ' + problems.join(' | ') : 'OK');
console.log('style tags     :', styleTags.length);
console.log('css braces     :', depth === 0 && minDepth === 0 ? 'balanced' : `UNBALANCED depth=${depth} min=${minDepth}`);
console.log('css size kb    :', Math.round(css.length / 1024));
console.log('ids            :', ids.length, dupIds.length ? 'DUPLICATES -> ' + dupIds.join(',') : 'unique');
console.log('anchor links   :', anchors.length, brokenAnchors.length ? 'BROKEN -> ' + brokenAnchors.join(',') : 'all resolve');
console.log('inline onclick :', noAriaButtons);
console.log('sections       :', root.querySelectorAll('section').length);
console.log('html lang      :', root.getAttribute('lang'));
console.log('charset        :', root.querySelector('meta[charset]') ? 'present' : 'MISSING');
console.log('viewport       :', root.querySelector('meta[name=viewport]') ? 'present' : 'MISSING');
