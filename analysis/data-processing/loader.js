// Data Loading and CSV Parsing for Phase 1
// Node.js module for reading and parsing CSV files

const fs = require('fs');
const path = require('path');

const {
  normalizeAnswerRecord,
  normalizeRosterRecord,
  getNormalizationStats,
  resetStats
} = require('./normalizer.js');

/**
 * Simple CSV parser (handles basic CSV with headers)
 * For production, consider using 'csv-parse' library
 *
 * @param {string} csvContent - Raw CSV content
 * @param {boolean} skipHeader - Whether to skip first row
 * @returns {array} - Array of objects with column headers as keys
 */
function parseCSV(csvContent, skipHeader = true) {
  const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  // First line is headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const startIndex = skipHeader ? 1 : 0;
  const rows = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));

    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Load and parse answers CSV file
 *
 * @param {string} filePath - Path to answers_rows CSV
 * @returns {object} - { raw: array, normalized: array, stats: object }
 */
function loadAnswersData(filePath) {
  console.log(`Loading answers data from: ${filePath}`);

  try {
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const rawRows = parseCSV(csvContent, true);

    console.log(`Parsed ${rawRows.length} raw answer records`);

    // Normalize all records
    const normalized = rawRows.map(row => normalizeAnswerRecord(row));

    // Filter out invalid records
    const valid = normalized.filter(record => record.isValid);
    const invalid = normalized.filter(record => !record.isValid);

    console.log(`Valid records: ${valid.length}, Invalid records: ${invalid.length}`);

    return {
      raw: rawRows,
      normalized: valid,
      invalid,
      stats: {
        totalRecords: rawRows.length,
        validRecords: valid.length,
        invalidRecords: invalid.length,
        invalidReasons: invalid.map(r => ({
          id: r.id,
          username: r.usernameOriginal,
          issues: r.validationIssues
        }))
      }
    };
  } catch (error) {
    console.error(`Error loading answers data: ${error.message}`);
    throw error;
  }
}

/**
 * Load and parse roster mapping CSV
 *
 * @param {string} filePath - Path to student2username CSV
 * @returns {object} - { raw: array, normalized: array, mapping: object }
 */
function loadRosterMapping(filePath) {
  console.log(`Loading roster mapping from: ${filePath}`);

  try {
    // Read file (may have BOM)
    let csvContent = fs.readFileSync(filePath, 'utf-8');

    // Remove BOM if present
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }

    // Special handling: this CSV has header in middle, not at top
    // Parse manually without relying on first row as header
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    const rawRows = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length === 2) {
        // Skip the header row
        if (parts[0] === 'student name' || parts[1] === 'fruit_animal') {
          continue;
        }
        rawRows.push({
          student_name: parts[0],
          username: parts[1]
        });
      }
    }

    console.log(`Parsed ${rawRows.length} raw roster records`);

    // Normalize all records
    const normalized = rawRows
      .map(row => normalizeRosterRecord(row))
      .filter(record => record.isValid);

    // Build student → usernames mapping
    const studentToUsernames = {};
    const usernameToStudents = {};

    normalized.forEach(record => {
      const { studentNameLower, username } = record;

      // Student → Usernames mapping
      if (!studentToUsernames[studentNameLower]) {
        studentToUsernames[studentNameLower] = {
          studentName: record.studentName,
          usernames: new Set(),
          records: []
        };
      }
      studentToUsernames[studentNameLower].usernames.add(username);
      studentToUsernames[studentNameLower].records.push(record);

      // Username → Students mapping (to detect shared usernames)
      if (!usernameToStudents[username]) {
        usernameToStudents[username] = [];
      }
      usernameToStudents[username].push(record.studentName);
    });

    // Convert Sets to Arrays
    Object.keys(studentToUsernames).forEach(key => {
      studentToUsernames[key].usernames = Array.from(studentToUsernames[key].usernames);
    });

    // Detect duplicates and aliases
    const duplicates = Object.entries(usernameToStudents)
      .filter(([username, students]) => students.length > 1)
      .map(([username, students]) => ({ username, students: [...new Set(students)] }));

    const aliases = Object.entries(studentToUsernames)
      .filter(([_, data]) => data.usernames.length > 1)
      .map(([studentKey, data]) => ({
        student: data.studentName,
        usernames: data.usernames
      }));

    console.log(`Built mapping for ${Object.keys(studentToUsernames).length} unique students`);
    console.log(`Found ${duplicates.length} shared usernames, ${aliases.length} students with multiple usernames`);

    return {
      raw: rawRows,
      normalized,
      studentToUsernames,
      usernameToStudents,
      stats: {
        totalRecords: rawRows.length,
        uniqueStudents: Object.keys(studentToUsernames).length,
        uniqueUsernames: Object.keys(usernameToStudents).length,
        sharedUsernames: duplicates,
        studentsWithAliases: aliases
      }
    };
  } catch (error) {
    console.error(`Error loading roster mapping: ${error.message}`);
    throw error;
  }
}

/**
 * Load curriculum data from JS module
 *
 * @param {string} filePath - Path to curriculum.js
 * @returns {object} - Curriculum data
 */
function loadCurriculum(filePath) {
  console.log(`Loading curriculum from: ${filePath}`);

  try {
    // Read file and evaluate to get EMBEDDED_CURRICULUM
    const fileContent = fs.readFileSync(path.resolve(filePath), 'utf-8');

    // Execute in a context to get the variable
    const questions = eval(fileContent + '; EMBEDDED_CURRICULUM;');

    // Filter for U1-L10 questions
    const l10Questions = questions.filter(q => q.id && q.id.startsWith('U1-L10'));

    console.log(`Loaded ${questions.length} total questions, ${l10Questions.length} L10 questions`);

    return {
      all: questions,
      l10: l10Questions,
      byId: questions.reduce((acc, q) => {
        acc[q.id] = q;
        return acc;
      }, {}),
      stats: {
        total: questions.length,
        l10Count: l10Questions.length,
        multipleChoice: questions.filter(q => q.type === 'multiple-choice').length,
        freeResponse: questions.filter(q => q.type === 'free-response').length
      }
    };
  } catch (error) {
    console.error(`Error loading curriculum: ${error.message}`);
    throw error;
  }
}

/**
 * Load all data files for Phase 1
 *
 * @param {object} config - Configuration with file paths
 * @returns {object} - All loaded and normalized data
 */
function loadAllData(config) {
  console.log('=== Phase 1: Data Loading and Normalization ===\n');

  resetStats(); // Reset normalization stats

  const basePath = config.basePath || process.cwd();

  const answersData = loadAnswersData(path.join(basePath, config.inputs.answersData));
  const rosterData = loadRosterMapping(path.join(basePath, config.inputs.rosterMapping));
  const curriculumData = loadCurriculum(path.join(basePath, config.inputs.curriculum));

  const normStats = getNormalizationStats();

  console.log('\n=== Data Loading Complete ===');
  console.log(`Answers: ${answersData.stats.validRecords} valid records`);
  console.log(`Roster: ${rosterData.stats.uniqueStudents} unique students`);
  console.log(`Curriculum: ${curriculumData.stats.l10Count} L10 questions`);

  return {
    answers: answersData,
    roster: rosterData,
    curriculum: curriculumData,
    normalizationStats: normStats,
    loadTimestamp: new Date().toISOString()
  };
}

// Export
module.exports = {
  parseCSV,
  loadAnswersData,
  loadRosterMapping,
  loadCurriculum,
  loadAllData
};
