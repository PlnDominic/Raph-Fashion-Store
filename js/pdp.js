// Dress page: gallery (drag to turn), size, Add to cart / Get it tailored.
(function () {
  const R = window.Raph;
  const products = window.PRODUCTS || [];
  const config = window.RAPH_CONFIG || {};
  const dlg = document.getElementById('pdp');
  if (!dlg || !R) return;

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(4, '0');
  const img = $('pdpImg');
  const main = $('pdpMain');
  let product = null, size = '', seq = [], at = 0;

  function open(id) {
    product = products.find((p) => p.id === id);
    if (!product) return;
    size = '';
    const gallery = product.gallery || product.images;
    // what dragging the big photo turns through: the dress's spin sequence if it has one, else the gallery
    seq = product.spin || gallery;

    $('pdpThumbs').innerHTML = gallery.length > 1 ? gallery.map((u, i) =>
      `<button type="button" class="pdp__thumb${i ? '' : ' is-on'}" data-src="${u}" aria-label="View ${i + 1}"><img src="${u}" alt=""></button>`).join('') : '';
    dlg.querySelector('.pdp__gallery').classList.toggle('is-single', gallery.length < 2);
    main.classList.toggle('can-turn', seq.length > 1);
    show(gallery[0]);
    img.alt = product.name;
    $('pdpName').textContent = product.name;
    $('pdpPrice').textContent = product.price != null ? R.money(product.price) : 'Price on request';
    $('pdpSizeBlock').hidden = !product.readyMade;
    $('pdpAdd').hidden = !product.readyMade;
    $('pdpSizes').innerHTML = (config.sizes || []).map((s) =>
      `<button type="button" class="chip" data-size="${R.esc(s)}" aria-pressed="false">${R.esc(s.replace(/^UK\s*/, ''))}</button>`).join('');
    $('pdpSizeLabel').textContent = 'choose';
    $('pdpError').textContent = '';
    $('pdpTailor').dataset.order = product.id;
    $('pdpHint').hidden = !product.spin;
    seq.forEach((u) => { new Image().src = u; });
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('.pdp__scroll').scrollTop = 0;
  }

  function show(u) {
    img.src = u;
    const i = seq.indexOf(u);
    if (i >= 0) at = i;
    dlg.querySelectorAll('.pdp__thumb').forEach((t) => t.classList.toggle('is-on', t.dataset.src === u));
  }

  // drag across the main photo to turn the dress
  let drag = null;
  main.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || seq.length < 2) return;
    drag = { x: e.clientX, from: at };
    main.setPointerCapture(e.pointerId);
  });
  main.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const step = main.clientWidth / seq.length / 1.2;
    const i = ((drag.from + Math.round((drag.x - e.clientX) / step)) % seq.length + seq.length) % seq.length;
    if (i !== at) { at = i; img.src = seq[i]; dlg.querySelectorAll('.pdp__thumb').forEach((t) => t.classList.toggle('is-on', t.dataset.src === seq[i])); }
  });
  const end = () => { drag = null; };
  main.addEventListener('pointerup', end);
  main.addEventListener('pointercancel', end);

  dlg.addEventListener('click', (e) => {
    const t = e.target;
    const thumb = t.closest('.pdp__thumb');
    const chip = t.closest('.chip');
    if (t === dlg || t.closest('[data-pdp-close]')) dlg.close();
    else if (thumb) show(thumb.dataset.src);
    else if (chip) {
      size = chip.dataset.size;
      dlg.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === chip));
      $('pdpSizeLabel').textContent = size.replace(/^UK\s*/, '');
      $('pdpError').textContent = '';
    } else if (t.closest('#pdpAdd')) {
      if (!size) { $('pdpError').textContent = 'Choose a size.'; return; }
      window.RaphCart && window.RaphCart.add(product.id, size);
    }
  });

  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { e.preventDefault(); open(v.dataset.view); }
  });

  window.RaphPdp = { open };
})();
