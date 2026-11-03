// Book a fitting at the Danfa studio. The order function says which slots are free (GET ?fittings=1) and books
// one against an existing order (POST action=fitting). The order reference + phone number prove it is their order.
(function () {
  const config = window.RAPH_CONFIG || {};
  const $ = (s) => document.getElementById(s);
  const dialog = $('fitDialog'), form = $('fitForm');
  if (!dialog) return;
  const sections = [...dialog.querySelectorAll('[data-fit]')];
  const state = { step: 'find', days: [], day: null, time: null, prefilled: false, busy: false };
  const errEl = $('fitError'), nextBtn = $('fitNext'), backBtn = $('fitBack');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtDay = (ymd) => {
    const d = new Date(ymd + 'T12:00:00Z');
    return {
      wd: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      dd: d.getUTCDate(),
      mo: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    };
  };
  const fmtTime = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  };

  function fail(msg) { errEl.textContent = msg; }
  function show(step) {
    state.step = step; fail('');
    sections.forEach((s) => { s.hidden = s.dataset.fit !== step; });
    $('fitNav').hidden = step === 'done';
    $('fitCaptcha').style.display = step === 'done' ? 'none' : '';
    backBtn.style.visibility = step === 'pick' && !state.prefilled ? 'visible' : 'hidden';
    nextBtn.textContent = step === 'find' ? 'Continue' : 'Book fitting';
    nextBtn.disabled = step === 'pick' && !(state.day && state.time);
    $('fitBody').scrollTop = 0;
  }

  // ---------- availability ----------
  async function loadSlots() {
    $('fitDays').innerHTML = '<p class="hint">Loading times…</p>'; $('fitTimes').innerHTML = '';
    try {
      const res = await fetch(config.orderEndpoint + (config.orderEndpoint.includes('?') ? '&' : '?') + 'fittings=1', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      state.days = (await res.json()).days || [];
    } catch (e) { state.days = null; }
    state.day = null; state.time = null;
    renderDays();
  }

  function renderDays() {
    const daysEl = $('fitDays'), timesEl = $('fitTimes');
    if (state.days === null) {
      daysEl.innerHTML = '<p class="hint">We could not load the times just now. Please try again, or message us on WhatsApp.</p>'; timesEl.innerHTML = ''; return;
    }
    if (state.days.length === 0) {
      daysEl.innerHTML = '<p class="hint">There are no free times in the next few weeks. Please message us on WhatsApp and we will fit you in.</p>'; timesEl.innerHTML = ''; return;
    }
    daysEl.innerHTML = state.days.map((d) => {
      const f = fmtDay(d.date);
      return `<button type="button" class="fit__day" data-day="${d.date}" aria-pressed="${state.day === d.date}"><span>${f.wd}</span><b>${f.dd}</b><span>${f.mo}</span></button>`;
    }).join('');
    renderTimes();
    $('fitHint').textContent = 'Appointments last about an hour. Times are Ghana time.';
  }

  function renderTimes() {
    const timesEl = $('fitTimes');
    const d = state.days && state.days.find((x) => x.date === state.day);
    if (!d) { timesEl.innerHTML = '<p class="hint">Choose a day to see the free times.</p>'; return; }
    timesEl.innerHTML = d.slots.map((t) => `<button type="button" class="fit__time" data-time="${t}" aria-pressed="${state.time === t}">${fmtTime(t)}</button>`).join('');
  }

  // ---------- booking ----------
  async function book() {
    if (state.busy) return;
    state.busy = true; nextBtn.disabled = true; nextBtn.textContent = 'Booking…'; fail('');
    const fd = new FormData();
    fd.append('action', 'fitting');
    fd.append('reference', form.elements.reference.value.trim());
    fd.append('phone', form.elements.phone.value.trim());
    fd.append('slot', `${state.day}T${state.time}:00.000Z`);
    try {
      const token = window.RaphCaptcha ? await window.RaphCaptcha.token($('fitCaptcha')) : '';
      if (token) fd.append('turnstile', token);
      const res = await fetch(config.orderEndpoint, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(data.message || 'Could not book.'); e.data = data; e.status = res.status; throw e; }
      done(data);
    } catch (e) {
      if (window.RaphCaptcha) window.RaphCaptcha.reset($('fitCaptcha'));
      const code = e && e.data && e.data.error;
      if (code === 'order_not_found') { state.prefilled = false; show('find'); fail(e.data.message); }
      else if (code === 'slot_taken') { show('pick'); await loadSlots(); show('pick'); fail(e.data.message); }
      else { show('pick'); fail(e && e.data && e.data.message ? e.data.message : 'Could not book. Check your connection and try again.'); }
    }
    state.busy = false;
  }

  function done(data) {
    $('fitDoneTitle').textContent = data.moved ? 'Fitting moved' : 'Fitting booked';
    $('fitWhen').textContent = data.label;
    // calendar file: Ghana time is UTC all year
    const start = new Date(data.slot), end = new Date(start.getTime() + 3600_000);
    const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mave Collection//Fitting//EN', 'BEGIN:VEVENT',
      `UID:${z(start)}@mavecollections.com`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      'SUMMARY:Fitting at Mave Collection', 'LOCATION:Mave Collection\\, Danfa\\, Accra', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    $('fitIcs').href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    show('done');
  }

  // ---------- open / events ----------
  function open(prefill) {
    if (!config.orderEndpoint) { alert('Fitting bookings are not switched on yet. Please message us on WhatsApp.'); return; }
    prefill = prefill || {};
    form.reset();
    state.day = null; state.time = null; state.busy = false;
    state.prefilled = !!(prefill.reference && prefill.phone);
    if (state.prefilled) {
      form.elements.reference.value = prefill.reference; form.elements.phone.value = prefill.phone;
      $('fitFor').textContent = `For order ${prefill.reference}`;
    }
    if (window.RaphCaptcha) window.RaphCaptcha.mount($('fitCaptcha'));
    if (!dialog.open) dialog.showModal();
    show(state.prefilled ? 'pick' : 'find');
    if (state.prefilled) loadSlots();
  }

  nextBtn.addEventListener('click', () => {
    if (state.step === 'find') {
      const ref = form.elements.reference.value.trim(), ph = form.elements.phone.value.replace(/\D/g, '');
      if (!ref) return fail('Enter your order reference.');
      if (ph.length < 9) return fail('Enter the phone number you ordered with.');
      $('fitFor').textContent = `For order ${ref.toUpperCase()}`;
      show('pick'); loadSlots();
    } else if (state.step === 'pick') book();
  });
  backBtn.addEventListener('click', () => { if (state.step === 'pick') show('find'); });
  form.addEventListener('submit', (e) => { e.preventDefault(); nextBtn.click(); });
  $('fitClose').addEventListener('click', () => dialog.close());
  $('fitDoneClose').addEventListener('click', () => { dialog.close(); const s = document.getElementById('shop'); if (s) s.scrollIntoView({ behavior: 'smooth' }); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]'), t = e.target.closest('[data-time]');
    if (d) { state.day = d.dataset.day; state.time = null; renderDays(); nextBtn.disabled = true; fail(''); }
    if (t) { state.time = t.dataset.time; renderTimes(); nextBtn.disabled = false; fail(''); }
  });
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-book-fit]'); if (a) { e.preventDefault(); open(); } });

  window.RaphFit = { open };
})();
