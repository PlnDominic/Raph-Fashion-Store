// place-order: receives an order from the Mave Collection site, checks it, stores it and replies { reference }.
//
//   GET   -> { stock: { <product id>: { <size>: <qty left> } } }   what the shop shows as in stock / sold out
//   POST multipart/form-data
//     order   JSON  the order exactly as the site builds it (see js/shop.js and js/cart.js)
//     photos  file  zero to five style-reference images (made-to-measure and custom orders)
//
// Deployed with verify_jwt = false because it is a public order form; every field is validated here and
// the database is only ever written with the service role, which Supabase injects into the function.
// Secrets (Edge Functions -> Secrets):
//   RESEND_API_KEY  API key from resend.com; together with NOTIFY_TO it switches the new-order email on
//   NOTIFY_TO       who gets the email; comma separated. While you use Resend's shared test sender this must
//                   be the address you signed up to Resend with.
//   NOTIFY_FROM     optional sender, e.g. "Mave Collection <orders@mavecollections.com>" once that domain is
//                   verified in Resend. Default: "Mave Collection Orders <onboarding@resend.dev>"
//   ALLOWED_ORIGIN  optional, e.g. https://www.mavecollections.com, to accept orders from that site only
//   TURNSTILE_SECRET  optional, the secret key of a Cloudflare Turnstile widget. When set, every order must carry a
//                   valid Turnstile token (the website adds it), which stops scripts from posting fake orders.
// An email problem never fails an order: the outcome is written to orders.notified_at / orders.notify_error
// (see supabase/migrations/20261103000000_order_notifications.sql).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_ORDERS_PER_PHONE_PER_HOUR = 5;

// ranges in cm (the order form works in inches and converts)
const MEASUREMENTS: Record<string, [number, number]> = {
  height: [120, 220],
  bust: [60, 180],
  underbust: [50, 160],
  waist: [45, 170],
  hips: [60, 200],
  shoulder: [25, 60],
  shoulderWaist: [25, 60],
  dressLength: [80, 220],
  upperArm: [15, 60],
  bustPoint: [8, 36],      // optional
  sleeveLength: [10, 72],  // optional
};
const OPTIONAL_MEASUREMENTS = new Set(['bustPoint', 'sleeveLength']);

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Vary': 'Origin',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class Invalid extends Error {}
const bad = (msg: string): never => { throw new Invalid(msg); };

const str = (v: unknown, field: string, min: number, max: number): string => {
  if (typeof v !== 'string') bad(`${field} is required`);
  const s = (v as string).trim();
  if (s.length < min || s.length > max) bad(`${field} must be ${min}-${max} characters`);
  return s;
};

const money = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1_000_000) bad(`${field} is not a valid amount`);
  return Math.round((v as number) * 100) / 100;
};

function validate(o: any) {
  if (typeof o !== 'object' || o === null) bad('order is missing');

  const c = o.customer ?? {};
  const customer_name = str(c.name, 'name', 1, 120);
  const customer_phone = str(c.phone, 'phone', 7, 24);
  if (!/^[+\d][\d\s()-]{6,}$/.test(customer_phone) || customer_phone.replace(/\D/g, '').length < 9) bad('phone number is not valid');
  const delivery_address = str(c.address, 'delivery address', 1, 300);

  let need_by: string | null = null;
  if (c.needBy) {
    if (typeof c.needBy !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.needBy) || isNaN(Date.parse(c.needBy))) bad('needed-by date is not valid');
    need_by = c.needBy;
  }

  const notes = typeof o.notes === 'string' && o.notes.trim() ? str(o.notes, 'notes', 1, 1000) : null;

  const items: Array<Record<string, unknown>> = [];
  let kind: 'ready-made' | 'made-to-measure' | 'custom';
  let measurements_cm: Record<string, number> | null = null;
  let total: number | null = null;

  if (o.type === 'ready-made') {
    kind = 'ready-made';
    if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 10) bad('cart is empty');
    let sum = 0, allPriced = true;
    for (const it of o.items) {
      const qty = it?.qty;
      if (!Number.isInteger(qty) || qty < 1 || qty > 9) bad('quantity is not valid');
      const size = str(it?.size, 'size', 1, 12);
      const price = money(it?.price, 'price');
      if (price === null) allPriced = false; else sum += price * qty;
      items.push({
        product_id: str(it?.id, 'product', 1, 80),
        product_name: str(it?.name, 'product name', 1, 120),
        size,
        qty,
        unit_price_ghs: price,
      });
    }
    total = allPriced ? Math.round(sum * 100) / 100 : null;
  } else {
    const p = o.product ?? {};
    const isCustom = p.id === 'custom';
    kind = isCustom ? 'custom' : 'made-to-measure';
    items.push({
      product_id: str(p.id, 'product', 1, 80),
      product_name: str(p.name, 'product name', 1, 120),
      size: null,
      qty: 1,
      unit_price_ghs: isCustom ? null : money(p.price, 'price'),
    });
    total = isCustom ? null : money(p.price, 'price');

    const m = o.measurementsCm ?? {};
    measurements_cm = {};
    for (const [key, [lo, hi]] of Object.entries(MEASUREMENTS)) {
      const v = m[key];
      if ((v == null) && OPTIONAL_MEASUREMENTS.has(key)) continue;
      if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) bad(`${key} should be between ${Math.round(lo / 2.54)} and ${Math.round(hi / 2.54)} inches`);
      measurements_cm[key] = Math.round(v * 10) / 10;
    }
  }

  return { kind, customer_name, customer_phone, delivery_address, need_by, notes, items, measurements_cm, total };
}

