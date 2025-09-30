-- Supabase Schema for AP Stats Curriculum App
-- Minimal schema focusing on simplicity and functionality

-- Create answers table
CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_value TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique answers per user per question (latest timestamp wins on conflict)
  UNIQUE(username, question_id)
);

-- Create index for efficient queries
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

-- Enable Row Level Security
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Create policies for public read/write (no auth required per requirements)
-- Anyone can read all answers (peer learning transparency)
CREATE POLICY "Anyone can read answers" ON answers
  FOR SELECT USING (true);

-- Anyone can insert their own answers
CREATE POLICY "Anyone can insert answers" ON answers
  FOR INSERT WITH CHECK (true);

-- Anyone can update their own answers (latest timestamp wins)
CREATE POLICY "Anyone can update answers" ON answers
  FOR UPDATE USING (true);

-- Same policies for badges
CREATE POLICY "Anyone can read badges" ON badges
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert badges" ON badges
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update badges" ON badges
  FOR UPDATE USING (true);

-- Create a function to handle upserts (insert or update based on unique constraint)
CREATE OR REPLACE FUNCTION upsert_answer(
  p_username TEXT,
  p_question_id TEXT,
  p_answer_value TEXT,
  p_timestamp BIGINT
)
RETURNS void AS $$
BEGIN
  INSERT INTO answers (username, question_id, answer_value, timestamp)
  VALUES (p_username, p_question_id, p_answer_value, p_timestamp)
  ON CONFLICT (username, question_id)
  DO UPDATE SET
    answer_value = EXCLUDED.answer_value,
    timestamp = EXCLUDED.timestamp
  WHERE EXCLUDED.timestamp > answers.timestamp; -- Only update if newer
END;
$$ LANGUAGE plpgsql;

-- Create a view for getting latest peer data efficiently
CREATE OR REPLACE VIEW latest_peer_answers AS
SELECT
  question_id,
  answer_value,
  COUNT(*) as answer_count,
  MAX(timestamp) as latest_timestamp
FROM answers
GROUP BY question_id, answer_value;

-- Create a view for getting user progress
CREATE OR REPLACE VIEW user_progress AS
SELECT
  username,
  COUNT(DISTINCT question_id) as questions_answered,
  MAX(timestamp) as last_activity
FROM answers
GROUP BY username;