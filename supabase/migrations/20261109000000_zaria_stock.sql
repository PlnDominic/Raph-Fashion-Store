-- Stock rows for The Zaria Luxe Corset Dress (all at 0 until you enter real quantities: Admin > Stock).
insert into public.product_stock (product_id, size)
select 'zaria-luxe-corset-dress', s.size
from unnest(array['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22']) as s(size)
on conflict do nothing;
