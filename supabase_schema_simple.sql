-- Simplified Supabase Schema for AP Stats Curriculum App
-- This version avoids stored procedures that may cause security warnings

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS badges CASCADE;
DROP TABLE IF EXISTS answers CASCADE;

-- Create answers table
CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_value TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique answers per user per question
  UNIQUE(username, question_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_answers_username ON answers(username);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_timestamp ON answers(timestamp DESC);

-- Create badges table (optional - for achievement tracking)
CREATE TABLE IF NOT EXISTS badges (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  earned_date BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique badges per user
  UNIQUE(username, badge_type)
);

-- Create index for badges
CREATE INDEX IF NOT EXISTS idx_badges_username ON badges(username);

-- Enable Row Level Security (RLS)
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Create policies for public read/write (no auth required)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read answers" ON answers;
DROP POLICY IF EXISTS "Anyone can insert answers" ON answers;
DROP POLICY IF EXISTS "Anyone can update answers" ON answers;
DROP POLICY IF EXISTS "Anyone can read badges" ON badges;
DROP POLICY IF EXISTS "Anyone can insert badges" ON badges;
DROP POLICY IF EXISTS "Anyone can update badges" ON badges;

-- Anyone can read all answers (peer learning transparency)
CREATE POLICY "Anyone can read answers" ON answers
  FOR SELECT USING (true);

-- Anyone can insert their own answers
CREATE POLICY "Anyone can insert answers" ON answers
  FOR INSERT WITH CHECK (true);

-- Anyone can update their own answers
CREATE POLICY "Anyone can update answers" ON answers
  FOR UPDATE USING (true);

-- Same policies for badges
CREATE POLICY "Anyone can read badges" ON badges
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert badges" ON badges
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update badges" ON badges
  FOR UPDATE USING (true);

-- Simple views for reporting (without SECURITY DEFINER to avoid warnings)
-- Drop existing views if they exist
DROP VIEW IF EXISTS latest_peer_answers;
DROP VIEW IF EXISTS user_progress;

-- Create a view for getting latest peer data efficiently
CREATE VIEW latest_peer_answers AS
SELECT
  question_id,
  answer_value,
  COUNT(*) as answer_count,
  MAX(timestamp) as latest_timestamp
FROM answers
GROUP BY question_id, answer_value;

-- Create a view for getting user progress
CREATE VIEW user_progress AS
SELECT
  username,
  COUNT(DISTINCT question_id) as questions_answered,
  MAX(timestamp) as last_activity
FROM answers
GROUP BY username;

-- Grant necessary permissions for anon role (Supabase's public access)
GRANT ALL ON answers TO anon;
GRANT ALL ON badges TO anon;
GRANT SELECT ON latest_peer_answers TO anon;
GRANT SELECT ON user_progress TO anon;
GRANT USAGE ON SEQUENCE answers_id_seq TO anon;
GRANT USAGE ON SEQUENCE badges_id_seq TO anon;