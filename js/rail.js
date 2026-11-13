// The homepage hero: one model shown in full, the next ones peeking in on either side. Arrows, the arrow keys,
// a swipe, or a tap on a neighbour move along. Reads the catalogue in js/products.js (any dress with a `rail`
// image is in the line-up).
(function () {
  const $ = (id) => document.getElementById(id);
  const list = $('railItems');
  if (!list) return;
  const money = (n) => `GHS\u00a0${Number(n).toLocaleString('en-GH')}`;
  const dresses = (window.PRODUCTS || []).filter((p) => p.rail);
  const N = dresses.length;
  if (!N) return;
  let cur = 0;

  list.innerHTML = dresses.map((p, i) => `
    <li class="slide" data-i="${i}" style="--s:${p.railScale || 1}">
      <button type="button" aria-label="${p.name}" tabindex="-1">
        <img src="${p.rail}" alt="${p.name}" decoding="async" draggable="false">
        <span class="slide__shadow" aria-hidden="true"></span>
      </button>
    </li>`).join('');
  const slides = [...list.children];
  slides.forEach((li) => {
    const img = li.querySelector('img');
    const set = () => { if (img.naturalHeight) li.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(3)); };
    if (img.complete) set(); else img.addEventListener('load', set);
  });

  // shortest way round the circle from the current dress
  const offset = (i) => { let d = i - cur; if (d > N / 2) d -= N; if (d < -N / 2) d += N; return d; };

  function layout() {
    slides.forEach((li, i) => {
      const d = offset(i), a = Math.abs(d);
      li.style.setProperty('--d', Math.max(-2.1, Math.min(2.1, d)));
      li.style.setProperty('--a', a === 0 ? 0 : a === 1 ? 1 : 1.4);
      li.style.zIndex = String(10 - Math.round(a));
      li.classList.toggle('is-on', d === 0);
      if (a >= 2) li.dataset.far = d > 0 ? '1' : '-1'; else delete li.dataset.far;
      li.querySelector('button').tabIndex = d === 0 || a === 1 ? 0 : -1;
      li.setAttribute('aria-hidden', a >= 2 ? 'true' : 'false');
    });
  }
  const cap = document.querySelector('.rail__caption');
  function caption() {
    const p = dresses[cur];
    $('railCount').textContent = `${String(cur + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
    $('railName').textContent = p.name;
    $('railMeta').textContent = `${p.readyMade ? 'Ready-made, or made to your measurements' : 'Made to your measurements'}  ·  ${p.price != null ? money(p.price) : 'Price on request'}`;
  }
  function go(i) {
    cur = ((i % N) + N) % N;
    layout();
    cap.classList.add('is-swap');
    setTimeout(() => { caption(); cap.classList.remove('is-swap'); }, 220);
  }
  layout(); caption();

  $('railPrev').addEventListener('click', () => go(cur - 1));
  $('railNext').addEventListener('click', () => go(cur + 1));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, dialog, [role="dialog"]')) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') go(cur - 1); else if (e.key === 'ArrowRight') go(cur + 1);
  });

  // swipe or drag; a plain tap on a neighbour brings it to the middle
  const car = $('carousel');
  let x0 = null, moved = false;
  car.addEventListener('pointerdown', (e) => { if (e.target.closest('.carousel__nav')) return; x0 = e.clientX; moved = false; });
  car.addEventListener('pointermove', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 8) moved = true; });
  const end = (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 45) go(cur + (dx < 0 ? 1 : -1));
  };
  car.addEventListener('pointerup', end); car.addEventListener('pointercancel', () => { x0 = null; });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.slide'); if (!li || moved) return;
    const i = +li.dataset.i;
    if (i !== cur) go(i); else if (window.RaphPdp) window.RaphPdp.open(dresses[i].id);
  });

  $('railView').addEventListener('click', () => { if (window.RaphPdp) window.RaphPdp.open(dresses[cur].id); });
  $('railTailor').addEventListener('click', () => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.order = dresses[cur].id; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
  });

  // ---------- the menu ----------
  const mb = $('menuBtn'), mp = $('menuPanel');
  const setMenu = (on) => { mp.hidden = !on; mb.setAttribute('aria-expanded', String(on)); };
  mb.addEventListener('click', (e) => { e.stopPropagation(); setMenu(mp.hidden); });
  document.addEventListener('click', (e) => { if (!mp.hidden && !e.target.closest('#menuPanel')) setMenu(false); });
  mp.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mp.hidden) setMenu(false); });
})();
