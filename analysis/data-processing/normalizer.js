// Normalization Pipeline for Phase 1
// Converts raw data into clean, normalized formats

const NORMALIZATION_STATS = {
  usernames: {
    totalProcessed: 0,
    lowercaseConversions: 0,
    hyphenReplacements: 0,
    whitespaceTrims: 0,
    noChanges: 0
  },
  questionIds: {
    totalProcessed: 0,
    validFormat: 0,
    invalidFormat: 0
  },
  timestamps: {
    totalProcessed: 0,
    validTimestamps: 0,
    invalidTimestamps: 0
  }
};

/**
 * Normalize username according to rules:
 * - Convert to lowercase
 * - Replace hyphens with underscores
 * - Trim whitespace
 *
 * @param {string} username - Raw username
 * @returns {object} - { normalized: string, changes: array }
 */
function normalizeUsername(username) {
  if (!username || typeof username !== 'string') {
    return { normalized: '', changes: ['invalid_input'], isValid: false };
  }

  const original = username;
  const changes = [];
  let result = username;

  // Trim whitespace
  const trimmed = result.trim();
  if (trimmed !== result) {
    changes.push('whitespace_trimmed');
    NORMALIZATION_STATS.usernames.whitespaceTrims++;
  }
  result = trimmed;

  // Replace hyphens with underscores
  if (result.includes('-')) {
    result = result.replace(/-/g, '_');
    changes.push('hyphens_to_underscores');
    NORMALIZATION_STATS.usernames.hyphenReplacements++;
  }

  // Convert to lowercase
  const lowercased = result.toLowerCase();
  if (lowercased !== result) {
    changes.push('converted_to_lowercase');
    NORMALIZATION_STATS.usernames.lowercaseConversions++;
  }
  result = lowercased;

  if (changes.length === 0) {
    NORMALIZATION_STATS.usernames.noChanges++;
  }

  NORMALIZATION_STATS.usernames.totalProcessed++;

  return {
    original,
    normalized: result,
    changes,
    isValid: /^[a-z_]+$/.test(result)
  };
}

/**
 * Extract and validate question ID components
 * Format: U{unit}-L{lesson}-Q{question}
 *
 * @param {string} questionId - Question identifier
 * @returns {object} - Parsed components and validation
 */
function parseQuestionId(questionId) {
  NORMALIZATION_STATS.questionIds.totalProcessed++;

  const pattern = /^U(\d+)-L(\d+)-Q(\d+)$/;
  const match = questionId.match(pattern);

  if (!match) {
    NORMALIZATION_STATS.questionIds.invalidFormat++;
    return {
      original: questionId,
      isValid: false,
      unit: null,
      lesson: null,
      questionNum: null,
      isL10: false
    };
  }

  NORMALIZATION_STATS.questionIds.validFormat++;

  const unit = parseInt(match[1], 10);
  const lesson = parseInt(match[2], 10);
  const questionNum = parseInt(match[3], 10);
  const isL10 = (unit === 1 && lesson === 10);

  return {
    original: questionId,
    isValid: true,
    unit,
    lesson,
    questionNum,
    isL10,
    formatted: `U${unit}-L${lesson}-Q${questionNum}` // Canonical format
  };
}

/**
 * Validate and convert timestamp
 *
 * @param {string|number} timestamp - Unix timestamp (milliseconds)
 * @returns {object} - Validation result
 */
function validateTimestamp(timestamp) {
  NORMALIZATION_STATS.timestamps.totalProcessed++;

  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;

  if (isNaN(ts) || ts < 1000000000000 || ts > 2000000000000) {
    NORMALIZATION_STATS.timestamps.invalidTimestamps++;
    return {
      original: timestamp,
      isValid: false,
      value: null,
      date: null
    };
  }

  NORMALIZATION_STATS.timestamps.validTimestamps++;

  return {
    original: timestamp,
    isValid: true,
    value: ts,
    date: new Date(ts)
  };
}

/**
 * Normalize PostgreSQL timestamp string to Date
 * Format: "2025-09-30 04:20:16.078989+00"
 */
