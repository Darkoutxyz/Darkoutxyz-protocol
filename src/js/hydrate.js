import { REG, caValue, linkFor, handleOf } from './register.js';

const ABSENT_TEXT = 'Address pending';

function setInert(el, on) {
  el.classList.toggle('is-inert', on);
  if (on) { el.removeAttribute('href'); el.setAttribute('aria-disabled', 'true'); el.setAttribute('tabindex', '-1'); }
  else { el.removeAttribute('aria-disabled'); el.removeAttribute('tabindex'); }
}

async function copyText(text) {
  // synchronous path first: it stays inside the click's user gesture and never waits on a permission prompt
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    if (ok) return true;
  } catch { /* fall through */ }
  try {
    return await Promise.race([navigator.clipboard.writeText(text).then(() => true), new Promise((r) => setTimeout(() => r(false), 800))]);
  } catch { return false; }
}

export function hydrate() {
  const ca = caValue();

  document.querySelectorAll('[data-link]').forEach((el) => {
    const url = linkFor(el.dataset.link);
    if (url) { el.setAttribute('href', url); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); setInert(el, false); }
    else { el.removeAttribute('target'); el.removeAttribute('rel'); setInert(el, true); }
  });

  document.querySelectorAll('[data-handle]').forEach((el) => {
    const h = handleOf(REG.x);
    if (h) el.textContent = 'X ' + h;
  });

  document.querySelectorAll('[data-ca-text]').forEach((el) => { el.textContent = ca || ABSENT_TEXT; });

  document.querySelectorAll('[data-ca-copy]').forEach((btn) => {
    const act = btn.querySelector('[data-ca-act]');
    if (!ca) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); if (act) act.textContent = ''; return; }
    btn.disabled = false; btn.removeAttribute('aria-disabled');
    if (act) act.textContent = 'Grab';
    let timer = 0;
    btn.addEventListener('click', async () => {
      const ok = await copyText(ca);
      if (act) act.textContent = ok ? 'Grabbed' : 'Press Ctrl+C';
      btn.classList.toggle('is-copied', ok);
      btn.setAttribute('aria-label', ok ? 'Contract address copied' : 'Copy contract address');
      clearTimeout(timer);
      timer = setTimeout(() => { if (act) act.textContent = 'Grab'; btn.classList.remove('is-copied'); btn.setAttribute('aria-label', 'Copy contract address'); }, 1500);
    });
  });
}
