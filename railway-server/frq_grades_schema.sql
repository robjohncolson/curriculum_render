-- FRQ Grades Table Schema for Supabase
-- Run this in your Supabase SQL Editor to create the table for storing AI-graded FRQ responses

-- Create the frq_grades table
CREATE TABLE IF NOT EXISTS frq_grades (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    question_id TEXT NOT NULL,
    student_answer TEXT NOT NULL,
    grade_result JSONB NOT NULL,
    total_points DECIMAL(4,2) NOT NULL,
    max_points DECIMAL(4,2) NOT NULL,
    graded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Composite unique constraint so each user can only have one grade per question
    UNIQUE(username, question_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_frq_grades_username ON frq_grades(username);
CREATE INDEX IF NOT EXISTS idx_frq_grades_question_id ON frq_grades(question_id);
CREATE INDEX IF NOT EXISTS idx_frq_grades_graded_at ON frq_grades(graded_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE frq_grades ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read grades (for peer comparison)
CREATE POLICY "Allow read access to all grades"
ON frq_grades FOR SELECT
USING (true);

-- Policy: Anyone can insert/update their own grades (anonymous users)
CREATE POLICY "Allow insert for all"
ON frq_grades FOR INSERT
WITH CHECK (true);

-- Policy: Allow upsert (update on conflict)
CREATE POLICY "Allow update for all"
ON frq_grades FOR UPDATE
USING (true);

-- Grant permissions to anon and authenticated users
GRANT SELECT, INSERT, UPDATE ON frq_grades TO anon;
GRANT SELECT, INSERT, UPDATE ON frq_grades TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE frq_grades_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE frq_grades_id_seq TO authenticated;

-- Enable realtime for this table (optional - for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE frq_grades;

-- Sample query to get a student's grades:
-- SELECT * FROM frq_grades WHERE username = 'Apple_Tiger' ORDER BY graded_at DESC;

-- Sample query to get class statistics for a question:
-- SELECT
--     question_id,
--     COUNT(*) as total_responses,
--     AVG(total_points) as avg_score,
--     AVG(total_points / max_points * 100) as avg_percentage
-- FROM frq_grades
-- WHERE question_id = 'U1-L10-Q04'
-- GROUP BY question_id;
