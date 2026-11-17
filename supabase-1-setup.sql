-- PART 1. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Creates the tables, the private photo bucket, and the rules that
-- only let signed-in people (you two) read or write anything.

-- People: one row per partner, filled in by supabase-2-people.sql
create table public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  name  text not null,
  slot  int  not null unique check (slot in (0, 1))   -- 0 = left side, 1 = right side
);

-- Daily game scores
create table public.scores (
  id          bigint generated always as identity primary key,
  player_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game        text not null,
  play_date   date not null,
  display     text not null,                  -- what people see, e.g. "2 mistakes" or "0:43"
  value       numeric,                        -- number used to decide who won
  better      text not null default 'lower' check (better in ('lower', 'higher', 'none')),
  raw         text,                           -- the pasted share text
  created_at  timestamptz not null default now(),
  unique (player_id, game, play_date)         -- saving again the same day replaces your score
);

-- Photos (the image files themselves live in the private "photos" bucket)
create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  path         text not null,
  thumb_path   text not null,
  caption      text,
  taken_on     date not null default current_date,
  uploaded_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.scores   enable row level security;
alter table public.photos   enable row level security;

-- Only signed-in users can do anything.
create policy "see people" on public.profiles for select to authenticated using (true);

create policy "see scores"       on public.scores for select to authenticated using (true);
create policy "add own scores"   on public.scores for insert to authenticated with check (player_id = auth.uid());
create policy "edit own scores"  on public.scores for update to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy "remove own scores" on public.scores for delete to authenticated using (player_id = auth.uid());

create policy "see photos"    on public.photos for select to authenticated using (true);
create policy "add photos"    on public.photos for insert to authenticated with check (true);
create policy "edit photos"   on public.photos for update to authenticated using (true) with check (true);
create policy "remove photos" on public.photos for delete to authenticated using (true);

-- Private photo storage (JPEGs only, 10 MB each; the site shrinks photos before upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg']);

create policy "see photo files"    on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "add photo files"    on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy "remove photo files" on storage.objects for delete to authenticated using (bucket_id = 'photos');
