import { REG, caValue, linkFor } from './register.js';
import { DASH, PLACEHOLDER, fmtPrice, fmtCompact, fmtPct, num } from './format.js';
import { tween } from './motion.js';

const BRAND_LOGO = 'brand/logo-128.png';
const M = REG.market;

// ---------- network: timeout + exponential backoff ----------
let ctl = null;
async function getJSON(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    const t = new AbortController();
    const to = setTimeout(() => t.abort(), 10000);
    const onAbort = () => t.abort();
    ctl && ctl.signal.addEventListener('abort', onAbort);
    try {
      const res = await fetch(url, { signal: t.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      err = e;
      if (ctl && ctl.signal.aborted) throw e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * 2 ** i + Math.random() * 250));
    } finally { clearTimeout(to); ctl && ctl.signal.removeEventListener('abort', onAbort); }
  }
  throw err;
}

// ---------- data shaping ----------
function bestPair(pairs, address) {
  const list = (Array.isArray(pairs) ? pairs : []).filter((p) => p && (!p.chainId || p.chainId === 'solana'));
  const own = address ? list.filter((p) => p.baseToken && p.baseToken.address === address) : list;
  const use = own.length ? own : list;
  return use.slice().sort((a, b) => (num(b.volume && b.volume.h24) || 0) - (num(a.volume && a.volume.h24) || 0))[0] || null;
}
const iconUrl = (id) => !id ? null : /^https?:/.test(id) ? id : 'https://cdn.dexscreener.com/cms/images/' + encodeURIComponent(id) + '?width=128&height=128&quality=90&format=auto';
function logosOf(pairs, address) {
  const list = (Array.isArray(pairs) ? pairs : []).filter((p) => p && p.info && p.info.imageUrl && (!address || (p.baseToken && p.baseToken.address === address)));
  return [...new Set(list.map((p) => p.info.imageUrl))];
}
function fromPair(p, address) {
  return {
    key: address, address,
    symbol: (p.baseToken && p.baseToken.symbol) || DASH,
    name: (p.baseToken && p.baseToken.name) || '',
    logos: [p.info && p.info.imageUrl].filter(Boolean),
    price: num(p.priceUsd), change: num(p.priceChange && p.priceChange.h24),
    vol: num(p.volume && p.volume.h24), liq: num(p.liquidity && p.liquidity.usd),
    url: p.url || null,
  };
}

async function loadTrending() {
  const boosts = await getJSON(M.boosts);
  const best = new Map();
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (!b || b.chainId !== 'solana' || !b.tokenAddress) continue;
    const prev = best.get(b.tokenAddress);
    if (!prev || (num(b.totalAmount) || 0) > (num(prev.totalAmount) || 0)) best.set(b.tokenAddress, b);
  }
  const top = [...best.values()].sort((a, b) => (num(b.totalAmount) || 0) - (num(a.totalAmount) || 0)).slice(0, M.count);
  if (!top.length) throw new Error('empty boosts');
  const settled = await Promise.allSettled(top.map((b) => getJSON(M.tokens + b.tokenAddress)));
  return top.map((b, i) => {
    const r = settled[i];
    const pair = r.status === 'fulfilled' ? bestPair(r.value, b.tokenAddress) : null;
    if (!pair) return { key: b.tokenAddress, address: b.tokenAddress, failed: true, symbol: DASH, name: '', logos: [iconUrl(b.icon)].filter(Boolean) };
    const row = fromPair(pair, b.tokenAddress);
    row.logos = [...new Set([...row.logos, ...logosOf(r.value, b.tokenAddress), iconUrl(b.icon)].filter(Boolean))];
    return row;
  });
}

// Pump.fun and DexScreener are fetched in parallel; neither blocks the other.
async function loadOwn(ca) {
  const [dex, pump] = await Promise.allSettled([getJSON(M.ownDex + ca), getJSON(M.ownPump + ca)]);
  const pair = dex.status === 'fulfilled' ? bestPair(dex.value && dex.value.pairs, ca) : null;
  const pf = pump.status === 'fulfilled' && pump.value && typeof pump.value === 'object' ? pump.value : null;
  if (!pair && !pf) throw new Error('own token: no source answered');
  const base = pair ? fromPair(pair, ca) : { key: ca, address: ca, symbol: DASH, name: '', logos: [], price: null, change: null, vol: null, liq: null, url: null };
  if (pair) base.logos = [...new Set([...base.logos, ...logosOf(dex.value && dex.value.pairs, ca)])];
  if (pf) {
    if (pf.symbol) base.symbol = pf.symbol;
    if (pf.name) base.name = pf.name;
    if (pf.image_uri) base.logos.unshift(pf.image_uri);       // order: pump.fun, DexScreener, brand, letter
  }
  base.logos.push(BRAND_LOGO);
  base.url = linkFor('chart');
  base.own = true; base.key = 'own';
  return base;
}

