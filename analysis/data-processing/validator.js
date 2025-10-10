// Data Validation for Phase 1
// Validates data integrity and generates validation reports

/**
 * Validate answers data
 */
function validateAnswersData(answersData, config) {
  const issues = [];
  const warnings = [];

  const { normalized, invalid } = answersData;

  // Check for invalid records
  if (invalid.length > 0) {
    issues.push({
      severity: 'error',
      category: 'invalid_records',
      count: invalid.length,
      message: `Found ${invalid.length} invalid answer records`,
      details: invalid.slice(0, 10).map(r => ({
        id: r.id,
        username: r.usernameOriginal,
        questionId: r.questionId,
        issues: r.validationIssues
      }))
    });
  }

  // Check for test data
  const testRecords = normalized.filter(r => r.username.includes('test'));
  if (testRecords.length > 0) {
    warnings.push({
      severity: 'warning',
      category: 'test_data',
      count: testRecords.length,
      message: `Found ${testRecords.length} test records (usernames containing 'test')`,
      recommendation: 'Consider filtering these out for production analysis'
    });
  }

  // Check for L10 coverage
  const l10Records = normalized.filter(r => r.isL10);
  const l10Questions = [...new Set(l10Records.map(r => r.questionId))];
  const expectedL10 = config.lesson10Questions.multipleChoice.concat(config.lesson10Questions.constructedResponse);

  const missingL10 = expectedL10.filter(q => !l10Questions.includes(q));
  if (missingL10.length > 0) {
    warnings.push({
      severity: 'warning',
      category: 'missing_l10_questions',
      count: missingL10.length,
      message: `Missing student responses for ${missingL10.length} L10 questions`,
      details: missingL10
    });
  }

  // Check timestamp validity
  const invalidTimestamps = normalized.filter(r => !r.timestamp || !r.timestampDate);
  if (invalidTimestamps.length > 0) {
    issues.push({
      severity: 'error',
      category: 'invalid_timestamps',
      count: invalidTimestamps.length,
      message: `Found ${invalidTimestamps.length} records with invalid timestamps`
    });
  }

  // Check for duplicate entries (same student, question, timestamp)
  const duplicates = findDuplicates(normalized);
  if (duplicates.length > 0) {
    warnings.push({
      severity: 'warning',
      category: 'potential_duplicates',
      count: duplicates.length,
      message: `Found ${duplicates.length} potential duplicate records`,
      details: duplicates.slice(0, 5)
    });
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    summary: {
      totalRecords: normalized.length,
      invalidRecords: invalid.length,
      testRecords: testRecords.length,
      l10Records: l10Records.length,
      uniqueL10Questions: l10Questions.length
    }
  };
}

/**
 * Find potential duplicate records
 */
function findDuplicates(records) {
  const seen = new Map();
  const duplicates = [];

  records.forEach(record => {
    const key = `${record.username}|${record.questionId}|${record.timestamp}`;
    if (seen.has(key)) {
      duplicates.push({
        username: record.username,
        questionId: record.questionId,
        timestamp: record.timestamp,
        ids: [seen.get(key), record.id]
      });
    } else {
      seen.set(key, record.id);
    }
  });

  return duplicates;
}

/**
 * Validate roster mapping
 */
function validateRosterMapping(rosterData) {
  const issues = [];
  const warnings = [];

  const { stats } = rosterData;

  // Check for shared usernames (one username → multiple students)
  if (stats.sharedUsernames.length > 0) {
    warnings.push({
      severity: 'warning',
      category: 'shared_usernames',
      count: stats.sharedUsernames.length,
      message: `Found ${stats.sharedUsernames.length} usernames shared by multiple students`,
      details: stats.sharedUsernames.slice(0, 5),
      recommendation: 'Review these mappings to resolve ambiguity'
    });
  }

  // Check for students with multiple usernames (aliases)
  if (stats.studentsWithAliases.length > 0) {
    warnings.push({
      severity: 'info',
      category: 'student_aliases',
      count: stats.studentsWithAliases.length,
      message: `Found ${stats.studentsWithAliases.length} students with multiple usernames`,
      details: stats.studentsWithAliases.slice(0, 5),
      recommendation: 'These aliases should be consolidated in roster resolution'
    });
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    summary: {
      uniqueStudents: stats.uniqueStudents,
      uniqueUsernames: stats.uniqueUsernames,
      sharedUsernames: stats.sharedUsernames.length,
      studentsWithAliases: stats.studentsWithAliases.length
    }
  };
}

