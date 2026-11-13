// The homepage line-up: the models stand edge-on in a row. Hover (or tap) turns one to face you; click opens a
// closer look. Reads the catalogue in js/products.js (any dress with a `rail` image stands in it).
(function () {
  const $ = (id) => document.getElementById(id);
  const list = $('railItems');
  if (!list) return;
  const money = (n) => `GHS ${Number(n).toLocaleString('en-GH')}`;
  const touch = window.matchMedia('(hover: none)').matches;
  const dresses = (window.PRODUCTS || []).filter((p) => p.rail);

  const DEFAULT = { name: 'From Accra, with love', hint: touch ? 'Tap a model to turn her. Tap again to explore.' : 'Hover a model to turn her. Click to explore.' };
  let active = -1, open = -1, pending = null, lastType = 'mouse';
  let downActive = -1;   // which dress was already turned when the finger went down (focus alone must not count as the first tap)
  document.addEventListener('pointerdown', (e) => { lastType = e.pointerType || 'mouse'; const li = e.target.closest && e.target.closest('.rail__item'); downActive = li ? active : -2; }, true);
  const touchy = () => touch || lastType !== 'mouse';

  // ---------- build the rail ----------
  list.innerHTML = dresses.map((p, i) => `
    <li class="rail__item" style="--i:${i};--s:${p.railScale || 1}" data-i="${i}">
      <button type="button" aria-label="${p.name}">
        <span class="rail__gar"><img src="${p.rail}" alt="${p.name}" loading="eager" decoding="async"></span>
        <span class="rail__shadow" aria-hidden="true"></span>
      </button>
    </li>`).join('');
  const items = [...list.children];
  // each garment's own proportions set how wide it is when it turns
  items.forEach((li, i) => {
    const img = li.querySelector('img');
    const set = () => { if (img.naturalHeight) li.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(3)); };
    if (img.complete) set(); else img.addEventListener('load', set);
  });

  function caption(i) {
    $('railName').textContent = i < 0 ? DEFAULT.name : dresses[i].name;
    $('railHint').textContent = i < 0 ? DEFAULT.hint : `${dresses[i].price != null ? money(dresses[i].price) : 'Price on request'}. ${touch ? 'Tap again to explore.' : 'Click to explore.'}`;
  }
  function activate(i) {
    if (i === active) return;
    active = i;
    items.forEach((li, n) => li.classList.toggle('is-on', n === i));
    caption(i);
  }

  list.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const li = e.target.closest('.rail__item'); if (li) activate(+li.dataset.i);
  });
  list.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') activate(-1); });
  list.addEventListener('focusin', (e) => { const li = e.target.closest('.rail__item'); if (li) activate(+li.dataset.i); });
  list.addEventListener('focusout', () => { if (!list.contains(document.activeElement)) activate(-1); });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.rail__item'); if (!li) return;
    const i = +li.dataset.i;
    // on a touch screen the first tap turns the dress, the second opens it
    if (touchy() && downActive !== i) { activate(i); li.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); return; }
    openFocus(i);
  });
  // tapping empty space on a phone puts the dress back
  $('railScroll').addEventListener('click', (e) => { if (touchy() && !e.target.closest('.rail__item')) activate(-1); });

  // ---------- the closer look ----------
  const focus = $('railFocus');
  function fill(i) {
    const p = dresses[i];
    open = i;
    $('railBig').src = p.rail; $('railBig').alt = p.name;
    $('railCount').textContent = `${String(i + 1).padStart(2, '0')} / ${String(dresses.length).padStart(2, '0')}`;
    $('railFocusName').textContent = p.name;
    $('railMeta').textContent = `${p.readyMade ? 'Ready-made, or made to your measurements' : 'Made to your measurements'}  ·  ${p.price != null ? money(p.price) : 'Price on request'}`;
    const hang = focus.querySelector('.railfocus__hang');
    hang.style.animation = 'none'; void hang.offsetWidth; hang.style.animation = '';   // replays the turn-in
  }
  function openFocus(i) {
    pending = document.activeElement;
    fill(i);
    focus.hidden = false;
    document.body.classList.add('is-focus');
    $('railClose').focus({ preventScroll: true });
  }
  function closeFocus() {
    focus.hidden = true; open = -1;
    document.body.classList.remove('is-focus');
    if (pending && pending.focus) pending.focus({ preventScroll: true });
  }
  const step = (d) => fill((open + d + dresses.length) % dresses.length);
  $('railClose').addEventListener('click', closeFocus);
  $('railPrev').addEventListener('click', () => step(-1));
  $('railNext').addEventListener('click', () => step(1));
  focus.addEventListener('click', (e) => { if (e.target === focus) closeFocus(); });
  document.addEventListener('keydown', (e) => {
    if (focus.hidden) return;
    if (e.key === 'Escape') closeFocus();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
  $('railView').addEventListener('click', () => { const id = dresses[open].id; closeFocus(); if (window.RaphPdp) window.RaphPdp.open(id); });
  $('railTailor').addEventListener('click', () => {
    const id = dresses[open].id; closeFocus();
    const b = document.createElement('button'); b.type = 'button'; b.dataset.order = id; b.hidden = true; document.body.appendChild(b); b.click(); b.remove();
  });

  // ---------- the menu ----------
  const mb = $('menuBtn'), mp = $('menuPanel');
  const setMenu = (on) => { mp.hidden = !on; mb.setAttribute('aria-expanded', String(on)); };
  mb.addEventListener('click', (e) => { e.stopPropagation(); setMenu(mp.hidden); });
  document.addEventListener('click', (e) => { if (!mp.hidden && !e.target.closest('#menuPanel')) setMenu(false); });
  mp.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mp.hidden) setMenu(false); });
})();
