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
  const names = {}; (window.PRODUCTS || []).forEach((p) => { names[p.id] = p.name; });

  const S = { token: null, orders: [], fittings: [], stock: [], tab: 'orders', filter: 'all', q: '', open: null };
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
      const [o, f, s] = await Promise.all([api('admin_orders'), api('admin_fittings'), api('admin_stock')]);
      S.orders = o.orders; S.fittings = f.fittings; S.stock = s.stock;
      render(); if (announce) toast('Up to date');
    } catch (x) { if (S.token) toast(x.message, true); }
  }

  // ---------- tabs ----------
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    S.tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    ['orders', 'fittings', 'stock'].forEach((t) => { $('tab-' + t).hidden = t !== S.tab; });
  });
  function render() { renderStats(); renderChips(); renderOrders(); renderFittings(); renderStock(); }

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
    (window.PRODUCTS || []).forEach((p) => { if (p.readyMade && !by[p.id]) by[p.id] = []; });
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

  // ---------- start ----------
  if (S.token) { showApp(true); loadAll(); }
})();
