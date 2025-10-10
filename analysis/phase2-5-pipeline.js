#!/usr/bin/env node

// Phase 2-5 Pipeline: Roster Resolution through Item Analysis
// Main execution script

const fs = require('fs');
const path = require('path');

const config = require('./config/phase0-config.js');
const { executePhase2 } = require('./data-processing/phase2-roster-resolution.js');
const { executePhase3 } = require('./data-processing/phase3-consolidation.js');
const { executePhase4 } = require('./data-processing/phase4-scoring.js');
const { executePhase5 } = require('./data-processing/phase5-analysis.js');

/**
 * Load Phase 0-1 outputs
 */
function loadPhase01Data() {
  console.log('Loading Phase 0-1 normalized data...');

  const dataPath = path.join(__dirname, 'reports', 'normalized-data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`  Loaded ${data.answers.length} answers`);
  console.log(`  Loaded ${Object.keys(data.roster).length} roster entries`);

  return data;
}

/**
 * Save phase outputs
 */
function savePhaseOutputs(phase, outputs) {
  const reportsDir = path.join(__dirname, 'reports');

  // Ensure reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();

  // Save JSON outputs
  Object.entries(outputs).forEach(([key, value]) => {
    if (key.endsWith('_json') || key === 'data') {
      const filename = key.replace('_json', '') + '.json';
      const filepath = path.join(reportsDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(value, null, 2));
      console.log(`  Saved: ${filename}`);
    }
  });

  // Save report
  if (outputs.report) {
    const reportPath = path.join(reportsDir, `${phase}-report.json`);
    fs.writeFileSync(reportPath, JSON.stringify({
      phase,
      timestamp,
      ...outputs.report
    }, null, 2));
    console.log(`  Saved: ${phase}-report.json`);
  }
}

/**
 * Generate CSV from array of objects
 */
function generateCSV(data, columns) {
  if (!data || data.length === 0) return '';

  const headers = columns || Object.keys(data[0]);
  let csv = headers.join(',') + '\n';

  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header];
      if (value === null || value === undefined) value = '';
      if (typeof value === 'object') value = JSON.stringify(value);
      // Escape quotes and wrap in quotes if contains comma
      value = String(value).replace(/"/g, '""');
      if (value.includes(',') || value.includes('\n')) {
        value = `"${value}"`;
      }
      return value;
    });
    csv += values.join(',') + '\n';
  });

  return csv;
}

/**
 * Save CSV files
 */
function saveCSVOutputs(phase, csvData) {
  const reportsDir = path.join(__dirname, 'reports');

  Object.entries(csvData).forEach(([filename, data]) => {
    const filepath = path.join(reportsDir, filename);
    fs.writeFileSync(filepath, data);
    console.log(`  Saved: ${filename}`);
  });
}

/**
 * Generate markdown reports
 */
function generateMarkdownReports(phase2Results, phase3Results, phase5Results) {
  const reportsDir = path.join(__dirname, 'reports');

  // Phase 2: Alias Consolidation Report
  let aliasReport = '# Phase 2: Alias Consolidation Report\n\n';
  aliasReport += `**Generated:** ${new Date().toISOString()}\n\n`;
  aliasReport += '## Shared Username Resolutions\n\n';

  phase2Results.sharedResolutions.forEach(res => {
    aliasReport += `### ${res.username}\n`;
    aliasReport += `- **Type:** ${res.type}\n`;
    aliasReport += `- **Original Names:** ${res.originalNames.join(', ')}\n`;
    aliasReport += `- **Resolved Name:** ${res.resolvedName || 'MANUAL RESOLUTION NEEDED'}\n`;
    aliasReport += `- **Decision:** ${res.decision}\n\n`;
  });

  aliasReport += '## Students with Multiple Usernames\n\n';
  phase2Results.aliasStudents.forEach(student => {
    aliasReport += `### ${student.studentName}\n`;
    aliasReport += `- **Primary:** ${student.primaryUsername}\n`;
    aliasReport += `- **Aliases:** ${student.aliases.join(', ')}\n`;
    aliasReport += `- **Usage:** ${JSON.stringify(student.usageCounts)}\n\n`;
  });

  fs.writeFileSync(path.join(reportsDir, 'phase2-alias-consolidation.md'), aliasReport);

  // Phase 3: Duplicates Report
  let dupReport = '# Phase 3: Duplicates Report\n\n';
  dupReport += `**Generated:** ${new Date().toISOString()}\n\n`;
  dupReport += `## Summary\n\n`;
  dupReport += `- Original records: ${phase3Results.stats.originalCount}\n`;
  dupReport += `- After consolidation: ${phase3Results.stats.consolidatedCount}\n`;
  dupReport += `- Duplicates removed: ${phase3Results.stats.duplicatesRemoved}\n\n`;
  dupReport += `## Examples\n\n`;

  phase3Results.duplicateExamples.forEach((ex, idx) => {
    dupReport += `### Example ${idx + 1}\n`;
    dupReport += `- **Student:** ${ex.primaryUsername}\n`;
    dupReport += `- **Question:** ${ex.questionId}\n`;
    dupReport += `- **Total attempts:** ${ex.totalAttempts}\n`;
    dupReport += `- **Kept timestamp:** ${ex.keptTimestamp}\n`;
    dupReport += `- **Removed timestamps:** ${ex.removedTimestamps.join(', ')}\n\n`;
  });

  fs.writeFileSync(path.join(reportsDir, 'phase3-duplicates-report.md'), dupReport);

  // Phase 5: Misconceptions Report
  let misconReport = '# Phase 5: L10 Misconceptions Report\n\n';
  misconReport += `**Generated:** ${new Date().toISOString()}\n\n`;
  misconReport += `## Top Misconceptions\n\n`;

  phase5Results.misconceptions.forEach((misc, idx) => {
    misconReport += `### ${idx + 1}. ${misc.questionId}\n`;
    misconReport += `- **Misconception:** Selected ${misc.wrongAnswer} instead of ${misc.correctAnswer}\n`;
    misconReport += `- **Frequency:** ${misc.percentSelected}% (${misc.studentCount} students)\n`;
    misconReport += `- **Evidence:** ${misc.evidence}\n\n`;
  });

  fs.writeFileSync(path.join(reportsDir, 'L10-misconceptions.md'), misconReport);

  console.log('  Saved markdown reports');
}

