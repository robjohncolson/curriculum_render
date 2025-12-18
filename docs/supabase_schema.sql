-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

-- Users table: Maps usernames to real names for student identification
CREATE TABLE public.users (
  username text NOT NULL,
  real_name text NOT NULL,
  password text NULL,
  user_type text NULL DEFAULT 'student'::text,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (username)
);

CREATE INDEX IF NOT EXISTS idx_users_real_name ON public.users USING btree (real_name);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON public.users USING btree (user_type);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TABLE public.answers (
  id integer NOT NULL DEFAULT nextval('answers_id_seq'::regclass),
  username text NOT NULL,
  question_id text NOT NULL,
  answer_value text NOT NULL,
  timestamp bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT answers_pkey PRIMARY KEY (username, question_id)
);
CREATE TABLE public.badges (
  id integer NOT NULL DEFAULT nextval('badges_id_seq'::regclass),
  username text NOT NULL,
  badge_type text NOT NULL,
  earned_date bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT badges_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_activity (
  username text NOT NULL,
  activity_state text NOT NULL,
  question_id text,
  timestamp bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_activity_pkey PRIMARY KEY (username)
);
CREATE TABLE public.votes (
  id bigint NOT NULL DEFAULT nextval('votes_id_seq'::regclass),
  created_at timestamp without time zone DEFAULT now(),
  question_id text,
  voter_username text,
  target_username text,
  score smallint,
  timestamp timestamp without time zone,
  CONSTRAINT votes_pkey PRIMARY KEY (id)
);
-- Ensure upsert on (question_id, voter_username, target_username) works
ALTER TABLE public.votes
  ADD CONSTRAINT votes_question_voter_target_key UNIQUE (question_id, voter_username, target_username);
-- Strengthen data integrity
ALTER TABLE public.votes ALTER COLUMN question_id SET NOT NULL;
ALTER TABLE public.votes ALTER COLUMN voter_username SET NOT NULL;
ALTER TABLE public.votes ALTER COLUMN target_username SET NOT NULL;
ALTER TABLE public.votes ALTER COLUMN "timestamp" SET NOT NULL;