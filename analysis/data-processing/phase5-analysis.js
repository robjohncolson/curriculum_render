// Phase 5: L10 Item Analysis and Student Subscores
// Performs psychometric analysis and generates student performance data

/**
 * Calculate item difficulty (p-value)
 * p = proportion of students who answered correctly
 */
function calculatePValue(responses) {
  const total = responses.length;
  const correct = responses.filter(r => r.isCorrect).length;
  return total > 0 ? correct / total : 0;
}

/**
 * Calculate distractor distribution
 */
function calculateDistractors(responses, questionId) {
  const distribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };

  responses.forEach(r => {
    const answer = r.answerValue;
    if (counts.hasOwnProperty(answer)) {
      counts[answer]++;
    }
  });

  const total = responses.length;
  Object.keys(counts).forEach(key => {
    distribution[key] = total > 0 ? counts[key] / total : 0;
  });

  return { distribution, counts };
}

/**
 * Calculate point-biserial correlation (discrimination)
 * Correlation between item score and total score
 */
function calculateDiscrimination(responses, allScores) {
  if (responses.length < 3) return null;

  // Get total scores for each student
  const itemScores = responses.map(r => r.isCorrect ? 1 : 0);
  const totalScores = responses.map(r => {
    const studentScore = allScores[r.primaryUsername] || 0;
    return studentScore;
  });

  // Calculate point-biserial correlation
  const n = itemScores.length;
  const meanTotal = totalScores.reduce((a, b) => a + b, 0) / n;

  // Group by item score
  const correctGroup = totalScores.filter((_, i) => itemScores[i] === 1);
  const incorrectGroup = totalScores.filter((_, i) => itemScores[i] === 0);

  if (correctGroup.length === 0 || incorrectGroup.length === 0) return null;

  const meanCorrect = correctGroup.reduce((a, b) => a + b, 0) / correctGroup.length;
  const meanIncorrect = incorrectGroup.reduce((a, b) => a + b, 0) / incorrectGroup.length;

  // Calculate standard deviation
  const variance = totalScores.reduce((sum, score) => sum + Math.pow(score - meanTotal, 2), 0) / n;
  const sd = Math.sqrt(variance);

  if (sd === 0) return null;

  // Point-biserial formula
  const p = correctGroup.length / n;
  const q = 1 - p;
  const rpb = ((meanCorrect - meanIncorrect) / sd) * Math.sqrt(p * q);

  return rpb;
}

/**
 * Perform item analysis for all MC questions
 */
function performItemAnalysis(mcScored, l10ByQuestion) {
  console.log('\n=== Phase 5: L10 Item Analysis ===\n');
  console.log('Step 1: Analyzing MC items...');

  // Calculate total scores first
  const studentScores = {};
  mcScored.forEach(response => {
    if (!studentScores[response.primaryUsername]) {
      studentScores[response.primaryUsername] = 0;
    }
    if (response.isCorrect) {
      studentScores[response.primaryUsername]++;
    }
  });

  const itemAnalysis = [];

  // Use mcScored directly since it has the questionType
  const mcByQuestion = {};
  mcScored.forEach(response => {
    if (!mcByQuestion[response.questionId]) {
      mcByQuestion[response.questionId] = [];
    }
    mcByQuestion[response.questionId].push(response);
  });

  Object.entries(mcByQuestion).forEach(([questionId, mcResponses]) => {

    if (mcResponses.length > 0) {
      const pValue = calculatePValue(mcResponses);
      const { distribution, counts } = calculateDistractors(mcResponses, questionId);
      const discrimination = calculateDiscrimination(mcResponses, studentScores);

      // Find most selected distractor (wrong answer)
      const correctAnswer = mcResponses[0].correctAnswer;
      const distractorCounts = Object.entries(counts)
        .filter(([choice, _]) => choice !== correctAnswer)
        .sort(([, a], [, b]) => b - a);

      const topDistractor = distractorCounts[0] || [null, 0];

      itemAnalysis.push({
        questionId,
        n: mcResponses.length,
        pValue: Math.round(pValue * 1000) / 1000,
        difficulty: pValue < 0.4 ? 'Hard' : pValue < 0.7 ? 'Medium' : 'Easy',
        correctAnswer,
        distribution,
        counts,
        discrimination: discrimination ? Math.round(discrimination * 1000) / 1000 : null,
        topDistractor: topDistractor[0],
        topDistractorCount: topDistractor[1],
        topDistractorPercent: Math.round((topDistractor[1] / mcResponses.length) * 100)
      });
    }
  });

  console.log(`  Analyzed ${itemAnalysis.length} MC items`);

  itemAnalysis.forEach(item => {
    console.log(`    ${item.questionId}: p=${item.pValue} (${item.difficulty}), disc=${item.discrimination}`);
  });

  return itemAnalysis;
}

/**
 * Mine misconceptions from distractor patterns
 */
