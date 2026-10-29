-- The Hugo site uses only achievements, site_images, the resume bucket and
-- is_admin(). Everything below belonged to the old site: résumé sections,
-- grade card, blog views/likes/comments, subscribers, page views and email
-- campaigns. Its edge functions are deleted separately.

drop function if exists public.increment_blog_like(text);
drop function if exists public.increment_blog_view(text);
drop function if exists public.increment_page_view(text);
drop function if exists public.submit_blog_comment(text, text, text);
drop function if exists public.subscribe_to_blog(text, text);
drop function if exists public.unsubscribe_by_token(uuid);

drop table if exists
  public.project_bullets,
  public.project_links,
  public.projects,
  public.skills,
  public.positions,
  public.education,
  public.grade_card_courses,
  public.grade_card_semesters,
  public.grade_card_meta,
  public.minor_courses,
  public.blog_stats,
  public.blog_comments,
  public.blog_subscribers,
  public.page_views,
  public.email_campaigns,
  public.email_settings
  cascade;

-- Its trigger went with blog_subscribers.
drop function if exists public.trigger_welcome_email();

-- The one-line résumé text; the Achievements page never shows it.
alter table public.achievements drop column if exists html;
