export const DASH = '—';
export const PLACEHOLDER = '· · · · ·';

const ok = (n) => typeof n === 'number' && Number.isFinite(n);

export function fmtPrice(n) {
  if (!ok(n)) return DASH;
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return '$' + n.toFixed(n >= 100 ? 2 : 3);
  if (n === 0) return '$0';
  const digits = Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return '$' + n.toFixed(digits);
}

export function fmtCompact(n) {
  if (!ok(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export function fmtPct(n) {
  if (!ok(n)) return DASH;
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%';
}

export const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return ok(n) ? n : null; };
