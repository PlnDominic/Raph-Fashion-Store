-- Make every dress in the shop available (10 of each size). Adjust the numbers any time in Admin > Stock.
-- Re-runnable: it only raises a size that is below 10, and adds any size row that is missing.
insert into public.product_stock (product_id, size, qty)
select d.id, s.size, 10
from unnest(array[
  'royal-plum-set', 'ruby-luxe-statement-dress', 'luxe-silhouette-dress', 'duchess-navy-dress',
  'turquoise-elegance-set', 'scarlett-slit-sleeve-dress', 'black-pearl',
  'zaria-luxe-corset-dress', 'luxe-tassel-midi-dress'
]) as d(id)
cross join unnest(array['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22']) as s(size)
on conflict (product_id, size) do update set qty = greatest(public.product_stock.qty, 10);