// ---------- spam protection: Cloudflare Turnstile ----------
// Returns true (a real person), false (rejected), or null when Cloudflare itself could not be reached, in which
// case the order is let through (a Cloudflare outage must not stop real customers) and the problem is logged.
async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean | null> {
  if (!token) { console.error('turnstile: order arrived without a token'); return false; }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(Deno.env.get('TURNSTILE_VERIFY_URL') ?? 'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status >= 500) { console.error('turnstile verify: Cloudflare answered', res.status); return null; }
    const data = await res.json();
    if (data?.success !== true) console.error('turnstile rejected:', JSON.stringify(data?.['error-codes'] ?? []));
    return data?.success === true;
  } catch (e) {
    console.error('turnstile verify unreachable:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ---------- the new-order email (sent with Resend's HTTPS API) ----------
const KINDS: Record<string, string> = { 'ready-made': 'Ready-made', 'made-to-measure': 'Made to measure', 'custom': 'Custom design' };
const LABELS: Record<string, string> = {
  height: 'Height', bust: 'Bust', underbust: 'Underbust', waist: 'Waist', hips: 'Hips',
  shoulder: 'Shoulder', shoulderWaist: 'Shoulder to waist', dressLength: 'Full length', upperArm: 'Round arm',
  bustPoint: 'Bust point', sleeveLength: 'Sleeve length',
};

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (v: unknown) => String(v ?? '').replace(/[\r\n\0\x0b\x0c\x85]+|\u2028|\u2029/g, ' ').trim();
const ghs = (n: number | null) => (n == null ? null : 'GHS ' + n.toLocaleString('en-GH', { maximumFractionDigits: 2 }));
const safeUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

// ---------- fitting appointments (Danfa studio) ----------
// Accra is on UTC all year, so these times are the same in the database and on the clock in Danfa.
// To change the opening days or hours, edit these four numbers and redeploy.
const FITTING_DAYS = [1, 2, 3, 4, 5, 6];   // 0 = Sunday ... 6 = Saturday (here Monday to Saturday)
const FITTING_FIRST_HOUR = 10;             // first appointment starts at 10:00
const FITTING_LAST_HOUR = 16;              // last appointment starts at 16:00 (each lasts an hour)
const FITTING_WINDOW_DAYS = 21;            // customers can book up to three weeks ahead
const FITTING_NOTICE_HOURS = 24;           // ...but not sooner than tomorrow

function fittingSlots(now = new Date()): string[] {
  const earliest = now.getTime() + FITTING_NOTICE_HOURS * 3600_000;
  const out: string[] = [];
  for (let d = 0; d <= FITTING_WINDOW_DAYS; d++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
    if (!FITTING_DAYS.includes(day.getUTCDay())) continue;
    for (let h = FITTING_FIRST_HOUR; h <= FITTING_LAST_HOUR; h++) {
      const t = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h));
      if (t.getTime() >= earliest) out.push(t.toISOString());
    }
  }
  return out;
}

// free slots grouped by day: { days: [{ date: '2026-11-10', slots: ['10:00', '11:00'] }] }
async function freeFittings(
  // deno-lint-ignore no-explicit-any
  supabase: any,
) {
  const all = fittingSlots();
  if (all.length === 0) return { days: [], all };
  const { data, error } = await supabase.from('fittings').select('slot_start')
    .in('status', ['booked', 'blocked']).gte('slot_start', all[0]).lte('slot_start', all[all.length - 1]);
  if (error) throw new Error(error.message);
  const taken = new Set(((data ?? []) as Array<{ slot_start: string }>).map((r) => new Date(r.slot_start).toISOString()));
  const free = all.filter((t) => !taken.has(t));
  const days: Array<{ date: string; slots: string[] }> = [];
  for (const t of free) {
    const date = t.slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.date === date) last.slots.push(t.slice(11, 16)); else days.push({ date, slots: [t.slice(11, 16)] });
  }
  return { days, all: free };
}

// Ghana numbers: 0541791986 -> 233541791986 for wa.me; anything else keeps its digits
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('233')) return d;
  if (d.startsWith('0') && d.length === 10) return '233' + d.slice(1);
  return d;
}

