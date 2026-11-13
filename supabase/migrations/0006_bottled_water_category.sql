-- WaterMarket: add the bottled water product category.
-- Run this file by itself in the Supabase SQL Editor.
-- PostgreSQL cannot use a new enum value in the same transaction that adds it.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'product_category'
      and e.enumlabel = 'bottled_water'
  ) then
    alter type public.product_category add value 'bottled_water';
  end if;
end $$;
