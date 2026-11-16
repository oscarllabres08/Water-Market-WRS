alter table public.laundry_sales add column if not exists cash_received numeric(12,2);
alter table public.laundry_sales add column if not exists change_due numeric(12,2);