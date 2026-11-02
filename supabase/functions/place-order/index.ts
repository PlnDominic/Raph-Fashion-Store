// place-order: receives an order from the Mave Collection site, checks it, stores it and replies { reference }.
//
//   POST multipart/form-data
//     order   JSON  the order exactly as the site builds it (see js/shop.js and js/cart.js)
//     photos  file  zero to five style-reference images (made-to-measure and custom orders)
//
// Deployed with verify_jwt = false because it is a public order form; every field is validated here and
// the database is only ever written with the service role, which Supabase injects into the function.
// Optional secret: ALLOWED_ORIGIN (e.g. https://mavecollection.com) to accept orders from that site only.
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

  return json({ reference });
});
