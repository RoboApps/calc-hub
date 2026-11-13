// Statický generátor jazykových verzií calc-hub.eu (bez závislostí, beží na Vercel pri nasadení).
// Zdroj: *.html v koreni repozitára. Výstup: dist/ (angličtina v koreni, ostatné jazyky v /sk/ /de/ /cs/ /pl/ /fr/ /es/).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, OUT = path.join(ROOT, 'dist'), SITE = 'https://calc-hub.eu/';
const LANGS = ['en', 'sk', 'de', 'cs', 'pl', 'fr', 'es'], ALT = LANGS.filter(l => l !== 'en');
const SKIP = new Set(['dist', 'node_modules', '.git', '.vercel', 'build.js', 'package.json', 'package-lock.json', 'vercel.json', 'sitemap.xml', 'sitemap-urls.xml', '.gitignore', '.DS_Store', ...ALT]);
const ADS = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7136183336732732" crossorigin="anonymous"></script>';
const AUTOLANG = `<script>try{if(!document.referrer.includes(location.host)&&location.pathname==='/'&&!location.search){var l=(navigator.language||'').slice(0,2);if(['sk','de','cs','pl','fr','es'].includes(l))location.replace('/'+l+'/')}}catch(e){}</script>`; // len úvodná anglická stránka: presmeruje podľa jazyka prehliadača, ak návštevník neprišiel z nášho webu
const addAds = h => h.includes('</head>') ? h.replace(/<script\b[^>]*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^>]*>\s*<\/script>\s*/g, '').replace('</head>', ADS + '\n</head>') : h; // odstráni prípadný vlastný/chybný zápis a vloží jeden správny
const errors = [], warns = [], emptyData = new Set();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => esc(s).replace(/"/g, '&quot;');

function grab(s, start) { // vyberie vyvážený {...} objekt
  let d = 0, q = null, e = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return s.slice(start, i + 1);
  }
  return null;
}
const getObj = (s, key) => { const i = s.indexOf(key); if (i < 0) return null; const o = grab(s, i + key.length - 1); return o && vm.runInNewContext('(' + o + ')'); };
const urlOf = (name, l) => SITE + (l === 'en' ? '' : l + '/') + (name === 'index.html' ? '' : name);
const lastScript = h => { let m, r = null; const re = /<script>([\s\S]*?)<\/script>/g; while ((m = re.exec(h))) r = m; return r; };

class El { constructor() { this.style = {}; this.dataset = {}; this.value = ''; this._h = undefined; this._t = undefined; this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } }; }
  set innerHTML(v) { this._h = v; } get innerHTML() { return this._h || ''; } set textContent(v) { this._t = v; } get textContent() { return this._t || ''; }
  addEventListener() {} setAttribute() {} appendChild() {} remove() {} focus() {} blur() {} closest() { return null; } querySelector() { return new El(); } querySelectorAll() { return []; } getBoundingClientRect() { return { left: 0, top: 0 }; } }
