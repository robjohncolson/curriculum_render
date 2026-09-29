-- 0003_answers_reasoning.sql  (USER-RUN on Supabase project bzqbhtrurzzavhqbgqrs)
--
-- QUIZ_FIRST_ANSWER_SPEC v2 (2026-09-29): a student's explanation for a quiz answer.
-- POST /api/submit-answer stores it when provided; /api/peer-data (select *) returns it;
-- the quiz page shows a classmate's card only when this is non-empty. The server retries
-- the upsert WITHOUT this column until it exists, so running this late loses only the text.
alter table public.answers add column if not exists reasoning text null;
