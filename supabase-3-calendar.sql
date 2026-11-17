-- Run once in the SQL Editor (after supabase-1-setup.sql).
-- A tiny settings table so the Calendar tab can remember your calendar's embed link
-- in your private database instead of in the public GitHub repo.
-- Other tabs can reuse it for any small "setting" you want both of you to share.

create table public.site_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table public.site_settings enable row level security;

create policy "see settings"    on public.site_settings for select to authenticated using (true);
create policy "add settings"    on public.site_settings for insert to authenticated with check (true);
create policy "edit settings"   on public.site_settings for update to authenticated using (true) with check (true);
create policy "remove settings" on public.site_settings for delete to authenticated using (true);
