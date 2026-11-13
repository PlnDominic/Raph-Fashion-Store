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

  // Ghanaian tailors work in inches, so the form does too. Ranges are in inches.
  // Values are still stored in cm (exact, no drift) by the order function.
  const MEASUREMENTS = [
    { key: 'bust',          label: 'Bust',              hint: 'Around the fullest part of your chest',                  min: 24, max: 70 },
    { key: 'underbust',     label: 'Underbust',         hint: 'Around your ribcage, just under the bust',               min: 20, max: 63 },
    { key: 'waist',         label: 'Waist',             hint: 'Around your natural waist, the narrowest part',          min: 18, max: 67 },
    { key: 'hips',          label: 'Hips',              hint: 'Around the fullest part of your hips',                   min: 24, max: 79 },
    { key: 'shoulder',      label: 'Shoulder',          hint: 'Across the back, from one shoulder point to the other',  min: 10, max: 24 },
    { key: 'bustPoint',     label: 'Bust point',        hint: 'Nipple to nipple, straight across',                      min: 3,  max: 14, optional: true },
    { key: 'shoulderWaist', label: 'Shoulder to waist', hint: 'From the top of the shoulder, over the bust, down to your waist', min: 10, max: 24 },
    { key: 'sleeveLength',  label: 'Sleeve length',     hint: 'From the shoulder point to where you want the sleeve to end', min: 4, max: 28, optional: true },
    { key: 'upperArm',      label: 'Round arm',         hint: 'Around the fullest part of your upper arm',              min: 6,  max: 24 },
    { key: 'dressLength',   label: 'Full length',       hint: 'From the top of the shoulder to where you want the hem', min: 31, max: 87 },
    { key: 'height',        label: 'Height',            hint: 'Standing straight, without shoes',                       min: 47, max: 87 },
  ];
  const IN = 2.54;

  const state = { product: null, step: 0, unit: 'in', files: [] };
  const STEP_NAMES = ['Details', 'Measure', 'Style', 'Review'];

  // ---------- shop grid ----------
  function renderGrid() {
    const S = window.RaphStock;
    const cards = products.map((p) => {
      const out = !!(p.readyMade && S && S.soldOut(p.id));
      const last = !!(p.readyMade && S && S.known && !out && S.total(p.id) === 1);
      const price = p.price != null ? money(p.price) : 'Price on request';
      const lead = p.leadTime ? `<span>Ready in ${p.leadTime}</span>` : '';
      return `
        <article class="card" data-id="${p.id}">
          <div class="card__media" data-view="${p.id}"${p.images.length > 1 ? ` data-images="${p.images.join('|')}"` : ''}>
            <img src="${p.images[0]}" alt="${p.name}" loading="lazy" width="496" height="800">
            ${out ? '<span class="card__badge">Sold out</span>' : last ? '<span class="card__badge card__badge--soft">Last piece</span>' : ''}
            ${p.images.length > 1 ? '<span class="card__turn" aria-hidden="true">Drag to turn</span>' : ''}
          </div>
          <div class="card__body">
            <h3><button type="button" class="card__name" data-view="${p.id}">${p.name}</button></h3>
            <p class="card__meta"><strong>${price}</strong>${lead}</p>
            <div class="card__actions">
              ${p.readyMade ? (out ? '<button class="btn btn--soldout" type="button" disabled>Sold out</button>' : `<button class="btn" type="button" data-add="${p.id}">Add to cart</button>`) : ''}
              <button class="btn ${p.readyMade && !out ? 'btn--ghost' : ''}" type="button" data-order="${p.id}">Get it tailored</button>
            </div>
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

    // drag / hover across the photo to flick through the dress's photos
    grid.querySelectorAll('.card__media[data-images]').forEach((media) => {
      const images = media.dataset.images.split('|');
      const img = media.querySelector('img');
      let last = 0;
      const turn = (clientX) => {
        const r = media.getBoundingClientRect();
        const t = Math.min(0.999, Math.max(0, (clientX - r.left) / r.width));
        const i = Math.floor(t * images.length);
        if (i !== last) { last = i; img.src = images[i]; }
      };
      let downX = null;
      media.addEventListener('pointermove', (e) => turn(e.clientX));
      media.addEventListener('pointerdown', (e) => { downX = e.clientX; turn(e.clientX); });
      // a tap opens the dress page; a drag only turns the dress
      media.addEventListener('click', (e) => { if (downX != null && Math.abs(e.clientX - downX) > 8) e.stopPropagation(); downX = null; });
      media.addEventListener('pointerleave', () => { last = 0; img.src = images[0]; });
      images.forEach((u) => { new Image().src = u; });   // warm the cache
    });
  }

  // ---------- dialog ----------
  function open(productId) {
    const isCustom = productId === 'custom';
    state.product = isCustom ? null : products.find((p) => p.id === productId) || null;
    state.custom = isCustom;
    state.step = 0;
    if (window.RaphCaptcha) window.RaphCaptcha.mount($('#orderCaptcha'));   // runs in the background while they fill the form
    state.files.forEach((f) => URL.revokeObjectURL(f.url));
    state.files = [];
    form.reset();   // also clears the consent tick
    dialog.querySelectorAll('[data-key]').forEach((i) => { delete i.dataset.cm; });
    restoreDraft();
    applyProfile();
    renderThumbs();
    $('#orderEyebrow').textContent = isCustom ? 'Custom design' : 'Made to measure';
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
    $('#orderCaptcha').style.display = done ? 'none' : '';   // the check has done its job once the order is in
    stepsEl.hidden = done;
    if (!done) {
      stepsEl.innerHTML = STEP_NAMES.map((name, i) =>
        `<li class="${i === n ? 'is-now' : i < n ? 'is-done' : ''}"><i>${i < n ? '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 6.5l2.6 2.6L10 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : i + 1}</i><b>${name}</b></li>`).join('');
      backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = n === 3 ? 'Place order' : 'Next';
      if (n === 3) renderReview();
    }
    $('#orderBody').scrollTop = 0;
    const first = dialog.querySelector(`[data-step="${n}"] input, [data-step="${n}"] textarea`);
    if (first && n !== 3 && n !== 'done') first.focus({ preventScroll: true });
  }

  // ---------- how-to-measure guide ----------
  // One small figure, with the measured line drawn on it. The panel above the fields follows whichever box is active.
  const TIPS = {
    bust:          'Level around the fullest part of your chest, under the arms. Snug, not tight.',
    underbust:     'Just under the bust, where a bra band sits.',
    waist:         'The narrowest part of your torso, usually just above the belly button.',
    hips:          'Around the fullest part of your hips and bottom, feet together.',
    shoulder:      'Across your back, from the tip of one shoulder to the other.',
    bustPoint:     'Straight across from one nipple to the other.',
    shoulderWaist: 'From the top of your shoulder, over the bust, down to your waist.',
    sleeveLength:  'From the shoulder tip to where you want the sleeve to end. Arm slightly bent.',
    upperArm:      'Around the fullest part of your upper arm, relaxed.',
    dressLength:   'From the top of your shoulder to where you want the hem. Stand in the shoes you will wear.',
    height:        'Stand straight against a wall, without shoes.',
  };
  const MARK = {
    bust:          '<path d="M37 77Q60 83 83 77"/><circle cx="37" cy="77" r="2.4"/><circle cx="83" cy="77" r="2.4"/>',
    underbust:     '<path d="M40 90Q60 96 80 90"/><circle cx="40" cy="90" r="2.4"/><circle cx="80" cy="90" r="2.4"/>',
    waist:         '<path d="M46 108Q60 114 74 108"/><circle cx="46" cy="108" r="2.4"/><circle cx="74" cy="108" r="2.4"/>',
    hips:          '<path d="M35 138Q60 145 85 138"/><circle cx="35" cy="138" r="2.4"/><circle cx="85" cy="138" r="2.4"/>',
    shoulder:      '<path d="M37 49Q60 44 83 49"/><circle cx="37" cy="49" r="2.4"/><circle cx="83" cy="49" r="2.4"/>',
    bustPoint:     '<path d="M51 78h18"/><circle cx="51" cy="78" r="2.4"/><circle cx="69" cy="78" r="2.4"/>',
    shoulderWaist: '<path d="M46 45Q51 76 47 108"/><circle cx="46" cy="45" r="2.4"/><circle cx="47" cy="108" r="2.4"/>',
    sleeveLength:  '<path d="M38 49Q27 70 25 104L25 126"/><circle cx="38" cy="49" r="2.4"/><circle cx="25" cy="126" r="2.4"/>',
    upperArm:      '<ellipse cx="30" cy="80" rx="6.5" ry="3"/>',
    dressLength:   '<path d="M60 46V238" stroke-dasharray="4 3.5"/><circle cx="60" cy="46" r="2.4"/><circle cx="60" cy="238" r="2.4"/>',
    height:        '<path d="M110 10V240"/><path d="M105 10h10M105 240h10"/>',
  };
  const FIGURE =
    '<path class="fig" d="M38 48Q27 70 25 104L24 128Q28 130 31 128L33 104Q35 76 44 56Z"/>' +
    '<path class="fig" d="M82 48Q93 70 95 104L96 128Q92 130 89 128L87 104Q85 76 76 56Z"/>' +
    '<path class="fig" d="M55 40Q46 41 38 48Q36 62 40 76Q40 86 44 94Q48 104 47 112Q40 124 36 138Q36 160 41 190L43 238H56L58 160L60 152L62 160L64 238H77L79 190Q84 160 84 138Q80 124 73 112Q72 104 76 94Q80 86 80 76Q84 62 82 48Q74 41 65 40Z"/>' +
    '<path class="fig" d="M55 30v11M65 30v11"/><ellipse class="fig" cx="60" cy="20" rx="10" ry="12"/>' +
    '<circle class="hair" cx="60" cy="6" r="6.5"/><path class="hair" d="M49.5 20Q48 5 60 6Q72 5 70.5 20Q66 12 60 12Q54 12 49.5 20Z"/>';
  const diagram = (key) => `<svg viewBox="0 0 120 250" width="60" height="125" aria-hidden="true">${FIGURE}<g class="halo">${MARK[key] || ''}</g><g class="mk">${MARK[key] || ''}</g></svg>`;

  function showGuide(key) {
    const m = MEASUREMENTS.find((x) => x.key === key) || MEASUREMENTS[0];
    const g = $('#mGuide');
    if (g.dataset.for === m.key) return;
    g.dataset.for = m.key;
    g.innerHTML = `${diagram(m.key)}<div><b>${m.label}${m.optional ? ' <i>optional</i>' : ''}</b><p>${TIPS[m.key] || m.hint}</p></div>`;
  }

  // ---------- measurements ----------
  function buildMeasureFields() {
    $('#measureFields').innerHTML = MEASUREMENTS.map((m) => `
      <label class="field">${m.label}${m.optional ? ' <span class="opt">(optional)</span>' : ''}
        <span class="unitwrap"><input name="m_${m.key}" type="number" inputmode="decimal" step="0.25" min="0" data-key="${m.key}" ${m.optional ? '' : 'required'}><i class="unit">in</i></span>
      </label>`).join('');
    showGuide(MEASUREMENTS[0].key);
  }

  const toCm = (v) => v * IN;
  const round1 = (v) => Math.round(v * 10) / 10;
  const quarter = (v) => Math.round(v * 4) / 4;

  // Each input keeps its exact value in cm (dataset.cm); the visible number is inches to the nearest quarter.
  const show = (cm) => quarter(cm / IN);

  function setCm(inp, cm) {
    if (cm == null || isNaN(cm)) { delete inp.dataset.cm; inp.value = ''; return; }
    inp.dataset.cm = cm;
    inp.value = show(cm);
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
      const em = form.elements.email.value.trim();
      if (em && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(em)) return fail('That email address does not look right.', form.elements.email);
      if (!address.value.trim()) return fail('Enter your delivery address.', address);
    }
    if (step === 1) {
      const m = readMeasurements();
      for (const f of MEASUREMENTS) {
        const inp = $(`[data-key="${f.key}"]`);
        if (m[f.key] == null) { if (f.optional) continue; return fail(`Enter your ${f.label.toLowerCase()}.`, inp); }
        const v = show(m[f.key]);
        if (v < f.min || v > f.max) return fail(`Check your ${f.label.toLowerCase()} (${f.min}–${f.max} in).`, inp);
      }
    }
    $('#consentError').textContent = '';
    if (step === 3 && !$('#consent').checked) {
      $('#consentError').textContent = 'Please tick the box to continue.';   // shown right under the box
      $('#consent').focus(); $('#consent').setAttribute('aria-invalid', 'true');
      return false;
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
        email: form.elements.email.value.trim() || null,
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
      const c = o.measurementsCm[m.key];
      if (c == null) return '';
      return `<div><dt>${m.label}</dt><dd>${show(c)}</dd></div>`;
    }).join('');
    const img = state.product && state.product.images ? state.product.images[0] : null;
    const kind = state.custom ? 'Your own design' : 'Made to measure';
    const edit = (n) => `<button type="button" class="rv__edit" data-goto="${n}">Edit</button>`;
    const thumbs = state.files.slice(0, 5).map((f) => `<img src="${f.url}" alt="">`).join('');
    $('#review').innerHTML = `
      <div class="rv__lead">
        ${img ? `<img class="rv__img" src="${img}" alt="">` : '<span class="rv__img rv__img--blank" aria-hidden="true"></span>'}
        <div>
          <p class="rv__kind">${kind}</p>
          <p class="rv__name">${esc(o.product.name)}</p>
          <p class="rv__price">${o.product.price != null ? money(o.product.price) : 'Price confirmed by phone'}</p>
        </div>
      </div>

      <section class="rv__sec">
        <header><h5>Your details</h5>${edit(0)}</header>
        <dl class="rv__rows">
          <div><dt>Name</dt><dd>${esc(o.customer.name)}</dd></div>
          <div><dt>Phone</dt><dd>${esc(o.customer.phone)}</dd></div>
          ${o.customer.email ? `<div><dt>Email</dt><dd>${esc(o.customer.email)}</dd></div>` : ''}
          <div><dt>Address</dt><dd>${esc(o.customer.address)}</dd></div>
          ${o.customer.needBy ? `<div><dt>Needed by</dt><dd>${esc(o.customer.needBy)}</dd></div>` : ''}
        </dl>
      </section>

      <section class="rv__sec">
        <header><h5>Measurements <i>inches</i></h5>${edit(1)}</header>
        <dl class="rv__meas">${meas}</dl>
      </section>

      <section class="rv__sec">
        <header><h5>Style</h5>${edit(2)}</header>
        ${o.notes ? `<p class="rv__note">${esc(o.notes)}</p>` : ''}
        ${thumbs ? `<div class="rv__thumbs">${thumbs}</div>` : `<p class="rv__note">No photos added</p>`}
      </section>`;
  }

  // Sends a finished order and resolves with the server's reply ({ reference }), or null when there is
  // no endpoint yet. Throws if the server rejects it. Without an endpoint the order is kept in this
  // browser only.
  async function send(order, files, humanToken) {
    if (config.orderEndpoint) {
      const fd = new FormData();
      fd.append('order', JSON.stringify(order));
      if (humanToken) fd.append('turnstile', humanToken);
      (files || []).forEach((f) => fd.append('photos', f.blob, f.name));
      const res = await fetch(config.orderEndpoint, { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error((data && (data.message || data.error)) || 'bad status ' + res.status);
        err.status = res.status; err.data = data;     // e.g. { error: 'sold_out', message, productId, size }
        throw err;
      }
      return data;
    }
    try {
      const all = JSON.parse(localStorage.getItem('raph_orders') || '[]');
      all.push(order);
      localStorage.setItem('raph_orders', JSON.stringify(all));
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  const ref = () => 'MAVE-' + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();

  async function submit() {
    const order = Object.assign({ reference: ref(), placedAt: new Date().toISOString() }, collect());
    nextBtn.disabled = true; nextBtn.textContent = 'Sending…';
    try {
      const humanToken = window.RaphCaptcha ? await window.RaphCaptcha.token($('#orderCaptcha')) : '';
      const reply = await send(order, state.files, humanToken);
      if (reply && reply.reference) order.reference = reply.reference;   // the server's reference is the real one
    } catch (e) {
      nextBtn.disabled = false; nextBtn.textContent = 'Place order';
      if (window.RaphCaptcha) window.RaphCaptcha.reset($('#orderCaptcha'));
      return fail(e && e.data && e.data.message ? e.data.message : 'Could not send. Check your connection and try again.');
    }
    saveProfile(order);
    clearDraft();
    state.last = { reference: order.reference, phone: order.customer.phone };
    nextBtn.disabled = false; nextBtn.textContent = 'Place order';
    $('#doneRef').textContent = order.reference;
    $('#doneMsg').textContent = `Thank you, ${order.customer.name.split(' ')[0]}. We'll call you on ${order.customer.phone} to confirm.${order.customer.email ? ' A copy is on its way to ' + order.customer.email + '.' : ''}`;
    const dev = $('#devNote');
    dev.hidden = !!config.orderEndpoint;
    dev.textContent = 'Test mode: saved on this device only, not sent to Mave Collection.';
    showStep('done');
  }

  // ---------- draft (so a half-finished form survives a refresh) ----------
  const DRAFT = 'raph_draft';
  function saveDraft() {
    try {
      const d = { f: {} };
      ['name', 'phone', 'email', 'address', 'needBy', 'notes'].forEach((k) => { d.f[k] = form.elements[k].value; });
      d.m = {}; dialog.querySelectorAll('[data-key]').forEach((i) => { if (i.dataset.cm) d.m[i.dataset.key] = Number(i.dataset.cm); });
      localStorage.setItem(DRAFT, JSON.stringify(d));
    } catch (e) { /* ignore */ }
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (!d) return;
            Object.entries(d.f || {}).forEach(([k, v]) => { form.elements[k].value = v; });
      Object.entries(d.m || {}).forEach(([k, v]) => { const i = $(`[data-key="${k}"]`); if (i) setCm(i, v); });
    } catch (e) { /* ignore */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT); } catch (e) { /* ignore */ } }


  // ---------- saved details (this device only) ----------
  // After an order, the customer's details and measurements can be kept in this browser so that next time
  // they only change what is different. Nothing is sent anywhere: it lives in localStorage and can be cleared.
  const PROFILE = 'raph_profile';
  const readProfile = () => { try { const p = JSON.parse(localStorage.getItem(PROFILE) || 'null'); return p && p.v === 1 && p.m ? p : null; } catch (e) { return null; } };
  const dateShort = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };

  function saveProfile(order) {
    try {
      if (!$('#remember').checked) return;
      const m = {};
      Object.entries(order.measurementsCm || {}).forEach(([k, v]) => { if (v != null) m[k] = v; });
      localStorage.setItem(PROFILE, JSON.stringify({
        v: 1, savedAt: new Date().toISOString(),
        name: order.customer.name, phone: order.customer.phone, email: order.customer.email || '', address: order.customer.address, m,
      }));
    } catch (e) { /* ignore */ }
  }

  // fill empty boxes from the saved profile, and mark which measurements differ from it
  function applyProfile() {
    state.saved = null;
    const p = readProfile();
    if (!p) { renderSavedNotes(); return; }
    state.saved = p;
    ['name', 'phone', 'email', 'address'].forEach((k) => { if (p[k] && !form.elements[k].value) form.elements[k].value = p[k]; });
    dialog.querySelectorAll('[data-key]').forEach((i) => { if (!i.dataset.cm && p.m[i.dataset.key] != null) setCm(i, p.m[i.dataset.key]); });
    renderSavedNotes();
    markChanged();
  }

  function renderSavedNotes() {
    const p = state.saved;
    ['0', '1'].forEach((n) => {
      const el = $('#savedNote' + n);
      if (!p) { el.hidden = true; return; }
      const first = esc((p.name || '').split(' ')[0]);
      el.hidden = false;
      el.innerHTML = n === '0'
        ? `<span>Welcome back${first ? ', ' + first : ''}. We filled in your details from ${dateShort(p.savedAt)}.</span> <button type="button" data-forget>Not you? Clear</button>`
        : `<span>Your measurements from ${dateShort(p.savedAt)} are filled in. Change only what is different.</span> <button type="button" data-forget>Clear</button>`;
    });
  }

  // a small "changed" tag on any measurement that no longer matches the saved one
  function markChanged() {
    dialog.querySelectorAll('[data-key]').forEach((i) => {
      const saved = state.saved && state.saved.m[i.dataset.key];
      const now = i.dataset.cm == null ? null : Number(i.dataset.cm);
      const changed = saved != null && now != null && Math.abs(now - saved) > 0.06;
      i.closest('.field').classList.toggle('is-changed', changed);
    });
  }

  function forgetProfile() {
    try { localStorage.removeItem(PROFILE); } catch (e) { /* ignore */ }
    if (state.saved) {
      ['name', 'phone', 'email', 'address'].forEach((k) => { if (form.elements[k].value === state.saved[k]) form.elements[k].value = ''; });
      dialog.querySelectorAll('[data-key]').forEach((i) => {
        const v = state.saved.m[i.dataset.key];
        if (v != null && Number(i.dataset.cm) === v) { delete i.dataset.cm; i.value = ''; }
      });
    }
    state.saved = null;
    renderSavedNotes(); markChanged(); saveDraft();
  }

  window.Raph = { money, ref, send, config, esc, compress };

  // ---------- wiring ----------
  buildMeasureFields();
  renderGrid();
  if (window.RaphStock) window.RaphStock.onChange(renderGrid);   // redraw when stock arrives or changes
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-order]');
    if (trigger) { e.preventDefault(); open(trigger.dataset.order); }
  });
  $('#orderClose').addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target.closest('[data-forget]')) forgetProfile(); });
  $('#doneFit').addEventListener('click', () => { const l = state.last || {}; close(); if (window.RaphFit) window.RaphFit.open(l); });
  $('#doneClose').addEventListener('click', () => { close(); document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });   // click on the backdrop
  backBtn.addEventListener('click', () => { if (state.step > 0) showStep(state.step - 1); });
  nextBtn.addEventListener('click', () => {
    if (!validate(state.step)) return;
    if (state.step === 3) submit(); else showStep(state.step + 1);
  });
  $('#review').addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) showStep(Number(b.dataset.goto)); });
  stepsEl.addEventListener('click', (e) => { const li = e.target.closest('li.is-done'); if (li) showStep([...stepsEl.children].indexOf(li)); });
  $('#measureFields').addEventListener('focusin', (e) => { const i = e.target.closest('[data-key]'); if (i) showGuide(i.dataset.key); });
  form.addEventListener('submit', (e) => { e.preventDefault(); nextBtn.click(); });
  form.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-key]');
    if (inp) { const v = parseFloat(inp.value); if (isNaN(v)) delete inp.dataset.cm; else inp.dataset.cm = toCm(v); }
    saveDraft(); if (state.step === 1) softWarnings(); markChanged();
  });
  $('#refInput').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  $('#thumbs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [f] = state.files.splice(Number(b.dataset.rm), 1); URL.revokeObjectURL(f.url); renderThumbs();
  });
})();