function mineDisconceptions(itemAnalysis, curriculum) {
  console.log('\nStep 2: Mining misconceptions from distractors...');

  const misconceptions = [];

  itemAnalysis.forEach(item => {
    if (item.topDistractorPercent >= 20) { // At least 20% selected this wrong answer
      misconceptions.push({
        questionId: item.questionId,
        misconceptionType: 'distractor',
        wrongAnswer: item.topDistractor,
        percentSelected: item.topDistractorPercent,
        studentCount: item.topDistractorCount,
        correctAnswer: item.correctAnswer,
        evidence: `${item.topDistractorCount} students (${item.topDistractorPercent}%) selected ${item.topDistractor} instead of ${item.correctAnswer}`
      });
    }
  });

  console.log(`  Identified ${misconceptions.length} significant misconceptions`);

  // Group and rank
  const sorted = misconceptions.sort((a, b) => b.percentSelected - a.percentSelected);

  return sorted.slice(0, 5); // Top 5
}

/**
 * Calculate student subscores
 */
function calculateStudentSubscores(mcScored, crTriaged, phase2Results) {
  console.log('\nStep 3: Calculating student subscores...');

  const { rosterResolved } = phase2Results;
  const periodBStudents = Object.values(rosterResolved).filter(s => s.period === 'B');

  const subscores = [];

  periodBStudents.forEach(student => {
    const username = student.primaryUsername;

    // Get MC responses
    const mcResponses = mcScored.filter(r => r.primaryUsername === username);
    const mcCorrect = mcResponses.filter(r => r.isCorrect).length;
    const mcTotal = 6; // Total MC questions

    // Get CR responses
    const crResponses = crTriaged.filter(r => r.primaryUsername === username);

    // Q04 (histogram) - use triage score as proxy
    const q04 = crResponses.find(r => r.questionId === 'U1-L10-Q04');
    const q04Score = q04 ? Math.round((q04.triageScore / 100) * 4) : null; // 0-4 scale

    // Q06 (z-scores) - use triage score as proxy
    const q06 = crResponses.find(r => r.questionId === 'U1-L10-Q06');
    const q06Score = q06 ? Math.round((q06.triageScore / 100) * 3) : null; // 0-3 scale

    // Calculate percentages
    const mcPercent = mcTotal > 0 ? (mcCorrect / mcTotal) * 100 : 0;
    const q04Percent = q04Score !== null ? (q04Score / 4) * 100 : null;
    const q06Percent = q06Score !== null ? (q06Score / 3) * 100 : null;

    // Traffic light
    const getTrafficLight = (percent) => {
      if (percent === null) return 'gray';
      if (percent < 60) return 'red';
      if (percent < 80) return 'yellow';
      return 'green';
    };

    subscores.push({
      studentName: student.studentName,
      primaryUsername: username,
      period: student.period,
      mcScore: `${mcCorrect}/${mcTotal}`,
      mcPercent: Math.round(mcPercent),
      mcTraffic: getTrafficLight(mcPercent),
      q04Score: q04Score !== null ? `${q04Score}/4` : 'N/A',
      q04Percent: q04Percent !== null ? Math.round(q04Percent) : null,
      q04Traffic: getTrafficLight(q04Percent),
      q06Score: q06Score !== null ? `${q06Score}/3` : 'N/A',
      q06Percent: q06Percent !== null ? Math.round(q06Percent) : null,
      q06Traffic: getTrafficLight(q06Percent),
      totalAttempted: mcResponses.length + crResponses.length
    });
  });

  console.log(`  Calculated subscores for ${subscores.length} Period B students`);

  // Traffic light summary
  const mcTrafficCounts = {
    green: subscores.filter(s => s.mcTraffic === 'green').length,
    yellow: subscores.filter(s => s.mcTraffic === 'yellow').length,
    red: subscores.filter(s => s.mcTraffic === 'red').length
  };

  console.log(`  MC Traffic Light: ${mcTrafficCounts.green} green, ${mcTrafficCounts.yellow} yellow, ${mcTrafficCounts.red} red`);

  return subscores;
}

/**
 * Main Phase 5 execution
 */
function executePhase5(phase3Results, phase4Results, phase2Results, config) {
  const { l10ByQuestion } = phase3Results;
  const { mcScored, crTriaged } = phase4Results;

  // Item analysis
  const itemAnalysis = performItemAnalysis(mcScored, l10ByQuestion);

  // Misconception mining
  const misconceptions = mineDisconceptions(itemAnalysis, {});

  // Student subscores
  const studentSubscores = calculateStudentSubscores(mcScored, crTriaged, phase2Results);

  console.log('\n=== Phase 5 Complete ===');
  console.log(`Item analysis: ${itemAnalysis.length} items`);
  console.log(`Misconceptions identified: ${misconceptions.length}`);
  console.log(`Student subscores: ${studentSubscores.length}`);

  return {
    itemAnalysis,
    misconceptions,
    studentSubscores,
    stats: {
      itemsAnalyzed: itemAnalysis.length,
      misconceptionsFound: misconceptions.length,
      studentsScored: studentSubscores.length
    }
  };
}

// Export
module.exports = {
  executePhase5,
  performItemAnalysis,
  mineDisconceptions,
  calculateStudentSubscores,
  calculatePValue,
  calculateDiscrimination
};
