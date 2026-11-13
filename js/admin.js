// Mave Admin: orders, fittings and stock. Talks to the order function with a short-lived token (kept for this tab only).
(function () {
  const endpoint = (window.RAPH_CONFIG || {}).orderEndpoint;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUSES = ['new', 'confirmed', 'cutting', 'sewing', 'ready', 'delivered', 'cancelled'];
  const PAYMENTS = ['unpaid', 'paid', 'refunded'];
  const KIND = { 'ready-made': 'Ready-made', 'made-to-measure': 'Made to measure', custom: 'Custom design' };
  const MEAS = [['bust', 'Bust'], ['underbust', 'Underbust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'], ['bustPoint', 'Bust point'],
    ['shoulderWaist', 'Shoulder to waist'], ['sleeveLength', 'Sleeve length'], ['upperArm', 'Round arm'], ['dressLength', 'Full length'], ['height', 'Height']];
  const names = {};

  const S = { token: null, orders: [], fittings: [], stock: [], products: [], content: {}, tab: 'orders', filter: 'all', q: '', open: null, editing: null };
  try { S.token = sessionStorage.getItem('mave_admin'); } catch (e) { /* ignore */ }

  const ghs = (n) => (n == null ? 'Price to confirm' : 'GHS ' + Number(n).toLocaleString('en-GH'));
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const dayLong = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const hhmm = (iso) => iso.slice(11, 16);
  const wa = (phone) => { const d = String(phone).replace(/\D/g, ''); return 'https://wa.me/' + (d.startsWith('233') ? d : d.startsWith('0') ? '233' + d.slice(1) : d); };
  const quarter = (cm) => Math.round((cm / 2.54) * 4) / 4;

  let toastT;
  function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 2600); }

  async function api(action, body) {
    if (!endpoint) throw Object.assign(new Error('No endpoint'), { data: { message: 'The site is not connected to the order function yet.' } });
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action, token: S.token }, body)) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'signed_out') signOut(true);
      throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
    }
    return data;
  }

  // ---------- sign in / out ----------
  function showApp(on) { $('login').hidden = on; $('app').hidden = !on; }
  function signOut(expired) {
    S.token = null; try { sessionStorage.removeItem('mave_admin'); } catch (e) { /* ignore */ }
    showApp(false); $('pw').value = '';
    if (expired) $('loginErr').textContent = 'Please sign in again.';
  }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('loginBtn'); btn.disabled = true; $('loginErr').textContent = '';
    try {
      const r = await api('admin_login', { password: $('pw').value, token: undefined });
      S.token = r.token; try { sessionStorage.setItem('mave_admin', r.token); } catch (x) { /* ignore */ }
      $('pw').value = ''; showApp(true); await loadAll();
    } catch (x) { $('loginErr').textContent = x.message; }
    btn.disabled = false;
  });
  $('signout').addEventListener('click', () => signOut(false));
  $('refresh').addEventListener('click', () => loadAll(true));

  // ---------- load ----------
  async function loadAll(announce) {
    try {
      const [o, f, s, c] = await Promise.all([api('admin_orders'), api('admin_fittings'), api('admin_stock'), api('admin_catalogue').catch(() => ({ products: [], content: {}, missing: true }))]);
      S.orders = o.orders; S.fittings = f.fittings; S.stock = s.stock; S.products = c.products; S.content = c.content; S.noCms = !!c.missing;
      S.products.forEach((p) => { names[p.id] = p.name; });
      render(); if (announce) toast('Up to date');
    } catch (x) { if (S.token) toast(x.message, true); }
  }

  // ---------- tabs ----------
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    S.tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    ['orders', 'fittings', 'stock', 'dresses', 'text'].forEach((t) => { $('tab-' + t).hidden = t !== S.tab; });
  });
  function render() { renderStats(); renderChips(); renderOrders(); renderFittings(); renderStock(); renderDresses(); renderText(); }

  // ---------- orders ----------
  const live = (o) => o.status !== 'cancelled';
  function renderStats() {
    const now = Date.now(), week = now + 7 * 86400_000;
    const nNew = S.orders.filter((o) => o.status === 'new').length;
    const prog = S.orders.filter((o) => ['confirmed', 'cutting', 'sewing', 'ready'].includes(o.status)).length;
    const unpaid = S.orders.filter((o) => live(o) && o.payment_status === 'unpaid');
    const owed = unpaid.reduce((t, o) => t + Number(o.total_ghs || 0), 0);
    const fits = S.fittings.filter((f) => f.status === 'booked' && Date.parse(f.slot_start) >= now && Date.parse(f.slot_start) <= week).length;
    $('stats').innerHTML = [
      ['New', nNew, 'waiting for you'], ['In progress', prog, 'confirmed to ready'],
      ['Unpaid', unpaid.length, owed ? ghs(owed) + ' to collect' : ''], ['Fittings', fits, 'in the next 7 days'],
    ].map(([l, n, s]) => `<div class="stat"><span>${l}</span><b>${n}</b><small>${esc(s)}</small></div>`).join('');
  }
  function renderChips() {
    const count = (st) => st === 'all' ? S.orders.length : S.orders.filter((o) => o.status === st).length;
    $('chips').innerHTML = ['all', ...STATUSES].map((st) => `<button class="chip" data-f="${st}" aria-pressed="${S.filter === st}">${st === 'all' ? 'All' : st[0].toUpperCase() + st.slice(1)}<b>${count(st)}</b></button>`).join('');
  }
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { S.filter = b.dataset.f; renderChips(); renderOrders(); } });
  $('search').addEventListener('input', (e) => { S.q = e.target.value.trim().toLowerCase(); renderOrders(); });

  const nextStage = (st) => STATUSES[STATUSES.indexOf(st) + 1] && st !== 'cancelled' && st !== 'delivered' ? STATUSES[STATUSES.indexOf(st) + 1] : null;

  function renderOrders() {
    const q = S.q;
    const rows = S.orders.filter((o) => (S.filter === 'all' || o.status === S.filter) &&
      (!q || [o.reference, o.customer_name, o.customer_phone].some((v) => String(v).toLowerCase().includes(q))));
    if (!rows.length) { $('orderList').innerHTML = `<div class="empty">${S.orders.length ? 'No orders match.' : 'No orders yet. New ones will appear here.'}</div>`; return; }
    $('orderList').innerHTML = rows.map(cardHtml).join('');
  }

  function cardHtml(o) {
    const open = S.open === o.id;
    const items = (o.order_items || []).map((i) => `${esc(i.product_name)}${i.size ? ' · ' + esc(i.size) : ''}${i.qty > 1 ? ' × ' + i.qty : ''}`).join(', ');
    return `<article class="card${open ? ' is-open' : ''}" data-id="${o.id}">
      <button class="card__head" data-toggle="${o.id}" aria-expanded="${open}">
        <span><span class="card__ref">${esc(o.reference)}</span> <span class="card__who">· ${esc(o.customer_name)} · ${when(o.created_at)}</span></span>
        <span class="card__sum">${items || esc(KIND[o.kind] || o.kind)}</span>
        <span class="card__right"><span class="card__total">${esc(ghs(o.total_ghs))}</span>
          <span><span class="pill pill--${o.status}">${o.status}</span> <span class="pill pill--${o.payment_status}">${o.payment_status}</span></span></span>
      </button>${open ? detailHtml(o) : ''}</article>`;
  }

  function detailHtml(o) {
    const nx = nextStage(o.status);
    const opt = (list, cur) => list.map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('');
    const items = (o.order_items || []).map((i) => `<li><span>${esc(i.product_name)}${i.size ? ' · ' + esc(i.size) : ''}${i.qty > 1 ? ' × ' + i.qty : ''}</span><span>${i.unit_price_ghs != null ? esc(ghs(i.unit_price_ghs)) : ''}</span></li>`).join('');
    const m = o.measurements_cm;
    const meas = m ? MEAS.filter(([k]) => m[k] != null).map(([k, l]) => `<div><dt>${l}</dt><dd>${quarter(m[k])}</dd></div>`).join('') : '';
    const fits = S.fittings.filter((f) => f.order_reference === o.reference && f.status !== 'blocked');
    const mail = o.notified_at ? `<span class="mail-ok">Emailed ${when(o.notified_at)}</span>` : o.notify_error ? `<span class="mail-bad">Email failed: ${esc(o.notify_error)}</span>` : 'No email sent';
    return `<div class="card__body">
      <div class="ctrls">
        <label>Status<select data-set="status">${opt(STATUSES, o.status)}</select></label>
        <label>Payment<select data-set="payment_status">${opt(PAYMENTS, o.payment_status)}</select></label>
        ${nx ? `<button class="ghost" data-next="${nx}">Move to ${nx} →</button>` : ''}
        <span class="grow"><a class="ghost" href="${esc(wa(o.customer_phone))}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="ghost" href="tel:${esc(String(o.customer_phone).replace(/[^\d+]/g, ''))}">Call</a></span>
      </div>
      <dl class="grid2 kv">
        <div><dt>Customer</dt><dd>${esc(o.customer_name)}<br>${esc(o.customer_phone)}</dd></div>
        <div><dt>Address</dt><dd>${esc(o.delivery_address)}</dd></div>
        <div><dt>Type</dt><dd>${esc(KIND[o.kind] || o.kind)}</dd></div>
        <div><dt>Needed by</dt><dd>${o.need_by ? esc(o.need_by) : 'No date given'}</dd></div>
        <div><dt>Order email</dt><dd>${mail}</dd></div>
      </dl>
      <div class="sec"><h4>Items</h4><ul class="items">${items}</ul>
        <div class="row" style="margin-top:10px"><label class="field">Total (GHS)<input type="number" min="0" step="0.01" data-total value="${o.total_ghs ?? ''}" style="width:130px" placeholder="to confirm"></label>
        <button class="ghost" data-save-total>Save total</button></div></div>
      ${o.notes ? `<div class="sec"><h4>Customer note</h4><p style="margin:0;white-space:pre-wrap">${esc(o.notes)}</p></div>` : ''}
      ${meas ? `<div class="sec"><h4>Measurements (inches)</h4><dl class="meas">${meas}</dl></div>` : ''}
      ${o.photos && o.photos.length ? `<div class="sec"><h4>Style photos</h4><div class="photos">${o.photos.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Style photo" loading="lazy"></a>`).join('')}</div></div>` : ''}
      ${fits.length ? `<div class="sec"><h4>Fitting</h4>${fits.map((f) => `<p style="margin:0">${dayLong(f.slot_start.slice(0, 10))}, ${hhmm(f.slot_start)} <span class="pill pill--${f.status === 'booked' ? 'confirmed' : f.status === 'done' ? 'delivered' : 'cancelled'}">${f.status}</span></p>`).join('')}</div>` : ''}
      <div class="sec"><label class="field">Internal notes (only your team sees this)<textarea data-notes>${esc(o.internal_notes || '')}</textarea></label>
        <button class="ghost" data-save-notes style="margin-top:8px">Save notes</button></div>
    </div>`;
  }

  async function updateOrder(id, patch, okMsg) {
    try { await api('admin_update_order', Object.assign({ id }, patch)); Object.assign(S.orders.find((o) => o.id === id), patch); toast(okMsg || 'Saved'); }
    catch (x) { toast(x.message, true); await loadAll(); return; }
    renderStats(); renderChips(); renderOrders();
  }

  $('orderList').addEventListener('click', (e) => {
    const card = e.target.closest('.card'); if (!card) return;
    const id = card.dataset.id;
    const t = e.target.closest('[data-toggle]');
    if (t) { S.open = S.open === id ? null : id; renderOrders(); return; }
    const nx = e.target.closest('[data-next]');
    if (nx) return updateOrder(id, { status: nx.dataset.next }, 'Moved to ' + nx.dataset.next);
    if (e.target.closest('[data-save-notes]')) return updateOrder(id, { internal_notes: card.querySelector('[data-notes]').value }, 'Notes saved');
    if (e.target.closest('[data-save-total]')) { const v = card.querySelector('[data-total]').value; return updateOrder(id, { total_ghs: v === '' ? null : Number(v) }, 'Total saved'); }
  });
  $('orderList').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-set]'); if (!sel) return;
    const id = sel.closest('.card').dataset.id;
    if (sel.dataset.set === 'status' && sel.value === 'cancelled' && !confirm('Cancel this order? Ready-made dresses go back in stock.')) { renderOrders(); return; }
    updateOrder(id, { [sel.dataset.set]: sel.value }, sel.dataset.set === 'status' ? 'Status updated' : 'Payment updated');
  });

  // ---------- fittings ----------
  function renderFittings() {
    const upcoming = S.fittings.filter((f) => f.status !== 'blocked');
    const blocked = {};
    S.fittings.filter((f) => f.status === 'blocked' && Date.parse(f.slot_start) >= Date.now() - 86400_000).forEach((f) => { const d = f.slot_start.slice(0, 10); blocked[d] = (blocked[d] || 0) + 1; });
    $('closures').innerHTML = `<h3>Close the studio</h3>
      <p class="note" style="margin:0 0 10px">Pick a day to stop customers booking it. Fittings already booked that day stay.</p>
      <div class="row"><input type="date" id="blockDate" class="addrow-input" style="padding:8px 10px;border:1px solid rgba(12,57,37,.25);border-radius:10px;font-size:16px">
        <button class="ghost" data-block>Close this day</button></div>
      ${Object.keys(blocked).length ? `<div class="closed">${Object.keys(blocked).sort().map((d) => `<span class="pill">${dayLong(d)} <button class="ghost" style="padding:1px 8px;margin-left:6px" data-unblock="${d}">Reopen</button></span>`).join('')}</div>` : ''}`;
    if (!upcoming.length) { $('fittingList').innerHTML = '<div class="empty">No fittings booked yet.</div>'; return; }
    const byDay = {};
    upcoming.forEach((f) => { (byDay[f.slot_start.slice(0, 10)] = byDay[f.slot_start.slice(0, 10)] || []).push(f); });
    $('fittingList').innerHTML = Object.keys(byDay).sort().map((d) => `<div class="day"><h3>${dayLong(d)}</h3>${byDay[d].map((f) => `
      <div class="appt${f.status === 'cancelled' ? ' is-gone' : ''}" data-id="${f.id}">
        <time>${hhmm(f.slot_start)}</time>
        <div>${esc(f.customer_name)} <span class="pill pill--${f.status === 'booked' ? 'confirmed' : f.status === 'done' ? 'delivered' : 'cancelled'}">${f.status}</span>
          <small>${esc(f.order_reference || '')} · ${esc(f.customer_phone || '')}</small></div>
        <div class="acts">
          <a class="ghost" href="${esc(wa(f.customer_phone || ''))}" target="_blank" rel="noopener">WhatsApp</a>
          ${f.status === 'booked' ? '<button class="ghost" data-fs="done">Done</button><button class="ghost danger" data-fs="cancelled">Cancel</button>' : '<button class="ghost" data-fs="booked">Restore</button>'}
        </div></div>`).join('')}</div>`).join('');
  }
  $('tab-fittings').addEventListener('click', async (e) => {
    try {
      const fs = e.target.closest('[data-fs]');
      if (fs) {
        const id = fs.closest('.appt').dataset.id;
        if (fs.dataset.fs === 'cancelled' && !confirm('Cancel this fitting? The time becomes free again.')) return;
        await api('admin_fitting_update', { id, status: fs.dataset.fs }); toast('Fitting updated'); return loadAll();
      }
      if (e.target.closest('[data-block]')) {
        const d = $('blockDate').value; if (!d) return toast('Pick a day first', true);
        await api('admin_fitting_block', { date: d }); toast('Day closed'); return loadAll();
      }
      const ub = e.target.closest('[data-unblock]');
      if (ub) { await api('admin_fitting_unblock', { date: ub.dataset.unblock }); toast('Day reopened'); return loadAll(); }
    } catch (x) { toast(x.message, true); loadAll(); }
  });

  // ---------- stock ----------
  const timers = {};
  function renderStock() {
    const by = {};
    S.stock.forEach((r) => { (by[r.product_id] = by[r.product_id] || []).push(r); });
    S.products.forEach((p) => { if (p.ready_made && !by[p.id]) by[p.id] = []; });
    const ids = Object.keys(by);
    if (!ids.length) { $('stockList').innerHTML = '<div class="empty">No stock rows yet. Run the stock SQL first.</div>'; return; }
    $('stockList').innerHTML = ids.map((id) => `<div class="prod" data-p="${esc(id)}"><h3>${esc(names[id] || id)}</h3>
      ${by[id].map((r) => `<div class="srow" data-s="${esc(r.size)}"><b>${esc(r.size)}</b>
        <span class="qty"><button data-d="-1" aria-label="One fewer">−</button><input type="number" min="0" max="999" value="${r.qty}" data-q><button data-d="1" aria-label="One more">+</button></span>
        <span>${r.qty === 0 ? '<span class="out">Sold out</span>' : r.qty === 1 ? '<span class="low">Last piece</span>' : ''} <span class="saved" data-ok></span>
        <button class="ghost danger" style="padding:3px 10px;margin-left:6px" data-del title="Stop offering this size">Remove</button></span></div>`).join('')}
      <div class="addrow"><input data-newsize placeholder="Size, e.g. UK 24"><input data-newqty type="number" min="0" max="999" placeholder="How many"><button class="ghost" data-add>Add size</button></div></div>`).join('');
  }
  async function saveStock(id, size, qty, row) {
    try { await api('admin_stock_set', { product_id: id, size, qty }); const r = S.stock.find((x) => x.product_id === id && x.size === size); if (r) r.qty = qty; else S.stock.push({ product_id: id, size, qty });
      if (row) { const ok = row.querySelector('[data-ok]'); if (ok) { ok.textContent = 'Saved'; setTimeout(() => { ok.textContent = ''; }, 1500); } } }
    catch (x) { toast(x.message, true); }
  }
  $('stockList').addEventListener('click', async (e) => {
    const prod = e.target.closest('.prod'); if (!prod) return; const id = prod.dataset.p;
    const row = e.target.closest('.srow');
    const d = e.target.closest('[data-d]');
    if (d && row) {
      const inp = row.querySelector('[data-q]'); const v = Math.max(0, Math.min(999, Number(inp.value || 0) + Number(d.dataset.d)));
      inp.value = v; clearTimeout(timers[id + row.dataset.s]);
      timers[id + row.dataset.s] = setTimeout(async () => { await saveStock(id, row.dataset.s, v, row); renderStockSoon(); }, 500);
    }
    if (e.target.closest('[data-del]') && row && confirm(`Stop offering ${row.dataset.s}? Customers will no longer see this size.`)) {
      try { await api('admin_stock_delete', { product_id: id, size: row.dataset.s }); S.stock = S.stock.filter((r) => !(r.product_id === id && r.size === row.dataset.s)); renderStock(); toast('Size removed'); } catch (x) { toast(x.message, true); }
    }
    if (e.target.closest('[data-add]')) {
      const size = prod.querySelector('[data-newsize]').value.trim(), qty = Number(prod.querySelector('[data-newqty]').value || 0);
      if (!size) return toast('Enter a size', true);
      await saveStock(id, size, qty); await loadAll(); toast('Size added');
    }
  });
  $('stockList').addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-q]'); if (!inp) return;
    const row = inp.closest('.srow'), id = inp.closest('.prod').dataset.p;
    const v = Math.max(0, Math.min(999, Math.floor(Number(inp.value || 0)))); inp.value = v;
    await saveStock(id, row.dataset.s, v, row); renderStockSoon();
  });
  let rs; function renderStockSoon() { clearTimeout(rs); rs = setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('#stockList')) renderStock(); }, 600); }


  // ---------- dresses ----------
  const SIZES = ['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22'];
  const NEW = { id: '', name: '', price: '', ready_made: true, lead_time: '', card_image: '', rail_image: '', rail_scale: 1, gallery: [], visible: true };

  function renderDresses() {
    if (S.noCms) {
      $('dressList').innerHTML = '<div class="empty">Managing dresses here needs the content SQL and the latest function. See step 11 in supabase/README.md.</div>';
      $('addDress').hidden = true; return;
    }
    $('addDress').hidden = false;
    $('dressForm').innerHTML = S.editing ? formHtml(S.editing) : '';
    if (!S.products.length) { $('dressList').innerHTML = '<div class="empty">No dresses yet. Add the first one.</div>'; return; }
    $('dressList').innerHTML = S.products.map((p, i) => `
      <article class="dress${p.visible ? '' : ' is-off'}" data-id="${esc(p.id)}">
        ${p.card_image ? `<img class="dress__img" src="${esc(p.card_image)}" alt="">` : '<span class="dress__img dress__img--none">No photo</span>'}
        <div><h3>${esc(p.name)}</h3>
          <p>${p.price == null ? 'Price on request' : esc(ghs(p.price))} &middot; ${p.ready_made ? 'Ready-made' : 'Made to order only'}${p.lead_time ? ' &middot; ' + esc(p.lead_time) : ''}</p>
          <p>${p.visible ? '' : '<span class="pill pill--cancelled">Hidden</span> '}${p.rail_image ? '' : '<span class="pill">Not in the homepage line-up</span>'}</p></div>
        <div class="acts">
          <button class="ghost" data-dact="edit">Edit</button>
          <button class="ghost" data-dact="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&uarr;</button>
          <button class="ghost" data-dact="down" ${i === S.products.length - 1 ? 'disabled' : ''} aria-label="Move down">&darr;</button>
          <button class="ghost" data-dact="vis">${p.visible ? 'Hide' : 'Show'}</button>
          <button class="ghost danger" data-dact="del">Delete</button>
        </div>
      </article>`).join('');
  }

  function formHtml(p) {
    const isNew = !p.id;
    const photo = (key, label, hint) => `<div class="field wide">${label}<span class="hint">${hint}</span>
      <div class="photo" data-photo="${key}">${p[key] ? `<img src="${esc(p[key])}" alt="">` : '<span class="none">None</span>'}
        <input type="file" accept="image/*" data-file="${key}">${p[key] ? `<button class="ghost danger" type="button" data-clear="${key}">Remove</button>` : ''}</div></div>`;
    return `<div class="panel form" id="dform"><h3>${isNew ? 'Add a dress' : 'Edit ' + esc(p.name)}</h3>
      <div class="formgrid">
        <label class="field">Name<input type="text" data-f="name" value="${esc(p.name)}" maxlength="120"></label>
        <label class="field">Price (GHS)<input type="number" min="0" step="1" data-f="price" value="${p.price ?? ''}" placeholder="empty = price on request"></label>
        <label class="field">Lead time <span style="text-transform:none;letter-spacing:0">(optional)</span><input type="text" data-f="lead_time" value="${esc(p.lead_time || '')}" maxlength="60" placeholder="e.g. 2 to 3 weeks"></label>
        <label class="field">How it is sold<select data-f="ready_made"><option value="1"${p.ready_made ? ' selected' : ''}>Ready-made (add to cart) and made to measure</option><option value="0"${p.ready_made ? '' : ' selected'}>Made to order only</option></select></label>
        ${photo('card_image', 'Main photo', 'Shown in the shop and on the dress page. Any background. A tall photo of the whole outfit works best.')}
        ${photo('rail_image', 'Line-up photo (optional)', 'For the homepage line-up: the whole model cut out on a transparent background (PNG or WebP). Without it the dress still sells in the shop but is not in the line-up.')}
        <label class="field">Size in the line-up<input type="number" min="0.4" max="1.2" step="0.05" data-f="rail_scale" value="${p.rail_scale ?? 1}"><span class="hint">1 is full size. Use about 0.85 for a photo that stops at the hips.</span></label>
        <div class="field wide">More photos <span class="hint">Extra angles on the dress page.</span>
          <div class="thumbs" id="gal">${(p.gallery || []).map((u, i) => `<figure><img src="${esc(u)}" alt=""><button type="button" data-gdel="${i}" aria-label="Remove">&times;</button></figure>`).join('')}<input type="file" accept="image/*" multiple data-file="gallery"></div></div>
        ${isNew ? '<label class="field">Starting stock<input type="number" min="0" max="99" step="1" data-f="start_qty" value="5"><span class="hint">How many of each size UK 8 to 22 (only for ready-made). Change it any time under Stock.</span></label>' : ''}
      </div>
      <div class="checks"><label><input type="checkbox" data-f="visible" ${p.visible ? 'checked' : ''}> Show this dress on the website</label></div>
      <div class="row"><button class="btn small" data-dsave>Save dress</button><button class="ghost" data-dcancel>Cancel</button><span class="err" id="dErr" role="alert"></span></div></div>`;
  }

  // shrink a photo before it is sent (the line-up photo keeps its transparent background)
  async function shrink(file, transparent) {
    const bmp = await createImageBitmap(file);
    const max = transparent ? 1100 : 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const mime = transparent ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise((res) => cv.toBlob(res, mime, transparent ? 0.9 : 0.88));
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
    return { mime: blob.type || mime, data: b64 };
  }
  async function uploadPhoto(file, transparent) {
    const { mime, data } = await shrink(file, transparent);
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': S.token }, body: JSON.stringify({ action: 'admin_upload_image', mime, data, folder: 'dresses' }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { if (j.error === 'signed_out') signOut(true); throw new Error(j.message || 'Could not upload that photo.'); }
    return j.url;
  }
  const readForm = () => {
    const f = (k) => document.querySelector(`#dform [data-f="${k}"]`);
    const e = S.editing;
    e.name = f('name').value.trim();
    e.price = f('price').value.trim() === '' ? null : Number(f('price').value);
    e.lead_time = f('lead_time').value.trim();
    e.ready_made = f('ready_made').value === '1';
    e.rail_scale = Number(f('rail_scale').value) || 1;
    e.visible = f('visible').checked;
    if (f('start_qty')) e.start_qty = Number(f('start_qty').value) || 0;
  };

  $('addDress').addEventListener('click', () => { S.editing = JSON.parse(JSON.stringify(NEW)); renderDresses(); $('dressForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  $('dressForm').addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-file]'); if (!inp || !inp.files.length) return;
    readForm();
    const err = $('dErr'); err.textContent = 'Uploading…';
    try {
      if (inp.dataset.file === 'gallery') {
        for (const file of [...inp.files].slice(0, 8)) { if (S.editing.gallery.length < 8) S.editing.gallery.push(await uploadPhoto(file, false)); }
      } else S.editing[inp.dataset.file] = await uploadPhoto(inp.files[0], inp.dataset.file === 'rail_image');
      renderDresses(); $('dErr').textContent = '';
    } catch (x) { err.textContent = x.message; }
  });
  $('dressForm').addEventListener('click', async (e) => {
    const clr = e.target.closest('[data-clear]');
    if (clr) { readForm(); S.editing[clr.dataset.clear] = ''; renderDresses(); return; }
    const gd = e.target.closest('[data-gdel]');
    if (gd) { readForm(); S.editing.gallery.splice(Number(gd.dataset.gdel), 1); renderDresses(); return; }
    if (e.target.closest('[data-dcancel]')) { S.editing = null; renderDresses(); return; }
    if (e.target.closest('[data-dsave]')) {
      e.preventDefault(); readForm();
      const p = S.editing; const err = $('dErr');
      if (!p.name) { err.textContent = 'Give the dress a name.'; return; }
      if (p.price !== null && (isNaN(p.price) || p.price < 0)) { err.textContent = 'The price must be a number.'; return; }
      if (!p.card_image) { err.textContent = 'Add a main photo.'; return; }
      err.textContent = 'Saving…';
      try {
        await api('admin_product_save', { product: p, start_qty: p.start_qty });
        S.editing = null; toast('Dress saved'); await loadAll();
      } catch (x) { err.textContent = x.message; }
    }
  });
  $('dressList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dact]'); if (!b) return;
    const id = b.closest('.dress').dataset.id; const i = S.products.findIndex((p) => p.id === id); const p = S.products[i];
    try {
      if (b.dataset.dact === 'edit') { S.editing = JSON.parse(JSON.stringify(p)); renderDresses(); $('dressForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (b.dataset.dact === 'vis') { await api('admin_product_save', { product: Object.assign({}, p, { visible: !p.visible }) }); toast(p.visible ? 'Hidden from the website' : 'Showing on the website'); }
      if (b.dataset.dact === 'del') {
        if (!confirm(`Delete ${p.name}? It disappears from the website. Past orders keep their details. (To hide it for a while instead, use Hide.)`)) return;
        await api('admin_product_delete', { id }); toast('Dress deleted');
      }
      if (b.dataset.dact === 'up' || b.dataset.dact === 'down') {
        const j = i + (b.dataset.dact === 'up' ? -1 : 1); if (j < 0 || j >= S.products.length) return;
        const ids = S.products.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
        await api('admin_products_order', { ids }); toast('Order saved');
      }
      await loadAll();
    } catch (x) { toast(x.message, true); }
  });

  // ---------- site text ----------
  function renderText() {
    if (S.noCms) { $('textBlocks').innerHTML = '<div class="empty">Editing the site text needs the content SQL and the latest function. See step 11 in supabase/README.md.</div>'; return; }
    const open = document.activeElement && document.activeElement.closest('#textBlocks');
    if (open) return;   // don't rebuild the forms under someone who is typing
    const c = S.content || {};
    const mq = Array.isArray(c.marquee) ? c.marquee : [];
    const k = c.contacts || {};
    const info = Array.isArray(c.info) ? c.info : [];
    $('textBlocks').innerHTML = `
      <div class="textblock" data-block="marquee"><h3>Scrolling band</h3><p class="note">The green band along the bottom of the homepage. One phrase per line.</p>
        <textarea rows="4" data-v>${esc(mq.join('\n'))}</textarea><div class="row" style="margin-top:10px"><button class="ghost" data-tsave>Save</button></div></div>

      <div class="textblock" data-block="contacts"><h3>Contacts</h3><p class="note">Shown in the footer.</p>
        <div class="formgrid">
          <label class="field">WhatsApp number (in full)<input type="text" data-k="whatsapp" value="${esc(k.whatsapp || '')}" placeholder="233541791986"></label>
          <label class="field">Email<input type="email" data-k="email" value="${esc(k.email || '')}"></label>
          <label class="field">Place<input type="text" data-k="address" value="${esc(k.address || '')}"></label>
          <label class="field">Phone numbers to call (one per line)<textarea rows="3" data-k="phones">${esc((k.phones || []).join('\n'))}</textarea></label>
        </div><button class="ghost" data-tsave>Save</button></div>

      <div class="textblock" data-block="info"><h3>Good to know</h3><p class="note">The questions and answers near the bottom of the homepage.</p>
        <div id="infoItems">${info.map(infoHtml).join('')}</div>
        <div class="row"><button class="ghost" data-tadd>Add a question</button><button class="btn small" data-tsave>Save all</button></div></div>`;
  }
  const infoHtml = (it) => `<div class="infoitem"><label class="field">Question<input type="text" data-t value="${esc(it.title)}" maxlength="100"></label>
    <label class="field" style="margin-top:8px">Answer<textarea rows="5" data-b>${esc(it.body)}</textarea></label>
    <div class="acts"><button class="ghost" data-iup type="button">&uarr;</button><button class="ghost" data-idown type="button">&darr;</button><button class="ghost danger" data-idel type="button">Delete</button></div></div>`;
  $('textBlocks').addEventListener('click', async (e) => {
    const blk = e.target.closest('.textblock'); if (!blk) return;
    const items = () => blk.querySelector('#infoItems');
    if (e.target.closest('[data-tadd]')) { items().insertAdjacentHTML('beforeend', infoHtml({ title: '', body: '' })); return; }
    const row = e.target.closest('.infoitem');
    if (row && e.target.closest('[data-idel]')) { if (confirm('Delete this question?')) row.remove(); return; }
    if (row && e.target.closest('[data-iup]') && row.previousElementSibling) { row.parentNode.insertBefore(row, row.previousElementSibling); return; }
    if (row && e.target.closest('[data-idown]') && row.nextElementSibling) { row.parentNode.insertBefore(row.nextElementSibling, row); return; }
    if (!e.target.closest('[data-tsave]')) return;
    const key = blk.dataset.block; let value;
    if (key === 'marquee') value = blk.querySelector('[data-v]').value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (key === 'contacts') {
      const g = (n) => blk.querySelector(`[data-k="${n}"]`).value.trim();
      value = { whatsapp: g('whatsapp'), email: g('email'), address: g('address'), phones: g('phones').split('\n').map((x) => x.trim()).filter(Boolean) };
    }
    if (key === 'info') value = [...blk.querySelectorAll('.infoitem')].map((r) => ({ title: r.querySelector('[data-t]').value.trim(), body: r.querySelector('[data-b]').value.trim() })).filter((x) => x.title && x.body);
    try { await api('admin_content_save', { key, value }); S.content[key] = value; toast('Saved. It shows on the website within a few seconds.'); }
    catch (x) { toast(x.message, true); }
  });

  // ---------- start ----------
  if (S.token) { showApp(true); loadAll(); }
})();
