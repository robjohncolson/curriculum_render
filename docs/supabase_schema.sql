-- This new table is designed to perfectly match your CSV file structure for import.
CREATE TABLE answers (
    -- id is a number from the CSV, not auto-generated. 'serial' is changed to 'bigint'.
    id bigint NOT NULL,

    -- These columns match perfectly.
    username text NOT NULL,
    question_id text NOT NULL,
    answer_value text NULL, -- Changed to NULL to be safe, as some FRQ answers might be empty.

    -- This column type already matches the CSV.
    "timestamp" bigint NOT NULL,

    -- These are now plain timestamp columns that will accept values from the CSV.
    -- The "default now()" has been removed.
    created_at timestamp with time zone NULL,
    updated_at timestamp with time zone NULL,

    -- Keep the same constraints.
    CONSTRAINT answers_imported_pkey PRIMARY KEY (id),
    CONSTRAINT answers_imported_username_question_id_key UNIQUE (username, question_id)
);
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read answers" ON answers
  FOR SELECT USING (true);

-- Anyone can insert their own answers
CREATE POLICY "Anyone can insert answers" ON answers
  FOR INSERT WITH CHECK (true);

-- Anyone can update their own answers (latest timestamp wins)
CREATE POLICY "Anyone can update answers" ON answers
  FOR UPDATE USING (true);

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