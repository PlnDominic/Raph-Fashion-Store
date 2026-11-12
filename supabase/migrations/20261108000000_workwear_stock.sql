-- Stock rows for the rest of the workwear dresses (all at 0 until you enter real quantities: Admin > Stock).
-- Safe to run before the dresses appear on the site.
insert into public.product_stock (product_id, size)
select d.id, s.size
from unnest(array['ruby-luxe-statement-dress', 'luxe-silhouette-dress', 'duchess-navy-dress',
                  'turquoise-elegance-set', 'scarlett-slit-sleeve-dress', 'black-pearl']) as d(id)
cross join unnest(array['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22']) as s(size)
on conflict do nothing;
