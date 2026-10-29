// Shop grid + order flow (details -> measurements -> style photos -> review).
(function () {
  const products = window.PRODUCTS || [];
  const config = window.RAPH_CONFIG || {};
  const grid = document.getElementById('shopGrid');
  const dialog = document.getElementById('orderDialog');
  if (!grid || !dialog) return;

  const $ = (sel, root = dialog) => root.querySelector(sel);
  const form = $('#orderForm');
  const stepsEl = $('#orderSteps');
  const nextBtn = $('#orderNext');
  const backBtn = $('#orderBack');
  const errEl = $('#orderError');
  const pad = (n) => String(n).padStart(4, '0');
  const money = (n) => `${config.currency || 'GHS'} ${Number(n).toLocaleString('en-GH')}`;

  const MEASUREMENTS = [
    { key: 'height',        label: 'Height',                hint: 'Standing straight, without shoes',                  min: 120, max: 220 },
    { key: 'bust',          label: 'Bust',                  hint: 'Around the fullest part of your chest',            min: 60,  max: 180 },
    { key: 'underbust',     label: 'Underbust',             hint: 'Around your ribcage, just under the bust',         min: 50,  max: 160 },
    { key: 'waist',         label: 'Waist',                 hint: 'Around your natural waist, the narrowest part',    min: 45,  max: 170 },
    { key: 'hips',          label: 'Hips',                  hint: 'Around the fullest part of your hips',             min: 60,  max: 200 },
    { key: 'shoulder',      label: 'Shoulder width',        hint: 'Across the back, from one shoulder point to the other', min: 25, max: 60 },
    { key: 'shoulderWaist', label: 'Shoulder to waist',     hint: 'From the top of the shoulder down to your waist',  min: 25,  max: 60 },
    { key: 'dressLength',   label: 'Dress length',          hint: 'From the top of the shoulder to where you want the hem', min: 80, max: 220 },
    { key: 'upperArm',      label: 'Upper arm',             hint: 'Around the fullest part of your upper arm',        min: 15,  max: 60 },
  ];

  const state = { product: null, step: 0, unit: 'cm', files: [] };
  const STEP_NAMES = ['Details', 'Measure', 'Style', 'Review'];

  // ---------- shop grid ----------
  function frameUrl(n) { return `assets/hero-frames/${pad(n)}.webp`; }

  function renderGrid() {
    const cards = products.map((p) => {
      const price = p.price != null ? money(p.price) : 'Price on request';
      const lead = p.leadTime ? `<span>Ready in ${p.leadTime}</span>` : '';
      return `
        <article class="card" data-id="${p.id}">
          <div class="card__media" data-frames="${p.frames.join(',')}">
            <img src="${frameUrl(p.frames[0])}" alt="${p.name}, shown turning" loading="lazy" width="496" height="800">
            <span class="card__turn" aria-hidden="true">Drag to turn</span>
          </div>
          <div class="card__body">
            <h3>${p.name}</h3>
            <p>${p.blurb}</p>
            <p class="card__meta"><strong>${price}</strong>${lead}</p>
            <button class="btn" type="button" data-order="${p.id}">Order this dress</button>
          </div>
        </article>`;
    }).join('');
    const custom = `
      <article class="card card--custom">
        <div class="card__media card__media--custom">
          <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="7" y="9" width="34" height="30" rx="4"/><circle cx="18" cy="20" r="3.5"/><path d="M8 35l10-9 7 6 6-5 10 9"/></svg>
        </div>
        <div class="card__body">
          <h3>Your own design</h3>
          <p>Send us a photo of the style you have in mind and we'll make it to your measurements.</p>
          <p class="card__meta"><strong>Quote on request</strong></p>
          <button class="btn btn--ghost" type="button" data-order="custom">Start a custom order</button>
        </div>
      </article>`;
    grid.innerHTML = cards + custom;

    // drag / hover across the photo to turn the dress
    grid.querySelectorAll('.card__media[data-frames]').forEach((media) => {
      const frames = media.dataset.frames.split(',').map(Number);
      const img = media.querySelector('img');
      let last = 0;
      const turn = (clientX) => {
        const r = media.getBoundingClientRect();
        const t = Math.min(0.999, Math.max(0, (clientX - r.left) / r.width));
        const i = Math.floor(t * frames.length);
        if (i !== last) { last = i; img.src = frameUrl(frames[i]); }
      };
      media.addEventListener('pointermove', (e) => turn(e.clientX));
      media.addEventListener('pointerdown', (e) => turn(e.clientX));
      media.addEventListener('pointerleave', () => { last = 0; img.src = frameUrl(frames[0]); });
      frames.forEach((n) => { new Image().src = frameUrl(n); });   // warm the cache
    });
  }

  // ---------- dialog ----------
  function open(productId) {
    const isCustom = productId === 'custom';
    state.product = isCustom ? null : products.find((p) => p.id === productId) || null;
    state.custom = isCustom;
    state.step = 0;
    state.files.forEach((f) => URL.revokeObjectURL(f.url));
    state.files = [];
    form.reset();
    dialog.querySelectorAll('[data-key]').forEach((i) => { delete i.dataset.cm; });
    setUnit('cm', false);
    restoreDraft();
    renderThumbs();
    $('#orderTitle').textContent = isCustom ? 'Your own design' : state.product.name;
    $('#styleOpt').hidden = isCustom;
    $('#refLabel').textContent = isCustom ? 'Photos of the style you want' : 'Photos (optional)';
    showStep(0);
    if (!dialog.open) dialog.showModal();
  }

  function close() { if (dialog.open) dialog.close(); }

  function showStep(n) {
    state.step = n;
    errEl.textContent = '';
    dialog.querySelectorAll('[data-step]').forEach((s) => { s.hidden = String(s.dataset.step) !== String(n); });
    const done = n === 'done';
    $('#orderNav').hidden = done;
    stepsEl.hidden = done;
    if (!done) {
      stepsEl.innerHTML = STEP_NAMES.map((name, i) =>
        `<li class="${i === n ? 'is-now' : i < n ? 'is-done' : ''}"><span>${i + 1}</span>${name}</li>`).join('');
      backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = n === 3 ? 'Place order' : 'Next';
      if (n === 3) renderReview();
    }
    $('#orderBody').scrollTop = 0;
    const first = dialog.querySelector(`[data-step="${n}"] input, [data-step="${n}"] textarea`);
    if (first && n !== 3 && n !== 'done') first.focus({ preventScroll: true });
  }

  // ---------- measurements ----------
  function buildMeasureFields() {
    $('#measureFields').innerHTML = MEASUREMENTS.map((m) => `
      <label class="field" title="${m.hint}">${m.label}
        <span class="unitwrap"><input name="m_${m.key}" type="number" inputmode="decimal" step="0.1" min="0" data-key="${m.key}" required><i class="unit">cm</i></span>
      </label>`).join('');
  }

  const toCm = (v) => (state.unit === 'in' ? v * 2.54 : v);
  const round1 = (v) => Math.round(v * 10) / 10;

  // Each measurement input keeps its exact value in cm (dataset.cm), so switching cm <-> in
  // never drifts. The visible number is just a rounded view of it.
  const show = (cm, unit) => round1(unit === 'in' ? cm / 2.54 : cm);

  function setCm(inp, cm) {
    if (cm == null || isNaN(cm)) { delete inp.dataset.cm; inp.value = ''; return; }
    inp.dataset.cm = cm;
    inp.value = show(cm, state.unit);
  }

  // convert=true: the user toggled the unit, so re-express what they've typed.
  // convert=false: just reset the labels (used when the dialog opens or a draft is restored).
  function setUnit(unit, convert = true) {
    if (convert && unit === state.unit) return;
    state.unit = unit;
    if (convert) dialog.querySelectorAll('[data-key]').forEach((inp) => { if (inp.dataset.cm) inp.value = show(Number(inp.dataset.cm), unit); });
    dialog.querySelectorAll('.unit').forEach((u) => { u.textContent = unit; });
    dialog.querySelectorAll('[data-unit]').forEach((b) => {
      const on = b.dataset.unit === unit;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  function readMeasurements() {
    const out = {};
    MEASUREMENTS.forEach((m) => {
      const cm = $(`[data-key="${m.key}"]`).dataset.cm;
      out[m.key] = cm == null ? null : round1(Number(cm));
    });
    return out;
  }

  // ---------- validation ----------
  function fail(msg, el) {
    errEl.textContent = msg;
    if (el) { el.focus(); el.setAttribute('aria-invalid', 'true'); }
    return false;
  }

  function validate(step) {
    dialog.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    errEl.textContent = '';
    if (step === 0) {
      const name = form.elements.name, phone = form.elements.phone, address = form.elements.address;
      if (!name.value.trim()) return fail('Enter your name.', name);
      if (form.elements.phone.value.replace(/\D/g, '').length < 9) return fail('Enter a valid phone number.', phone);
      if (!address.value.trim()) return fail('Enter your delivery address.', address);
    }
    if (step === 1) {
      const m = readMeasurements();
      for (const f of MEASUREMENTS) {
        const inp = $(`[data-key="${f.key}"]`);
        if (m[f.key] == null) return fail(`Enter your ${f.label.toLowerCase()}.`, inp);
        if (m[f.key] < f.min || m[f.key] > f.max) {
          const lo = state.unit === 'in' ? round1(f.min / 2.54) : f.min;
          const hi = state.unit === 'in' ? round1(f.max / 2.54) : f.max;
          return fail(`Check your ${f.label.toLowerCase()} (${lo}–${hi} ${state.unit}).`, inp);
        }
      }
    }
    if (step === 2 && state.custom && state.files.length === 0) {
      return fail('Add at least one photo.', $('#refInput'));
    }
    return true;
  }

  function softWarnings() {
    const m = readMeasurements();
    const w = [];
    if (m.waist && m.hips && m.waist > m.hips) w.push('Waist is larger than hips. Please check.');
    if (m.underbust && m.bust && m.underbust > m.bust) w.push('Underbust is larger than bust. Please check.');
    if (m.shoulderWaist && m.dressLength && m.shoulderWaist > m.dressLength) w.push('Shoulder to waist is longer than dress length.');
    $('#measureWarn').textContent = w.join(' ');
  }

  // ---------- photos ----------
  const MAX_FILES = 5;

  async function compress(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return { blob, url: URL.createObjectURL(blob), name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  }

  async function addFiles(list) {
    const err = $('#refError'); err.textContent = '';
    for (const file of list) {
      if (state.files.length >= MAX_FILES) { err.textContent = `Up to ${MAX_FILES} photos.`; break; }
      if (!file.type.startsWith('image/')) { err.textContent = 'Photos only.'; continue; }
      try { state.files.push(await compress(file)); }
      catch { err.textContent = 'Could not read that photo.'; }
    }
    renderThumbs();
  }

  function renderThumbs() {
    $('#thumbs').innerHTML = state.files.map((f, i) =>
      `<li><img src="${f.url}" alt="Reference photo ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">&times;</button></li>`).join('');
  }

  // ---------- review / submit ----------
  function collect() {
    return {
      product: state.custom ? { id: 'custom', name: 'Custom design' } : { id: state.product.id, name: state.product.name, price: state.product.price },
      customer: {
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        address: form.elements.address.value.trim(),
        needBy: form.elements.needBy.value || null,
      },
      measurementsCm: readMeasurements(),
      notes: form.elements.notes.value.trim(),
      photos: state.files.length,
    };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function renderReview() {
    const o = collect();
    const meas = MEASUREMENTS.map((m) => {
      const v = state.unit === 'in' ? round1(o.measurementsCm[m.key] / 2.54) : o.measurementsCm[m.key];
      return `<div><dt>${m.label}</dt><dd>${v} ${state.unit}</dd></div>`;
    }).join('');
    $('#review').innerHTML = `
      <div class="review__block"><h5>${esc(o.product.name)}</h5>
        <p>${o.product.price != null ? money(o.product.price) : 'Price confirmed by phone'}</p></div>
      <div class="review__block"><h5>You</h5>
        <p>${esc(o.customer.name)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.address)}${o.customer.needBy ? '<br>Needed by ' + esc(o.customer.needBy) : ''}</p></div>
      <div class="review__block"><h5>Measurements</h5><dl class="review__meas">${meas}</dl></div>
      <div class="review__block"><h5>Style</h5>
        <p>${o.notes ? esc(o.notes) + '<br>' : ''}${o.photos} photo${o.photos === 1 ? '' : 's'}</p></div>`;
  }

  const ref = () => 'RPH-' + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();

  async function submit() {
    const order = Object.assign({ reference: ref(), placedAt: new Date().toISOString() }, collect());
    nextBtn.disabled = true; nextBtn.textContent = 'Sending…';
    try {
      if (config.orderEndpoint) {
        const fd = new FormData();
        fd.append('order', JSON.stringify(order));
        state.files.forEach((f) => fd.append('photos', f.blob, f.name));
        const res = await fetch(config.orderEndpoint, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('bad status ' + res.status);
      } else {
        // no backend connected yet: keep the order in this browser only
        try {
          const all = JSON.parse(localStorage.getItem('raph_orders') || '[]');
          all.push(order);
          localStorage.setItem('raph_orders', JSON.stringify(all));
        } catch (e) { /* storage unavailable */ }
      }
    } catch (e) {
      nextBtn.disabled = false; nextBtn.textContent = 'Place order';
      return fail('Could not send. Check your connection and try again.');
    }
    clearDraft();
    nextBtn.disabled = false; nextBtn.textContent = 'Place order';
    $('#doneRef').textContent = order.reference;
    $('#doneMsg').textContent = `Thank you, ${order.customer.name.split(' ')[0]}. We'll call you on ${order.customer.phone} to confirm.`;
    const dev = $('#devNote');
    dev.hidden = !!config.orderEndpoint;
    dev.textContent = 'Test mode: saved on this device only, not sent to Raph.';
    showStep('done');
  }

  // ---------- draft (so a half-finished form survives a refresh) ----------
  const DRAFT = 'raph_draft';
  function saveDraft() {
    try {
      const d = { unit: state.unit, f: {} };
      ['name', 'phone', 'address', 'needBy', 'notes'].forEach((k) => { d.f[k] = form.elements[k].value; });
      d.m = {}; dialog.querySelectorAll('[data-key]').forEach((i) => { if (i.dataset.cm) d.m[i.dataset.key] = Number(i.dataset.cm); });
      localStorage.setItem(DRAFT, JSON.stringify(d));
    } catch (e) { /* ignore */ }
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (!d) return;
      setUnit(d.unit || 'cm', false);
      Object.entries(d.f || {}).forEach(([k, v]) => { form.elements[k].value = v; });
      Object.entries(d.m || {}).forEach(([k, v]) => { const i = $(`[data-key="${k}"]`); if (i) setCm(i, v); });
    } catch (e) { /* ignore */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT); } catch (e) { /* ignore */ } }

  // ---------- wiring ----------
  buildMeasureFields();
  renderGrid();

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-order]');
    if (trigger) { e.preventDefault(); open(trigger.dataset.order); }
  });
  $('#orderClose').addEventListener('click', close);
  $('#doneClose').addEventListener('click', () => { close(); document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });   // click on the backdrop
  backBtn.addEventListener('click', () => { if (state.step > 0) showStep(state.step - 1); });
  nextBtn.addEventListener('click', () => {
    if (!validate(state.step)) return;
    if (state.step === 3) submit(); else showStep(state.step + 1);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); nextBtn.click(); });
  form.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-key]');
    if (inp) { const v = parseFloat(inp.value); if (isNaN(v)) delete inp.dataset.cm; else inp.dataset.cm = toCm(v); }
    saveDraft(); if (state.step === 1) softWarnings();
  });
  dialog.querySelectorAll('[data-unit]').forEach((b) => b.addEventListener('click', () => { setUnit(b.dataset.unit); saveDraft(); if (state.step === 1) softWarnings(); }));
  $('#refInput').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  $('#thumbs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [f] = state.files.splice(Number(b.dataset.rm), 1); URL.revokeObjectURL(f.url); renderThumbs();
  });
})();
