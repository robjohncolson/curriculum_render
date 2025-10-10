#!/usr/bin/env node

// Phase 0 & 1 Pipeline: Scope Definition, Data Ingestion, and Normalization
// Main execution script

const fs = require('fs');
const path = require('path');

const config = require('./config/phase0-config.js');
const { L10_RUBRICS, CR_SCORING_GUIDANCE } = require('./config/rubrics.js');
const { loadAllData } = require('./data-processing/loader.js');
const { validateAllData } = require('./data-processing/validator.js');
const { getNormalizationStats } = require('./data-processing/normalizer.js');

/**
 * Generate Phase 0 report
 */
function generatePhase0Report(config, rubrics) {
  const report = {
    phase: 'Phase 0: Scope, Inputs, and Assumptions',
    timestamp: new Date().toISOString(),
    scope: config.scope,
    assumptions: config.assumptions,
    inputs: config.inputs,
    lesson10: {
      questions: config.lesson10Questions,
      answerKey: config.answerKey,
      rubrics: {
        'U1-L10-Q04': {
          topic: rubrics['U1-L10-Q04'].topic,
          totalPoints: rubrics['U1-L10-Q04'].totalPoints,
          parts: rubrics['U1-L10-Q04'].parts.length
        },
        'U1-L10-Q06': {
          topic: rubrics['U1-L10-Q06'].topic,
          totalPoints: rubrics['U1-L10-Q06'].totalPoints,
          parts: rubrics['U1-L10-Q06'].parts.length
        }
      }
    },
    status: 'Complete'
  };

  return report;
}

/**
 * Generate Phase 1 report
 */
function generatePhase1Report(loadedData, validationResults, normStats) {
  const report = {
    phase: 'Phase 1: Data Ingestion and Normalization',
    timestamp: new Date().toISOString(),
    dataLoading: {
      answers: {
        totalRecords: loadedData.answers.stats.totalRecords,
        validRecords: loadedData.answers.stats.validRecords,
        invalidRecords: loadedData.answers.stats.invalidRecords
      },
      roster: {
        totalRecords: loadedData.roster.stats.totalRecords,
        uniqueStudents: loadedData.roster.stats.uniqueStudents,
        uniqueUsernames: loadedData.roster.stats.uniqueUsernames,
        studentsWithAliases: loadedData.roster.stats.studentsWithAliases.length
      },
      curriculum: {
        totalQuestions: loadedData.curriculum.stats.total,
        l10Questions: loadedData.curriculum.stats.l10Count
      }
    },
    normalization: normStats.summary,
    normalizationDetails: {
      usernames: {
        modified: normStats.usernames.totalProcessed - normStats.usernames.noChanges,
        lowercaseConversions: normStats.usernames.lowercaseConversions,
        hyphenReplacements: normStats.usernames.hyphenReplacements,
        whitespaceTrims: normStats.usernames.whitespaceTrims
      },
      questionIds: {
        valid: normStats.questionIds.validFormat,
        invalid: normStats.questionIds.invalidFormat
      }
    },
    validation: {
      status: validationResults.isValid ? 'PASSED' : 'FAILED',
      criticalErrors: validationResults.summary.criticalErrors,
      totalWarnings: validationResults.summary.totalWarnings,
      issues: validationResults.answers.issues.concat(
        validationResults.roster.issues,
        validationResults.curriculum.issues
      ),
      warnings: validationResults.answers.warnings.concat(
        validationResults.roster.warnings,
        validationResults.curriculum.warnings
      )
    },
    status: validationResults.isValid ? 'Complete - Data Ready' : 'Complete - Issues Found'
  };

  return report;
}

/**
 * Save report to file
 */
function saveReport(report, filename) {
  const reportsDir = path.join(__dirname, 'reports');

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filepath = path.join(reportsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

  console.log(`\nReport saved to: ${filepath}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  AP Statistics Period B Unit 1 Analysis Pipeline          ║');
  console.log('║  Phase 0 & 1: Scope Definition and Data Normalization     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Phase 0: Generate scope report
    console.log('=== Phase 0: Scope, Inputs, and Assumptions ===\n');
    const phase0Report = generatePhase0Report(config, L10_RUBRICS);

    console.log(`Scope: ${config.scope.description}`);
    console.log(`Period: ${config.scope.period}`);
    console.log(`Lessons: ${config.scope.lessons.range[0]}-${config.scope.lessons.range[1]} (spotlight: L${config.scope.lessons.spotlight})`);
    console.log(`L10 Questions: ${config.lesson10Questions.total} (${config.lesson10Questions.multipleChoice.length} MC, ${config.lesson10Questions.constructedResponse.length} CR)`);

    console.log('\nAnswer Key (MC):');
    Object.entries(config.answerKey).forEach(([qId, answer]) => {
      console.log(`  ${qId}: ${answer}`);
    });

    console.log('\nRubrics Created:');
    Object.entries(L10_RUBRICS).forEach(([qId, rubric]) => {
      console.log(`  ${qId}: ${rubric.topic} (${rubric.totalPoints} points)`);
    });

    saveReport(phase0Report, 'phase0-scope-report.json');

    // Phase 1: Load and normalize data
    const loadedData = loadAllData(config);

    // Validate data
    const validationResults = validateAllData(loadedData, config);

    // Get normalization stats
    const normStats = getNormalizationStats();

    // Generate Phase 1 report
    const phase1Report = generatePhase1Report(loadedData, validationResults, normStats);

    saveReport(phase1Report, 'phase1-normalization-report.json');

    // Save normalized data for next phases
    const normalizedDataPath = path.join(__dirname, 'reports', 'normalized-data.json');
    fs.writeFileSync(normalizedDataPath, JSON.stringify({
      answers: loadedData.answers.normalized,
      roster: loadedData.roster.studentToUsernames,
      curriculum: loadedData.curriculum.byId,
      metadata: {
        timestamp: loadedData.loadTimestamp,
        validation: validationResults.isValid,
        recordCounts: {
          answers: loadedData.answers.normalized.length,
          students: Object.keys(loadedData.roster.studentToUsernames).length
        }
      }
    }, null, 2));

    console.log(`\nNormalized data saved to: ${normalizedDataPath}`);

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  Phase 0 & 1 Complete                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('Phase 0 Outputs:');
    console.log('  ✓ Scope configuration defined');
    console.log('  ✓ L10 answer key extracted (6 MC questions)');
    console.log('  ✓ Rubrics created (2 CR questions)');

    console.log('\nPhase 1 Outputs:');
    console.log(`  ✓ ${loadedData.answers.normalized.length} answer records normalized`);
    console.log(`  ✓ ${Object.keys(loadedData.roster.studentToUsernames).length} unique students mapped`);
    console.log(`  ✓ ${loadedData.curriculum.stats.l10Count} L10 questions loaded`);
    console.log(`  ✓ Data validation: ${validationResults.isValid ? 'PASSED' : 'FAILED'}`);

    if (!validationResults.isValid) {
      console.log(`\n⚠️  ${validationResults.summary.criticalErrors} critical errors found - review reports`);
    }

    console.log('\nReady for Phase 2: Roster Resolution and Period Filter');

    // Exit with appropriate code
    process.exit(validationResults.isValid ? 0 : 1);

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
