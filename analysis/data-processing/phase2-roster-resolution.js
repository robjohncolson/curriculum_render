// Phase 2: Roster Resolution and Period Tagging
// Resolves username conflicts, consolidates aliases, and assigns Period B/E tags

const fs = require('fs');
const path = require('path');

/**
 * Normalize student name for matching (case-insensitive)
 */
function normalizeStudentName(name) {
  return name.toLowerCase().trim();
}

/**
 * Resolve shared usernames (capitalization variants)
 * Strategy: Treat as same student if student names match (case-insensitive)
 */
function resolveSharedUsernames(rosterData) {
  const resolutions = [];

  // Build username to students mapping from roster
  const usernameToStudents = {};

  Object.entries(rosterData).forEach(([studentKey, data]) => {
    data.usernames.forEach(username => {
      if (!usernameToStudents[username]) {
        usernameToStudents[username] = [];
      }
      usernameToStudents[username].push(data.studentName);
    });
  });

  Object.entries(usernameToStudents).forEach(([username, studentList]) => {
    if (studentList.length > 1) {
      // Normalize student names
      const normalizedNames = studentList.map(s => normalizeStudentName(s));
      const uniqueNormalized = [...new Set(normalizedNames)];

      if (uniqueNormalized.length === 1) {
        // Capitalization variant - same student
        resolutions.push({
          username,
          type: 'capitalization_variant',
          originalNames: studentList,
          resolvedName: studentList[0], // Use first occurrence
          decision: 'Same student, different capitalization'
        });
      } else {
        // Truly shared username - different students
        resolutions.push({
          username,
          type: 'truly_shared',
          originalNames: studentList,
          resolvedName: null,
          decision: 'WARNING: Different students sharing same username',
          action: 'Needs manual resolution'
        });
      }
    }
  });

  return resolutions;
}

/**
 * Consolidate student aliases
 * Each student gets a primary username and list of aliases
 */
function consolidateAliases(rosterData, answersData) {
  const consolidatedRoster = {};

  Object.entries(rosterData).forEach(([studentKey, data]) => {
    const { studentName, usernames } = data;

    if (usernames.length === 1) {
      // No aliases
      consolidatedRoster[studentKey] = {
        studentName,
        primaryUsername: usernames[0],
        aliases: [],
        allUsernames: [usernames[0]],
        aliasType: 'none'
      };
    } else {
      // Has aliases - determine primary by usage frequency
      const usageCounts = {};
      usernames.forEach(username => {
        usageCounts[username] = answersData.filter(a => a.username === username).length;
      });

      // Sort by usage, pick most used as primary
      const sortedUsernames = usernames.sort((a, b) => usageCounts[b] - usageCounts[a]);
      const primaryUsername = sortedUsernames[0];
      const aliases = sortedUsernames.slice(1);

      consolidatedRoster[studentKey] = {
        studentName,
        primaryUsername,
        aliases,
        allUsernames: usernames,
        aliasType: 'multiple_usernames',
        usageCounts
      };
    }
  });

  return consolidatedRoster;
}

/**
 * Assign Period B/E tags based on L10 attempts
 * Period B = has ≥1 U1-L10 attempt
 * Period E = no U1-L10 attempts
 */
function assignPeriods(consolidatedRoster, answersData) {
  const rosterWithPeriods = {};

  Object.entries(consolidatedRoster).forEach(([studentKey, student]) => {
    const { allUsernames } = student;

    // Check if any username has L10 attempts
    const l10Attempts = answersData.filter(answer =>
      allUsernames.includes(answer.username) &&
      answer.isL10 === true
    );

    const hasL10 = l10Attempts.length > 0;
    const l10Questions = [...new Set(l10Attempts.map(a => a.questionId))];

    rosterWithPeriods[studentKey] = {
      ...student,
      period: hasL10 ? 'B' : 'E',
      l10AttemptCount: l10Attempts.length,
      l10UniqueQuestions: l10Questions.length,
      l10Questions
    };
  });

  return rosterWithPeriods;
}

/**
 * Create username lookup for quick student resolution
 * Maps every username (primary and alias) to student key
 */
function createUsernameLookup(rosterWithPeriods) {
  const lookup = {};

  Object.entries(rosterWithPeriods).forEach(([studentKey, student]) => {
    student.allUsernames.forEach(username => {
      lookup[username] = {
        studentKey,
        studentName: student.studentName,
        primaryUsername: student.primaryUsername,
        period: student.period
      };
    });
  });

  return lookup;
}

/**
 * Validate roster resolution
 */