// ---------- view ----------
const $rows = document.getElementById('rows');
const $mq = document.getElementById('marquee');
const $err = document.getElementById('board-err');
const $status = document.getElementById('status');
const $stext = document.getElementById('status-text');
const live = { trending: null, own: null };
const view = new Map(); // key -> { el, cells, vals }

function coin(logos, sym, cls = '') {
  const box = document.createElement('span');
  box.className = 'coin ' + cls;
  const letter = () => { box.textContent = (sym && sym !== DASH ? sym[0] : '?').toUpperCase(); };
  const list = (logos || []).slice();
  const next = () => {
    const src = list.shift();
    if (!src) { box.replaceChildren(); letter(); return; }
    const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onerror = next; img.onload = () => box.replaceChildren(img);
    img.src = src;
  };
  letter(); next();
  return box;
}

function skeletonRow(i) {
  const el = document.createElement('div');
  el.className = 'row in'; el.dataset.skeleton = '1';
  const bar = (w) => { const s = document.createElement('span'); s.className = 'sk'; s.style.width = w; return s; };
  const idx = document.createElement('span'); idx.className = 'row__idx'; idx.textContent = String(i + 2);
  const tok = document.createElement('span'); tok.className = 'row__tok';
  const c = document.createElement('span'); c.className = 'sk sk--coin';
  const t = document.createElement('span'); t.className = 'row__txt'; t.append(bar('64px'));
  tok.append(c, t);
  const p = bar('64px'), ch = bar('48px'); p.classList.add('r'); ch.classList.add('r');
  const v = bar('56px'), l = bar('56px'); v.classList.add('c-vol'); l.classList.add('c-liq');
  el.append(idx, tok, p, ch, v, l);
  return el;
}

function makeRow(d, idx) {
  const placeholder = !!d.placeholder;
  const el = document.createElement(placeholder || !d.url ? 'div' : 'a');
  el.className = 'row' + (d.own ? ' row--own' : '') + (placeholder ? ' is-placeholder' : '');
  if (placeholder) el.setAttribute('aria-disabled', 'true');
  const i = document.createElement('span'); i.className = 'row__idx'; i.textContent = String(idx);
  const tok = document.createElement('span'); tok.className = 'row__tok';
  const txt = document.createElement('span'); txt.className = 'row__txt';
  const sym = document.createElement('div'); sym.className = 'row__sym'; sym.textContent = d.symbol;
  if (d.own) { const tag = document.createElement('span'); tag.className = 'row__own-tag'; tag.textContent = 'OURS'; sym.append(tag); }
  const name = document.createElement('div'); name.className = 'row__name'; name.textContent = d.name;
  const meta = document.createElement('div'); meta.className = 'meta';
  txt.append(sym, name, meta);
  tok.append(coin(d.logos, d.symbol), txt);
  const price = document.createElement('span'); price.className = 'r mono-n';
  const chg = document.createElement('span'); chg.className = 'r mono-n';
  const vol = document.createElement('span'); vol.className = 'r c-vol mono-n';
  const liq = document.createElement('span'); liq.className = 'r c-liq mono-n';
  el.append(i, tok, price, chg, vol, liq);
  return { el, idx: i, sym, name, meta, price, chg, vol, liq, vals: {}, logoKey: null, tok };
}

function paint(v, d) {
  const cells = [
    ['price', v.price, d.price, fmtPrice],
    ['change', v.chg, d.change, fmtPct],
    ['vol', v.vol, d.vol, fmtCompact],
    ['liq', v.liq, d.liq, fmtCompact],
  ];
  let changed = false;
  for (const [k, node, val, fmt] of cells) {
    if (d.placeholder) { node.textContent = PLACEHOLDER; continue; }
    const prev = v.vals[k];
    if (prev === undefined) node.textContent = fmt(val);
    else if (prev !== val) { tween(node, prev, val, fmt); changed = true; }
    v.vals[k] = val;
  }
  v.chg.classList.toggle('up', typeof d.change === 'number' && d.change > 0);
  v.chg.classList.toggle('dn', typeof d.change === 'number' && d.change < 0);
  v.meta.textContent = d.placeholder ? '' : 'Vol ' + fmtCompact(d.vol) + ' · Liq ' + fmtCompact(d.liq);
  v.sym.firstChild.nodeType === 3 && (v.sym.firstChild.nodeValue = d.symbol);
  if (changed) { v.el.classList.remove('flash'); void v.el.offsetWidth; v.el.classList.add('flash'); setTimeout(() => v.el.classList.remove('flash'), 1250); }
}

function entries() {
  const ca = caValue();
  const list = [];
  if (ca) list.push(live.own || { key: 'own', own: true, symbol: DASH, name: '', logos: [BRAND_LOGO], pending: true });
  else list.push({ key: 'own', own: true, placeholder: true, symbol: 'DARKOUT', name: 'Awaiting contract address', logos: [BRAND_LOGO] });
  const tr = live.trending || [];
  for (const t of tr) { if (ca && t.address === ca) continue; list.push(t); }   // dedup: own never repeats in rows 2-10
  return list;
}

