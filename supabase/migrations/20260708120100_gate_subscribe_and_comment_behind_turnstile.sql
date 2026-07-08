-- subscribe_to_blog and submit_blog_comment used to be callable directly by
-- anon with the public anon key, with no rate limit, CAPTCHA, or email
-- verification. A script could mass-call subscribe_to_blog with arbitrary
-- third-party emails, each one triggering an automatic welcome email sent
-- from this site's Brevo identity — an email-bombing/spam-relay vector.
-- Both RPCs are now only reachable through the blog-engage edge function,
-- which verifies a Turnstile token first and calls them with the service
-- role (which bypasses grants, same as any other role check).
revoke execute on function public.subscribe_to_blog(text, text) from anon, authenticated, public;
revoke execute on function public.submit_blog_comment(text, text, text) from anon, authenticated, public;
