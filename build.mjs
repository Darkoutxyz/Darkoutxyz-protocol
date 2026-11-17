// Build: src/ -> dist/ (deploy output). Logo + favicon are copied explicitly and checked afterwards.
// Test builds: DARKOUT_OUT=<dir> and DARKOUT_CA=<address> write a second tree with the CA stated (never touches dist/).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const out = resolve(process.env.DARKOUT_OUT || 'dist');
if (out === root || !out.startsWith(root)) throw new Error('refusing to write outside the project folder: ' + out);

const register = JSON.parse(readFileSync('src/register.json', 'utf8'));
if (process.env.DARKOUT_CA) register.ca = { state: 'stated', value: process.env.DARKOUT_CA };
if (process.env.DARKOUT_GITHUB) register.github = { state: 'stated', url: process.env.DARKOUT_GITHUB };

// clear contents, not the folder itself (a dev server may be holding it open on Windows)
mkdirSync(out, { recursive: true });
for (const n of readdirSync(out)) rmSync(join(out, n), { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });
mkdirSync(join(out, 'brand'), { recursive: true });

await build({
  entryPoints: { app: 'src/js/main.js' }, bundle: true, minify: true, format: 'iife', target: 'es2020',
  outdir: join(out, 'assets'), logLevel: 'warning',
});
await build({
  entryPoints: { app: 'src/styles/app.css' }, bundle: true, minify: true, outdir: join(out, 'assets'),
  loader: { '.woff2': 'file' }, assetNames: 'fonts/[name]-[hash]', logLevel: 'warning',
});

// explicit asset copies
for (const n of ['logo-512.png', 'logo-256.png', 'logo-128.png']) copyFileSync(join('src/assets', n), join(out, 'brand', n));
copyFileSync('src/assets/favicon.svg', join(out, 'favicon.svg'));

let html = readFileSync('src/index.html', 'utf8');
html = html.replace('/*REGISTER*/', JSON.stringify(register).replace(/</g, '\\u003c'));
writeFileSync(join(out, 'index.html'), html);

for (const need of ['index.html', 'favicon.svg', 'brand/logo-128.png', 'brand/logo-256.png', 'assets/app.js', 'assets/app.css']) {
  if (!existsSync(join(out, need))) throw new Error('missing from build: ' + need);
}
const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:)/.test(u));
for (const r of refs) if (!existsSync(join(out, r))) throw new Error('index.html references a file that is not in the build: ' + r);
console.log('built ->', out, '| files:', readdirSync(out).join(', '), '| ca:', register.ca.state);