/**
 * Main pipeline execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  AP Statistics Period B Unit 1 Analysis Pipeline          ║');
  console.log('║  Phase 2-5: Roster Resolution through Item Analysis       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Load Phase 0-1 data
    const normalizedData = loadPhase01Data();

    // Execute Phase 2: Roster Resolution
    const phase2Results = executePhase2(normalizedData, config);

    console.log('\nSaving Phase 2 outputs...');
    savePhaseOutputs('phase2', {
      data_json: {
        rosterResolved: phase2Results.rosterResolved,
        usernameLookup: phase2Results.usernameLookup,
        sharedResolutions: phase2Results.sharedResolutions,
        validation: phase2Results.validation
      },
      report: {
        stats: phase2Results.stats,
        validation: phase2Results.validation
      }
    });

    // Save Period Assignments CSV
    const periodData = Object.values(phase2Results.rosterResolved).map(s => ({
      studentName: s.studentName,
      primaryUsername: s.primaryUsername,
      aliases: s.aliases.join(';'),
      period: s.period,
      l10Attempts: s.l10AttemptCount,
      l10Questions: s.l10UniqueQuestions
    }));

    saveCSVOutputs('phase2', {
      'phase2-period-assignments.csv': generateCSV(periodData)
    });

    // Execute Phase 3: Attempt Consolidation
    const phase3Results = executePhase3(normalizedData, phase2Results);

    console.log('\nSaving Phase 3 outputs...');
    savePhaseOutputs('phase3', {
      'answers-consolidated_json': phase3Results.answersConsolidated,
      'L10-answers-latest_json': phase3Results.l10Answers,
      report: {
        stats: phase3Results.stats,
        validation: phase3Results.validation
      }
    });

    // Execute Phase 4: Scoring and Triage
    const phase4Results = executePhase4(phase3Results, config);

    console.log('\nSaving Phase 4 outputs...');

    // MC Scored CSV
    const mcCSV = generateCSV(phase4Results.mcScored, [
      'primaryUsername', 'studentName', 'period', 'questionId',
      'answerValue', 'correctAnswer', 'isCorrect', 'timestamp'
    ]);

    // CR Triage CSV
    const crCSV = generateCSV(phase4Results.crTriaged, [
      'primaryUsername', 'studentName', 'period', 'questionId',
      'triageBucket', 'triageScore', 'keywordMatches', 'needsReview', 'responseLength'
    ]);

    saveCSVOutputs('phase4', {
      'L10-MC-scored.csv': mcCSV,
      'L10-CR-triage.csv': crCSV
    });

    // Calibration Pack
    let calibrationMD = '# L10 CR Calibration Pack\n\n';
    calibrationMD += `**Generated:** ${new Date().toISOString()}\n\n`;
    calibrationMD += '## Instructions\n\nScore each response using the rubrics in `config/rubrics.js`.\n\n';

    phase4Results.calibrationPack.forEach((sample, idx) => {
      calibrationMD += `## ${sample.sampleId}: ${sample.questionId}\n\n`;
      calibrationMD += `- **Triage Bucket:** ${sample.triageBucket}\n`;
      calibrationMD += `- **Keyword Matches:** ${sample.keywordMatches.join(', ')}\n`;
      calibrationMD += `- **Response Length:** ${sample.responseLength} chars\n\n`;
      calibrationMD += `**Response:**\n\n> ${sample.response}\n\n`;
      calibrationMD += `**Your Score:** _____\n\n`;
      calibrationMD += '---\n\n';
    });

    fs.writeFileSync(path.join(__dirname, 'reports', 'L10-CR-calibration-pack.md'), calibrationMD);

    // Execute Phase 5: Item Analysis
    const phase5Results = executePhase5(phase3Results, phase4Results, phase2Results, config);

    console.log('\nSaving Phase 5 outputs...');

    // Item Analysis CSV
    const itemCSV = generateCSV(phase5Results.itemAnalysis, [
      'questionId', 'n', 'pValue', 'difficulty', 'correctAnswer',
      'discrimination', 'topDistractor', 'topDistractorPercent'
    ]);

    // Student Subscores CSV
    const subscoreCSV = generateCSV(phase5Results.studentSubscores, [
      'studentName', 'primaryUsername', 'period',
      'mcScore', 'mcPercent', 'mcTraffic',
      'q04Score', 'q04Percent', 'q04Traffic',
      'q06Score', 'q06Percent', 'q06Traffic',
      'totalAttempted'
    ]);

    // Traffic Light CSV
    const trafficData = phase5Results.studentSubscores.map(s => ({
      studentName: s.studentName,
      primaryUsername: s.primaryUsername,
      MC: s.mcTraffic,
      Q04_Histogram: s.q04Traffic,
      Q06_ZScores: s.q06Traffic
    }));

    const trafficCSV = generateCSV(trafficData);

    saveCSVOutputs('phase5', {
      'L10-item-analysis.csv': itemCSV,
      'L10-student-subscores.csv': subscoreCSV,
      'L10-traffic-light.csv': trafficCSV
    });

    // Generate markdown reports
    console.log('\nGenerating markdown reports...');
    generateMarkdownReports(phase2Results, phase3Results, phase5Results);

    // Final summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  Phase 2-5 Complete                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('Phase 2 - Roster Resolution:');
    console.log(`  ✓ ${phase2Results.stats.totalStudents} students processed`);
    console.log(`  ✓ Period B: ${phase2Results.stats.periodB} students`);
    console.log(`  ✓ Period E: ${phase2Results.stats.periodE} students`);
    console.log(`  ✓ ${phase2Results.stats.studentsWithAliases} students with aliases`);

    console.log('\nPhase 3 - Attempt Consolidation:');
    console.log(`  ✓ ${phase3Results.stats.duplicatesRemoved} duplicates removed`);
    console.log(`  ✓ ${phase3Results.stats.consolidatedCount} unique student×question records`);
    console.log(`  ✓ ${phase3Results.l10Answers.length} L10 responses`);

    console.log('\nPhase 4 - Scoring and Triage:');
    console.log(`  ✓ ${phase4Results.stats.mcCount} MC responses scored`);
    console.log(`  ✓ ${phase4Results.stats.mcCorrect} correct (${Math.round(phase4Results.stats.mcCorrect/phase4Results.stats.mcCount*100)}%)`);
    console.log(`  ✓ ${phase4Results.stats.crCount} CR responses triaged`);
    console.log(`  ✓ ${phase4Results.calibrationPack.length} calibration samples`);

    console.log('\nPhase 5 - Item Analysis:');
    console.log(`  ✓ ${phase5Results.stats.itemsAnalyzed} items analyzed`);
    console.log(`  ✓ ${phase5Results.stats.misconceptionsFound} misconceptions identified`);
    console.log(`  ✓ ${phase5Results.stats.studentsScored} students scored`);

    console.log('\n📁 Generated Files:');
    console.log('  Reports:');
    console.log('    • phase2-alias-consolidation.md');
    console.log('    • phase2-period-assignments.csv');
    console.log('    • phase3-duplicates-report.md');
    console.log('    • L10-MC-scored.csv');
    console.log('    • L10-CR-triage.csv');
    console.log('    • L10-CR-calibration-pack.md ⭐');
    console.log('    • L10-item-analysis.csv');
    console.log('    • L10-misconceptions.md');
    console.log('    • L10-student-subscores.csv');
    console.log('    • L10-traffic-light.csv ⭐');

    console.log('\n✅ Ready for Phase 6+ or manual CR calibration');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Pipeline Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
