-- Already applied to the live database. Checked in for reference/reproducibility
-- only — do not re-run as-is, since the secret below is a placeholder.
--
-- Before applying to a fresh database, replace <INTERNAL_WEBHOOK_SECRET> with
-- the same value stored as the send-welcome-email Edge Function's
-- INTERNAL_WEBHOOK_SECRET secret (Project Settings -> Edge Functions -> Secrets).

create extension if not exists pg_net;

-- Fire-and-forget async HTTP call, so subscribing doesn't wait on email
-- sending. The internal secret matches what's set as the send-welcome-email
-- function's INTERNAL_WEBHOOK_SECRET.
create or replace function public.trigger_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://vadbagtnekrjwrimvgxe.supabase.co/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '<INTERNAL_WEBHOOK_SECRET>'
    ),
    body := jsonb_build_object('name', new.name, 'email', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_blog_subscriber_insert on public.blog_subscribers;
create trigger on_blog_subscriber_insert
after insert on public.blog_subscribers
for each row
execute function public.trigger_welcome_email();
