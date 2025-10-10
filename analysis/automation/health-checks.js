const fs = require('fs');
const path = require('path');

/**
 * Health Checks for Pipeline Automation
 * Monitors for drift, anomalies, and alert conditions
 */

function loadPreviousRun() {
  const snapshotPath = path.join(__dirname, '../reports/snapshot-previous.json');
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
}

function saveCurrentSnapshot(data) {
  const snapshotPath = path.join(__dirname, '../reports/snapshot-current.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2));

  // Archive previous
  const prevPath = path.join(__dirname, '../reports/snapshot-previous.json');
  if (fs.existsSync(snapshotPath)) {
    fs.copyFileSync(snapshotPath, prevPath);
  }
}

function checkNewUsernames(currentUsernames, previousUsernames) {
  if (!previousUsernames) return { status: 'ok', newUsernames: [] };

  const newUsernames = currentUsernames.filter(u => !previousUsernames.includes(u));

  if (newUsernames.length > 2) {
    return {
      status: 'alert',
      message: `${newUsernames.length} new usernames detected`,
      newUsernames,
      action: 'Check roster for drift, update student2username.csv if needed'
    };
  } else if (newUsernames.length > 0) {
    return {
      status: 'warning',
      message: `${newUsernames.length} new username(s) detected`,
      newUsernames,
      action: 'Review and add to roster if legitimate student'
    };
  }

  return { status: 'ok', newUsernames: [] };
}

function checkCRCompletion(crData) {
  const alerts = [];

  Object.entries(crData).forEach(([questionId, completion]) => {
    const { attempted, total, percent } = completion;

    if (percent < 40) {
      alerts.push({
        questionId,
        attempted,
        total,
        percent,
        severity: 'high',
        action: 'Run CR Blitz intervention immediately'
      });
    } else if (percent < 60) {
      alerts.push({
        questionId,
        attempted,
        total,
        percent,
        severity: 'medium',
        action: 'Monitor and encourage CR completion'
      });
    }
  });

  return {
    status: alerts.length > 0 ? 'alert' : 'ok',
    alerts
  };
}

function checkMasteryDrops(currentMastery, previousMastery) {
  if (!previousMastery) return { status: 'ok', drops: [] };

  const drops = [];

  Object.entries(currentMastery).forEach(([username, skills]) => {
    if (!previousMastery[username]) return;

    Object.entries(skills).forEach(([skill, current]) => {
      const previous = previousMastery[username][skill];
      if (!previous) return;

      const currentPct = current.percentage;
      const previousPct = previous.percentage;
      const delta = currentPct - previousPct;

      if (delta < -15) {
        drops.push({
          username,
          studentName: skills.studentName,
          skill,
          previousPct,
          currentPct,
          delta: delta.toFixed(1),
          action: 'Review instruction for this skill'
        });
      }
    });
  });

  return {
    status: drops.length > 0 ? 'alert' : 'ok',
    drops
  };
}

function checkItemQuality(itemAnalysis) {
  const issues = [];

  itemAnalysis.forEach(item => {
    // Low discrimination
    if (item.discrimination < 0.2) {
      issues.push({
        questionId: item.questionId,
        issue: 'Low discrimination',
        value: item.discrimination,
        severity: 'medium',
        action: 'Review question for clarity or difficulty'
      });
    }

    // Extremely easy (everyone gets it)
    if (item.pValue > 0.95) {
      issues.push({
        questionId: item.questionId,
        issue: 'Too easy',
        value: item.pValue,
        severity: 'low',
        action: 'Consider increasing difficulty for better differentiation'
      });
    }

    // Extremely hard (almost no one gets it)
    if (item.pValue < 0.3) {
      issues.push({
        questionId: item.questionId,
        issue: 'Too hard or unclear',
        value: item.pValue,
        severity: 'high',
        action: 'Check for mis-keyed answer or ambiguous wording'
      });
    }
  });

  return {
    status: issues.filter(i => i.severity === 'high').length > 0 ? 'alert' : 'ok',
    issues
  };
}

function generateHealthReport(checks) {
  let report = '# Pipeline Health Check Report\n\n';
  report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  report += '---\n\n';

  // Overall status
  const hasAlerts = Object.values(checks).some(c => c.status === 'alert');
  const hasWarnings = Object.values(checks).some(c => c.status === 'warning');

  if (hasAlerts) {
    report += '## ⚠️ ALERTS DETECTED\n\n';
  } else if (hasWarnings) {
    report += '## ⚡ Warnings Present\n\n';
  } else {
    report += '## ✅ All Systems Normal\n\n';
  }

  // New Usernames
  report += '### New Usernames Check\n';
  report += `**Status:** ${checks.newUsernames.status}\n\n`;
  if (checks.newUsernames.newUsernames.length > 0) {
    report += 'New usernames detected:\n';
    checks.newUsernames.newUsernames.forEach(u => {
      report += `- ${u}\n`;
    });
    report += `\n**Action:** ${checks.newUsernames.action}\n\n`;
  } else {
    report += 'No new usernames.\n\n';
  }

  // CR Completion
  report += '### CR Completion Check\n';
  report += `**Status:** ${checks.crCompletion.status}\n\n`;
  if (checks.crCompletion.alerts.length > 0) {
    report += '| Question | Attempted | Total | % | Severity | Action |\n';
    report += '|----------|-----------|-------|---|----------|--------|\n';
    checks.crCompletion.alerts.forEach(alert => {
      report += `| ${alert.questionId} | ${alert.attempted} | ${alert.total} | ${alert.percent}% | ${alert.severity} | ${alert.action} |\n`;
    });
    report += '\n';
  } else {
    report += 'All CR completion rates above threshold.\n\n';
  }

  // Mastery Drops
  report += '### Mastery Regression Check\n';
  report += `**Status:** ${checks.masteryDrops.status}\n\n`;
  if (checks.masteryDrops.drops.length > 0) {
    report += '| Student | Skill | Previous | Current | Delta | Action |\n';
    report += '|---------|-------|----------|---------|-------|--------|\n';
    checks.masteryDrops.drops.forEach(drop => {
      report += `| ${drop.studentName} | ${drop.skill} | ${drop.previousPct}% | ${drop.currentPct}% | ${drop.delta}% | ${drop.action} |\n`;
    });
    report += '\n';
  } else {
    report += 'No significant mastery drops detected.\n\n';
  }

  // Item Quality
  report += '### Item Quality Check\n';
  report += `**Status:** ${checks.itemQuality.status}\n\n`;
  if (checks.itemQuality.issues.length > 0) {
    report += '| Question | Issue | Value | Severity | Action |\n';
    report += '|----------|-------|-------|----------|--------|\n';
    checks.itemQuality.issues.forEach(issue => {
      report += `| ${issue.questionId} | ${issue.issue} | ${issue.value.toFixed(2)} | ${issue.severity} | ${issue.action} |\n`;
    });
    report += '\n';
  } else {
    report += 'All items meet quality thresholds.\n\n';
  }

  report += '---\n\n';
  report += '*Automated health check - review and take action as needed*';

  return report;
}

function runHealthChecks() {
  console.log('=== Pipeline Health Checks ===\n');

  // Load current data
  const currentData = {
    usernames: loadCurrentUsernames(),
    crData: loadCRData(),
    mastery: loadMastery(),
    itemAnalysis: loadItemAnalysis()
  };

  // Load previous snapshot
  const previousData = loadPreviousRun();

  // Run checks
  const checks = {
    newUsernames: checkNewUsernames(
      currentData.usernames,
      previousData?.usernames || []
    ),
    crCompletion: checkCRCompletion(currentData.crData),
    masteryDrops: checkMasteryDrops(
      currentData.mastery,
      previousData?.mastery || {}
    ),
    itemQuality: checkItemQuality(currentData.itemAnalysis)
  };

  // Generate report
  const report = generateHealthReport(checks);

  // Save outputs
  const reportsDir = path.join(__dirname, '../reports');
  fs.writeFileSync(
    path.join(reportsDir, 'health-check.md'),
    report
  );

  // Save snapshot for next run
  saveCurrentSnapshot(currentData);

  // Log summary
  console.log('Health Check Results:');
  console.log(`  New Usernames: ${checks.newUsernames.status}`);
  console.log(`  CR Completion: ${checks.crCompletion.status}`);
  console.log(`  Mastery Drops: ${checks.masteryDrops.status}`);
  console.log(`  Item Quality: ${checks.itemQuality.status}`);
  console.log(`\nFull report: reports/health-check.md`);

  return checks;
}

// Helper functions to load current data
function loadCurrentUsernames() {
  const dataPath = path.join(__dirname, '../reports/data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  return Object.keys(data.usernameToStudents || {});
}

function loadCRData() {
  const missingPath = path.join(__dirname, '../reports/L10-CR-missing.csv');
  const content = fs.readFileSync(missingPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const crData = {};

  let q04Missing = 0;
  let q06Missing = 0;
  const total = lines.length - 1; // minus header

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts[2] === 'YES') q04Missing++;
    if (parts[3] === 'YES') q06Missing++;
  }

  crData['Q04'] = {
    attempted: total - q04Missing,
    total,
    percent: ((total - q04Missing) / total * 100).toFixed(0)
  };

  crData['Q06'] = {
    attempted: total - q06Missing,
    total,
    percent: ((total - q06Missing) / total * 100).toFixed(0)
  };

  return crData;
}

function loadMastery() {
  const masteryPath = path.join(__dirname, '../reports/mastery-by-student-skill.csv');
  const content = fs.readFileSync(masteryPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const mastery = {};

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const username = parts[1];
    const skill = parts[2];

    if (!mastery[username]) {
      mastery[username] = { studentName: parts[0] };
    }

    mastery[username][skill] = {
      percentage: parseFloat(parts[6])
    };
  }

  return mastery;
}

function loadItemAnalysis() {
  const itemPath = path.join(__dirname, '../reports/L10-item-analysis.csv');
  const content = fs.readFileSync(itemPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    items.push({
      questionId: parts[0],
      pValue: parseFloat(parts[2]),
      discrimination: parseFloat(parts[5])
    });
  }

  return items;
}

// Run if called directly
if (require.main === module) {
  runHealthChecks();
}

module.exports = { runHealthChecks };