/**
 * Validate curriculum data
 */
function validateCurriculum(curriculumData, config) {
  const issues = [];
  const warnings = [];

  const { l10, stats } = curriculumData;

  // Check L10 question count
  const expectedCount = config.lesson10Questions.total;
  if (l10.length !== expectedCount) {
    issues.push({
      severity: 'error',
      category: 'missing_l10_questions',
      message: `Expected ${expectedCount} L10 questions, found ${l10.length}`,
      details: {
        expected: expectedCount,
        found: l10.length
      }
    });
  }

  // Verify answer keys exist
  const l10MC = config.lesson10Questions.multipleChoice;
  const missingKeys = l10MC.filter(qId => !config.answerKey[qId]);

  if (missingKeys.length > 0) {
    issues.push({
      severity: 'error',
      category: 'missing_answer_keys',
      message: `Missing answer keys for ${missingKeys.length} MC questions`,
      details: missingKeys
    });
  }

  // Check for CR questions with rubrics (from curriculum)
  const l10CR = config.lesson10Questions.constructedResponse;
  l10CR.forEach(qId => {
    const question = curriculumData.byId[qId];
    if (!question) {
      issues.push({
        severity: 'error',
        category: 'missing_question',
        message: `CR question ${qId} not found in curriculum`
      });
    } else if (!question.solution) {
      warnings.push({
        severity: 'warning',
        category: 'missing_rubric',
        message: `CR question ${qId} missing solution/rubric in curriculum`
      });
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    summary: {
      totalQuestions: stats.total,
      l10Questions: l10.length,
      expectedL10: expectedCount,
      multipleChoice: stats.multipleChoice,
      freeResponse: stats.freeResponse
    }
  };
}

/**
 * Run full validation suite
 */
function validateAllData(loadedData, config) {
  console.log('\n=== Phase 1: Data Validation ===\n');

  const answersValidation = validateAnswersData(loadedData.answers, config);
  const rosterValidation = validateRosterMapping(loadedData.roster);
  const curriculumValidation = validateCurriculum(loadedData.curriculum, config);

  const allIssues = [
    ...answersValidation.issues,
    ...rosterValidation.issues,
    ...curriculumValidation.issues
  ];

  const allWarnings = [
    ...answersValidation.warnings,
    ...rosterValidation.warnings,
    ...curriculumValidation.warnings
  ];

  const isValid = allIssues.length === 0;

  console.log(`Validation Complete:`);
  console.log(`  Status: ${isValid ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`  Issues: ${allIssues.length}`);
  console.log(`  Warnings: ${allWarnings.length}`);

  if (allIssues.length > 0) {
    console.log('\nCritical Issues:');
    allIssues.forEach(issue => {
      console.log(`  - [${issue.category}] ${issue.message}`);
    });
  }

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    allWarnings.slice(0, 5).forEach(warning => {
      console.log(`  - [${warning.category}] ${warning.message}`);
    });
    if (allWarnings.length > 5) {
      console.log(`  ... and ${allWarnings.length - 5} more warnings`);
    }
  }

  return {
    isValid,
    answers: answersValidation,
    roster: rosterValidation,
    curriculum: curriculumValidation,
    summary: {
      totalIssues: allIssues.length,
      totalWarnings: allWarnings.length,
      criticalErrors: allIssues.filter(i => i.severity === 'error').length
    }
  };
}

// Export
module.exports = {
  validateAnswersData,
  validateRosterMapping,
  validateCurriculum,
  validateAllData
};