// Email look: a plain white letter, left-aligned, one serif headline, one green button, hairline rules.
const INK = '#1b1b1a';
const MUTED = '#6e6a62';
const RULE = '#e7e3db';
const GREEN = '#0c3925';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const LOGO_URL = 'https://www.mavecollections.com/assets/brand/mave-logo.png';

const whenAccra = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const dayOnly = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ymd + 'T12:00:00Z'));

function buildEmail(reference: string, o: ReturnType<typeof validate>, photos: string[]) {
  const kind = KINDS[o.kind];
  const first = String(o.items[0].product_name);
  const more = o.items.length > 1 ? ` and ${o.items.length - 1} more` : '';
  const total = ghs(o.total);
  const firstName = o.customer_name.trim().split(/\s+/)[0];
  const phoneDial = o.customer_phone.replace(/[^\d+]/g, '');
  const wa = `https://wa.me/${waNumber(o.customer_phone)}?text=${encodeURIComponent(`Hello ${firstName}, this is Mave Collection about your order ${reference}.`)}`;
  const received = whenAccra(new Date());
  const needBy = o.need_by ? dayOnly(o.need_by) : null;
  const items = o.items.map((i) => ({
    name: String(i.product_name),
    detail: [i.size ? `Size ${i.size}` : '', Number(i.qty) > 1 ? `Qty ${i.qty}` : ''].filter(Boolean).join(' · '),
    price: ghs(i.unit_price_ghs as number | null),
  }));
  const meas = o.measurements_cm
    ? Object.entries(o.measurements_cm).map(([k, v]) => ({ label: LABELS[k] ?? k, inch: Math.round((v / 2.54) * 4) / 4 }))
    : [];
  const links = photos.map(safeUrl).filter((u): u is string => !!u);

  const subject = oneLine(`New order from ${o.customer_name}: ${first}${more} · ${total ?? 'price to confirm'} (${reference})`).slice(0, 200);
  const preheader = oneLine(`${first}${more} · ${total ?? 'price to confirm'} · ${o.delivery_address}`).slice(0, 110);

  // ---- plain text (shown by text-only mail apps and used for search) ----
  const text = [
    `New order ${reference}`,
    `${kind} · ${total ?? 'price to confirm'} · received ${received}`,
    '',
    o.customer_name,
    `Phone: ${o.customer_phone}`,
    `WhatsApp: ${wa}`,
    `Deliver to: ${o.delivery_address}`,
    needBy ? `Needed by: ${needBy}` : '',
    '',
    'What they ordered',
    ...items.map((i) => `  ${i.name}${i.detail ? ` (${i.detail})` : ''}${i.price ? ` - ${i.price}` : ''}`),
    `  Total: ${total ?? 'to be confirmed'}`,
    o.notes ? `\nTheir note\n  ${o.notes}` : '',
    meas.length ? '\nMeasurements\n' + meas.map((m) => `  ${m.label}: ${m.inch} in`).join('\n') : '',
    links.length ? '\nStyle photos (links work for 7 days)\n' + links.map((u, n) => `  ${n + 1}. ${u}`).join('\n') : '',
    '',
    'Mave Collection, Danfa, Accra',
    "To change this order's status: Supabase, Table Editor, orders.",
  ].filter((l) => l !== '').join('\n');

  // ---- html ----
  const h2 = (t: string) => `<h2 style="margin:0 0 12px;font:400 19px/1.3 ${SERIF};color:${INK}">${t}</h2>`;
  const block = (inner: string) => `<tr><td class="px" style="padding:30px 32px 0">${inner}</td></tr>`;
  const rule = `<tr><td class="px" style="padding:30px 32px 0"><div style="border-top:1px solid ${RULE};font-size:0;line-height:0">&nbsp;</div></td></tr>`;
  const line = (label: string, value: string, last = false) =>
    `<tr><td style="padding:9px 0;${last ? '' : `border-bottom:1px solid ${RULE};`}font:14px/1.4 ${SANS};color:${MUTED}">${label}</td>
     <td align="right" style="padding:9px 0;${last ? '' : `border-bottom:1px solid ${RULE};`}font:15px/1.4 ${SANS};color:${INK}">${value}</td></tr>`;

  const orderRows = items.map((i) =>
    `<tr><td style="padding:12px 0;border-bottom:1px solid ${RULE};font:15px/1.45 ${SANS};color:${INK}">
        <div style="font-weight:600">${esc(i.name)}</div>${i.detail ? `<div style="font-size:14px;color:${MUTED}">${esc(i.detail)}</div>` : ''}</td>
      <td align="right" valign="top" style="padding:12px 0;border-bottom:1px solid ${RULE};font:15px/1.45 ${SANS};color:${INK};white-space:nowrap">${esc(i.price ?? 'Price to confirm')}</td></tr>`).join('');

  const photoCells = links.map((u, n) =>
    `<td width="50%" valign="top" style="padding:0 ${n % 2 === 0 ? '6px' : '0'} 12px ${n % 2 === 0 ? '0' : '6px'}">
       <a href="${esc(u)}"><img src="${esc(u)}" width="250" alt="Style photo ${n + 1}" style="display:block;width:100%;height:auto;border:0;border-radius:4px"></a></td>`);
  const photoRows: string[] = [];
  for (let n = 0; n < photoCells.length; n += 2) photoRows.push(`<tr>${photoCells[n]}${photoCells[n + 1] ?? '<td width="50%"></td>'}</tr>`);

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<style>
  a { color: ${GREEN}; }
  @media (max-width: 620px) { .px { padding-left: 20px !important; padding-right: 20px !important; } .ref { font-size: 28px !important; } .call { display: block !important; margin: 14px 0 0 0 !important; } }
</style></head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#ffffff">${esc(preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;text-align:left">

  <tr><td class="px" style="padding:28px 32px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><img src="${LOGO_URL}" width="34" height="34" alt="" style="display:block;border:0"></td>
      <td valign="middle" style="padding-left:10px;font:600 17px/1 ${SERIF};color:${GREEN}">Mave Collection</td>
    </tr></table>
  </td></tr>

  ${block(`<div style="font:14px/1.4 ${SANS};color:${MUTED}">New order &middot; ${esc(received)}</div>
    <h1 class="ref" style="margin:6px 0 4px;font:400 34px/1.15 ${SERIF};color:${INK};letter-spacing:.01em">${esc(reference)}</h1>
    <div style="font:16px/1.5 ${SANS};color:${INK}">${esc(kind)}${total ? ` &middot; <b>${esc(total)}</b>` : ' &middot; price to confirm'}</div>`)}

  ${block(`<div style="font:400 24px/1.25 ${SERIF};color:${INK}">${esc(o.customer_name)}</div>
    <div style="margin-top:6px;font:15px/1.6 ${SANS};color:${INK}">${esc(o.delivery_address)}</div>
    ${needBy ? `<div style="margin-top:2px;font:15px/1.6 ${SANS};color:${INK}">Needed by <b>${esc(needBy)}</b></div>` : ''}
    <div style="margin-top:16px">
      <a href="${esc(wa)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font:600 15px/1 ${SANS};padding:13px 20px;border-radius:6px">Message ${esc(firstName)} on WhatsApp</a>
      <a class="call" href="tel:${esc(phoneDial)}" style="display:inline-block;margin:6px 0 0 14px;font:15px/1.2 ${SANS};color:${GREEN}">or call ${esc(o.customer_phone)}</a>
    </div>`)}

  ${rule}
  ${block(`${h2('What they ordered')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${orderRows}
      <tr><td style="padding:14px 0 0;font:14px/1.4 ${SANS};color:${MUTED}">Total</td>
          <td align="right" style="padding:14px 0 0;font:600 18px/1.3 ${SANS};color:${INK}">${esc(total ?? 'To be confirmed')}</td></tr>
    </table>`)}

  ${o.notes ? block(`${h2('Their note')}<div style="font:15px/1.6 ${SANS};color:${INK};white-space:pre-wrap">${esc(o.notes)}</div>`) : ''}

  ${meas.length ? block(`${h2('Measurements')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${meas.map((m, n) => line(esc(m.label), `${m.inch} in`, n === meas.length - 1)).join('')}</table>`) : ''}

  ${links.length ? block(`${h2('Style photos')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${photoRows.join('')}</table>
    <div style="font:13px/1.4 ${SANS};color:${MUTED}">Tap a photo to open it full size. The links work for 7 days.</div>`) : ''}

  <tr><td class="px" style="padding:36px 32px 36px">
    <div style="border-top:1px solid ${RULE};padding-top:16px;font:13px/1.6 ${SANS};color:${MUTED}">
      Mave Collection &middot; Danfa, Accra<br>
      To change this order's status, open Supabase, then Table Editor, then the orders table.
    </div>
  </td></tr>

</table></td></tr></table>
</body></html>`;
  return { subject, text, html };
}

// Sends the email with Resend (https://resend.com/docs/api-reference/emails/send-email).
// The idempotency key is the order reference, so a retry can never send the same order twice.
async function sendWithResend(apiKey: string, payload: Record<string, unknown>, reference: string): Promise<string | null> {
  const endpoint = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com/emails';
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `order-${reference}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return null;
      const detail = await res.json().catch(() => null);
      lastError = `Resend answered ${res.status}${detail?.message ? `: ${String(detail.message).slice(0, 160)}` : ''}`;
      if (res.status < 500 && res.status !== 429) return lastError;        // a mistake on our side: retrying won't help
    } catch (e) {
      lastError = `Resend unreachable: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return lastError;
}

// Emails the team about a saved order. Best effort: it never changes what the customer sees.
async function notifyTeam(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  id: string,
  reference: string,
  order: ReturnType<typeof validate>,
  paths: string[],
) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = (Deno.env.get('NOTIFY_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!apiKey || to.length === 0) return;

  let error: string | null = null;
  try {
    // style photos live in a private bucket, so give the team links that work for 7 days
    let photos: string[] = [];
    if (paths.length) {
      const { data } = await supabase.storage.from('order-photos').createSignedUrls(paths, 7 * 24 * 3600);
      photos = ((data ?? []) as Array<{ signedUrl?: string }>).map((d) => d.signedUrl).filter((u): u is string => !!u);
    }
    const mail = buildEmail(reference, order, photos);
    error = await sendWithResend(apiKey, {
      from: Deno.env.get('NOTIFY_FROM') ?? 'Mave Collection Orders <onboarding@resend.dev>',
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }, reference);
  } catch (e) {
    error = `notification failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (error) console.error('notifyTeam', reference, error);          // never log the API key
  const { error: updateError } = await supabase
    .from('orders')
    .update(error ? { notify_error: error.slice(0, 300) } : { notified_at: new Date().toISOString(), notify_error: null })
    .eq('id', id);
  if (updateError) console.error('could not record the notification result', updateError.message);
}

