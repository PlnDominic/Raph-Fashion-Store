# Order database (Supabase)

When a customer places an order on the site, it goes to a small Supabase function (`place-order`), which checks it and saves it in a database. Style-reference photos go to private storage. The team reads orders in the Supabase dashboard.

```
site  ──POST──▶  place-order function  ──▶  orders / order_items / order_photos  +  private "order-photos" storage
                                    └──▶  Resend  ──▶  an email to the team for every new order
```

The browser can never read or change orders: the tables are locked, and only the function (using a secret key that never leaves Supabase) can write to them.

## One-time setup (about 15 minutes)

### 1. Create a Supabase project
1. Go to https://supabase.com/dashboard and sign in.
2. **New project**. Name: `mave-collection`. Pick a strong database password and save it in a password manager. Region: `eu-west-1` (Ireland) or `eu-central-1` (Frankfurt) are the closest to Accra.
3. Wait until the project says it is ready. The free plan is enough to start.

### 2. Create the tables
1. In the project, open **SQL Editor → New query**.
2. Paste the whole of `supabase/migrations/20261102000000_orders.sql` and press **Run**. You should see "Success".
3. Check **Table Editor**: `orders`, `order_items`, `order_photos`. Check **Storage**: a private bucket called `order-photos`.

### 3. Deploy the order function
Easiest, no tools to install:
1. **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `place-order`.
2. Paste the whole of `supabase/functions/place-order/index.ts` and deploy.
3. Open the function's settings and turn **"Verify JWT" OFF** (the order form is public, and the function checks every field itself).

Or with the Supabase CLI: `supabase login`, `supabase link --project-ref <ref>`, `supabase functions deploy place-order --no-verify-jwt`.

