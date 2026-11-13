// Mave Admin: orders, fittings, dresses, stock and site text. Talks to the order function with a short-lived token
// (kept for this tab only).
(function () {
  const endpoint = (window.RAPH_CONFIG || {}).orderEndpoint;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STEPS = [['new', 'New'], ['confirmed', 'Confirmed'], ['cutting', 'Cutting'], ['sewing', 'Sewing'], ['ready', 'Ready'], ['delivered', 'Delivered']];
  const LABEL = { new: 'New', confirmed: 'Confirmed', cutting: 'Cutting', sewing: 'Sewing', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };
  const GROUPS = {
    all: ['All', null], new: ['New', ['new']], making: ['In progress', ['confirmed', 'cutting', 'sewing']],
    ready: ['Ready', ['ready']], done: ['Delivered', ['delivered']], cancelled: ['Cancelled', ['cancelled']],
  };
  const PAY = [['unpaid', 'Unpaid'], ['paid', 'Paid'], ['refunded', 'Refunded']];
  const KIND = { 'ready-made': 'Ready-made', 'made-to-measure': 'Made to measure', custom: 'Custom design' };
  const MEAS = [['bust', 'Bust'], ['underbust', 'Underbust'], ['waist', 'Waist'], ['hips', 'Hips'], ['shoulder', 'Shoulder'], ['bustPoint', 'Bust point'],
    ['shoulderWaist', 'Shoulder to waist'], ['sleeveLength', 'Sleeve length'], ['upperArm', 'Round arm'], ['dressLength', 'Full length'], ['height', 'Height']];
  const TITLES = { orders: 'Orders', fittings: 'Fittings', dresses: 'Dresses', stock: 'Stock', text: 'Site text' };
  const names = {};

  const S = { token: null, orders: [], fittings: [], stock: [], products: [], content: {}, tab: 'orders', filter: 'all', q: '', open: null, show: false, editing: null, noCms: false };
  try { S.token = sessionStorage.getItem('mave_admin'); S.tab = sessionStorage.getItem('mave_tab') || 'orders'; } catch (e) { /* ignore */ }
  if (!TITLES[S.tab]) S.tab = 'orders';

  const wide = () => window.matchMedia('(min-width: 960px)').matches;
  const wantsNotify = () => { try { return localStorage.getItem('mave_notify') !== '0'; } catch (e) { return true; } };
  const ghs = (n) => (n == null ? 'Price to confirm' : 'GHS ' + Number(n).toLocaleString('en-GH'));
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' h ago';
    if (m < 2880) return 'yesterday'; return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Accra' });
  };
  const dayLong = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const todayYmd = () => new Date().toISOString().slice(0, 10);
  const hhmm = (iso) => iso.slice(11, 16);
  const waLink = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return 'https://wa.me/' + (d.startsWith('233') ? d : d.startsWith('0') ? '233' + d.slice(1) : d); };
  const quarter = (cm) => Math.round((cm / 2.54) * 4) / 4;
  const items = (o) => (o.order_items || []).map((i) => `${i.product_name}${i.size ? ' · ' + i.size : ''}${i.qty > 1 ? ' × ' + i.qty : ''}`).join(', ');

  let toastT;
  function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000); }

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
      $('pw').value = ''; showApp(true); go(S.tab); await loadAll();
    } catch (x) { $('loginErr').textContent = x.message; }
    btn.disabled = false;
  });
  ['signout', 'signout2'].forEach((id) => $(id).addEventListener('click', () => signOut(false)));
  ['refresh', 'refresh2'].forEach((id) => $(id).addEventListener('click', () => loadAll(true)));

  // ---------- load ----------
  async function loadAll(announce) {
    try {
      const [o, f, s, c] = await Promise.all([api('admin_orders'), api('admin_fittings'), api('admin_stock'), api('admin_catalogue').catch(() => ({ products: [], content: {}, missing: true }))]);
      S.orders = o.orders; S.fittings = f.fittings; S.stock = s.stock; S.products = c.products; S.content = c.content; S.noCms = !!c.missing;
      S.products.forEach((p) => { names[p.id] = p.name; });
      render(); if (announce) toast('Up to date');
    } catch (x) { if (S.token) toast(x.message, true); }
  }

  // ---------- navigation ----------
  function go(tab) {
    S.tab = tab; try { sessionStorage.setItem('mave_tab', tab); } catch (e) { /* ignore */ }
    Object.keys(TITLES).forEach((t) => { $('tab-' + t).hidden = t !== tab; });
    document.querySelectorAll('#nav button').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('pageTitle').textContent = TITLES[tab];
    window.scrollTo(0, 0);
  }
  $('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });

  function render() { renderBadges(); renderOrders(); renderFittings(); renderDresses(); renderStock(); renderText(); }

  function badge(id, n) { const el = $(id); el.hidden = !n; el.textContent = n > 99 ? '99+' : n; }
  function renderBadges() {
    badge('nb-orders', S.orders.filter((o) => o.status === 'new').length);
    const now = Date.now(), week = now + 7 * 86400_000;
    badge('nb-fittings', S.fittings.filter((f) => f.status === 'booked' && Date.parse(f.slot_start) >= now && Date.parse(f.slot_start) <= week).length);
    const total = {}; S.stock.forEach((r) => { total[r.product_id] = (total[r.product_id] || 0) + r.qty; });
    badge('nb-stock', S.products.filter((p) => p.visible && p.ready_made && (total[p.id] || 0) === 0).length);
  }

  // =====================================================================================================
  // ORDERS
  // =====================================================================================================
  const inGroup = (o, g) => !GROUPS[g][1] || GROUPS[g][1].includes(o.status);
  const matches = (o) => {
    if (S.filter === 'unpaid') { if (o.status === 'cancelled' || o.payment_status !== 'unpaid') return false; } else if (!inGroup(o, S.filter)) return false;
    const q = S.q; return !q || [o.reference, o.customer_name, o.customer_phone, o.customer_email].some((v) => String(v || '').toLowerCase().includes(q));
  };

  function renderOrders() {
    // stat cards (they are also shortcuts)
    const nNew = S.orders.filter((o) => o.status === 'new').length;
    const making = S.orders.filter((o) => ['confirmed', 'cutting', 'sewing', 'ready'].includes(o.status)).length;
    const unpaid = S.orders.filter((o) => o.status !== 'cancelled' && o.payment_status === 'unpaid');
    const owed = unpaid.reduce((t, o) => t + Number(o.total_ghs || 0), 0);
    $('stats').innerHTML = [
      ['new', nNew, 'New orders'], ['making', making, 'Being made'],
      ['unpaid', unpaid.length, owed ? `Unpaid · ${ghs(owed)}` : 'Unpaid'],
      ['fit', S.fittings.filter((f) => f.status === 'booked' && Date.parse(f.slot_start) >= Date.now() && Date.parse(f.slot_start) <= Date.now() + 7 * 86400_000).length, 'Fittings this week'],
    ].map(([k, n, l]) => `<button class="stat${S.filter === k ? ' is-on' : ''}" data-stat="${k}"><b>${n}</b><span>${esc(l)}</span></button>`).join('');
    $('chips').innerHTML = Object.entries(GROUPS).map(([k, [l]]) => {
      const n = S.orders.filter((o) => inGroup(o, k)).length;
      return `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}">${l}<b>${n}</b></button>`;
    }).join('');

    const rows = S.orders.filter(matches);
    if (wide() && (!S.open || !rows.some((o) => o.id === S.open)) && rows.length) S.open = rows[0].id;
    $('orderList').innerHTML = rows.length ? rows.map((o) => `
      <button class="orow orow--${o.status}${S.open === o.id && (wide() || S.show) ? ' is-open' : ''}" data-open="${o.id}">
        <span class="orow__bar"></span>
        <span class="orow__main"><span class="orow__who">${esc(o.customer_name)}</span>
          <span class="orow__sub">${esc(o.reference)} · ${esc(items(o) || KIND[o.kind] || o.kind)}</span></span>
        <span class="orow__end"><span class="orow__total">${esc(ghs(o.total_ghs))}</span>
          <span class="pill pill--${o.status}">${LABEL[o.status]}</span><span class="orow__time">${esc(ago(o.created_at))}</span></span>
      </button>`).join('') : `<div class="empty">${S.orders.length ? 'No orders match.' : 'No orders yet. New ones will appear here.'}</div>`;

    const cur = S.orders.find((o) => o.id === S.open);
    $('tab-orders').classList.toggle('has-detail', !!(cur && S.show));
    $('orderDetail').innerHTML = cur ? detailHtml(cur) : (wide() ? '<div class="empty">Choose an order on the left.</div>' : '');
  }

  function detailHtml(o) {
    const idx = STEPS.findIndex(([k]) => k === o.status);
    const m = o.measurements_cm;
    const meas = m ? MEAS.filter(([k]) => m[k] != null).map(([k, l]) => `<div><dt>${l}</dt><dd>${quarter(m[k])}</dd></div>`).join('') : '';
    const fits = S.fittings.filter((f) => f.order_reference === o.reference && f.status !== 'blocked');
    const msgs = [...(o.order_messages || [])].sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));
    const mail = o.notified_at ? `<span class="mail-ok">Team emailed ${esc(when(o.notified_at))}</span>` : o.notify_error ? `<span class="mail-bad">Team email failed: ${esc(o.notify_error)}</span>` : 'No team email sent';
    return `<div class="od" data-id="${o.id}">
      <button class="back" data-back>&#8249; All orders</button>
      <div class="od__head">
        <div><h2 class="od__ref">${esc(o.reference)}</h2><div class="od__who">${esc(o.customer_name)} · placed ${esc(when(o.created_at))}</div></div>
        <div class="od__acts"><a class="btn btn--wa btn--sm" href="${esc(waLink(o.customer_phone))}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn btn--ghost btn--sm" href="tel:${esc(String(o.customer_phone).replace(/[^\d+]/g, ''))}">Call</a></div>
      </div>

      <div class="card"><h3>Progress</h3>
        ${o.status === 'cancelled' ? `<div class="cancelled-bar"><span>This order was cancelled.</span><button class="btn btn--ghost btn--sm" data-step="new">Re-open it</button></div>` :
          `<div class="steps">${STEPS.map(([k, l], i) => `<button class="step${i < idx ? ' is-done' : i === idx ? ' is-now' : ''}" data-step="${k}"><i>${i < idx ? '&#10003;' : i + 1}</i>${l}</button>`).join('')}</div>`}
        <label class="switchrow"><span class="switch"><input type="checkbox" data-notify ${wantsNotify() ? 'checked' : ''}><span></span></span>
          <span><b>Tell the customer when I change the stage</b><small>Sends the email and SMS for this stage (if they gave an email or phone). Switch off to change it quietly.</small></span></label>
        ${o.status === 'cancelled' ? '' : '<div class="row u-mt14"><button class="btn btn--danger btn--sm" data-cancel>Cancel this order</button></div>'}
      </div>

      <div class="card"><h3>Payment</h3>
        <div class="seg">${PAY.map(([k, l]) => `<button class="${k}" data-pay="${k}" aria-pressed="${o.payment_status === k}">${l}</button>`).join('')}</div>
      </div>

      <div class="card"><h3>Customer</h3>
        <dl class="kv">
          <div><dt>Name</dt><dd>${esc(o.customer_name)}</dd></div>
          <div><dt>Phone</dt><dd>${esc(o.customer_phone)}</dd></div>
          ${o.customer_email ? `<div><dt>Email</dt><dd>${esc(o.customer_email)}</dd></div>` : ''}
          <div><dt>Address</dt><dd>${esc(o.delivery_address)}</dd></div>
          <div><dt>Needed by</dt><dd>${o.need_by ? esc(o.need_by) : 'No date given'}</dd></div>
          <div><dt>Order type</dt><dd>${esc(KIND[o.kind] || o.kind)}</dd></div>
        </dl>
      </div>

      <div class="card"><h3>What they ordered</h3>
        <ul class="items">${(o.order_items || []).map((i) => `<li><span><b>${esc(i.product_name)}</b>${i.size ? ' · ' + esc(i.size) : ''}${i.qty > 1 ? ' × ' + i.qty : ''}</span><span>${i.unit_price_ghs != null ? esc(ghs(i.unit_price_ghs)) : ''}</span></li>`).join('')}</ul>
        <div class="totalrow"><label class="field u-w170">Total (GHS)<input type="number" min="0" step="0.01" data-total value="${o.total_ghs ?? ''}" placeholder="not set yet"></label>
          <button class="btn btn--ghost btn--sm" data-save-total>Save total</button></div>
      </div>

      ${o.notes ? `<div class="card"><h3>Customer's note</h3><p class="u-pre">${esc(o.notes)}</p></div>` : ''}
      ${meas ? `<div class="card"><h3>Measurements (inches)</h3><dl class="meas">${meas}</dl></div>` : ''}
      ${o.photos && o.photos.length ? `<div class="card"><h3>Style photos</h3><div class="photos">${o.photos.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Style photo" loading="lazy"></a>`).join('')}</div></div>` : ''}
      ${fits.length ? `<div class="card"><h3>Fitting</h3>${fits.map((f) => `<p class="u-mb4">${esc(dayLong(f.slot_start.slice(0, 10)))}, ${hhmm(f.slot_start)} <span class="pill pill--${f.status}">${f.status}</span></p>`).join('')}</div>` : ''}

      <div class="card"><h3>Notes for your team</h3>
        <label class="field u-hide" for="notes-${o.id}">Notes</label>
        <textarea class="inp" id="notes-${o.id}" data-notes rows="3" placeholder="Only your team sees this. It saves when you tap away.">${esc(o.internal_notes || '')}</textarea>
        <div class="saved-note" data-notes-ok></div>
      </div>

      <div class="card"><h3>Messages</h3>
        <div class="log"><p>${mail}</p>${msgs.length ? msgs.map((x) => `<p>${esc(when(x.sent_at))} · ${x.channel === 'sms' ? 'SMS' : 'Email'} · ${esc(x.kind)} ${x.error ? `<span class="mail-bad">failed: ${esc(x.error)}</span>` : '<span class="mail-ok">sent</span>'}</p>`).join('') : '<p class="u-muted">No messages sent to the customer yet.</p>'}</div>
      </div>
    </div>`;
  }

  async function updateOrder(id, patch, okMsg) {
    try {
      const r = await api('admin_update_order', Object.assign({ id, notify: wantsNotify() }, patch));
      Object.assign(S.orders.find((o) => o.id === id), patch);
      toast((okMsg || 'Saved') + (r.messaging ? '. Telling the customer.' : ''));
    } catch (x) { toast(x.message, true); await loadAll(); return false; }
    renderBadges(); renderOrders(); return true;
  }

  $('stats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stat]'); if (!b) return;
    if (b.dataset.stat === 'fit') return go('fittings');
    S.filter = S.filter === b.dataset.stat ? 'all' : b.dataset.stat;
    if (S.filter === 'making') S.filter = 'making';
    renderOrders();
  });
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { S.filter = b.dataset.f; renderOrders(); } });
  $('search').addEventListener('input', (e) => { S.q = e.target.value.trim().toLowerCase(); renderOrders(); });
  $('orderList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    S.open = b.dataset.open; S.show = true; renderOrders();
    $('orderDetail').scrollTop = 0; if (!wide()) $('orderDetail').scrollTo(0, 0);
  });
  $('orderDetail').addEventListener('click', async (e) => {
    const root = e.target.closest('.od'); if (!root) return;
    const id = root.dataset.id;
    if (e.target.closest('[data-back]')) { S.show = false; renderOrders(); return; }
    const st = e.target.closest('[data-step]');
    if (st) { const o = S.orders.find((x) => x.id === id); if (o.status !== st.dataset.step) updateOrder(id, { status: st.dataset.step }, 'Moved to ' + LABEL[st.dataset.step]); return; }
    const pay = e.target.closest('[data-pay]');
    if (pay) { const o = S.orders.find((x) => x.id === id); if (o.payment_status !== pay.dataset.pay) updateOrder(id, { payment_status: pay.dataset.pay }, 'Marked ' + pay.dataset.pay); return; }
    if (e.target.closest('[data-cancel]')) { if (confirm('Cancel this order? Ready-made dresses go back in stock.')) updateOrder(id, { status: 'cancelled' }, 'Order cancelled'); return; }
    if (e.target.closest('[data-save-total]')) { const v = root.querySelector('[data-total]').value; updateOrder(id, { total_ghs: v === '' ? null : Number(v) }, 'Total saved'); }
  });
  $('orderDetail').addEventListener('change', async (e) => {
    const nt = e.target.closest('[data-notify]');
    if (nt) { try { localStorage.setItem('mave_notify', nt.checked ? '1' : '0'); } catch (x) { /* ignore */ } toast(nt.checked ? 'The customer will be told' : 'Changes will be quiet'); return; }
    const notes = e.target.closest('[data-notes]');
    if (notes) {
      const id = notes.closest('.od').dataset.id, o = S.orders.find((x) => x.id === id);
      if ((o.internal_notes || '') === notes.value) return;
      const ok = notes.closest('.card').querySelector('[data-notes-ok]');
      try { await api('admin_update_order', { id, notify: false, internal_notes: notes.value }); o.internal_notes = notes.value; ok.textContent = 'Saved'; setTimeout(() => { ok.textContent = ''; }, 1800); }
      catch (x) { toast(x.message, true); }
    }
  });

  // =====================================================================================================
  // FITTINGS
  // =====================================================================================================
  function renderFittings() {
    const today = todayYmd();
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const blocked = {};
    S.fittings.filter((f) => f.status === 'blocked' && f.slot_start.slice(0, 10) >= today).forEach((f) => { const d = f.slot_start.slice(0, 10); blocked[d] = (blocked[d] || 0) + 1; });
    const keep = $('closures').open;
    $('closures').innerHTML = `<summary>Close the studio for a day</summary><div class="body">
      <p class="note u-mb12">Pick a day to stop customers booking it. Fittings already booked that day stay.</p>
      <div class="row"><input type="date" class="inp u-auto" id="blockDate" min="${today}"><button class="btn btn--ghost" data-block>Close this day</button></div>
      ${Object.keys(blocked).length ? `<div class="closed">${Object.keys(blocked).sort().map((d) => `<span class="tag">${esc(dayLong(d))}<button data-unblock="${d}">Reopen</button></span>`).join('')}</div>` : ''}</div>`;
    $('closures').open = keep;

    const real = S.fittings.filter((f) => f.status !== 'blocked');
    const upcoming = real.filter((f) => f.slot_start.slice(0, 10) >= today);
    const past = real.filter((f) => f.slot_start.slice(0, 10) < today);
    const group = (list) => { const by = {}; list.forEach((f) => { (by[f.slot_start.slice(0, 10)] = by[f.slot_start.slice(0, 10)] || []).push(f); }); return by; };
    const card = (f) => `
      <div class="appt${f.status === 'cancelled' ? ' is-gone' : ''}" data-id="${f.id}">
        <time>${hhmm(f.slot_start)}</time>
        <div><b>${esc(f.customer_name || 'Customer')}</b> <span class="pill pill--${f.status}">${f.status}</span>
          <small>${esc(f.order_reference || '')} · ${esc(f.customer_phone || '')}</small></div>
        <div class="acts">
          <a class="btn btn--wa btn--sm" href="${esc(waLink(f.customer_phone))}" target="_blank" rel="noopener">WhatsApp</a>
          ${f.status === 'booked' ? '<button class="btn btn--ghost btn--sm" data-fs="done">Done</button><button class="btn btn--danger btn--sm" data-fs="cancelled">Cancel</button>' : '<button class="btn btn--ghost btn--sm" data-fs="booked">Restore</button>'}
        </div></div>`;
    const section = (by, label) => Object.keys(by).sort().map((d) => `<div class="day"><h3>${label(d)}</h3>${by[d].map(card).join('')}</div>`).join('');
    const lab = (d) => `${d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : esc(dayLong(d))}${d === today || d === tomorrow ? `<small>${esc(dayLong(d))}</small>` : ''}`;
    $('fittingList').innerHTML = (upcoming.length ? section(group(upcoming), lab) : '<div class="empty u-mt18">No upcoming fittings. When a customer books one, it shows here.</div>')
      + (past.length ? `<details class="card closer u-mt22"><summary>Earlier this week (${past.length})</summary><div class="body">${section(group(past), (d) => esc(dayLong(d)))}</div></details>` : '');
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

  // =====================================================================================================
  // DRESSES
  // =====================================================================================================
  const NEW = { id: '', name: '', price: '', ready_made: true, lead_time: '', card_image: '', rail_image: '', rail_scale: 1, gallery: [], visible: true };
  const dlg = $('dressDialog');

  function renderDresses() {
    if (S.noCms) { $('dressList').innerHTML = '<div class="empty u-span">Managing dresses here needs the content SQL and the latest function. See step 11 in supabase/README.md.</div>'; $('addDress').hidden = true; return; }
    $('addDress').hidden = false;
    if (!S.products.length) { $('dressList').innerHTML = '<div class="empty u-span">No dresses yet. Add the first one.</div>'; return; }
    $('dressList').innerHTML = S.products.map((p, i) => `
      <article class="dcard${p.visible ? '' : ' is-off'}" data-id="${esc(p.id)}">
        <div class="dcard__img">${p.card_image ? `<img src="${esc(p.card_image)}" alt="" loading="lazy">` : '<div class="none">No photo</div>'}
          <div class="tags">${p.visible ? '' : '<span class="pill pill--cancelled">Hidden</span>'}${p.rail_image ? '' : '<span class="pill">Not in line-up</span>'}</div></div>
        <div class="dcard__body"><h3>${esc(p.name)}</h3>
          <p><b>${p.price == null ? 'Price on request' : esc(ghs(p.price))}</b> · ${p.ready_made ? 'Ready-made' : 'Made to order'}${p.lead_time ? ' · ' + esc(p.lead_time) : ''}</p></div>
        <div class="dcard__acts">
          <button class="btn btn--ghost btn--sm" data-dact="edit">Edit</button>
          <button class="btn btn--ghost btn--sm" data-dact="vis">${p.visible ? 'Hide' : 'Show'}</button>
          <button class="icon-btn" data-dact="up" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier"><svg viewBox="0 0 24 24"><path d="M12 19V6M6 12l6-6 6 6"/></svg></button>
          <button class="icon-btn" data-dact="down" ${i === S.products.length - 1 ? 'disabled' : ''} aria-label="Move later"><svg viewBox="0 0 24 24"><path d="M12 5v13M6 12l6 6 6-6"/></svg></button>
        </div>
      </article>`).join('');
  }

  function formHtml(p) {
    const isNew = !p.id;
    const photoBox = (key, label, hint, cls) => `<div><span class="photolabel">${label}</span>
      <div class="photobox ${cls}">${p[key] ? `<img src="${esc(p[key])}" alt="">` : `<div class="none">${hint}</div>`}
        <div class="row u-center"><label class="btn btn--ghost btn--sm">${p[key] ? 'Change photo' : 'Choose photo'}<input type="file" accept="image/*" data-file="${key}"></label>${p[key] ? `<button type="button" class="btn btn--danger btn--sm" data-clear="${key}">Remove</button>` : ''}</div></div></div>`;
    return `
      <div class="modal__top"><h2 id="dressTitle">${isNew ? 'Add a dress' : 'Edit dress'}</h2><button type="button" class="icon-btn" data-dcancel aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="modal__body">
        <div class="fgrid">
          ${photoBox('card_image', 'Main photo', 'A tall photo of the whole outfit. Shown in the shop and on the dress page.', '')}
          ${photoBox('rail_image', 'Homepage line-up photo (optional)', 'The model cut out on a transparent background (PNG or WebP). Without it the dress is not in the homepage line-up.', 'cut')}
        </div>
        <div class="fgrid">
          <div class="fgrid two">
            <label class="field wide">Name<input type="text" data-f="name" value="${esc(p.name)}" maxlength="120" placeholder="e.g. Black Pearl"></label>
            <label class="field">Price (GHS)<input type="number" min="0" step="1" data-f="price" value="${p.price ?? ''}" placeholder="empty = on request"><span class="hint">Leave empty to show "Price on request".</span></label>
            <label class="field">Lead time <span class="u-norm">(optional)</span><input type="text" data-f="lead_time" value="${esc(p.lead_time || '')}" maxlength="60" placeholder="e.g. 2 to 3 weeks"></label>
            <label class="field wide">How it is sold<select data-f="ready_made"><option value="1"${p.ready_made ? ' selected' : ''}>Ready-made (add to cart) and made to measure</option><option value="0"${p.ready_made ? '' : ' selected'}>Made to order only</option></select></label>
            ${isNew ? '<label class="field wide">Starting stock in each size<input type="number" min="0" max="99" step="1" data-f="start_qty" value="5"><span class="hint">For sizes UK 8 to 22 (ready-made only). You can change each size later under Stock.</span></label>' : ''}
            <label class="field">Size in the line-up<input type="number" min="0.4" max="1.2" step="0.05" data-f="rail_scale" value="${p.rail_scale ?? 1}"><span class="hint">1 = full size. About 0.85 for a photo that stops at the hips.</span></label>
          </div>
          <div class="wide"><span class="photolabel">More photos (other angles, shown on the dress page)</span>
            <div class="thumbs">${(p.gallery || []).map((u, i) => `<figure><img src="${esc(u)}" alt=""><button type="button" data-gdel="${i}" aria-label="Remove photo">&times;</button></figure>`).join('')}
              ${(p.gallery || []).length < 8 ? '<label title="Add photos">+<input type="file" accept="image/*" multiple data-file="gallery"></label>' : ''}</div></div>
          <label class="checkrow"><input type="checkbox" data-f="visible" ${p.visible ? 'checked' : ''}> Show this dress on the website</label>
        </div>
      </div>
      <div class="modal__foot">
        ${isNew ? '' : '<button type="button" class="btn btn--danger btn--sm" data-ddelete>Delete</button>'}
        <span class="err spacer u-m0" id="dErr" role="alert"></span>
        <button type="button" class="btn btn--ghost" data-dcancel>Cancel</button>
        <button type="button" class="btn" data-dsave>Save dress</button>
      </div>`;
  }
  function openForm(p) { S.editing = JSON.parse(JSON.stringify(p)); $('dressForm').innerHTML = formHtml(S.editing); if (!dlg.open) dlg.showModal(); }
  function reForm() { readForm(); $('dressForm').innerHTML = formHtml(S.editing); }
  function closeForm() { S.editing = null; if (dlg.open) dlg.close(); }

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
  function readForm() {
    const f = (k) => document.querySelector(`#dressForm [data-f="${k}"]`); const e = S.editing;
    if (!f('name')) return;
    e.name = f('name').value.trim();
    e.price = f('price').value.trim() === '' ? null : Number(f('price').value);
    e.lead_time = f('lead_time').value.trim();
    e.ready_made = f('ready_made').value === '1';
    e.rail_scale = Number(f('rail_scale').value) || 1;
    e.visible = f('visible').checked;
    if (f('start_qty')) e.start_qty = Number(f('start_qty').value) || 0;
  }

  $('addDress').addEventListener('click', () => openForm(NEW));
  dlg.addEventListener('close', () => { S.editing = null; });
  dlg.addEventListener('cancel', () => { S.editing = null; });
  $('dressForm').addEventListener('submit', (e) => e.preventDefault());
  $('dressForm').addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-file]'); if (!inp || !inp.files.length) return;
    readForm();
    const err = $('dErr'); err.style.color = 'var(--muted)'; err.textContent = 'Uploading…';
    try {
      if (inp.dataset.file === 'gallery') {
        for (const file of [...inp.files].slice(0, 8)) { if (S.editing.gallery.length < 8) S.editing.gallery.push(await uploadPhoto(file, false)); }
      } else S.editing[inp.dataset.file] = await uploadPhoto(inp.files[0], inp.dataset.file === 'rail_image');
      reForm();
    } catch (x) { err.style.color = ''; err.textContent = x.message; }
  });
  $('dressForm').addEventListener('click', async (e) => {
    const clr = e.target.closest('[data-clear]'); if (clr) { readForm(); S.editing[clr.dataset.clear] = ''; reForm(); return; }
    const gd = e.target.closest('[data-gdel]'); if (gd) { readForm(); S.editing.gallery.splice(Number(gd.dataset.gdel), 1); reForm(); return; }
    if (e.target.closest('[data-dcancel]')) return closeForm();
    if (e.target.closest('[data-ddelete]')) {
      const p = S.editing;
      if (!confirm(`Delete ${p.name}? It disappears from the website. Past orders keep their details. (To hide it for a while instead, use Hide on its card.)`)) return;
      try { await api('admin_product_delete', { id: p.id }); closeForm(); toast('Dress deleted'); await loadAll(); } catch (x) { $('dErr').textContent = x.message; }
      return;
    }
    if (e.target.closest('[data-dsave]')) {
      readForm(); const p = S.editing; const err = $('dErr'); err.style.color = '';
      if (!p.name) { err.textContent = 'Give the dress a name.'; return; }
      if (p.price !== null && (isNaN(p.price) || p.price < 0)) { err.textContent = 'The price must be a number.'; return; }
      if (!p.card_image) { err.textContent = 'Add a main photo.'; return; }
      err.textContent = 'Saving…';
      try { await api('admin_product_save', { product: p, start_qty: p.start_qty }); closeForm(); toast('Dress saved'); await loadAll(); }
      catch (x) { err.textContent = x.message; }
    }
  });
  $('dressList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dact]'); if (!b || b.disabled) return;
    const id = b.closest('.dcard').dataset.id; const i = S.products.findIndex((p) => p.id === id); const p = S.products[i];
    try {
      if (b.dataset.dact === 'edit') return openForm(p);
      if (b.dataset.dact === 'vis') { await api('admin_product_save', { product: Object.assign({}, p, { visible: !p.visible }) }); toast(p.visible ? 'Hidden from the website' : 'Showing on the website'); }
      if (b.dataset.dact === 'up' || b.dataset.dact === 'down') {
        const j = i + (b.dataset.dact === 'up' ? -1 : 1); if (j < 0 || j >= S.products.length) return;
        const ids = S.products.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
        await api('admin_products_order', { ids }); toast('Order saved');
      }
      await loadAll();
    } catch (x) { toast(x.message, true); }
  });

  // =====================================================================================================
  // STOCK
  // =====================================================================================================
  const timers = {};
  const rank = (s) => { const n = parseInt(String(s).replace(/\D/g, ''), 10); return isNaN(n) ? 999 : n; };
  function renderStock() {
    const by = {};
    S.stock.forEach((r) => { (by[r.product_id] = by[r.product_id] || []).push(r); });
    S.products.forEach((p) => { if (p.ready_made && !by[p.id]) by[p.id] = []; });
    const order = S.products.map((p) => p.id).filter((id) => by[id]).concat(Object.keys(by).filter((id) => !S.products.some((p) => p.id === id)));
    if (!order.length) { $('stockList').innerHTML = '<div class="empty u-span">No stock rows yet. Run the stock SQL first.</div>'; return; }
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#stockList');
    if (typing) return;
    $('stockList').innerHTML = order.map((id) => {
      const rows = by[id].sort((a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size));
      const total = rows.reduce((t, r) => t + r.qty, 0), outN = rows.filter((r) => r.qty === 0).length;
      const sum = !rows.length ? '<span class="sum bad">No sizes yet</span>' : total === 0 ? '<span class="sum bad">Sold out</span>' : outN ? `<span class="sum low">${total} in stock · ${outN} size${outN > 1 ? 's' : ''} out</span>` : `<span class="sum">${total} in stock</span>`;
      return `<div class="scard" data-p="${esc(id)}"><header><h3>${esc(names[id] || id)}</h3>${sum}</header>
        <div class="tiles">${rows.map((r) => `<div class="tile${r.qty === 0 ? ' is-out' : r.qty === 1 ? ' is-low' : ''}" data-s="${esc(r.size)}">
          <b>${esc(r.size)}</b><button class="x" data-del aria-label="Remove ${esc(r.size)}" title="Stop offering this size">&times;</button><span class="ok" data-ok></span>
          <div class="q"><button data-d="-1" aria-label="One fewer">&minus;</button><input type="number" min="0" max="999" inputmode="numeric" value="${r.qty}" data-q aria-label="${esc(r.size)} quantity"><button data-d="1" aria-label="One more">+</button></div></div>`).join('')}</div>
        <div class="addsize"><input class="inp" data-newsize placeholder="New size, e.g. UK 24"><input class="inp qty" data-newqty type="number" min="0" max="999" placeholder="Qty"><button class="btn btn--ghost btn--sm" data-add>Add</button></div></div>`;
    }).join('');
  }
  async function saveStock(id, size, qty, tile) {
    try {
      await api('admin_stock_set', { product_id: id, size, qty });
      const r = S.stock.find((x) => x.product_id === id && x.size === size); if (r) r.qty = qty; else S.stock.push({ product_id: id, size, qty });
      if (tile) { const ok = tile.querySelector('[data-ok]'); if (ok) { ok.textContent = '✓'; setTimeout(() => { ok.textContent = ''; }, 1400); } tile.classList.toggle('is-out', qty === 0); tile.classList.toggle('is-low', qty === 1); }
      renderBadges();
    } catch (x) { toast(x.message, true); }
  }
  let rs; const restock = () => { clearTimeout(rs); rs = setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('#stockList')) renderStock(); }, 700); };
  $('stockList').addEventListener('click', async (e) => {
    const card = e.target.closest('.scard'); if (!card) return; const id = card.dataset.p;
    const tile = e.target.closest('.tile');
    const d = e.target.closest('[data-d]');
    if (d && tile) {
      const inp = tile.querySelector('[data-q]'); const v = Math.max(0, Math.min(999, Number(inp.value || 0) + Number(d.dataset.d)));
      inp.value = v; clearTimeout(timers[id + tile.dataset.s]);
      timers[id + tile.dataset.s] = setTimeout(async () => { await saveStock(id, tile.dataset.s, v, tile); restock(); }, 450);
    }
    if (e.target.closest('[data-del]') && tile && confirm(`Stop offering ${tile.dataset.s} for ${names[id] || id}? Customers will no longer see this size.`)) {
      try { await api('admin_stock_delete', { product_id: id, size: tile.dataset.s }); S.stock = S.stock.filter((r) => !(r.product_id === id && r.size === tile.dataset.s)); document.activeElement.blur(); renderStock(); renderBadges(); toast('Size removed'); } catch (x) { toast(x.message, true); }
    }
    if (e.target.closest('[data-add]')) {
      const size = card.querySelector('[data-newsize]').value.trim(), qty = Number(card.querySelector('[data-newqty]').value || 0);
      if (!size) return toast('Enter a size', true);
      await saveStock(id, size, qty); document.activeElement.blur(); await loadAll(); toast('Size added');
    }
  });
  $('stockList').addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-q]'); if (!inp) return;
    const tile = inp.closest('.tile'), id = inp.closest('.scard').dataset.p;
    const v = Math.max(0, Math.min(999, Math.floor(Number(inp.value || 0)))); inp.value = v;
    await saveStock(id, tile.dataset.s, v, tile); restock();
  });

  // =====================================================================================================
  // SITE TEXT
  // =====================================================================================================
  const infoHtml = (it) => `<div class="infoitem"><label class="field">Question<input type="text" data-t value="${esc(it.title)}" maxlength="100"></label>
    <label class="field">Answer<textarea data-b rows="5">${esc(it.body)}</textarea></label>
    <div class="acts"><button class="btn btn--ghost btn--sm" data-iup type="button">&uarr; Up</button><button class="btn btn--ghost btn--sm" data-idown type="button">&darr; Down</button><button class="btn btn--danger btn--sm" data-idel type="button">Delete</button></div></div>`;
  function renderText() {
    if (S.noCms) { $('textBlocks').innerHTML = '<div class="empty">Editing the site text needs the content SQL and the latest function. See step 11 in supabase/README.md.</div>'; return; }
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#textBlocks')) return;   // don't rebuild the forms under someone who is typing
    const open = new Set([...document.querySelectorAll('#textBlocks details[open]')].map((d) => d.dataset.block));
    const c = S.content || {}; const mq = Array.isArray(c.marquee) ? c.marquee : []; const k = c.contacts || {}; const info = Array.isArray(c.info) ? c.info : [];
    const blk = (key, title, hint, body) => `<details class="tblock" data-block="${key}"${open.has(key) ? ' open' : ''}><summary><div><h3>${title}</h3><small>${hint}</small></div></summary><div class="body">${body}</div></details>`;
    $('textBlocks').innerHTML =
      blk('marquee', 'Scrolling band', 'The green strip along the bottom of the homepage', `<label class="field">One phrase per line<textarea data-v rows="4">${esc(mq.join('\n'))}</textarea></label><div><button class="btn btn--sm" data-tsave>Save</button></div>`) +
      blk('contacts', 'Contacts', 'Shown in the footer of every page', `<div class="fgrid two"><label class="field">WhatsApp number (in full)<input type="text" data-k="whatsapp" value="${esc(k.whatsapp || '')}" placeholder="233541791986"></label><label class="field">Email<input type="email" data-k="email" value="${esc(k.email || '')}"></label><label class="field">Place<input type="text" data-k="address" value="${esc(k.address || '')}"></label><label class="field">Phone numbers to call (one per line)<textarea data-k="phones" rows="3">${esc((k.phones || []).join('\n'))}</textarea></label></div><div><button class="btn btn--sm" data-tsave>Save</button></div>`) +
      blk('info', 'Good to know', 'The questions and answers near the bottom of the homepage', `<div id="infoItems" class="fgrid">${info.map(infoHtml).join('')}</div><div class="row"><button class="btn btn--ghost btn--sm" data-tadd type="button">+ Add a question</button><button class="btn btn--sm" data-tsave>Save all</button></div>`);
  }
  $('textBlocks').addEventListener('click', async (e) => {
    const blk = e.target.closest('.tblock'); if (!blk) return;
    if (e.target.closest('[data-tadd]')) { blk.querySelector('#infoItems').insertAdjacentHTML('beforeend', infoHtml({ title: '', body: '' })); return; }
    const row = e.target.closest('.infoitem');
    if (row && e.target.closest('[data-idel]')) { if (confirm('Delete this question?')) row.remove(); return; }
    if (row && e.target.closest('[data-iup]') && row.previousElementSibling) { row.parentNode.insertBefore(row, row.previousElementSibling); return; }
    if (row && e.target.closest('[data-idown]') && row.nextElementSibling) { row.parentNode.insertBefore(row.nextElementSibling, row); return; }
    if (!e.target.closest('[data-tsave]')) return;
    const key = blk.dataset.block; let value;
    if (key === 'marquee') value = blk.querySelector('[data-v]').value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (key === 'contacts') { const g = (n) => blk.querySelector(`[data-k="${n}"]`).value.trim(); value = { whatsapp: g('whatsapp'), email: g('email'), address: g('address'), phones: g('phones').split('\n').map((x) => x.trim()).filter(Boolean) }; }
    if (key === 'info') value = [...blk.querySelectorAll('.infoitem')].map((r) => ({ title: r.querySelector('[data-t]').value.trim(), body: r.querySelector('[data-b]').value.trim() })).filter((x) => x.title && x.body);
    try { await api('admin_content_save', { key, value }); S.content[key] = value; toast('Saved. It shows on the website within a few seconds.'); }
    catch (x) { toast(x.message, true); }
  });

  // ---------- start ----------
  window.addEventListener('resize', () => { if (S.token && !$('app').hidden) renderOrders(); });
  if (S.token) { showApp(true); go(S.tab); loadAll(); }
})();
