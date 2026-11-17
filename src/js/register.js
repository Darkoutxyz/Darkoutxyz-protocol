// Register pattern: every external fact is one record with state stated | absent | unconfirmed.
// Only "stated" records may render links or values. Everything else renders inert.
const raw = document.getElementById('register');
export const REG = JSON.parse(raw ? raw.textContent : '{}');

export const isStated = (r) => !!r && r.state === 'stated';

// Link rule: the URL is stored, the handle is derived from it.
export function handleOf(rec) {
  if (!isStated(rec) || !rec.url) return null;
  try {
    const seg = new URL(rec.url).pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : null;
  } catch { return null; }
}

export function caValue() {
  return isStated(REG.ca) && REG.ca.value ? REG.ca.value : null;
}

// Every outbound link is derived from a record; null means "render inert, no href".
export function linkFor(name) {
  const ca = caValue();
  switch (name) {
    case 'x': return isStated(REG.x) ? REG.x.url : null;
    case 'github': return isStated(REG.github) ? REG.github.url : null;
    case 'buy': return ca ? 'https://pump.fun/coin/' + ca : null;
    case 'chart': return ca ? 'https://dexscreener.com/solana/' + ca : null;
    case 'solscan': return ca ? 'https://solscan.io/token/' + ca : null;
    default: return null;
  }
}
