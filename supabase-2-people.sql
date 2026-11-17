-- PART 2. Run AFTER you've created your two accounts in
-- Supabase: Authentication -> Users -> Add user (tick "Auto Confirm User").
--
-- Edit the two emails and names below, then run it.
-- slot 0 shows on the LEFT of the scoreboard, slot 1 on the RIGHT.

insert into public.profiles (id, name, slot)
select id, 'Rae', 0 from auth.users where email = 'rae@example.com';

insert into public.profiles (id, name, slot)
select id, 'Conor', 1 from auth.users where email = 'conor@example.com';
