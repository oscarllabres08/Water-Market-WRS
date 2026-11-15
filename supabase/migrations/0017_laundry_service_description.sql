-- Optional short text shown in laundry admin services list (and website when wired).

alter table public.laundry_services
  add column if not exists description text;