const fittingWhen = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

function buildFittingEmail(f: { reference: string; name: string; phone: string; slot: string; moved: boolean }) {
  const when = fittingWhen(f.slot);
  const first = f.name.split(' ')[0] || f.name;
  const wa = `https://wa.me/${waNumber(f.phone)}?text=${encodeURIComponent(`Hello ${first}, this is Mave Collection about your fitting on ${when}.`)}`;
  const subject = `${f.moved ? 'Fitting moved' : 'Fitting booked'}: ${when} · ${f.name} (${f.reference})`;
  const text = [
    f.moved ? 'A fitting was moved.' : 'A fitting was booked.', '',
    when, `${f.name} · ${f.phone}`, `Order ${f.reference}`, '', `WhatsApp: ${wa}`, '',
    'Mave Collection, Danfa, Accra',
    'To cancel it: Supabase, Table Editor, fittings, set status to cancelled.',
  ].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;text-align:left">
<tr><td style="padding:28px 24px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td valign="middle"><img src="${LOGO_URL}" width="34" height="34" alt="" style="display:block;border:0"></td>
  <td valign="middle" style="padding-left:10px;font:600 17px/1 ${SERIF};color:${GREEN}">Mave Collection</td></tr></table></td></tr>
<tr><td style="padding:30px 24px 0">
  <div style="font:14px/1.4 ${SANS};color:${MUTED}">${f.moved ? 'Fitting moved' : 'Fitting booked'} &middot; Danfa studio</div>
  <h1 style="margin:6px 0 4px;font:400 30px/1.2 ${SERIF};color:${INK}">${esc(when)}</h1>
  <div style="font:16px/1.5 ${SANS};color:${INK}">${esc(f.name)} &middot; order ${esc(f.reference)}</div>
  <div style="margin-top:16px"><a href="${esc(wa)}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font:600 15px/1 ${SANS};padding:13px 20px;border-radius:6px">Message ${esc(first)} on WhatsApp</a>
  <a href="tel:${esc(f.phone.replace(/[^\d+]/g, ''))}" style="display:inline-block;margin:6px 0 0 14px;font:15px/1.2 ${SANS};color:${GREEN}">or call ${esc(f.phone)}</a></div>
</td></tr>
<tr><td style="padding:34px 24px 36px"><div style="border-top:1px solid ${RULE};padding-top:16px;font:13px/1.6 ${SANS};color:${MUTED}">
  To cancel it, open Supabase, then Table Editor, then the fittings table, and set its status to cancelled.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

// books a fitting for an existing order (the phone number must match the order)
async function handleFitting(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  form: FormData,
) {
  const reference = String(form.get('reference') ?? '').trim().slice(0, 40);
  const phone = String(form.get('phone') ?? '').trim().slice(0, 30);
  const slot = String(form.get('slot') ?? '').trim();
  if (!reference || phone.replace(/\D/g, '').length < 9) {
    return json({ error: 'invalid', message: 'Enter your order reference and the phone number you ordered with.' }, 400);
  }

  const { all } = await freeFittings(supabase);
  const slotIso = isNaN(Date.parse(slot)) ? '' : new Date(slot).toISOString();
  if (!slotIso || !all.includes(slotIso)) {
    return json({ error: 'slot_taken', message: 'Sorry, that time has just been taken. Please choose another.' }, 409);
  }

  const { data, error } = await supabase.rpc('book_fitting', { p: { reference, phone, slot: slotIso } });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg.includes('ORDER_NOT_FOUND')) {
      return json({ error: 'order_not_found', message: "We couldn't find an order with that reference and phone number. Please check both." }, 404);
    }
    if (msg.includes('SLOT_TAKEN')) {
      return json({ error: 'slot_taken', message: 'Sorry, that time has just been taken. Please choose another.' }, 409);
    }
    console.error('book_fitting failed', msg);
    return json({ error: 'Could not book the fitting. Please try again.' }, 500);
  }

  const f = data as { id: string; reference: string; name: string; phone: string; slot: string; moved: boolean };
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = (Deno.env.get('NOTIFY_TO') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const task = (async () => {
    if (!apiKey || to.length === 0) return;
    let err: string | null = null;
    try {
      const mail = buildFittingEmail({ ...f, slot: new Date(f.slot).toISOString() });
      err = await sendWithResend(apiKey, {
        from: Deno.env.get('NOTIFY_FROM') ?? 'Mave Collection Orders <onboarding@resend.dev>',
        to, subject: mail.subject, html: mail.html, text: mail.text,
      }, `fitting-${f.id}`);
    } catch (e) { err = `notification failed: ${e instanceof Error ? e.message : String(e)}`; }
    if (err) console.error('fitting notify', f.reference, err);
    await supabase.from('fittings').update(err ? { notify_error: err.slice(0, 300) } : { notified_at: new Date().toISOString(), notify_error: null }).eq('id', f.id);
  })().catch((e) => console.error('fitting notify crashed', e));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task); else await task;

  return json({ ok: true, slot: new Date(f.slot).toISOString(), label: fittingWhen(f.slot), moved: f.moved });
}

