-- Content management: dresses and site text live in the database, so the admin page can change them.
-- Run once in the SQL Editor (after the earlier migrations). The site keeps working from its built-in list
-- if the database cannot be reached, and the seed rows below are exactly what the site shows today.

create table public.products (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name        text not null check (char_length(name) between 1 and 120),
  price       numeric(10, 2) check (price is null or price >= 0),        -- null = "Price on request"
  ready_made  boolean not null default true,                              -- false = made to order only
  lead_time   text check (lead_time is null or char_length(lead_time) <= 60),
  card_image  text,                                                       -- shop photo (a path in the site, or a full address)
  rail_image  text,                                                       -- transparent cut-out for the homepage line-up (optional)
  rail_scale  numeric(3, 2) not null default 1 check (rail_scale between 0.4 and 1.2),
  gallery     jsonb not null default '[]'::jsonb,                         -- extra photos for the dress page
  visible     boolean not null default true,
  sort        integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.site_content (
  key        text primary key check (key in ('marquee', 'contacts', 'info')),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.products     enable row level security;
alter table public.site_content enable row level security;
revoke all on public.products, public.site_content from anon, authenticated;   -- the site reads them through the order function

create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger site_content_set_updated_at before update on public.site_content for each row execute function public.set_updated_at();

-- photos uploaded from the admin page (public to read, written only by the function)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

insert into public.products (id, name, price, ready_made, card_image, rail_image, rail_scale, sort) values
  ('royal-plum-set', 'Royal Plum Set', 300, true, 'assets/products/royal-plum-set.webp', 'assets/rail/royal-plum-set.webp', 0.85, 10),
  ('ruby-luxe-statement-dress', 'Ruby Luxe Statement Dress', 270, true, 'assets/products/ruby-luxe-statement-dress.webp', 'assets/rail/ruby-luxe-statement-dress.webp', 1, 20),
  ('luxe-silhouette-dress', 'Luxe Silhouette Dress', 250, true, 'assets/products/luxe-silhouette-dress.webp', 'assets/rail/luxe-silhouette-dress.webp', 1, 30),
  ('duchess-navy-dress', 'Duchess Navy Dress', 290, true, 'assets/products/duchess-navy-dress.webp', 'assets/rail/duchess-navy-dress.webp', 0.85, 40),
  ('turquoise-elegance-set', 'Turquoise Elegance Set', 350, true, 'assets/products/turquoise-elegance-set.webp', 'assets/rail/turquoise-elegance-set.webp', 1, 50),
  ('scarlett-slit-sleeve-dress', 'Scarlett Slit Sleeve Dress', 250, true, 'assets/products/scarlett-slit-sleeve-dress.webp', 'assets/rail/scarlett-slit-sleeve-dress.webp', 1, 60),
  ('black-pearl', 'Black Pearl', 250, true, 'assets/products/black-pearl.webp', 'assets/rail/black-pearl.webp', 1, 70),
  ('zaria-luxe-corset-dress', 'The Zaria Luxe Corset Dress', 270, true, 'assets/products/zaria-luxe-corset-dress.webp', 'assets/rail/zaria-luxe-corset-dress.webp', 1, 80),
  ('luxe-tassel-midi-dress', 'The Luxe Tassel Midi Dress', 270, true, 'assets/products/luxe-tassel-midi-dress.webp', 'assets/rail/luxe-tassel-midi-dress.webp', 1, 90)
on conflict (id) do nothing;

insert into public.site_content (key, value) values
  ('marquee',  $j$["From Accra, with love", "Designed & stitched in Danfa", "Mave Collection, Accra"]$j$::jsonb),
  ('contacts', $j${"whatsapp": "233541791986", "phones": ["054 179 1986", "059 247 5432"], "email": "info@mavecollections.com", "address": "Danfa, Accra"}$j$::jsonb),
  ('info',     $j$[{"title": "How ordering works", "body": "**Ready-made dresses:** choose a size, add the dress to your cart and check out with your name, phone number and delivery address.\n\n**Made to measure and custom designs:** send us your measurements and, if you like, photos of the style you have in mind.\n\nFor every order we call or message you on WhatsApp to confirm the details, the price and the timing before anything is made or sent."}, {"title": "Delivery and pick-up", "body": "You can collect your dress from us in **Danfa, Accra**, or we can deliver it:\n\n- within Accra and Tema,\n- by courier to other parts of Ghana, and\n- internationally, quoted for each order.\n\nThe delivery fee depends on where you are. We tell you the amount when we confirm your order."}, {"title": "Payment", "body": "**Ready-made dresses** are paid for in full.\n\n**Made-to-measure and custom dresses** start with a deposit, and the balance is paid before your dress is delivered or collected.\n\nWe confirm the amounts and how to pay when we contact you, so you never pay anything before we have spoken."}, {"title": "How long it takes", "body": "Ready-made dresses are prepared once your order is confirmed. Made-to-measure timing depends on the dress and how much detail it has, so we confirm the time with you when we call, before you pay a deposit."}, {"title": "Fittings, exchanges and returns", "body": "Made-to-measure and custom dresses are made for one person, so they cannot be returned. If the fit is not right, we adjust it for you free of charge.\n\nReady-made dresses can be exchanged if they have not been worn.\n\nMessage us on WhatsApp as soon as you have tried your dress and we will arrange it.\n\nWant it checked while it is being made? [Book a fitting at our Danfa studio](#book-fit). You will need your order reference."}, {"title": "Your measurements and photos", "body": "We use your measurements and style photos only to make your dress. They are kept in a private database that only our team can open. You can ask us to delete them at any time. Read our [Privacy Notice](privacy.html)."}]$j$::jsonb)
on conflict (key) do nothing;
