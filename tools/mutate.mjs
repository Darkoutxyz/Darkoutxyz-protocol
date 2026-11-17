// Mutation harness: break a copy of the build one way at a time and require the named gate to fail.
// Anchors are state-independent: they read the current register from the copy at runtime and never assume absent/stated.
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dist = process.argv.includes('--dist') ? process.argv[process.argv.indexOf('--dist') + 1] : 'dist';
const T = '.mut';
const reset = () => {
  rmSync(T, { recursive: true, force: true });
  mkdirSync(T, { recursive: true });
  cpSync(dist, join(T, 'dist'), { recursive: true });
  cpSync('src', join(T, 'src'), { recursive: true });
  mkdirSync(join(T, 'docs'), { recursive: true });
  for (const f of ['README.md', 'LICENSE', 'package.json', 'build.mjs', 'docs/whitepaper.md']) cpSync(f, join(T, f));
};
const run = () => spawnSync(process.execPath, ['tools/verify.mjs', '--dist', join(T, 'dist'), '--src', join(T, 'src'), '--root', T], { encoding: 'utf8' });
const regOf = () => JSON.parse(readFileSync(join(T, 'dist/index.html'), 'utf8').match(/id="register">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<'));
const edit = (p, fn) => writeFileSync(p, fn(readFileSync(p, 'utf8')));
const indexP = () => join(T, 'dist/index.html');

const strayAddress = () => { const ca = regOf().ca.value; const a = 'Dark0utStrayAddressxxxxxxxxxxxxxxxxxxxxxx'.replace(/[0OIl]/g, 'x'); return a === ca ? a.slice(0, -1) + 'y' : a; };

const mutations = [
  ['G03', 'unstated record gains a value', () => edit(indexP(), (s) => { const r = regOf(); const k = Object.keys(r).find((x) => r[x].state !== 'stated'); if (!k) throw new Error('no unstated record to mutate'); r[k] = { ...r[k], url: 'https://example.invalid/', value: 'x' }; return s.replace(/(id="register">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(r)}$2`); })],
  ['G04', 'logo removed from dist', () => rmSync(join(T, 'dist/brand/logo-128.png'))],
  ['G05', 'logo path made absolute', () => edit(indexP(), (s) => s.replaceAll('src="brand/logo-128.png"', 'src="/brand/logo-128.png"'))],
  ['G06', 'favicon viewBox broken', () => edit(join(T, 'dist/favicon.svg'), (s) => s.replace('viewBox="0 0 32 32"', 'viewBox="0 0 64 64"'))],
  ['G07', 'colour literal added outside tokens', () => appendFileSync(join(T, 'src/styles/app.css'), '\n.x { color: #123456; }\n')],
  ['G08', 'a visible date appears', () => edit(indexP(), (s) => s.replace('</main>', '<p>Updated 12 Mar 2026</p></main>'))],
  ['G09', 'date API in shipped JS', () => appendFileSync(join(T, 'src/js/main.js'), '\nconsole.log(new Date());\n')],
  ['G10', 'stray address-shaped string on page', () => edit(indexP(), (s) => s.replace('</main>', `<p>${strayAddress()}</p></main>`))],
  ['G11', 'blanket 0x rejection added', () => appendFileSync(join(T, 'src/js/hydrate.js'), '\nexport const bad = (x) => /^0x/.test(x);\n')],
  ['G12', 'href leaks onto an inert link', () => edit(indexP(), (s) => s.replace(/(<a\b[^>]*?)(data-link="github")/, '$1href="https://example.invalid/" $2'))],
  ['G13', 'GitHub icon gets a text label', () => edit(indexP(), (s) => s.replace(/(<a[^>]*data-link="github"[^>]*>)/, '$1GitHub '))],
  ['G14', 'icons hidden at a breakpoint', () => edit(join(T, 'dist/assets/app.css'), (s) => s + '\n.icon-btn{display:none}\n')],
  ['G15', 'CA slot removed from header', () => edit(indexP(), (s) => s.replace(/<header[\s\S]*?<\/header>/, '<header></header>'))],
  ['G16', 'own fetch made sequential and CA-gated trending', () => edit(join(T, 'src/js/market.js'), (s) => s.replace('const jobs = [loadTrending()];', 'const jobs = [];'))],
  ['G17', 'visibility pause removed', () => edit(join(T, 'src/js/market.js'), (s) => s.replaceAll('visibilitychange', 'noop'))],
  ['G18', 'reduced-motion kill removed', () => edit(join(T, 'src/styles/app.css'), (s) => s.replace('animation: none !important', 'animation: none'))],
  ['G19', 'ch unit introduced', () => appendFileSync(join(T, 'src/styles/app.css'), '\n.y { max-width: 40ch; }\n')],
  ['G20', 'attribution file added', () => writeFileSync(join(T, 'CLAUDE.md'), 'x')],
  ['G23', 'keyframes orphaned (animation reference renamed)', () => edit(join(T, 'src/styles/app.css'), (s) => s.replace('animation: marquee 38s', 'animation: marqueeX 38s'))],
  ['G24', 'second X icon added to header', () => edit(indexP(), (s) => s.replace('</header>', '<a data-link="x"></a></header>'))],
  ['G25', 'copy feedback timing changed', () => edit(join(T, 'src/js/hydrate.js'), (s) => s.replace('}, 1500);', '}, 1600);'))],
  ['G21', 'licence broken', () => writeFileSync(join(T, 'LICENSE'), 'not a licence')],
];

reset();
const base = run();
console.log(`baseline: exit ${base.status}`);
let bad = 0;
if (base.status !== 0) { console.log(base.stdout); process.exit(1); }
for (const [gid, label, fn] of mutations) {
  reset();
  try { fn(); } catch (e) { console.log(`ERROR ${gid} ${label}: ${e.message}`); bad++; continue; }
  const r = run();
  const caught = r.status !== 0 && new RegExp(`FAIL ${gid}\\b`).test(r.stdout);
  console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${gid} ${label}`);
  if (!caught) bad++;
}
rmSync(T, { recursive: true, force: true });
console.log(`\nmutations: ${mutations.length} total, ${mutations.length - bad} caught, ${bad} missed`);
process.exit(bad ? 1 : 0);
void existsSync;
