// Static gates. Usage: node tools/verify.mjs [--dist dist] [--src src] [--root .]
// Exit 0 only if every gate passes. Anchors read the register at runtime, never a hard-coded state.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const DIST = arg('dist', 'dist'), SRC = arg('src', 'src'), ROOT = arg('root', '.');
const read = (p) => readFileSync(p, 'utf8');
const walk = (d, skip = []) => existsSync(d) ? readdirSync(d).flatMap((n) => {
  if (skip.includes(n)) return [];
  const p = join(d, n); return statSync(p).isDirectory() ? walk(p, skip) : [p];
}) : [];

const html = existsSync(join(DIST, 'index.html')) ? read(join(DIST, 'index.html')) : '';
let REG = {};
try { REG = JSON.parse((html.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/) || [])[1].replace(/\\u003c/g, '<')); } catch { /* gate G02 reports */ }
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const srcFiles = walk(SRC);
const caVal = REG.ca && REG.ca.state === 'stated' ? REG.ca.value : null;

const gates = [];
const gate = (id, name, fn) => { let ok = false, note = ''; try { const r = fn(); ok = r === true || (r && r.ok); note = r && r.note || ''; } catch (e) { note = String(e.message || e); } gates.push({ id, name, ok, note }); };

gate('G01', 'dist/index.html exists', () => existsSync(join(DIST, 'index.html')));
gate('G02', 'register inlined and every record has a valid state', () => {
  const states = ['stated', 'absent', 'unconfirmed'];
  for (const k of ['chain', 'domain', 'ca', 'x', 'github', 'market']) if (!REG[k] || !states.includes(REG[k].state)) return { ok: false, note: 'bad record ' + k };
  return true;
});
gate('G03', 'unstated records carry no value or url (inert by construction)', () => {
  for (const [k, r] of Object.entries(REG)) if (r.state !== 'stated' && (r.value || r.url)) return { ok: false, note: k };
  for (const [k, r] of Object.entries(REG)) if (r.state === 'stated' && (k === 'x' || k === 'github') && !/^https:\/\//.test(r.url || '')) return { ok: false, note: k + ' stated without https url' };
  return true;
});
gate('G04', 'logo copied into dist/brand and is a real RGBA PNG', () => {
  const p = join(DIST, 'brand/logo-128.png'); if (!existsSync(p)) return { ok: false, note: 'missing' };
  const b = readFileSync(p); const png = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return { ok: png && b[25] === 6, note: 'colortype ' + b[25] };
});
gate('G05', 'index.html references logo by relative path that exists in dist', () => {
  const m = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((x) => x[1]);
  return { ok: m.length >= 3 && m.every((u) => !u.startsWith('/') && !/^https?:/.test(u) && existsSync(join(DIST, u))) && m.includes('brand/logo-128.png'), note: m.join(',') };
});
gate('G06', 'favicon is a 32x32 SVG, linked from index.html', () => {
  const p = join(DIST, 'favicon.svg'); if (!existsSync(p)) return { ok: false, note: 'missing' };
  const s = read(p);
  return /viewBox="0 0 32 32"/.test(s) && /width="32"/.test(s) && /height="32"/.test(s) && /rel="icon"[^>]*href="favicon\.svg"/.test(html);
});
gate('G07', 'no colour literals outside tokens.css (palette rule)', () => {
  const bad = srcFiles.filter((f) => !/tokens\.css$/.test(f) && !f.includes(join(SRC, 'assets')) && /#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(read(f).replace(/&#\d+;|&#x[0-9a-f]+;|href="#[\w-]+"|href="#"/gi, '').replace(/\/\*[\s\S]*?\*\//g, '')) && /\.(css|js|html)$/.test(f));
  return { ok: !bad.length, note: bad.map((f) => relative(SRC, f)).join(',') };
});
gate('G08', 'no dates, timestamps or "as of" copy on the page', () => {
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(19|20)\d{2}\b|\b\d{1,2}:\d{2}\b|\bas of\b|\bchecked\b|\bupdated\b|\blast (updated|checked)\b/i;
  const hit = text.match(re); return { ok: !hit, note: hit ? hit[0] : '' };
});
gate('G09', 'no date/clock APIs in shipped JS', () => !/toLocale(Date|Time)String|new Date\(|Date\.now|Intl\.DateTimeFormat/.test(srcFiles.filter((f) => f.endsWith('.js')).map(read).join('\n')));
gate('G10', 'address scanner: every address-shaped string matches the stated registry (CA exempt)', () => {
  const shaped = [...text.matchAll(/\b(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g)].map((m) => m[1]);
  const allowed = new Set([caVal].filter(Boolean));
  const stray = shaped.filter((a) => !allowed.has(a));
  return { ok: !stray.length, note: stray.join(',') };
});
gate('G11', 'gate never blanket-rejects 0x hex', () => !/\^0x|startsWith\(['"]0x|reject.*0x/i.test(srcFiles.filter((f) => f.endsWith('.js')).map(read).join('\n')));
gate('G12', 'inert links: no href on any data-link anchor in the shipped markup', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*data-link="[^"]+"[^>]*>/g)].map((m) => m[0]);
  const bad = anchors.filter((a) => /\shref=/.test(a));
  return { ok: anchors.length >= 8 && !bad.length, note: bad.join(' ') };
});
gate('G13', 'both social icons present, icon-only, X svg and GitHub octicon', () => {
  const x = html.match(/<a[^>]*data-link="x"[^>]*>([\s\S]*?)<\/a>/), g = html.match(/<a[^>]*data-link="github"[^>]*>([\s\S]*?)<\/a>/);
  if (!x || !g) return false;
  const bare = (s) => s.replace(/<svg[\s\S]*?<\/svg>/, '').trim() === '';
  return bare(x[1]) && bare(g[1]) && x[1].includes('M18.244 2.25') && g[1].includes('viewBox="0 0 16 16"') && g[1].includes('M8 0c4.42 0 8 3.58 8 8');
});
gate('G14', 'social icons sit outside any breakpoint-hidden wrapper (top-right at every width)', () => {
  const css = read(join(DIST, 'assets/app.css'));
  return /\.bar__end\{[^}]*margin-left:auto/.test(css) && !/\.bar__end\{[^}]*display:none/.test(css) && !/\.icon-btn\{[^}]*display:none/.test(css);
});
gate('G15', 'CA slot in header, always rendered, with copy control', () => /<header[\s\S]*data-ca-copy[\s\S]*<\/header>/.test(html));
gate('G16', 'market endpoints wired and independent of CA state', () => {
  const m = REG.market || {}; const js = read(join(SRC, 'js/market.js'));
  return /token-boosts\/top\/v1/.test(m.boosts) && /tokens\/v1\/solana\//.test(m.tokens) && /pump\.fun\/coins\//.test(m.ownPump) && /latest\/dex\/tokens\//.test(m.ownDex)
    && /const jobs = \[loadTrending\(\)\]/.test(js) && /Promise\.allSettled\(\[getJSON\(M\.ownDex[^\]]*getJSON\(M\.ownPump/.test(js) && /chainId !== 'solana'/.test(js);
});
gate('G17', 'poll 60s, hidden-tab pause, immediate fetch on visible, exponential backoff', () => {
  const js = read(join(SRC, 'js/market.js'));
  return REG.market.pollMs === 60000 && /document\.hidden/.test(js) && /visibilitychange/.test(js) && /2 \*\* /.test(js);
});
gate('G18', 'own row: accent border-left 2px, mint pulse, reduced-motion kill', () => {
  const css = read(join(SRC, 'styles/app.css'));
  return /\.row--own\s*\{[^}]*border-left:\s*2px solid var\(--color-accent\)/.test(css) && /@keyframes ownPulse/.test(css) && /prefers-reduced-motion: reduce[\s\S]*animation: none !important/.test(css) && /--src-mint:\s*#00ffcc/i.test(read(join(SRC, 'styles/tokens.css')));
});
gate('G19', 'no ch units (measure in px)', () => !/\d\s*ch\b/.test(srcFiles.filter((f) => f.endsWith('.css')).map(read).join('\n')));
gate('G20', 'repo hygiene: no CLAUDE.md, no .claude, no AI attribution text', () => {
  if (existsSync(join(ROOT, 'CLAUDE.md')) || existsSync(join(ROOT, '.claude'))) return false;
  const re = new RegExp(['clau' + 'de', 'anthro' + 'pic', 'co-authored', 'generated (with|by)', 'ch' + 'atgpt'].join('|'), 'i');
  const files = [...srcFiles, ...walk(DIST), ...['README.md', 'LICENSE', 'package.json', 'docs/whitepaper.md', 'build.mjs'].map((f) => join(ROOT, f)).filter(existsSync)].filter((f) => /\.(html|js|css|md|json|svg|mjs)$/.test(f) || /LICENSE$/.test(f));
  const bad = files.filter((f) => re.test(read(f)));
  return { ok: !bad.length, note: bad.join(',') };
});
gate('G21', 'repo content present: README, whitepaper, MIT LICENSE', () => existsSync(join(ROOT, 'README.md')) && existsSync(join(ROOT, 'docs/whitepaper.md')) && /MIT License[\s\S]*Copyright \(c\) 2026 DARKOUT/.test(read(join(ROOT, 'LICENSE'))));
gate('G22', 'scroll progress, status pill, skeleton, spotlight, reveal hooks present', () => /id="progress"/.test(html) && /id="status"/.test(html) && /data-spot/.test(html) && /data-reveal/.test(html) && /\.sk\{|\.sk \{/.test(read(join(DIST, 'assets/app.css')).replace(/\s+/g, ' ')));

gate('G23', 'every @keyframes is applied to an element and killed under reduced motion', () => {
  const css = srcFiles.filter((f) => f.endsWith('.css')).map(read).join('\n');
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const unused = names.filter((n) => !new RegExp('animation(-name)?:[^;}]*\\b' + n + '\\b').test(css));
  const rm = /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation: none !important[^}]*transition: none !important/.test(css);
  return { ok: names.length >= 5 && !unused.length && rm, note: 'unused: ' + unused.join(',') + ' reducedMotion=' + rm };
});
gate('G24', 'exactly one X icon in the header, resolved from the x record', () => {
  const head = (html.match(/<header[\s\S]*?<\/header>/) || [''])[0];
  const n = (head.match(/data-link="x"/g) || []).length;
  return { ok: n === 1 && REG.x && REG.x.state === 'stated' && REG.x.url === 'https://x.com/Darkoutxyz', note: 'count ' + n };
});
gate('G25', 'copy feedback timing matches reference (1500ms) and reduced-motion JS fallbacks exist', () => {
  const js = srcFiles.filter((f) => f.endsWith('.js')).map(read).join('\n');
  return /\}, 1500\);/.test(js) && /reduced\(\)/.test(js);
});

const w = Math.max(...gates.map((g) => g.name.length));
for (const g of gates) console.log(`${g.ok ? 'PASS' : 'FAIL'} ${g.id} ${g.name.padEnd(w)} ${g.ok ? '' : g.note}`);
const failed = gates.filter((g) => !g.ok);
console.log(`\ngates: ${gates.length} total, ${gates.length - failed.length} passed, ${failed.length} failed | dist=${DIST} ca=${REG.ca && REG.ca.state}`);
process.exit(failed.length ? 1 : 0);
void extname;
