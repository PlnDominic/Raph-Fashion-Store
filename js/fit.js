// Virtual Fit: the customer adds a photo of themselves, picks a dress and sees it on them.
// The picture is made by an AI try-on service at RAPH_CONFIG.tryOnEndpoint (see js/products.js).
(function () {
  const R = window.Raph;
  const products = window.PRODUCTS || [];
  const config = window.RAPH_CONFIG || {};
  const dlg = document.getElementById('fit');
  if (!dlg || !R) return;

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(4, '0');
  const frame = (p) => `assets/hero-frames/${pad(p.fitFrame || p.frames[0])}.webp`;
  const MAX_PHOTOS = 3;

  const state = { product: null, photos: [], active: -1, results: {}, original: false, busy: false, note: '' };
  const key = () => `${state.active}:${state.product.id}`;

  function open(id) {
    state.product = products.find((p) => p.id === id) || products[0];
    state.note = '';
    render();
    if (!dlg.open) dlg.showModal();
  }

  function render() {
    const p = state.product;
    const photo = state.photos[state.active];
    const result = photo && state.results[key()];

    $('fitPhotos').innerHTML = state.photos.map((ph, i) =>
      `<button type="button" class="fit__thumb${i === state.active ? ' is-on' : ''}" data-photo="${i}" aria-label="Your photo ${i + 1}"><img src="${ph.url}" alt=""></button>`).join('');
    dlg.querySelector('.fit__add').hidden = state.photos.length >= MAX_PHOTOS;
    $('fitDresses').innerHTML = products.map((d) =>
      `<button type="button" class="fit__thumb${d === p ? ' is-on' : ''}" data-dress="${d.id}" aria-label="${R.esc(d.name)}"><img src="${frame(d)}" alt=""></button>`).join('');

    let view;
    if (!photo) {
      view = `
        <label class="fit__empty" for="fitInput">
          <img src="${frame(p)}" alt="" class="fit__ghost">
          <span class="fit__cta">Add a full-length photo of yourself</span>
          <span class="btn">Upload photo</span>
        </label>`;
    } else {
      const src = result && !state.original ? result : photo.url;
      view = `<img class="fit__img" src="${src}" alt="${result && !state.original ? 'You wearing ' + R.esc(p.name) : 'Your photo'}">`;
      if (state.busy) view += '<div class="fit__busy"><span class="spinner" aria-hidden="true"></span>Fitting the dress…</div>';
    }
    $('fitView').innerHTML = view;

    let controls = '';
    if (photo && !result) controls = `<button type="button" class="btn" data-go ${state.busy ? 'disabled' : ''}>See it on me</button>`;
    if (result) controls = `<label class="switch"><input type="checkbox" data-original ${state.original ? 'checked' : ''}><span></span>Show my original photo</label>`;
    if (state.note) controls += `<p class="fit__note">${R.esc(state.note)}</p>`;
    $('fitControls').innerHTML = controls;

    $('fitProdImg').src = frame(p);
    $('fitProdName').textContent = p.name;
    $('fitProdPrice').textContent = p.price != null ? R.money(p.price) : 'Price on request';
    $('fitAdd').hidden = !p.readyMade;
    $('fitTailor').dataset.order = p.id;
  }

  async function addPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const ph = await R.compress(file);
      state.photos.push(ph);
      state.active = state.photos.length - 1;
      state.note = '';
      state.original = false;
      render();
    } catch (e) { state.note = 'Could not read that photo. Try another.'; render(); }
  }

  async function generate() {
    const photo = state.photos[state.active];
    if (!photo || state.busy) return;
    if (!config.tryOnEndpoint) {
      state.note = 'Virtual fit is not switched on yet. Your photo has stayed on this device.';
      render();
      return;
    }
    state.busy = true; state.note = ''; render();
    try {
      const fd = new FormData();
      fd.append('person', photo.blob, photo.name);
      fd.append('garmentUrl', new URL(frame(state.product), location.href).href);
      fd.append('productId', state.product.id);
      const res = await fetch(config.tryOnEndpoint, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('status ' + res.status);
      const data = await res.json();
      if (!data.image) throw new Error('no image');
      state.results[key()] = data.image;
      state.original = false;
    } catch (e) {
      state.note = 'Could not create your fit. Please try again, or try a clearer full-length photo.';
    }
    state.busy = false;
    render();
  }

  dlg.addEventListener('click', (e) => {
    const t = e.target;
    const ph = t.closest('[data-photo]');
    const dr = t.closest('[data-dress]');
    if (t === dlg || t.closest('#fitClose')) dlg.close();
    else if (ph) { state.active = Number(ph.dataset.photo); state.original = false; state.note = ''; render(); }
    else if (dr) { state.product = products.find((p) => p.id === dr.dataset.dress); state.original = false; state.note = ''; render(); }
    else if (t.closest('[data-go]')) generate();
    else if (t.closest('#fitAdd')) window.RaphCart && window.RaphCart.add(state.product.id);
  });
  dlg.addEventListener('change', (e) => {
    if (e.target.id === 'fitInput') { addPhoto(e.target.files[0]); e.target.value = ''; }
    if (e.target.matches('[data-original]')) { state.original = e.target.checked; render(); }
  });

  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fit]');
    if (f) { e.preventDefault(); open(f.dataset.fit); }
  });
})();
