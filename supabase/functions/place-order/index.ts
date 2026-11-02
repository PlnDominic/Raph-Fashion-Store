// place-order: receives an order from the Mave Collection site, checks it, stores it and replies { reference }.
//
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
// An email problem never fails an order: the outcome is written to orders.notified_at / orders.notify_error
// (see supabase/migrations/20261103000000_order_notifications.sql).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_ORDERS_PER_PHONE_PER_HOUR = 5;

// same ranges as the order form (cm)
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
};

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
      if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) bad(`${key} should be between ${lo} and ${hi} cm`);
      measurements_cm[key] = Math.round(v * 10) / 10;
    }
  }

  return { kind, customer_name, customer_phone, delivery_address, need_by, notes, items, measurements_cm, total };
}

// ---------- the new-order email (sent with Resend's HTTPS API) ----------
const KINDS: Record<string, string> = { 'ready-made': 'Ready-made', 'made-to-measure': 'Made to measure', 'custom': 'Custom design' };
const LABELS: Record<string, string> = {
  height: 'Height', bust: 'Bust', underbust: 'Underbust', waist: 'Waist', hips: 'Hips',
  shoulder: 'Shoulder width', shoulderWaist: 'Shoulder to waist', dressLength: 'Dress length', upperArm: 'Upper arm',
};
const GREEN = '#0c3925';
const GOLD = '#c7880f';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (v: unknown) => String(v ?? '').replace(/[\r\n\0\x0b\x0c\x85]+|\u2028|\u2029/g, ' ').trim();
const ghs = (n: number | null) => (n == null ? null : 'GHS ' + n.toLocaleString('en-GH', { maximumFractionDigits: 2 }));
const safeUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

// Ghana numbers: 0541791986 -> 233541791986 for wa.me; anything else keeps its digits
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('233')) return d;
  if (d.startsWith('0') && d.length === 10) return '233' + d.slice(1);
  return d;
}

function buildEmail(reference: string, o: ReturnType<typeof validate>, photos: string[]) {
  const kind = KINDS[o.kind];
  const first = String(o.items[0].product_name) + (o.items.length > 1 ? ` +${o.items.length - 1} more` : '');
  const subject = oneLine(`New order ${reference} · ${kind} · ${first} · ${o.customer_name}`).slice(0, 200);
  const total = ghs(o.total) ?? 'To be confirmed';
  const wa = `https://wa.me/${waNumber(o.customer_phone)}?text=${encodeURIComponent(`Hello ${o.customer_name.split(' ')[0]}, this is Mave Collection about your order ${reference}.`)}`;
  const items = o.items.map((i) => ({
    line: `${i.qty} x ${i.product_name}${i.size ? ` (${i.size})` : ''}`,
    price: ghs(i.unit_price_ghs as number | null),
  }));
  const meas = o.measurements_cm
    ? Object.entries(o.measurements_cm).map(([k, v]) => ({ label: LABELS[k] ?? k, cm: v, inch: Math.round((v / 2.54) * 10) / 10 }))
    : [];
  const links = photos.map(safeUrl).filter((u): u is string => !!u);

  const text = [
    `NEW ORDER ${reference}`,
    `${kind}  |  Total: ${total}`,
    '',
    'CUSTOMER',
    o.customer_name,
    `Phone / WhatsApp: ${o.customer_phone}   (${wa})`,
    `Deliver to: ${o.delivery_address}`,
    o.need_by ? `Needed by: ${o.need_by}` : '',
    '',
    'ORDER',
    ...items.map((i) => `- ${i.line}${i.price ? `  ${i.price}` : ''}`),
    o.notes ? `\nNOTES\n${o.notes}` : '',
    meas.length ? '\nMEASUREMENTS\n' + meas.map((m) => `- ${m.label}: ${m.cm} cm (${m.inch} in)`).join('\n') : '',
    links.length ? '\nSTYLE PHOTOS (links work for 7 days)\n' + links.map((u, n) => `${n + 1}. ${u}`).join('\n') : '',
    '',
    'Update the status in Supabase > Table Editor > orders.',
  ].filter((l) => l !== '').join('\n');

  const row = (a: string, b: string) =>
    `<tr><td style="padding:6px 0;color:#6b5a4e;width:42%">${a}</td><td style="padding:6px 0;text-align:right;font-weight:500">${b}</td></tr>`;
  const section = (title: string, inner: string) =>
    `<h3 style="margin:26px 0 8px;font:600 11px Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:${GREEN}">${title}</h3>${inner}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ec;padding:16px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#1f120b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
  <div style="background:${GREEN};color:#fff;padding:22px 24px">
    <div style="font:11px Arial;letter-spacing:.22em;text-transform:uppercase;color:#e8c36a">Mave Collection &middot; New order</div>
    <div style="font:600 26px Georgia,serif;margin-top:6px">${esc(reference)}</div>
    <div style="margin-top:6px;opacity:.9">${esc(kind)} &middot; ${esc(total)}</div>
  </div>
  <div style="padding:6px 24px 24px">
    ${section('Customer', `<div style="font-weight:600;font-size:17px">${esc(o.customer_name)}</div>
      <div style="margin-top:4px"><a href="tel:${esc(o.customer_phone.replace(/[^\d+]/g, ''))}" style="color:${GREEN}">${esc(o.customer_phone)}</a>
        &nbsp;&middot;&nbsp; <a href="${esc(wa)}" style="color:${GREEN};font-weight:600">Message on WhatsApp</a></div>
      <div style="margin-top:4px">${esc(o.delivery_address)}</div>
      ${o.need_by ? `<div style="margin-top:4px;color:#6b5a4e">Needed by <b style="color:#1f120b">${esc(o.need_by)}</b></div>` : ''}`)}
    ${section('Order', `<table style="width:100%;border-collapse:collapse">${items.map((i) => row(esc(i.line), esc(i.price ?? '—'))).join('')}
      <tr><td colspan="2" style="border-top:1px solid #e6e1da;padding-top:8px;text-align:right"><b>Total ${esc(total)}</b></td></tr></table>`)}
    ${o.notes ? section('Notes', `<div style="white-space:pre-wrap">${esc(o.notes)}</div>`) : ''}
    ${meas.length ? section('Measurements', `<table style="width:100%;border-collapse:collapse">${meas.map((m) => row(esc(m.label), `${m.cm} cm <span style="color:#6b5a4e;font-weight:400">(${m.inch} in)</span>`)).join('')}</table>`) : ''}
    ${links.length ? section('Style photos <span style="text-transform:none;letter-spacing:0;color:#6b5a4e">(links work for 7 days)</span>', links.map((u, n) => `<div style="margin:4px 0"><a href="${esc(u)}" style="color:${GOLD};font-weight:600">Photo ${n + 1}</a></div>`).join('')) : ''}
    <p style="margin:28px 0 0;color:#6b5a4e;font-size:13px">Change the status in Supabase &rarr; Table Editor &rarr; <b>orders</b>.</p>
  </div>
</div></body></html>`;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: 'That order is too large.' }, 413);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'Could not read the order.' }, 400); }

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
    console.error('place_order failed', error);
    if (paths.length) await supabase.storage.from('order-photos').remove(paths);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }

  // email the team in the background: the customer's confirmation never waits for it
  const task = notifyTeam(supabase, id, reference as string, order, paths).catch((e) => console.error('notifyTeam crashed', e));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task); else await task;

  return json({ reference });
});
