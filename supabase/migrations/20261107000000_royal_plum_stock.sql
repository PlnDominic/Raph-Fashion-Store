-- Stock rows for the Royal Plum Set (all at 0 until you enter what you have: Admin > Stock, or Table Editor > product_stock).
insert into public.product_stock (product_id, size)
select 'royal-plum-set', s.size
from unnest(array['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22']) as s(size)
on conflict do nothing;
