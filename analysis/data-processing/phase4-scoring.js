// Phase 4: Answer Key and Rubric Application
// Scores MC questions and triages CR questions

const { L10_RUBRICS } = require('../config/rubrics.js');

/**
 * Score MC questions against answer key
 */
function scoreMCQuestions(l10Answers, answerKey) {
  console.log('\n=== Phase 4: MC Scoring and CR Triage ===\n');
  console.log('Step 1: Scoring MC questions...');

  const mcQuestions = Object.keys(answerKey);
  const scored = [];

  l10Answers.forEach(answer => {
    if (mcQuestions.includes(answer.questionId)) {
      const correctAnswer = answerKey[answer.questionId];
      const isCorrect = answer.answerValue === correctAnswer;

      scored.push({
        ...answer,
        correctAnswer,
        isCorrect,
        questionType: 'MC'
      });
    }
  });

  console.log(`  Scored ${scored.length} MC responses`);

  // Calculate stats
  const correctCount = scored.filter(s => s.isCorrect).length;
  const incorrectCount = scored.length - correctCount;

  console.log(`    Correct: ${correctCount} (${(correctCount/scored.length*100).toFixed(1)}%)`);
  console.log(`    Incorrect: ${incorrectCount} (${(incorrectCount/scored.length*100).toFixed(1)}%)`);

  return scored;
}

/**
 * Triage CR questions using keyword detection
 */
function triageCRQuestions(l10Answers, rubrics) {
  console.log('\nStep 2: Triaging CR questions...');

  const crQuestions = Object.keys(rubrics);
  const triaged = [];

  l10Answers.forEach(answer => {
    if (crQuestions.includes(answer.questionId)) {
      const rubric = rubrics[answer.questionId];
      const response = answer.answerValue || '';
      const responseLower = response.toLowerCase();

      // Apply keyword detection
      const triageResult = applyKeywordTriage(responseLower, rubric);

      triaged.push({
        ...answer,
        questionType: 'CR',
        responseLength: response.length,
        triageScore: triageResult.score,
        triageBucket: triageResult.bucket,
        keywordMatches: triageResult.matches,
        flagsForReview: triageResult.flags,
        needsReview: triageResult.bucket === 'low' || triageResult.flags.length > 0
      });
    }
  });

  console.log(`  Triaged ${triaged.length} CR responses`);

  const highConf = triaged.filter(t => t.triageBucket === 'high').length;
  const medConf = triaged.filter(t => t.triageBucket === 'medium').length;
  const lowConf = triaged.filter(t => t.triageBucket === 'low').length;

  console.log(`    High confidence: ${highConf}`);
  console.log(`    Medium confidence: ${medConf}`);
  console.log(`    Low confidence: ${lowConf}`);
  console.log(`    Flagged for review: ${triaged.filter(t => t.needsReview).length}`);

  return triaged;
}

/**
 * Apply keyword triage to a CR response
 */
function applyKeywordTriage(responseLower, rubric) {
  const matches = {
    accept: [],
    reject: [],
    flags: []
  };

  const triageKeywords = rubric.triageKeywords || {};
  const likelyHigh = triageKeywords.likelyHigh || [];
  const likelyMid = triageKeywords.likelyMid || [];
  const likelyLow = triageKeywords.likelyLow || [];

  // Check each part's keywords
  rubric.parts.forEach(part => {
    const keywords = part.keywords || {};

    (keywords.accept || []).forEach(keyword => {
      if (responseLower.includes(keyword.toLowerCase())) {
        matches.accept.push(keyword);
      }
    });

    (keywords.reject || []).forEach(keyword => {
      if (responseLower.includes(keyword.toLowerCase())) {
        matches.reject.push(keyword);
      }
    });

    (keywords.flags || []).forEach(keyword => {
      if (responseLower.includes(keyword.toLowerCase())) {
        matches.flags.push(keyword);
      }
    });
  });

  // Determine bucket
  const acceptCount = matches.accept.length;
  const rejectCount = matches.reject.length;
  const flagCount = matches.flags.length;

  let bucket = 'medium';
  let score = 50; // 0-100 scale

  if (acceptCount >= 3 && rejectCount === 0) {
    bucket = 'high';
    score = 80 + (acceptCount * 5);
  } else if (acceptCount >= 2 && rejectCount <= 1) {
    bucket = 'medium';
    score = 50 + (acceptCount * 10) - (rejectCount * 10);
  } else if (rejectCount > acceptCount || responseLower.length < 10) {
    bucket = 'low';
    score = 20 + (acceptCount * 5);
  }

  return {
    bucket,
    score: Math.min(100, Math.max(0, score)),
    matches: matches.accept,
    rejects: matches.reject,
    flags: matches.flags
  };
}

/**
 * Create calibration pack (sample responses for manual scoring)
 */
function createCalibrationPack(triagedCR, sampleSize = 10) {
  console.log('\nStep 3: Creating calibration pack...');

  const byBucket = {
    high: triagedCR.filter(t => t.triageBucket === 'high'),
    medium: triagedCR.filter(t => t.triageBucket === 'medium'),
    low: triagedCR.filter(t => t.triageBucket === 'low')
  };

  // Sample across buckets (3 high, 4 medium, 3 low)
  const samples = [];

  // Helper to randomly sample
  const randomSample = (arr, n) => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
  };

  samples.push(...randomSample(byBucket.high, 3));
  samples.push(...randomSample(byBucket.medium, 4));
  samples.push(...randomSample(byBucket.low, 3));

  console.log(`  Selected ${samples.length} responses for calibration`);
  console.log(`    High: 3, Medium: 4, Low: 3`);

  // Anonymize for calibration
  const calibrationPack = samples.map((sample, idx) => ({
    sampleId: `CAL-${String(idx + 1).padStart(2, '0')}`,
    questionId: sample.questionId,
    response: sample.answerValue,
    responseLength: sample.responseLength,
    triageBucket: sample.triageBucket,
    keywordMatches: sample.keywordMatches,
    flags: sample.flagsForReview,
    // Redacted student info
    studentIdentifier: `Student-${String(idx + 1).padStart(2, '0')}`,
    timestamp: sample.timestamp
  }));

  return calibrationPack;
}

/**
 * Main Phase 4 execution
 */
function executePhase4(phase3Results, config) {
  const { l10Answers } = phase3Results;
  const { answerKey } = config;

  // Score MC
  const mcScored = scoreMCQuestions(l10Answers, answerKey);

  // Triage CR
  const crTriaged = triageCRQuestions(l10Answers, L10_RUBRICS);

  // Create calibration pack
  const calibrationPack = createCalibrationPack(crTriaged);

  console.log('\n=== Phase 4 Complete ===');
  console.log(`MC responses scored: ${mcScored.length}`);
  console.log(`CR responses triaged: ${crTriaged.length}`);
  console.log(`Calibration pack: ${calibrationPack.length} samples`);

  return {
    mcScored,
    crTriaged,
    calibrationPack,
    stats: {
      totalL10: l10Answers.length,
      mcCount: mcScored.length,
      crCount: crTriaged.length,
      mcCorrect: mcScored.filter(s => s.isCorrect).length,
      crNeedsReview: crTriaged.filter(c => c.needsReview).length
    }
  };
}

// Export
module.exports = {
  executePhase4,
  scoreMCQuestions,
  triageCRQuestions,
  applyKeywordTriage,
  createCalibrationPack
};
