-- Files used inside posts (videos, audio, images) that should not appear in
-- the Gallery or the blog cover picker.
alter table public.site_images drop constraint site_images_kind_check;
alter table public.site_images add constraint site_images_kind_check
  check (kind = any (array['gallery'::text, 'blog-cover'::text, 'post-media'::text]));
