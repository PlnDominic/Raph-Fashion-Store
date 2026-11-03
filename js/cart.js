// Cart for ready-made dresses: add from the shop ("Order"), pick a size, check out with delivery details.
(function () {
  const R = window.Raph;
  const products = window.PRODUCTS || [];
  const config = window.RAPH_CONFIG || {};
  const dialog = document.getElementById('cartDialog');
  if (!R || !dialog) return;

  const body = document.getElementById('cartBody');
  const foot = document.getElementById('cartFoot');
  const title = document.getElementById('cartTitle');
  const countEl = document.getElementById('cartCount');
  const openBtn = document.getElementById('cartBtn');
  const S = window.RaphStock;
  const pad = (n) => String(n).padStart(4, '0');
  const prod = (id) => products.find((p) => p.id === id);

  let cart = load();
  let view = 'list';                 // list | checkout | done
  let details = { name: '', phone: '', address: '', notes: '' };
  let doneInfo = null;
  let notice = '';                   // why the cart changed (e.g. a size sold out); shown until the customer acts

  function load() {
    try { return JSON.parse(localStorage.getItem('raph_cart') || '[]').filter((i) => prod(i.id)); }
    catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem('raph_cart', JSON.stringify(cart)); } catch (e) { /* ignore */ }
    const n = cart.reduce((sum, i) => sum + i.qty, 0);
    countEl.textContent = n; countEl.hidden = !n;
    openBtn.setAttribute('aria-label', n ? `Open cart, ${n} item${n === 1 ? '' : 's'}` : 'Open cart');
  }

  const priceOf = (p) => (p.price != null ? R.money(p.price) : 'Price on request');
  function totalText() {
    if (cart.every((i) => prod(i.id).price != null)) return R.money(cart.reduce((s, i) => s + prod(i.id).price * i.qty, 0));
    return 'Confirmed by phone';
  }

  // ---------- rendering ----------
  function render() {
    if (view === 'list') renderList();
    else if (view === 'checkout') renderCheckout();
    else renderDone();
  }

  // most of this line the customer may buy: what is left in the chosen size, never more than 9
  function maxQty(i) {
    const left = S && i.size ? S.qty(i.id, i.size) : Infinity;
    return Math.max(1, Math.min(9, left));
  }

  // Compare the cart with current stock. Sold-out sizes are cleared (the customer must pick again) and
  // quantities are trimmed. Returns messages describing what changed.
  function reconcile() {
    if (!S || !S.known) return [];
    const msgs = [];
    for (const i of cart) {
      const p = prod(i.id);
      if (S.soldOut(i.id)) { msgs.push(`${p.name} has sold out. Remove it, or use "Get it tailored" to have it made for you.`); continue; }
      if (!i.size) continue;
      const left = S.qty(i.id, i.size);
      if (left <= 0) { msgs.push(`${p.name} in ${i.size} has sold out. Please choose another size.`); i.size = ''; }
      else if (i.qty > left) { msgs.push(`Only ${left} of ${p.name} in ${i.size} left, so we lowered the quantity.`); i.qty = left; }
    }
    if (msgs.length) { notice = msgs[0]; save(); }
    return msgs;
  }

  function renderList() {
    title.textContent = 'Cart';
    if (!cart.length) {
      body.innerHTML = '<p class="cart__empty">Your cart is empty.</p>';
      foot.innerHTML = '<button type="button" class="btn" data-close>Continue shopping</button>';
      return;
    }
    body.innerHTML = '<ul class="lines">' + cart.map((i) => {
      const p = prod(i.id);
      const sizes = (S ? S.sizes(p.id) : (config.sizes || [])).filter((s) => !S || S.qty(p.id, s) > 0);
      const opts = ['<option value="">Choose size</option>'].concat(sizes.map((s) => `<option${s === i.size ? ' selected' : ''}>${R.esc(s)}</option>`)).join('');
      const max = maxQty(i);
      return `
        <li class="line" data-id="${p.id}">
          <img src="${p.images[0]}" alt="" width="64" height="104">
          <div class="line__info">
            <h4>${R.esc(p.name)}</h4>
            <p>${priceOf(p)}</p>
            <div class="line__ctrl">
              <select data-size aria-label="Size">${opts}</select>
              <div class="qty">
                <button type="button" data-dec aria-label="One fewer">&minus;</button>
                <span aria-live="polite">${i.qty}</span>
                <button type="button" data-inc aria-label="One more"${i.qty >= max ? ' disabled' : ''}>+</button>
              </div>
            </div>
          </div>
          <button type="button" class="line__rm" data-rm aria-label="Remove ${R.esc(p.name)}">&times;</button>
        </li>`;
    }).join('') + '</ul>';
    foot.innerHTML = `
      <div class="cart__total"><span>Total</span><strong>${totalText()}</strong></div>
      <p class="err" id="cartError" role="alert">${R.esc(notice)}</p>
      <button type="button" class="btn" data-checkout>Checkout</button>`;
  }

  function renderCheckout() {
    title.textContent = 'Checkout';
    body.innerHTML = `
      <label class="field">Full name<input name="name" autocomplete="name" value="${R.esc(details.name)}"></label>
      <label class="field">Phone / WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${R.esc(details.phone)}"></label>
      <label class="field">Delivery address<input name="address" autocomplete="street-address" value="${R.esc(details.address)}"></label>
      <label class="field">Notes <span class="opt">(optional)</span><textarea name="notes" rows="2">${R.esc(details.notes)}</textarea></label>
      <div class="cart__total"><span>Total</span><strong>${totalText()}</strong></div>`;
    foot.innerHTML = `
      <div class="cart__nav">
        <button type="button" class="btn btn--ghost" data-back>Back</button>
        <button type="button" class="btn" data-place>Place order</button>
      </div>
      <p class="err" id="cartError" role="alert"></p>`;
  }

  function renderDone() {
    title.textContent = 'Order received';
    body.innerHTML = `
      <div class="done">
        <div class="done__tick" aria-hidden="true">&#10003;</div>
        <h4>Thank you</h4>
        <p class="done__ref">Reference <strong>${R.esc(doneInfo.ref)}</strong></p>
        <p>${R.esc(doneInfo.msg)}</p>
        ${config.orderEndpoint ? '' : '<p class="devnote">Test mode: saved on this device only, not sent to Mave Collection.</p>'}
      </div>`;
    foot.innerHTML = '<button type="button" class="btn" data-close>Back to the shop</button>';
  }

  // ---------- actions ----------
  function open(v) {
    view = v || 'list';
    render();
    if (S && view === 'list') S.refresh().then(() => { if (dialog.open && view === 'list') { reconcile(); renderList(); } });
    if (!dialog.open) dialog.showModal();
  }
  function close() { if (dialog.open) dialog.close(); }
  const setError = (msg, el) => {
    const e = document.getElementById('cartError'); if (e) e.textContent = msg;
    if (el) { el.focus(); el.setAttribute('aria-invalid', 'true'); }
    return false;
  };

  function add(id, size) {
    if (S && (S.soldOut(id) || (size && S.qty(id, size) <= 0))) return;       // nothing to add
    const line = cart.find((i) => i.id === id);
    if (line) {
      if (size) line.size = size;
      line.qty = Math.min(line.qty + 1, maxQty(line));
    } else cart.push({ id, qty: 1, size: size || '' });
    save();
    open('list');
    if (S) S.refresh(true).then(() => { reconcile(); if (dialog.open && view === 'list') renderList(); });
  }

  async function checkout() {
    notice = '';                                     // only problems found by THIS check may stop checkout
    if (S) {
      await S.refresh(true);
      reconcile();
      if (notice) { renderList(); return; }          // something changed: show what, and let the customer fix it
    }
    const missing = cart.find((i) => !i.size);
    if (missing) {
      const sel = body.querySelector(`[data-id="${missing.id}"] [data-size]`);
      return setError('Choose a size.', sel);
    }
    notice = ''; view = 'checkout'; render();
    body.querySelector('input').focus({ preventScroll: true });
  }

  async function place() {
    const f = body;
    const name = f.querySelector('[name=name]'), phone = f.querySelector('[name=phone]'), address = f.querySelector('[name=address]');
    f.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    if (!name.value.trim()) return setError('Enter your name.', name);
    if (phone.value.replace(/\D/g, '').length < 9) return setError('Enter a valid phone number.', phone);
    if (!address.value.trim()) return setError('Enter your delivery address.', address);

    const order = {
      type: 'ready-made',
      reference: R.ref(),
      placedAt: new Date().toISOString(),
      items: cart.map((i) => { const p = prod(i.id); return { id: p.id, name: p.name, size: i.size, qty: i.qty, price: p.price }; }),
      customer: { name: name.value.trim(), phone: phone.value.trim(), address: address.value.trim() },
      notes: f.querySelector('[name=notes]').value.trim(),
    };
    const btn = foot.querySelector('[data-place]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try { const reply = await R.send(order, []); if (reply && reply.reference) order.reference = reply.reference; }
    catch (e) {
      if (e && e.data && e.data.error === 'sold_out') {       // someone else just bought it: go back to the cart with the latest stock
        if (S) await S.refresh(true);
        reconcile(); notice = e.data.message || 'Something in your cart has just sold out.'; view = 'list'; render();
        return;
      }
      btn.disabled = false; btn.textContent = 'Place order';
      return setError('Could not send. Check your connection and try again.');
    }
    doneInfo = { ref: order.reference, msg: `Thank you, ${order.customer.name.split(' ')[0]}. We'll call you on ${order.customer.phone} to confirm.` };
    cart = []; save();
    view = 'done'; render();
  }

  // ---------- wiring ----------
  openBtn.addEventListener('click', () => open('list'));
  document.getElementById('cartClose').addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  document.addEventListener('click', (e) => {
    const add_ = e.target.closest('[data-add]');
    if (add_) { e.preventDefault(); add(add_.dataset.add); }
  });

  dialog.addEventListener('click', (e) => {
    const t = e.target;
    const line = t.closest('.line');
    const item = line && cart.find((i) => i.id === line.dataset.id);
    if (t.closest('[data-close]')) { close(); if (view === 'done') { view = 'list'; document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); } }
    else if (t.closest('[data-inc]') && item) { notice = ''; item.qty = Math.min(maxQty(item), item.qty + 1); save(); renderList(); }
    else if (t.closest('[data-dec]') && item) { notice = ''; item.qty = Math.max(1, item.qty - 1); save(); renderList(); }
    else if (t.closest('[data-rm]') && item) { notice = ''; cart = cart.filter((i) => i !== item); save(); renderList(); }
    else if (t.closest('[data-checkout]')) checkout();
    else if (t.closest('[data-back]')) { view = 'list'; render(); }
    else if (t.closest('[data-place]')) place();
  });
  dialog.addEventListener('change', (e) => {
    if (!e.target.matches('[data-size]')) return;
    const line = e.target.closest('.line'); const item = cart.find((i) => i.id === line.dataset.id);
    if (item) { item.size = e.target.value; notice = ''; save(); const er = document.getElementById('cartError'); if (er) er.textContent = ''; }
  });
  dialog.addEventListener('input', (e) => {
    if (view === 'checkout' && e.target.name) details[e.target.name] = e.target.value;
  });

  if (S) S.onChange(() => { if (dialog.open && view === 'list') { reconcile(); renderList(); } });
  window.RaphCart = { add };
  save();
})();
