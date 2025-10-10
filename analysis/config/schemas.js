// Data Schemas and Type Definitions for Analysis Pipeline
// Phase 1: Data Ingestion and Normalization

/**
 * Schema for answers_rows CSV
 * Source: docs/answers_rows (1).csv
 */
const ANSWER_ROW_SCHEMA = {
  fields: [
    { name: 'id', type: 'integer', description: 'Database row ID' },
    { name: 'username', type: 'string', description: 'Student gamer-tag (Fruit_Animal format)', normalize: true },
    { name: 'question_id', type: 'string', description: 'Question identifier (Unit-Lesson-Question format)', pattern: /^U\d+-L\d+-Q\d+$/ },
    { name: 'answer_value', type: 'string', description: 'Student answer (A-E for MC, text for CR)' },
    { name: 'timestamp', type: 'integer', description: 'Unix timestamp in milliseconds (primary recency indicator)' },
    { name: 'created_at', type: 'timestamp', description: 'PostgreSQL timestamp with timezone' },
    { name: 'updated_at', type: 'timestamp', description: 'PostgreSQL timestamp with timezone (fallback recency)' }
  ],
  primaryKey: 'id',
  recencyField: 'timestamp', // Use for determining latest attempt
  recencyFallback: 'updated_at'
};

/**
 * Schema for student2username mapping CSV
 * Source: docs/student2username.csv
 */
const ROSTER_MAPPING_SCHEMA = {
  fields: [
    { name: 'student_name', type: 'string', description: 'Student real name or identifier', normalize: true },
    { name: 'username', type: 'string', description: 'Gamer-tag username', normalize: true }
  ],
  notes: [
    'May contain duplicate mappings (one student → multiple gamer-tags)',
    'May contain capitalization variants of same username',
    'Header row present: "student name,fruit_animal"'
  ]
};

/**
 * Normalized Answer Record
 * After normalization pipeline
 */
const NORMALIZED_ANSWER_RECORD = {
  id: 'integer',
  username: 'string (normalized: lowercase, underscores, trimmed)',
  questionId: 'string (validated format)',
  answerValue: 'string',
  timestamp: 'integer',
  createdAt: 'Date',
  updatedAt: 'Date',
  unit: 'integer (extracted from questionId)',
  lesson: 'integer (extracted from questionId)',
  questionNum: 'integer (extracted from questionId)',
  isL10: 'boolean (derived: lesson === 10 && unit === 1)'
};

/**
 * Normalized Roster Record
 * After normalization and deduplication
 */
const NORMALIZED_ROSTER_RECORD = {
  studentName: 'string (normalized)',
  usernames: 'array<string> (all known gamer-tags, normalized)',
  primaryUsername: 'string (most recently used)',
  aliases: 'array<string> (alternative usernames)',
  period: 'string (B or E, assigned based on L10 attempts)'
};

/**
 * Normalization Rules
 */
const NORMALIZATION_RULES = {
  username: [
    'Convert to lowercase',
    'Replace all hyphens with underscores',
    'Trim leading/trailing whitespace',
    'Examples: "Guava_cat" → "guava_cat", "lemon-eagle" → "lemon_eagle", " Mango_Tiger " → "mango_tiger"'
  ],
  studentName: [
    'Trim leading/trailing whitespace',
    'Preserve original capitalization for display',
    'Create lowercase version for matching'
  ],
  questionId: [
    'Validate format: U{unit}-L{lesson}-Q{question}',
    'Extract components for filtering/grouping'
  ]
};

/**
 * Data Dictionary
 */
const DATA_DICTIONARY = {
  'answers_rows (1).csv': {
    source: 'Supabase export via Railway server',
    rowCount: 'TBD during load',
    columns: ANSWER_ROW_SCHEMA.fields,
    expectedFormat: 'CSV with headers',
    encoding: 'UTF-8',
    specialNotes: [
      'First row contains test data (test_user)',
      'Timestamps are Unix epoch milliseconds',
      'Some usernames have inconsistent capitalization'
    ]
  },
  'student2username.csv': {
    source: 'Manual roster mapping',
    rowCount: 'TBD during load',
    columns: ROSTER_MAPPING_SCHEMA.fields,
    expectedFormat: 'CSV with headers',
    encoding: 'UTF-8 with BOM',
    specialNotes: [
      'Header row: "student name,fruit_animal"',
      'Contains duplicate entries (same student, multiple attempts)',
      'Some names in lowercase, some capitalized'
    ]
  },
  'data/curriculum.js': {
    source: 'Embedded curriculum definition',
    format: 'JavaScript array of objects',
    structure: 'EMBEDDED_CURRICULUM array',
    usage: 'Extract question prompts, answer keys, rubrics'
  },
  'data/units.js': {
    source: 'Unit structure and resources',
    format: 'JavaScript object',
    structure: 'ALL_UNITS_DATA array',
    usage: 'Map questions to topics and skills'
  }
};

/**
 * Validation Rules
 */
const VALIDATION_RULES = {
  username: {
    pattern: /^[a-z_]+$/,
    description: 'After normalization: lowercase letters and underscores only',
    examples: ['guava_cat', 'lemon_eagle', 'mango_tiger']
  },
  questionId: {
    pattern: /^U(\d+)-L(\d+)-Q(\d+)$/,
    description: 'Format: U{unit}-L{lesson}-Q{question}',
    examples: ['U1-L10-Q01', 'U1-L3-Q02'],
    extractionGroups: {
      1: 'unit number',
      2: 'lesson number',
      3: 'question number'
    }
  },
  answerValue: {
    multipleChoice: {
      pattern: /^[A-E]$/,
      description: 'Single letter A through E'
    },
    constructedResponse: {
      pattern: /.+/,
      description: 'Any non-empty text',
      minLength: 1
    }
  },
  timestamp: {
    type: 'integer',
    min: 1000000000000, // Year 2001 in ms
    max: 2000000000000, // Year 2033 in ms
    description: 'Unix timestamp in milliseconds'
  }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ANSWER_ROW_SCHEMA,
    ROSTER_MAPPING_SCHEMA,
    NORMALIZED_ANSWER_RECORD,
    NORMALIZED_ROSTER_RECORD,
    NORMALIZATION_RULES,
    DATA_DICTIONARY,
    VALIDATION_RULES
  };
}