function render() {
  const list = entries();
  const haveTrending = !!live.trending;
  // drop skeleton rows once trending exists
  if (haveTrending) $rows.querySelectorAll('[data-skeleton]').forEach((n) => n.remove());
  const seen = new Set();
  let fresh = 0;
  list.forEach((d, n) => {
    const vk = d.key + (d.url && !d.placeholder ? ':a' : ':d');   // anchor vs inert div is part of row identity
    seen.add(vk);
    let v = view.get(vk);
    if (!v) { v = makeRow(d, n + 1); view.set(vk, v); v.isNew = true; }
    const lk = (d.logos || []).join('|') + '#' + d.symbol;
    if (v.logoKey !== lk) { v.logoKey = lk; v.tok.replaceChild(coin(d.logos, d.symbol), v.tok.firstChild); }
    if (v.el.tagName === 'A' && d.url) { v.el.href = d.url; v.el.target = '_blank'; v.el.rel = 'noopener noreferrer'; }
    v.idx.textContent = String(n + 1);
    if (d.pending) { /* own row waiting on first answer: keep skeleton numbers */ v.price.textContent = v.chg.textContent = v.vol.textContent = v.liq.textContent = ''; [v.price, v.chg, v.vol, v.liq].forEach((x) => { if (!x.firstChild) { const s = document.createElement('span'); s.className = 'sk'; s.style.width = '56px'; x.append(s); } }); }
    else {
      if (v.price.querySelector('.sk')) { v.price.textContent = v.chg.textContent = v.vol.textContent = v.liq.textContent = ''; }
      paint(v, d);
    }
    if (v.isNew) { v.isNew = false; v.el.style.setProperty('--i', String(fresh++)); requestAnimationFrame(() => requestAnimationFrame(() => v.el.classList.add('in'))); }
    $rows.appendChild(v.el);
  });
  for (const [k, v] of view) if (!seen.has(k)) { v.el.remove(); view.delete(k); }
  // keep skeletons (if any) at the tail
  $rows.querySelectorAll('[data-skeleton]').forEach((n) => $rows.appendChild(n));
  renderMarquee(list);
}

function renderMarquee(list) {
  const items = list.filter((d) => !d.placeholder && !d.pending && !d.failed && d.symbol !== DASH);
  if (!items.length) {
    if (!live.trending) {
      $mq.replaceChildren(...Array.from({ length: 12 }, () => { const s = document.createElement('span'); s.className = 'mq mq--sk'; s.textContent = '— — — —'; return s; }));
    }
    return;
  }
  const make = (d) => {
    const s = document.createElement('span'); s.className = 'mq';
    const sym = document.createElement('b'); sym.textContent = d.symbol;
    const pr = document.createElement('span'); pr.textContent = fmtPrice(d.price);
    const ch = document.createElement('span'); ch.textContent = fmtPct(d.change); ch.className = d.change > 0 ? 'up' : d.change < 0 ? 'dn' : '';
    s.append(coin(d.logos, d.symbol, 'coin--sm'), sym, pr, ch); return s;
  };
  const once = items.map(make), twice = items.map(make);
  $mq.replaceChildren(...once, ...twice);
}

function setStatus(state, text) { $status.dataset.state = state; $stext.textContent = text; }

// ---------- orchestration ----------
let timer = 0, fails = 0, busy = false;

async function cycle() {
  if (busy) return; busy = true;
  ctl = new AbortController();
  const ca = caValue();
  const jobs = [loadTrending()];
  if (ca) jobs.push(loadOwn(ca));
  const [tr, own] = await Promise.allSettled(jobs);
  let anyOk = false, anyFail = false;
  if (tr.status === 'fulfilled') { live.trending = tr.value; anyOk = true; } else anyFail = true;
  if (ca) { if (own && own.status === 'fulfilled') { live.own = own.value; anyOk = true; } else anyFail = true; }
  if (ctl.signal.aborted) { busy = false; return; }
  if (!live.trending && tr.status === 'rejected') { live.trending = Array.from({ length: M.count - 1 }, (_, i) => ({ key: 'x' + i, address: 'x' + i, failed: true, symbol: DASH, name: '', logos: [], price: null, change: null, vol: null, liq: null, url: null })); live.trendingIsDash = true; }
  else if (tr.status === 'fulfilled') live.trendingIsDash = false;
  render();
  $err.hidden = !anyFail;
  if (anyFail) { fails++; setStatus('error', anyOk ? 'Partial, retrying' : 'Source down, retrying'); } else { fails = 0; setStatus('ok', 'Live'); }
  busy = false;
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (document.hidden) return;
  const wait = fails ? Math.min(M.pollMs, 4000 * 2 ** (fails - 1)) : M.pollMs;
  timer = setTimeout(cycle, wait);
}

export function startMarket() {
  // initial skeletons for rows 2-10
  for (let i = 0; i < M.count - 1; i++) $rows.appendChild(skeletonRow(i));
  render();
  renderMarquee([]);
  setStatus('loading', 'Connecting');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); ctl && ctl.abort(); busy = false; }
    else cycle();
  });
  cycle();
}
