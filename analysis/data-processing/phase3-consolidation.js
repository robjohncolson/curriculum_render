// Phase 3: Attempt Consolidation
// Applies latest-attempt rule to keep one answer per student×question

const fs = require('fs');

/**
 * Consolidate attempts using latest-attempt rule
 * For each primaryUsername × questionId, keep only the latest attempt
 */
function consolidateAttempts(answersData, usernameLookup) {
  console.log('\n=== Phase 3: Attempt Consolidation ===\n');

  // Map all answers to primary usernames
  console.log('Step 1: Mapping answers to primary usernames...');
  const answersWithPrimary = answersData.map(answer => {
    const studentInfo = usernameLookup[answer.username];

    if (!studentInfo) {
      // Username not in roster - keep original
      return {
        ...answer,
        primaryUsername: answer.username,
        studentName: 'Unknown',
        period: 'Unknown',
        inRoster: false
      };
    }

    return {
      ...answer,
      primaryUsername: studentInfo.primaryUsername,
      studentName: studentInfo.studentName,
      period: studentInfo.period,
      inRoster: true
    };
  });

  console.log(`  Mapped ${answersWithPrimary.length} answers`);

  // Group by primaryUsername × questionId
  console.log('\nStep 2: Grouping by student × question...');
  const groups = {};

  answersWithPrimary.forEach(answer => {
    const key = `${answer.primaryUsername}|${answer.questionId}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(answer);
  });

  console.log(`  Created ${Object.keys(groups).length} unique student×question groups`);

  // Apply latest-attempt rule
  console.log('\nStep 3: Applying latest-attempt rule...');
  const consolidated = [];
  const duplicateExamples = [];
  let totalDuplicatesRemoved = 0;

  Object.entries(groups).forEach(([key, attempts]) => {
    if (attempts.length > 1) {
      // Sort by timestamp (descending), use updated_at as fallback
      attempts.sort((a, b) => {
        const tsA = a.timestamp || new Date(a.updatedAt).getTime();
        const tsB = b.timestamp || new Date(b.updatedAt).getTime();
        return tsB - tsA; // Latest first
      });

      const latest = attempts[0];
      const removed = attempts.slice(1);

      consolidated.push({
        ...latest,
        hadDuplicates: true,
        duplicateCount: attempts.length - 1
      });

      totalDuplicatesRemoved += removed.length;

      // Keep examples for report
      if (duplicateExamples.length < 5) {
        duplicateExamples.push({
          primaryUsername: latest.primaryUsername,
          questionId: latest.questionId,
          totalAttempts: attempts.length,
          keptTimestamp: latest.timestamp,
          removedTimestamps: removed.map(r => r.timestamp)
        });
      }
    } else {
      // No duplicates
      consolidated.push({
        ...attempts[0],
        hadDuplicates: false,
        duplicateCount: 0
      });
    }
  });

  console.log(`  Kept ${consolidated.length} latest attempts`);
  console.log(`  Removed ${totalDuplicatesRemoved} duplicate attempts`);

  return {
    consolidated,
    duplicateExamples,
    stats: {
      originalCount: answersWithPrimary.length,
      consolidatedCount: consolidated.length,
      duplicatesRemoved: totalDuplicatesRemoved,
      uniqueStudentQuestions: Object.keys(groups).length
    }
  };
}

/**
 * Filter for Unit 1 only
 */
function filterUnit1(consolidatedAnswers) {
  console.log('\nStep 4: Filtering for Unit 1...');

  const unit1 = consolidatedAnswers.filter(a => a.unit === 1);

  console.log(`  Unit 1 records: ${unit1.length} (from ${consolidatedAnswers.length} total)`);

  return unit1;
}

/**
 * Create L10-specific view
 */
function filterL10(consolidatedAnswers) {
  console.log('\nStep 5: Creating L10-specific view...');

  const l10 = consolidatedAnswers.filter(a => a.isL10 === true);

  console.log(`  L10 records: ${l10.length}`);

  // Group by question
  const byQuestion = {};
  l10.forEach(answer => {
    if (!byQuestion[answer.questionId]) {
      byQuestion[answer.questionId] = [];
    }
    byQuestion[answer.questionId].push(answer);
  });

  console.log(`  L10 questions with responses: ${Object.keys(byQuestion).length}`);

  Object.entries(byQuestion).forEach(([qId, answers]) => {
    console.log(`    ${qId}: ${answers.length} students`);
  });

  return {
    l10Answers: l10,
    byQuestion
  };
}

/**
 * Validate consolidation
 */
function validateConsolidation(consolidatedAnswers) {
  console.log('\nStep 6: Validating consolidation...');

  const issues = [];

  // Check for duplicate student×question combinations
  const seen = new Set();
  consolidatedAnswers.forEach(answer => {
    const key = `${answer.primaryUsername}|${answer.questionId}`;
    if (seen.has(key)) {
      issues.push({
        severity: 'error',
        message: `Duplicate found: ${answer.primaryUsername} × ${answer.questionId}`
      });
    }
    seen.add(key);
  });

  // Check timestamps
  const invalidTimestamps = consolidatedAnswers.filter(a => !a.timestamp && !a.updatedAt);
  if (invalidTimestamps.length > 0) {
    issues.push({
      severity: 'warning',
      message: `${invalidTimestamps.length} records with no valid timestamp`
    });
  }

  const isValid = issues.filter(i => i.severity === 'error').length === 0;

  console.log(`  Validation: ${isValid ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`  Issues: ${issues.length}`);

  return { isValid, issues };
}

/**
 * Main Phase 3 execution
 */
function executePhase3(normalizedData, phase2Results) {
  const { answers } = normalizedData;
  const { usernameLookup } = phase2Results;

  // Consolidate all attempts
  const consolidationResult = consolidateAttempts(answers, usernameLookup);

  // Filter Unit 1
  const unit1Answers = filterUnit1(consolidationResult.consolidated);

  // Create L10 view
  const l10Result = filterL10(unit1Answers);

  // Validate
  const validation = validateConsolidation(consolidationResult.consolidated);

  console.log('\n=== Phase 3 Complete ===');
  console.log(`Original records: ${answers.length}`);
  console.log(`After consolidation: ${consolidationResult.consolidated.length}`);
  console.log(`Unit 1 only: ${unit1Answers.length}`);
  console.log(`L10 only: ${l10Result.l10Answers.length}`);

  return {
    answersConsolidated: consolidationResult.consolidated,
    unit1Answers,
    l10Answers: l10Result.l10Answers,
    l10ByQuestion: l10Result.byQuestion,
    duplicateExamples: consolidationResult.duplicateExamples,
    stats: consolidationResult.stats,
    validation
  };
}

// Export
module.exports = {
  executePhase3,
  consolidateAttempts,
  filterUnit1,
  filterL10,
  validateConsolidation
};