### 4. Connect the site
Your function URL is `https://<project-ref>.supabase.co/functions/v1/<function-slug>` (the project ref is in **Project Settings → General**; the slug is shown on the function's **Overview** tab and can differ from the name in the dashboard heading, so copy it from there). Put it in `js/products.js`:

```js
orderEndpoint: 'https://<project-ref>.supabase.co/functions/v1/<function-slug>',
```

Commit and publish the site. From then on the "Test mode" notice disappears and orders appear in the database.

### 5. Try it
Place a test order on the site, then open **Table Editor → orders** (or **SQL Editor**: `select * from orders_overview;`). Delete test rows when you are done.

## Day to day

- **See orders:** SQL Editor → `select * from orders_overview;` shows one readable row per order (what they bought, size, total, photos, notes, measurements).
- **Move an order along:** in Table Editor change `status` (`new → confirmed → cutting → sewing → ready → delivered`, or `cancelled`) and `payment_status` (`unpaid / paid / refunded`). `internal_notes` is for the team only.
- **See a customer's style photos:** Storage → `order-photos` → the folder named after the order's `id`. (The `order_photos` table lists the file paths.)
- **Backups:** the free plan has no automatic backups you can restore. Export `orders` to CSV from the Table Editor now and then, or move to a paid plan before relying on this heavily.

## 6. Email the team about every new order (Resend)

The function sends the email itself through [Resend](https://resend.com) (a web API, so nothing to host). If Resend is down, the customer's order still goes through; the result is written to the order (`notified_at`, or `notify_error`) so you can see which orders you were not emailed about.

1. **Run the notifications SQL once:** SQL Editor → paste `supabase/migrations/20261103000000_order_notifications.sql` → Run.
2. **Redeploy the function** with the latest `supabase/functions/place-order/index.ts` (Edge Functions → `place-order` → Code → replace `index.ts` → Deploy updates).
3. **Create a Resend account** at resend.com, signing up with the address that should receive the orders (`info.mavecollection@gmail.com`). In Resend: **API Keys → Create API Key** (permission: "Sending access"). Copy the key (it starts with `re_`).
4. **Add secrets** in Supabase: Edge Functions → **Secrets** → add:
   - `RESEND_API_KEY` = the key from step 3
   - `NOTIFY_TO` = `info.mavecollection@gmail.com` (several addresses can be separated by commas)
5. **Test:** place an order on the site. The email arrives within seconds, from "Mave Collection Orders <onboarding@resend.dev>" (check Spam the first time). In SQL Editor, `select reference, notified_at, notify_error from orders_overview;` shows whether it was sent.

**Resend's shared sender** (`onboarding@resend.dev`) can only deliver to the address you signed up with, which is fine for getting started. To send from your own address (e.g. `orders@mavecollections.com`) and to more recipients: Resend → **Domains → Add domain** `mavecollections.com`, add the DNS records Resend shows you at your domain provider, wait for "Verified", then add the secret `NOTIFY_FROM` = `Mave Collection <orders@mavecollections.com>`.

What the email contains: reference, order type and total, the customer's name, phone (tap to call, plus a "Message on WhatsApp" link), address and needed-by date, the dresses and sizes, notes, the measurements (in inches) and links to the style photos (private; the links work for 7 days).

If the free plan's sending limit is ever reached, orders keep working but emails stop; `notify_error` will say so. Check Resend's pricing page for the current limits.

## 7. Stock and sizes for ready-made dresses

Ready-made dresses are counted per size in the `product_stock` table (one row per dress per size, with a `qty`). The shop reads it, shows crossed-out sizes and a "Sold out" / "Last piece" badge, and the database takes stock off the moment an order is placed, so two people can never buy the same last piece. Made-to-measure and custom orders never touch stock.

**Set it up (in this order, so the shop is never wrongly "sold out"):**
1. **Run the stock SQL once:** SQL Editor → paste `supabase/migrations/20261104000000_stock.sql` → Run. It creates a row for every dress in UK 8, 10, 12, 14, 16, 18, 20 and 22, all at `0`.
2. **Enter what you really have:** Table Editor → `product_stock` → change the `qty` numbers. Delete the rows for sizes you don't make (they would otherwise show as crossed-out "sold out" sizes). To add a size or a new dress, insert a row (`product_id` is the id from `js/products.js`).
3. **Redeploy the function** (Edge Functions → your function → Code → paste the latest `supabase/functions/place-order/index.ts` → Deploy updates).

**Day to day**
- **Received more stock / made another one?** Raise its `qty` in the Table Editor. The shop updates within a few seconds.
- **An order is cancelled?** Set the order's `status` to `cancelled` (Table Editor → `orders`). Its dresses go back in stock automatically. Changing it back from `cancelled` takes them off again (and is refused if that stock has been sold in the meantime).
- **Unpaid orders hold stock** until they are cancelled, so cancel orders that will not be paid.
- A customer who finds a size just sold out is told so and offered "Get it tailored".

If the shop cannot load stock (old function, offline, no endpoint yet), every size is simply shown as available and the database still protects against overselling when the order is placed.

## 8. Spam protection (Cloudflare Turnstile)

The order address is public, so without a check a script could post thousands of fake orders. Turnstile is Cloudflare's free, mostly invisible "are you a real person" check. The website runs it in the background while a customer fills in the order form (a small box appears only if Cloudflare is unsure), and the order function refuses any order that doesn't carry a valid proof. It is off until you complete these steps, so do them **in this order** so real customers are never locked out:

1. **Create the widget.** Cloudflare dashboard → **Turnstile** (left menu) → **Add widget**. Name: `Mave orders`. Hostnames: `www.mavecollections.com` and `mavecollections.com`. Widget mode: **Managed**. Create it, then copy the **Site Key** (public) and the **Secret Key** (private).
2. **Put the Site Key in the website:** in `js/products.js` set `turnstileSiteKey: 'the site key'` (or send me the site key and I'll do it). Wait for the site to redeploy.
3. **Redeploy the function** with the latest `supabase/functions/place-order/index.ts`. Nothing changes yet.
4. **Switch it on:** Supabase → Edge Functions → **Secrets** → add `TURNSTILE_SECRET` = the Secret Key. **Never put the Secret Key in the website or paste it in a chat.**
5. **Test:** place an order on the site. It should go through as usual.

**Off switch:** delete the `TURNSTILE_SECRET` secret and the function stops requiring the check straight away.

Good to know: if Cloudflare itself is unreachable the function lets customers who carry a token through (and logs it), so a Cloudflare outage cannot stop real orders. A customer whose browser blocks Cloudflare's script is asked to try again or order on WhatsApp.

## 9. Fitting appointments (Danfa studio)

Customers book a one-hour fitting from the "Order received" screen, from the "Good to know" section, or from the footer. They enter their order reference and the phone number they ordered with (so nobody can book against someone else's order), pick a free day and time, and you get an email. Each slot can be booked once; a customer who books again moves their appointment.

1. **Run the fittings SQL once:** SQL Editor, paste `supabase/migrations/20261105000000_fittings.sql`, Run.
2. **Redeploy the function** with the latest `supabase/functions/place-order/index.ts`.
3. **Opening hours** are the five `FITTING_*` values near the top of that file: Monday to Saturday, 10:00 to 16:00 (last start), up to 21 days ahead, at least 24 hours' notice. Change them and redeploy.

**Day to day**
- See appointments: SQL Editor, `select * from fittings_overview;`.
- Cancel one: Table Editor, `fittings`, set `status` to `cancelled`. The slot is free again.
- Close the studio for a slot or a day: insert rows in `fittings` with `status = 'blocked'` and the `slot_start` times (no order needed). Example for a whole Tuesday: `insert into fittings (slot_start, status) select d + h * interval '1 hour', 'blocked' from (select date '2026-11-10') x(d), generate_series(10, 16) h;`

If the fittings SQL has not been run, the booking screen simply says it cannot load times and asks the customer to message you on WhatsApp.

## Before you take real payments (Paystack)
Prices are currently sent from the browser, and the function stores what it is sent. That is fine while the team confirms every order by phone, but **before online payment goes live the prices must live in the database** and the function must look them up itself, otherwise a customer could change a price. Do that in the same step as the Paystack integration.

## Protection already built in
- A customer can place at most 5 orders per phone number per hour (so email can never be flooded from one number).
- Photos: JPEG/PNG/WebP only, 5 MB each, up to 5 per order.
- Every field is checked in the function (names, phone, address, measurement ranges, sizes, quantities), and again by database constraints.
- If saving the order fails, the uploaded photos are deleted again.
- To accept orders only from your own website, add a function secret `ALLOWED_ORIGIN` = `https://your-domain` (Edge Functions → Secrets).