// ---------- admin dashboard ----------
// The team signs in at /admin.html with the password stored in the secret ADMIN_PASSWORD (at least 12 characters).
// A correct password returns a token that expires after 12 hours; every other admin call must carry it.
// Too many wrong passwords from one address (or too many overall) lock sign-in for 15 minutes.
const ADMIN_TTL_MS = 12 * 3600_000;
const ORDER_STATUSES = ['new', 'confirmed', 'cutting', 'sewing', 'ready', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];
const FITTING_STATUSES = ['booked', 'done', 'cancelled'];
const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const adminKey = (password: string) => password + '|' + (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

async function handleAdmin(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
) {
  const password = Deno.env.get('ADMIN_PASSWORD') ?? '';
  if (password.length < 12) {
    return json({ error: 'not_set_up', message: 'The admin password has not been set up yet (secret ADMIN_PASSWORD, at least 12 characters).' }, 503);
  }
  if (Number(req.headers.get('content-length') ?? 0) > 20_000) return json({ error: 'Too large' }, 413);
  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'Could not read the request.' }, 400); }
  const action = String(b?.action ?? '');

  // ---- sign in ----
  if (action === 'admin_login') {
    const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const [mine, all] = await Promise.all([
      supabase.from('admin_login_attempts').select('id', { count: 'exact', head: true }).eq('ok', false).eq('ip', ip).gte('at', since),
      supabase.from('admin_login_attempts').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', since),
    ]);
    if ((mine.count ?? 0) >= 6 || (all.count ?? 0) >= 40) {
      return json({ error: 'locked', message: 'Too many wrong passwords. Please wait 15 minutes and try again.' }, 429);
    }
    const given = await hmac('login-check', String(b?.password ?? ''));
    const real = await hmac('login-check', password);
    const ok = safeEqual(given, real);
    await supabase.from('admin_login_attempts').insert({ ip, ok });
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: 'wrong', message: 'That password is not right.' }, 401);
    }
    const exp = Date.now() + ADMIN_TTL_MS;
    return json({ token: `${exp}.${await hmac(adminKey(password), 'admin.' + exp)}`, expires: exp });
  }

  // ---- everything else needs a valid token ----
  const [expStr, sig] = String(b?.token ?? '').split('.');
  const exp = Number(expStr);
  if (!sig || !isFinite(exp) || exp < Date.now() || !safeEqual(sig, await hmac(adminKey(password), 'admin.' + exp))) {
    return json({ error: 'signed_out', message: 'Please sign in again.' }, 401);
  }

  const fail = (e: { message?: string } | null, what: string) => {
    console.error('admin', what, e?.message);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  };

  if (action === 'admin_orders') {
    const { data, error } = await supabase.from('orders')
      .select('id,reference,kind,status,payment_status,customer_name,customer_phone,delivery_address,need_by,notes,measurements_cm,total_ghs,internal_notes,created_at,notified_at,notify_error,order_items(product_id,product_name,size,qty,unit_price_ghs),order_photos(path)')
      .order('created_at', { ascending: false }).limit(300);
    if (error) return fail(error, 'orders');
    // deno-lint-ignore no-explicit-any
    const paths: string[] = (data ?? []).flatMap((o: any) => (o.order_photos ?? []).map((p: { path: string }) => p.path));
    const urls: Record<string, string> = {};
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('order-photos').createSignedUrls(paths, 3600);
      for (const s of (signed ?? []) as Array<{ path?: string; signedUrl?: string }>) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
    }
    // deno-lint-ignore no-explicit-any
    const orders = (data ?? []).map((o: any) => ({ ...o, order_photos: undefined, photos: (o.order_photos ?? []).map((p: { path: string }) => urls[p.path]).filter(Boolean) }));
    return json({ orders });
  }

  if (action === 'admin_update_order') {
    const id = String(b?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Bad request' }, 400);
    const patch: Record<string, unknown> = {};
    if (b.status !== undefined) { if (!ORDER_STATUSES.includes(b.status)) return json({ error: 'Bad status' }, 400); patch.status = b.status; }
    if (b.payment_status !== undefined) { if (!PAYMENT_STATUSES.includes(b.payment_status)) return json({ error: 'Bad payment status' }, 400); patch.payment_status = b.payment_status; }
    if (b.internal_notes !== undefined) patch.internal_notes = String(b.internal_notes).slice(0, 2000);
    if (b.total_ghs !== undefined) {
      const t = b.total_ghs === null || b.total_ghs === '' ? null : Number(b.total_ghs);
      if (t !== null && (!isFinite(t) || t < 0 || t > 1_000_000)) return json({ error: 'Bad total' }, 400);
      patch.total_ghs = t;
    }
    if (Object.keys(patch).length === 0) return json({ error: 'Nothing to change' }, 400);
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    if (error) {
      if (/product_stock|check constraint/i.test(error.message ?? '')) {
        return json({ error: 'stock', message: 'That stock has been sold since this order was cancelled, so it cannot be re-opened.' }, 409);
      }
      return fail(error, 'update order');
    }
    return json({ ok: true });
  }

  if (action === 'admin_stock') {
    const { data, error } = await supabase.from('product_stock').select('product_id,size,qty').order('product_id').order('size');
    if (error) return fail(error, 'stock');
    return json({ stock: data ?? [] });
  }
  if (action === 'admin_stock_set') {
    const product_id = String(b?.product_id ?? '').slice(0, 80), size = String(b?.size ?? '').trim().slice(0, 20), qty = Number(b?.qty);
    if (!product_id || !size || !Number.isInteger(qty) || qty < 0 || qty > 999) return json({ error: 'Bad stock value' }, 400);
    const { error } = await supabase.from('product_stock').upsert({ product_id, size, qty }, { onConflict: 'product_id,size' });
    if (error) return fail(error, 'stock set');
    return json({ ok: true });
  }
  if (action === 'admin_stock_delete') {
    const { error } = await supabase.from('product_stock').delete().eq('product_id', String(b?.product_id ?? '')).eq('size', String(b?.size ?? ''));
    if (error) return fail(error, 'stock delete');
    return json({ ok: true });
  }

  if (action === 'admin_fittings') {
    const from = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data, error } = await supabase.from('fittings').select('id,order_reference,customer_name,customer_phone,slot_start,status,notes,notified_at,notify_error')
      .gte('slot_start', from).order('slot_start').limit(400);
    if (error) return fail(error, 'fittings');
    return json({ fittings: data ?? [] });
  }
  if (action === 'admin_fitting_update') {
    const id = String(b?.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !FITTING_STATUSES.includes(b?.status)) return json({ error: 'Bad request' }, 400);
    const { error } = await supabase.from('fittings').update({ status: b.status }).eq('id', id).neq('status', 'blocked');
    if (error) {
      if (/unique|duplicate/i.test(error.message ?? '')) return json({ error: 'taken', message: 'Someone else has that slot now.' }, 409);
      return fail(error, 'fitting update');
    }
    return json({ ok: true });
  }
  if (action === 'admin_fitting_block' || action === 'admin_fitting_unblock') {
    const date = String(b?.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return json({ error: 'Bad date' }, 400);
    if (action === 'admin_fitting_unblock') {
      const { error } = await supabase.from('fittings').delete().eq('status', 'blocked').gte('slot_start', `${date}T00:00:00Z`).lte('slot_start', `${date}T23:59:59Z`);
      if (error) return fail(error, 'unblock');
      return json({ ok: true });
    }
    for (let h = FITTING_FIRST_HOUR; h <= FITTING_LAST_HOUR; h++) {
      // a slot that is already booked is skipped (the unique index refuses it)
      await supabase.from('fittings').insert({ slot_start: `${date}T${String(h).padStart(2, '0')}:00:00Z`, status: 'blocked' });
    }
    return json({ ok: true });
  }

  return json({ error: 'Unknown request' }, 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // the shop asks what is in stock (a few seconds of caching keeps this cheap)
  if (req.method === 'GET' && new URL(req.url).searchParams.has('fittings')) {
    try {
      const { days } = await freeFittings(supabase);
      return new Response(JSON.stringify({ days }), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch (e) {
      console.error('fittings read failed', e instanceof Error ? e.message : String(e));
      return json({ error: 'Fittings are not available' }, 500);
    }
  }
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('product_stock').select('product_id,size,qty');
    if (error) { console.error('stock read failed', error.message); return json({ error: 'Stock is not available' }, 500); }
    const stock: Record<string, Record<string, number>> = {};
    for (const r of (data ?? []) as Array<{ product_id: string; size: string; qty: number }>) {
      (stock[r.product_id] ??= {})[r.size] = r.qty;
    }
    return new Response(JSON.stringify({ stock }), {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10' },
    });
  }

  // the admin dashboard talks JSON; customers' orders and fittings are multipart forms
  if ((req.headers.get('content-type') ?? '').includes('application/json')) return await handleAdmin(supabase, req);

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: 'That order is too large.' }, 413);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'Could not read the order.' }, 400); }

  // spam protection: with TURNSTILE_SECRET set, only orders that carry a valid human-check token get in
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET');
  if (turnstileSecret) {
    const token = form.get('turnstile');
    const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
    const human = await verifyTurnstile(turnstileSecret, typeof token === 'string' ? token : '', ip);
    if (human === false) {
      return json({
        error: 'captcha',
        message: "We couldn't confirm you're a real person. Please try again, or send your order to us on WhatsApp.",
      }, 403);
    }
  }

  if (form.get('action') === 'fitting') return await handleFitting(supabase, form);

  let order: ReturnType<typeof validate>;
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  try {
    const raw = form.get('order');
    if (typeof raw !== 'string') bad('order is missing');
    order = validate(JSON.parse(raw as string));
    if (photos.length > MAX_PHOTOS) bad(`You can add up to ${MAX_PHOTOS} photos.`);
    for (const f of photos) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) bad('Photos must be JPEG, PNG or WebP.');
      if (f.size > MAX_PHOTO_BYTES) bad('A photo is too large (5 MB maximum).');
    }
    if (order.kind === 'custom' && photos.length === 0) bad('Please add at least one photo of the style you want.');
  } catch (e) {
    if (e instanceof Invalid) return json({ error: e.message }, 400);
    if (e instanceof SyntaxError) return json({ error: 'Could not read the order.' }, 400);
    console.error('validate failed', e);
    return json({ error: 'Could not read the order.' }, 400);
  }

  // basic abuse guard: a handful of orders per phone number per hour
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: countError } = await supabase
    .from('orders').select('id', { count: 'exact', head: true })
    .eq('customer_phone', order.customer_phone).gte('created_at', since);
  if (countError) { console.error('rate check failed', countError); return json({ error: 'Something went wrong. Please try again.' }, 500); }
  if ((count ?? 0) >= MAX_ORDERS_PER_PHONE_PER_HOUR) return json({ error: 'Too many orders from this number. Please call us.' }, 429);

  // photos first (under the new order's id); if the database step fails they are removed again
  const id = crypto.randomUUID();
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const ext = photos[i].type === 'image/png' ? 'png' : photos[i].type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${id}/${i + 1}.${ext}`;
    const { error } = await supabase.storage.from('order-photos').upload(path, photos[i], { contentType: photos[i].type });
    if (error) {
      console.error('photo upload failed', error);
      if (paths.length) await supabase.storage.from('order-photos').remove(paths);
      return json({ error: 'Could not upload your photos. Please try again.' }, 500);
    }
    paths.push(path);
  }

  const { data: reference, error } = await supabase.rpc('place_order', {
    p: {
      id,
      kind: order.kind,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      delivery_address: order.delivery_address,
      need_by: order.need_by,
      notes: order.notes,
      measurements_cm: order.measurements_cm,
      total_ghs: order.total,
      items: order.items,
      photos: paths,
    },
  });
  if (error || !reference) {
    if (paths.length) await supabase.storage.from('order-photos').remove(paths);
    // the database refuses an order when a dress/size is gone: SOLD_OUT:<product id>|<size>
    const sold = /SOLD_OUT:([^|]+)\|(.+)$/.exec(String(error?.message ?? ''));
    if (sold) {
      const name = order.items.find((i) => i.product_id === sold[1])?.product_name ?? 'That dress';
      return json({
        error: 'sold_out',
        productId: sold[1],
        size: sold[2],
        message: `Sorry, ${name} in ${sold[2]} has just sold out. Please choose another size, or get it tailored to your measurements.`,
      }, 409);
    }
    console.error('place_order failed', error);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }

  // email the team in the background: the customer's confirmation never waits for it
  const task = notifyTeam(supabase, id, reference as string, order, paths).catch((e) => console.error('notifyTeam crashed', e));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task); else await task;

  return json({ reference });
});
