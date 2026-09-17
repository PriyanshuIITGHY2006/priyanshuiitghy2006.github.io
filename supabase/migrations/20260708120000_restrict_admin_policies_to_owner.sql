-- The "admin" policies previously checked only `to authenticated`, which in
-- Supabase means ANY logged-in user, not specifically the site owner. Since
-- Supabase projects allow public sign-up by default and nothing in this app
-- disables it, any visitor who created an account would have passed these
-- checks and gained full write access to resume content plus read access to
-- subscriber emails and all comments. Scope them to the one real admin.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = 'c4c44bfa-3ba6-4494-a98a-a3ed1fc7b67e'::uuid;
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

drop policy "admin write projects" on public.projects;
create policy "admin write projects" on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "admin write project_bullets" on public.project_bullets;
create policy "admin write project_bullets" on public.project_bullets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "admin write achievements" on public.achievements;
create policy "admin write achievements" on public.achievements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "admin write skills" on public.skills;
create policy "admin write skills" on public.skills
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "admin write positions" on public.positions;
create policy "admin write positions" on public.positions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "admin read all comments" on public.blog_comments;
create policy "admin read all comments" on public.blog_comments
  for select to authenticated using (public.is_admin());

drop policy "admin moderate comments" on public.blog_comments;
create policy "admin moderate comments" on public.blog_comments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy "admin delete comments" on public.blog_comments;
create policy "admin delete comments" on public.blog_comments
  for delete to authenticated using (public.is_admin());

drop policy "admin read subscribers" on public.blog_subscribers;
create policy "admin read subscribers" on public.blog_subscribers
  for select to authenticated using (public.is_admin());

-- trigger_welcome_email is only ever invoked by the AFTER INSERT trigger,
-- never called directly by clients; it doesn't need direct EXECUTE grants.
revoke execute on function public.trigger_welcome_email() from public, anon, authenticated;

-- Basic abuse-resistance: cap payload sizes and enforce a plausible email
-- shape at the DB layer, since these RPCs are directly callable by anon and
-- client-side validation is trivially bypassed with a raw RPC call.
alter table public.blog_subscribers
  add constraint blog_subscribers_name_len check (char_length(name) <= 200),
  add constraint blog_subscribers_email_len check (char_length(email) <= 320),
  add constraint blog_subscribers_email_shape check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

alter table public.blog_comments
  add constraint blog_comments_name_len check (char_length(name) <= 200),
  add constraint blog_comments_message_len check (char_length(message) between 1 and 4000),
  add constraint blog_comments_slug_len check (char_length(slug) <= 200);