function mkCtx() {
  const els = {}, get = id => els[id] || (els[id] = new El());
  const ctx = { document: { getElementById: get, querySelectorAll: () => [], querySelector: () => new El(), createElement: () => new El(), documentElement: {}, head: new El(), title: '', addEventListener() {} },
    location: { pathname: '/', search: '', hash: '', href: SITE }, navigator: { language: 'en' }, history: { replaceState() {} }, window: {}, URL, URLSearchParams, Intl, console, setTimeout: () => 0, Math, Date, Set, Map, JSON, Object, Array, Number, String, parseInt, parseFloat, isFinite, RegExp };
  vm.createContext(ctx); return { ctx, els };
}
function runtimeVar(js, name) { // záloha: spustí skript v atrape DOM a prečíta premennú (napr. keď sa T skladá za behu)
  const { ctx } = mkCtx(); try { vm.runInContext(js, ctx); } catch (e) {}
  try { return vm.runInContext('typeof ' + name + " !== 'undefined' ? " + name + ' : null', ctx); } catch (e) { return null; }
}
function record(js) { // spustí skript stránky v atrape DOM a zachytí, čo zapísal do prvkov s id
  const els = {}, get = id => els[id] || (els[id] = new El());
  const ctx = { document: { getElementById: get, querySelectorAll: () => [], querySelector: () => new El(), createElement: () => new El(), documentElement: {}, head: new El(), title: '', addEventListener() {} },
    location: { pathname: '/', search: '', hash: '', href: SITE }, navigator: { language: 'en' }, history: { replaceState() {} }, window: {}, URL, URLSearchParams, Intl, console, setTimeout: () => 0, Math, Date, Set, Map, JSON, Object, Array, Number, String, parseInt, parseFloat, isFinite, RegExp };
  vm.createContext(ctx); vm.runInContext(js, ctx); return els;
}
function inject(h, id, content, asAttr) {
  const re = new RegExp('(<([a-zA-Z0-9]+)\\b[^>]*\\bid="' + id + '"[^>]*>)([\\s\\S]*?)(</\\2>)');
  if (!re.test(h)) { errors.push('chýba prvok #' + id); return h; }
  return h.replace(re, (m, a, t, b, c) => a + content + c);
}
function setMeta(h, attr, val, content) {
  const re = new RegExp('<meta\\b[^>]*\\b' + attr + '="' + val + '"[^>]*>');
  if (!re.test(h)) return h;
  return h.replace(re, tag => tag.replace(/content="[^"]*"/, 'content="' + escA(content) + '"'));
}
const OGL = { en: 'en_US', sk: 'sk_SK', de: 'de_DE', cs: 'cs_CZ', pl: 'pl_PL', fr: 'fr_FR', es: 'es_ES' };

function render(name, src, T, META, FT, kind, l) {
  const url = urlOf(name, l); let h = src;
  const patch = (re, to, must) => { const n = h.replace(re, to); if (must && n === h) errors.push(name + ' [' + l + ']: úprava skriptu nenašla ' + must); h = n; };
  // --- skript: pevný jazyk, žiadne ?lang=, prepínač naviguje na adresu jazyka
  patch(/try\{const s=new URLSearchParams\(location\.search\)\.get\('lang'\)\|\|\(navigator\.language\|\|''\)\.slice\(0,2\);if\(T\[s\]\)lang=s\}catch\(e\)\{\}/, "lang='" + l + "';", 'výber jazyka');
  patch(/function applySeo\(\)\{/, 'function applySeo(){return;', 'applySeo');
  patch(/lang=b\.dataset\.l;try\{const u=new URL\(location\.href\);if\(lang==='en'\)u\.searchParams\.delete\('lang'\);else u\.searchParams\.set\('lang',lang\);history\.replaceState\(null,'',u\)\}catch\(x\)\{\}close\(\);cb\(\)/, 'goLang(b.dataset.l)', 'prepínač jazyka');
  patch(/\blet lang=/, "function goLang(l){const p=location.pathname.replace(/^\\/(sk|de|cs|pl|fr|es)(?=\\/|$)/,'')||'/';location.href=(l==='en'?'':'/'+l)+(p.charAt(0)==='/'?p:'/'+p)+location.search+location.hash}\nlet lang=", 'let lang');
  patch(/function propLinks\(\)\{[^\n]*\}/, 'function propLinks(){}', 'propLinks');
  patch(/'privacy\.html'\+\(lang==='en'\?'':'\?lang='\+lang\)\+'#cookies'/, "'privacy.html#cookies'", null);
  h = h.replace(/href="index\.html"/g, 'href="./"').replace(/<a([^>]*?)href="#"([^>]*>\s*<span class="ico)/g, '<a$1href="./"$2');
  // --- hlavička
  h = h.replace(/<html lang="[^"]*"/, '<html lang="' + l + '"');
  const m = META[l]; h = h.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(m.t) + '</title>');
  h = setMeta(h, 'name', 'description', m.d); h = setMeta(h, 'property', 'og:title', m.t); h = setMeta(h, 'property', 'og:description', m.d);
  h = setMeta(h, 'name', 'twitter:title', m.t); h = setMeta(h, 'name', 'twitter:description', m.d); h = setMeta(h, 'property', 'og:url', url); h = setMeta(h, 'property', 'og:locale', OGL[l]);
  h = h.replace(/<meta property="og:locale:alternate"[^>]*>\s*/g, '').replace(/<link rel="alternate" hreflang="[^"]*"[^>]*>\s*/g, '');
  h = h.replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="' + url + '">');
  const alt = '\n' + ['x-default', ...LANGS].map(c => '<link rel="alternate" hreflang="' + c + '" href="' + urlOf(name, c === 'x-default' ? 'en' : c) + '">').join('\n') + '\n' + LANGS.filter(c => c !== l).map(c => '<meta property="og:locale:alternate" content="' + OGL[c] + '">').join('\n');
  h = h.replace(/(<link rel="canonical"[^>]*>)/, '$1' + alt);
  // --- obsah
  if (T) h = h.replace(/(<([a-zA-Z0-9]+)\b[^>]*\bdata-i="([^"]+)"[^>]*>)(<\/\2>)/g, (a, o, t, k, c) => { const v = T[l][k]; if (v === undefined) return a; return o + (t === 'ul' ? v : esc(v)) + c; });
  h = h.replace(/(<span id="langCur">)[^<]*/, '$1' + l.toUpperCase());
  if (FT) { const s = '<span class="mx-2">·</span>'; h = inject(h, 'flinks', '<a href="about.html" class="hover:text-white">' + esc(FT[l][2]) + '</a>' + s + '<a href="privacy.html" class="hover:text-white">' + esc(FT[l][0]) + '</a>' + s + '<button data-cs class="hover:text-white">' + esc(FT[l][1]) + '</button>'); }
  if (kind !== 'calc') {
    const ids = kind === 'index' ? ['badge', 't1', 't2', 'sub', 'emptyT', 'foot', 'cards'] : ['sections', 'upd'];
    const els = record(lastScript(h)[1]);
    for (const id of ids) { const e = els[id]; if (!e || (e._h === undefined && e._t === undefined)) { errors.push(name + ' [' + l + ']: skript nezapísal #' + id); continue; } h = inject(h, id, e._h !== undefined ? e._h : esc(e._t)); }
    if (kind === 'index' && els.q && els.q.placeholder) h = h.replace(/(<input id="q"[^>]*?)(\s*\/?>)/, (a, x, y) => x.replace(/\s*placeholder="[^"]*"/, '') + ' placeholder="' + escA(els.q.placeholder) + '"' + y);
  }
  if (name === 'index.html' && l === 'en') h = h.replace('</head>', AUTOLANG + '\n</head>');
  h = addAds(h);
  return { h, url };
}
function check(name, l, h, url, kind) {
  const w = x => errors.push(name + ' [' + l + ']: ' + x);
  if (!h.includes('<link rel="canonical" href="' + url + '">')) w('zlý canonical');
  if ((h.match(/hreflang="/g) || []).length !== 8) w('hreflang nie je 8');
  if (!h.includes('adsbygoogle.js?client=ca-pub-7136183336732732')) w('chýba AdSense kód');
  if (!h.includes('<html lang="' + l + '"')) w('zlé <html lang>');
  if (/[?&]lang=/.test(h.replace(/<link rel="alternate"[^>]*>/g, '').replace(/\?lang='\+q/g, ''))) w('ostal ?lang=');
  if (/\bdata-i="[^"]+"[^>]*><\/(\w+)>/.test(h)) emptyData.add(name);
  if (kind === 'index' && !/<div id="cards"[^>]*>\s*<article/.test(h)) w('prázdne karty');
  if (kind === 'legal' && !/<div id="sections"[^>]*>\s*<section/.test(h)) w('prázdne sekcie');
}
// --- hlavný beh
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const pages = [], pass = [];
for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !SKIP.has(f))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!lastScript(src) || !/META=\{/.test(src)) { pass.push(f); continue; }
  try {
    const META = getObj(src, 'META={'), FT = getObj(src, 'const FT={'); const isIdx = f === 'index.html';
    let T = isIdx ? null : getObj(src, 'const T={');
    if (!isIdx && (!T || LANGS.some(l => !T[l]))) { const rt = runtimeVar(lastScript(src)[1], 'T'); if (rt && LANGS.every(l => rt[l])) T = rt; }
    if (!isIdx && T && LANGS.some(l => !T[l])) throw new Error('T nemá všetky jazyky: chýba ' + LANGS.filter(l => !T[l]).join(','));
    const kind = isIdx ? 'index' : (/id="sections"/.test(src) ? 'legal' : 'calc');
    if (!META || !FT || (!isIdx && !T)) throw new Error('nepodarilo sa načítať T/META/FT');
    pages.push(f);
    for (const l of LANGS) {
      const { h, url } = render(f, src, T, META, FT, kind, l); check(f, l, h, url, kind);
      const dir = l === 'en' ? OUT : path.join(OUT, l); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, f), h);
    }
  } catch (e) { errors.push(f + ': ' + e.message); }
}
for (const f of pass) { fs.writeFileSync(path.join(OUT, f), addAds(fs.readFileSync(path.join(ROOT, f), 'utf8'))); warns.push(f + ': skopírované bez zmien (nie je stránka kalkulačky)'); }
(function copy(dir, rel) { for (const n of fs.readdirSync(dir)) { if (SKIP.has(n) || (!rel && /\.(html)$/.test(n))) continue; const p = path.join(dir, n), t = path.join(OUT, rel, n);
  if (fs.statSync(p).isDirectory()) { fs.mkdirSync(t, { recursive: true }); copy(p, path.join(rel, n)); } else if (!/^README/i.test(n)) { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(p, t); } } })(ROOT, '');
const urls = pages.flatMap(f => LANGS.map(l => urlOf(f, l)));
const sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => '  <url><loc>' + u + '</loc></url>').join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(OUT, 'sitemap-urls.xml'), sm); fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sm); // oba názvy rovnaké, aby sedel aj starý odkaz v robots.txt
console.log('Stránky: ' + pages.length + ', súborov: ' + pages.length * LANGS.length + ', adries v sitemap: ' + urls.length);
if (emptyData.size) warns.push('niektoré prvky data-i ostali prázdne (dopĺňa ich JavaScript) v: ' + [...emptyData].join(', '));
warns.forEach(w => console.log('POZNÁMKA: ' + w));
if (errors.length) { console.error('\nCHYBY (' + errors.length + '):\n' + errors.map(e => ' - ' + e).join('\n')); process.exit(1); }
console.log('Build v poriadku.');