function validateRosterResolution(rosterWithPeriods, answersData, config) {
  const issues = [];
  const warnings = [];

  // Check: All L10 submitters tagged Period B
  const l10Usernames = [...new Set(answersData.filter(a => a.isL10).map(a => a.username))];
  const periodBUsernames = new Set();

  Object.values(rosterWithPeriods).forEach(student => {
    if (student.period === 'B') {
      student.allUsernames.forEach(u => periodBUsernames.add(u));
    }
  });

  const l10NotInPeriodB = l10Usernames.filter(u => !periodBUsernames.has(u));
  if (l10NotInPeriodB.length > 0) {
    issues.push({
      severity: 'error',
      category: 'period_assignment',
      message: `${l10NotInPeriodB.length} L10 submitters not in Period B`,
      usernames: l10NotInPeriodB
    });
  }

  // Check: All usernames mapped
  const allAnswerUsernames = [...new Set(answersData.map(a => a.username))];
  const lookup = createUsernameLookup(rosterWithPeriods);
  const unmappedUsernames = allAnswerUsernames.filter(u => !lookup[u]);

  if (unmappedUsernames.length > 0) {
    warnings.push({
      severity: 'warning',
      category: 'unmapped_usernames',
      message: `${unmappedUsernames.length} usernames not in roster mapping`,
      usernames: unmappedUsernames.slice(0, 10),
      recommendation: 'These may be students not in student2username.csv'
    });
  }

  // Stats
  const periodBCount = Object.values(rosterWithPeriods).filter(s => s.period === 'B').length;
  const periodECount = Object.values(rosterWithPeriods).filter(s => s.period === 'E').length;
  const aliasCount = Object.values(rosterWithPeriods).filter(s => s.aliases.length > 0).length;

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    stats: {
      totalStudents: Object.keys(rosterWithPeriods).length,
      periodB: periodBCount,
      periodE: periodECount,
      studentsWithAliases: aliasCount,
      unmappedUsernames: unmappedUsernames.length
    }
  };
}

/**
 * Main Phase 2 execution
 */
function executePhase2(normalizedData, config) {
  console.log('\n=== Phase 2: Roster Resolution and Period Tagging ===\n');

  const { answers, roster } = normalizedData;

  // Step 1: Resolve shared usernames
  console.log('Step 1: Resolving shared usernames...');
  const sharedResolutions = resolveSharedUsernames(roster);
  console.log(`  Resolved ${sharedResolutions.length} shared username cases`);

  // Step 2: Consolidate aliases
  console.log('\nStep 2: Consolidating aliases...');
  const consolidatedRoster = consolidateAliases(roster, answers);
  console.log(`  Processed ${Object.keys(consolidatedRoster).length} students`);

  const aliasStudents = Object.values(consolidatedRoster).filter(s => s.aliases.length > 0);
  console.log(`  Found ${aliasStudents.length} students with aliases`);

  // Step 3: Assign periods
  console.log('\nStep 3: Assigning Period B/E tags...');
  const rosterWithPeriods = assignPeriods(consolidatedRoster, answers);

  const periodBCount = Object.values(rosterWithPeriods).filter(s => s.period === 'B').length;
  const periodECount = Object.values(rosterWithPeriods).filter(s => s.period === 'E').length;
  console.log(`  Period B: ${periodBCount} students`);
  console.log(`  Period E: ${periodECount} students`);

  // Step 4: Create lookup
  console.log('\nStep 4: Creating username lookup...');
  const usernameLookup = createUsernameLookup(rosterWithPeriods);
  console.log(`  Mapped ${Object.keys(usernameLookup).length} usernames`);

  // Step 5: Validate
  console.log('\nStep 5: Validating roster resolution...');
  const validation = validateRosterResolution(rosterWithPeriods, answers, config);

  console.log(`  Validation: ${validation.isValid ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`  Issues: ${validation.issues.length}`);
  console.log(`  Warnings: ${validation.warnings.length}`);

  if (validation.warnings.length > 0) {
    console.log('\n  Warnings:');
    validation.warnings.forEach(w => {
      console.log(`    - [${w.category}] ${w.message}`);
    });
  }

  return {
    rosterResolved: rosterWithPeriods,
    usernameLookup,
    sharedResolutions,
    aliasStudents,
    validation,
    stats: validation.stats
  };
}

// Export
module.exports = {
  executePhase2,
  resolveSharedUsernames,
  consolidateAliases,
  assignPeriods,
  createUsernameLookup,
  validateRosterResolution
};