function parsePostgresTimestamp(timestampStr) {
  if (!timestampStr) return null;

  try {
    // PostgreSQL format with timezone
    const date = new Date(timestampStr);
    return isNaN(date.getTime()) ? null : date;
  } catch (e) {
    return null;
  }
}

/**
 * Normalize a complete answer record
 *
 * @param {object} rawRecord - Raw CSV row
 * @returns {object} - Normalized record
 */
function normalizeAnswerRecord(rawRecord) {
  const usernameResult = normalizeUsername(rawRecord.username);
  const questionResult = parseQuestionId(rawRecord.question_id);
  const timestampResult = validateTimestamp(rawRecord.timestamp);

  return {
    id: parseInt(rawRecord.id, 10),
    username: usernameResult.normalized,
    usernameOriginal: usernameResult.original,
    usernameChanges: usernameResult.changes,
    questionId: rawRecord.question_id,
    questionIdParsed: questionResult,
    answerValue: rawRecord.answer_value,
    timestamp: timestampResult.value,
    timestampDate: timestampResult.date,
    createdAt: parsePostgresTimestamp(rawRecord.created_at),
    updatedAt: parsePostgresTimestamp(rawRecord.updated_at),
    // Extracted fields for easy filtering
    unit: questionResult.unit,
    lesson: questionResult.lesson,
    questionNum: questionResult.questionNum,
    isL10: questionResult.isL10,
    // Validation flags
    isValid: usernameResult.isValid && questionResult.isValid && timestampResult.isValid,
    validationIssues: [
      !usernameResult.isValid && 'invalid_username',
      !questionResult.isValid && 'invalid_question_id',
      !timestampResult.isValid && 'invalid_timestamp'
    ].filter(Boolean)
  };
}

/**
 * Normalize roster mapping record
 *
 * @param {object} rawRecord - Raw CSV row
 * @returns {object} - Normalized record
 */
function normalizeRosterRecord(rawRecord) {
  const studentName = rawRecord.student_name ? rawRecord.student_name.trim() : '';
  const usernameResult = normalizeUsername(rawRecord.username);

  return {
    studentName,
    studentNameLower: studentName.toLowerCase(),
    username: usernameResult.normalized,
    usernameOriginal: usernameResult.original,
    usernameChanges: usernameResult.changes,
    isValid: usernameResult.isValid && studentName.length > 0
  };
}

/**
 * Get normalization statistics summary
 */
function getNormalizationStats() {
  return {
    ...NORMALIZATION_STATS,
    summary: {
      totalUsernames: NORMALIZATION_STATS.usernames.totalProcessed,
      usernamesModified: NORMALIZATION_STATS.usernames.totalProcessed - NORMALIZATION_STATS.usernames.noChanges,
      usernamesUnchanged: NORMALIZATION_STATS.usernames.noChanges,
      totalQuestionIds: NORMALIZATION_STATS.questionIds.totalProcessed,
      validQuestionIds: NORMALIZATION_STATS.questionIds.validFormat,
      invalidQuestionIds: NORMALIZATION_STATS.questionIds.invalidFormat,
      totalTimestamps: NORMALIZATION_STATS.timestamps.totalProcessed,
      validTimestamps: NORMALIZATION_STATS.timestamps.validTimestamps,
      invalidTimestamps: NORMALIZATION_STATS.timestamps.invalidTimestamps
    }
  };
}

/**
 * Reset normalization statistics (for testing/re-runs)
 */
function resetStats() {
  NORMALIZATION_STATS.usernames = {
    totalProcessed: 0,
    lowercaseConversions: 0,
    hyphenReplacements: 0,
    whitespaceTrims: 0,
    noChanges: 0
  };
  NORMALIZATION_STATS.questionIds = {
    totalProcessed: 0,
    validFormat: 0,
    invalidFormat: 0
  };
  NORMALIZATION_STATS.timestamps = {
    totalProcessed: 0,
    validTimestamps: 0,
    invalidTimestamps: 0
  };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeUsername,
    parseQuestionId,
    validateTimestamp,
    parsePostgresTimestamp,
    normalizeAnswerRecord,
    normalizeRosterRecord,
    getNormalizationStats,
    resetStats
  };
}
