-- 0002_quiz_reviews.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- quiz_reviews: one row per AI appeal, preserving the student's explanation,
-- the AI verdict/feedback, and the credit represented by the signed review
-- grant. Written only by railway-server/server.js with the backend service key.
-- Idempotent / safe to re-run.

create table if not exists public.quiz_reviews (
  id                 bigint generated always as identity primary key,
  username           text not null,
  sid                text,
  question_id        text not null,
  appeal_text        text not null,
  verdict            text not null check (verdict in ('E', 'P', 'I')),
  credit             numeric not null check (credit between 0 and 1),
  exception_granted  boolean not null default false,
  feedback           text,
  created_at         timestamptz not null default now()
);

create index if not exists quiz_reviews_username_question_idx on public.quiz_reviews (username, question_id);
create index if not exists quiz_reviews_sid_question_idx      on public.quiz_reviews (sid, question_id);

-- Older runs may contain retry duplicates. Keep the first row so creation of
-- the idempotency index is safe on an already-populated installation.
delete from public.quiz_reviews newer
using public.quiz_reviews older
where newer.id > older.id
  and newer.sid is not distinct from older.sid
  and newer.question_id = older.question_id
  and md5(newer.appeal_text) = md5(older.appeal_text);

create unique index if not exists quiz_reviews_sid_question_appeal_uidx
  on public.quiz_reviews (sid, question_id, md5(appeal_text));

do $$ begin
  alter table public.quiz_reviews
    add constraint quiz_reviews_credit_range check (credit between 0 and 1);
exception when duplicate_object then null; end $$;

-- Deliberately ZERO RLS policies: student explanations and AI feedback are
-- private. The backend service role bypasses RLS; anon/authenticated clients
-- must have no direct read or write path.
alter table public.quiz_reviews enable row level security;
revoke all on table public.quiz_reviews from anon, authenticated;

do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'quiz_reviews'
  loop
    execute format('drop policy if exists %I on public.quiz_reviews', policy_row.policyname);
  end loop;
end $$;
