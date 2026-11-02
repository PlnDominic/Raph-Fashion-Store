# Order database (Supabase)

When a customer places an order on the site, it goes to a small Supabase function (`place-order`), which checks it and saves it in a database. Style-reference photos go to private storage. The team reads orders in the Supabase dashboard.

```
site  ──POST──▶  place-order function  ──▶  orders / order_items / order_photos  +  private "order-photos" storage
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
Your function URL is `https://<project-ref>.supabase.co/functions/v1/place-order` (the project ref is in **Project Settings → General**). Put it in `js/products.js`:

```js
orderEndpoint: 'https://<project-ref>.supabase.co/functions/v1/place-order',
```

Commit and publish the site. From then on the "Test mode" notice disappears and orders appear in the database.

### 5. Try it
Place a test order on the site, then open **Table Editor → orders** (or **SQL Editor**: `select * from orders_overview;`). Delete test rows when you are done.

## Day to day

- **See orders:** SQL Editor → `select * from orders_overview;` shows one readable row per order (what they bought, size, total, photos, notes, measurements).
- **Move an order along:** in Table Editor change `status` (`new → confirmed → cutting → sewing → ready → delivered`, or `cancelled`) and `payment_status` (`unpaid / paid / refunded`). `internal_notes` is for the team only.
- **See a customer's style photos:** Storage → `order-photos` → the folder named after the order's `id`. (The `order_photos` table lists the file paths.)
- **Backups:** the free plan has no automatic backups you can restore. Export `orders` to CSV from the Table Editor now and then, or move to a paid plan before relying on this heavily.

## Before you take real payments (Paystack)
Prices are currently sent from the browser, and the function stores what it is sent. That is fine while the team confirms every order by phone, but **before online payment goes live the prices must live in the database** and the function must look them up itself, otherwise a customer could change a price. Do that in the same step as the Paystack integration.

## Protection already built in
- A customer can place at most 5 orders per phone number per hour.
- Photos: JPEG/PNG/WebP only, 5 MB each, up to 5 per order.
- Every field is checked in the function (names, phone, address, measurement ranges, sizes, quantities), and again by database constraints.
- If saving the order fails, the uploaded photos are deleted again.
- To accept orders only from your own website, add a function secret `ALLOWED_ORIGIN` = `https://your-domain` (Edge Functions → Secrets).
