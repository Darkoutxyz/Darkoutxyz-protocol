// Damped spring solver (semi-implicit Euler, fixed 1/240s substeps) + reveal, parallax, spotlight, progress.
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Spring {
  constructor(value = 0, { stiffness = 170, damping = 20, mass = 1 } = {}) {
    Object.assign(this, { x: value, v: 0, target: value, k: stiffness, c: damping, m: mass });
  }
  step(dt) {
    let t = Math.min(dt, 0.05);
    while (t > 0) {
      const h = Math.min(t, 1 / 240);
      const a = (-this.k * (this.x - this.target) - this.c * this.v) / this.m;
      this.v += a * h; this.x += this.v * h; t -= h;
    }
    return Math.abs(this.v) > 0.001 || Math.abs(this.x - this.target) > 0.001;
  }
}

const live = new Set();
let raf = 0, last = 0;
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  for (const fn of [...live]) if (!fn(dt)) live.delete(fn);
  raf = live.size ? requestAnimationFrame(frame) : 0;
}
function run(fn) {
  live.add(fn);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('revealed')); return; }
  const queue = new Map();
  const io = new IntersectionObserver((entries) => {
    const fresh = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    fresh.forEach((en, i) => {
      const el = en.target; io.unobserve(el);
      const delay = i * 70; // stagger within one batch
      const y = new Spring(28, { stiffness: 170, damping: 18 }); y.target = 0;
      el.style.transform = 'translate3d(0,28px,0)';
      setTimeout(() => {
        el.classList.add('revealed');   // opacity fades via CSS transition; position runs on the damped spring
        run((dt) => {
          const a = y.step(dt);
          el.style.transform = a ? `translate3d(0,${y.x.toFixed(2)}px,0)` : '';
          return a;
        });
      }, delay);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
  void queue;
}

export function initParallax() {
  const layers = [...document.querySelectorAll('[data-depth]')];
  if (!layers.length || reduced()) return;
  const px = new Spring(0, { stiffness: 90, damping: 16 }), py = new Spring(0, { stiffness: 90, damping: 16 }), sy = new Spring(0, { stiffness: 110, damping: 20 });
  const hero = document.querySelector('.hero');
  addEventListener('pointermove', (e) => {
    px.target = (e.clientX / innerWidth - 0.5) * 2; py.target = (e.clientY / innerHeight - 0.5) * 2; kick();
  }, { passive: true });
  addEventListener('scroll', () => { sy.target = Math.min(scrollY, hero ? hero.offsetHeight : 800); kick(); }, { passive: true });
  function kick() {
    run((dt) => {
      const a = px.step(dt), b = py.step(dt), c = sy.step(dt);
      for (const l of layers) {
        const d = parseFloat(l.dataset.depth);
        // individual `translate` property composes with CSS transform animations instead of fighting them
        l.style.translate = `${(px.x * -18 * d).toFixed(2)}px ${(py.x * -12 * d + sy.x * 0.12 * d).toFixed(2)}px`;
      }
      return a || b || c;
    });
  }
}

export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('[data-spot], .row');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    t.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}

export function initProgress() {
  const bar = document.getElementById('progress');
  if (!bar) return;
  const s = new Spring(0, { stiffness: 260, damping: 30 });
  const upd = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    s.target = max > 0 ? scrollY / max : 0;
    if (reduced()) { bar.style.transform = `scaleX(${s.target})`; return; }
    run((dt) => { const m = s.step(dt); bar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.x))})`; return m; });
  };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
}

// Count-up between two numbers; flashes the host when the value changed.
export function tween(el, from, to, fmt, ms = 650) {
  if (from === to || reduced() || !Number.isFinite(from) || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  run(() => {
    const p = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    return p < 1;
  });
}
