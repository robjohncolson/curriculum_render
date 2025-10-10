const fs = require('fs');
const path = require('path');

/**
 * Phase 8: Class Report Generator
 * Creates comprehensive class-level analysis for teacher
 */

function loadItemAnalysis() {
  const itemPath = path.join(__dirname, '../reports/L10-item-analysis.csv');
  const content = fs.readFileSync(itemPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    items.push({
      questionId: parts[0],
      n: parseInt(parts[1]),
      pValue: parseFloat(parts[2]),
      difficulty: parts[3],
      correctAnswer: parts[4],
      discrimination: parseFloat(parts[5]),
      topDistractor: parts[6],
      topDistractorPercent: parseInt(parts[7])
    });
  }

  return items;
}

function loadMisconceptions() {
  const misconPath = path.join(__dirname, '../reports/L10-misconceptions.md');
  const content = fs.readFileSync(misconPath, 'utf-8');

  // Parse the markdown
  const misconceptions = [];
  const lines = content.split('\n');

  let currentMiscon = null;
  lines.forEach(line => {
    if (line.startsWith('### ')) {
      if (currentMiscon) misconceptions.push(currentMiscon);
      currentMiscon = { title: line.replace('### ', '').trim() };
    } else if (line.startsWith('- **Misconception:**')) {
      if (currentMiscon) currentMiscon.misconception = line.replace('- **Misconception:**', '').trim();
    } else if (line.startsWith('- **Frequency:**')) {
      if (currentMiscon) currentMiscon.frequency = line.replace('- **Frequency:**', '').trim();
    } else if (line.startsWith('- **Evidence:**')) {
      if (currentMiscon) currentMiscon.evidence = line.replace('- **Evidence:**', '').trim();
    }
  });

  if (currentMiscon) misconceptions.push(currentMiscon);

  return misconceptions;
}

function loadWeakSkills() {
  const weakPath = path.join(__dirname, '../reports/weak-skills.csv');
  const content = fs.readFileSync(weakPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const weakSkills = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    weakSkills.push({
      skill: parts[0],
      skillName: parts[1].replace(/"/g, ''),
      studentsStruggling: parseInt(parts[2]),
      totalStudents: parseInt(parts[3]),
      strugglingPercent: parseFloat(parts[4])
    });
  }

  return weakSkills.slice(0, 5); // Top 5
}

function loadTrafficLight() {
  const trafficPath = path.join(__dirname, '../reports/L10-traffic-light.csv');
  const content = fs.readFileSync(trafficPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const students = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    students.push({
      studentName: parts[0],
      username: parts[1],
      mcStatus: parts[2]
    });
  }

  return students;
}

function generateClassReport() {
  const itemAnalysis = loadItemAnalysis();
  const misconceptions = loadMisconceptions();
  const weakSkills = loadWeakSkills();
  const trafficLight = loadTrafficLight();

  let report = '# Period B Unit 1 Class Report\n\n';
  report += `**Generated:** ${new Date().toLocaleString()}\n`;
  report += `**Focus:** Lesson 10 Assessment with Unit 1 Context\n\n`;
  report += '---\n\n';

  // Executive Summary
  report += '## Executive Summary\n\n';

  const greenCount = trafficLight.filter(s => s.mcStatus === 'green').length;
  const yellowCount = trafficLight.filter(s => s.mcStatus === 'yellow').length;
  const redCount = trafficLight.filter(s => s.mcStatus === 'red').length;

  report += `**Class Performance:** ${trafficLight.length} students assessed\n`;
  report += `- 🟢 Green (≥80%): ${greenCount} students\n`;
  report += `- 🟡 Yellow (60-79%): ${yellowCount} students\n`;
  report += `- 🔴 Red (<60%): ${redCount} students\n\n`;

  report += `**Overall MC Accuracy:** ${(itemAnalysis.reduce((sum, item) => sum + item.pValue, 0) / itemAnalysis.length * 100).toFixed(1)}%\n\n`;

  // Item Analysis Snapshot
  report += '## Item Analysis Snapshot\n\n';
  report += '| Question | Difficulty | p-value | Discrimination | Top Distractor |\n';
  report += '|----------|------------|---------|----------------|----------------|\n';

  itemAnalysis
    .sort((a, b) => a.questionId.localeCompare(b.questionId))
    .forEach(item => {
      report += `| ${item.questionId} | ${item.difficulty} | ${(item.pValue * 100).toFixed(0)}% | ${item.discrimination.toFixed(2)} | ${item.topDistractor} (${item.topDistractorPercent}%) |\n`;
    });

  report += '\n';

  // Key Insights
  report += '## Key Insights\n\n';

  // Best differentiator
  const bestDiscrim = itemAnalysis.reduce((best, item) =>
    item.discrimination > (best?.discrimination || 0) ? item : best
  );
  report += `### Strongest Item\n`;
  report += `**${bestDiscrim.questionId}** has the highest discrimination (${bestDiscrim.discrimination.toFixed(3)}), making it the best differentiator between high and low performers.\n\n`;

  // Weakest items
  const weakItems = itemAnalysis.filter(item => item.discrimination < 0.3);
  if (weakItems.length > 0) {
    report += `### Items Needing Review\n`;
    weakItems.forEach(item => {
      report += `- **${item.questionId}:** Low discrimination (${item.discrimination.toFixed(2)}) - too easy (${(item.pValue * 100).toFixed(0)}% correct)\n`;
    });
    report += '\n';
  }

  // Top 3 Misconceptions
  report += '## Top Misconceptions\n\n';

  misconceptions.slice(0, 3).forEach((miscon, idx) => {
    report += `### ${idx + 1}. ${miscon.title}\n\n`;
    report += `**What students chose:** ${miscon.misconception}\n\n`;
    report += `**Frequency:** ${miscon.frequency}\n\n`;
    report += `**Evidence:** ${miscon.evidence}\n\n`;

    // Teaching note
    if (miscon.title.includes('Q02')) {
      report += `**Teaching Note:** This indicates confusion about z-score to proportion conversion. Students likely misunderstand how to use the normal table or confuse the z-score value with the proportion.\n\n`;
      report += `**Recommended Action:** Mini-lesson on Table A usage, emphasizing that the table value IS the proportion below for a given z-score.\n\n`;
    } else if (miscon.title.includes('Q03')) {
      report += `**Teaching Note:** Students may struggle with extreme value probabilities or tail areas of the normal distribution.\n\n`;
    } else {
      report += `**Teaching Note:** Review fundamental concepts and provide targeted practice.\n\n`;
    }
  });

  // Weak Skills Across Unit
  report += '## Weak Skills (Unit 1 Overall)\n\n';
  report += 'Based on performance across all Unit 1 lessons:\n\n';

  weakSkills.forEach(skill => {
    report += `- **${skill.skillName}:** ${skill.studentsStruggling}/${skill.totalStudents} students struggling (${skill.strugglingPercent}%)\n`;
  });

  report += '\n';

  // Recommended Mini-Lessons
  report += '## Recommended Mini-Lessons\n\n';

  report += '### 1. Z-Score to Proportion Conversion (Q02 Misconception)\n';
  report += '**Duration:** 12 minutes\n\n';
  report += '**Objectives:**\n';
  report += '- Correctly use Table A to find proportions\n';
  report += '- Distinguish "below" (use table directly) from "above" (subtract from 1)\n\n';
  report += '**Materials:** Normal table, practice problems\n\n';
  report += '**See:** `interventions/mini-lesson-Q02.md` for complete lesson plan\n\n';

  report += '### 2. CR Completion Blitz (Low Response Rates)\n';
  report += '**Duration:** 10-12 minutes\n\n';
  report += '**Objectives:**\n';
  report += '- Complete missing Q04 (histogram) and Q06 (z-scores) responses\n';
  report += '- Build CR confidence\n\n';
  report += '**See:** `interventions/CR-blitz-plan.md` for implementation\n\n';

  if (weakSkills.length > 0) {
    const topWeakSkill = weakSkills[0];
    report += `### 3. ${topWeakSkill.skillName} Review\n`;
    report += `**Rationale:** ${topWeakSkill.strugglingPercent}% of students struggling across Unit 1\n\n`;
    report += '**Suggested Activities:**\n';
    report += '- Reteach core concepts with new examples\n';
    report += '- Pair work with mixed-ability partners\n';
    report += '- Formative exit ticket to assess improvement\n\n';
  }

  // Exit Ticket Bank
  report += '## Exit Ticket Bank\n\n';

  report += '### Quick Check: Normal Distribution (5 mins)\n';
  report += '1. Calculate the z-score for x = 52 given μ = 48, σ = 2\n';
  report += '2. What proportion of values fall below z = 1.5?\n';
  report += '3. Interpret your answer to #2 in context\n\n';

  report += '### Quick Check: Distribution Description (5 mins)\n';
  report += '1. Describe the shape of this distribution: [provide histogram]\n';
  report += '2. Estimate the center\n';
  report += '3. Would mean or median be higher? Why?\n\n';

  report += '**Full exit ticket questions available in:** `interventions/exit-ticket-Q02.csv`\n\n';

  // Student Groups Needing Support
  report += '## Students Needing Support\n\n';

  const redStudents = trafficLight.filter(s => s.mcStatus === 'red');
  const yellowStudents = trafficLight.filter(s => s.mcStatus === 'yellow');

  if (redStudents.length > 0) {
    report += '### Priority (Red - <60%)\n';
    redStudents.forEach(s => {
      report += `- **${s.studentName}** (${s.username})\n`;
      report += `  - See: \`reports/students/${s.username}-brief.md\` for personalized plan\n`;
    });
    report += '\n';
  }

  if (yellowStudents.length > 0) {
    report += '### Monitor (Yellow - 60-79%)\n';
    yellowStudents.forEach(s => {
      report += `- **${s.studentName}** (${s.username})\n`;
    });
    report += '\n';
  }

  // Next Steps
  report += '## Immediate Next Steps\n\n';
  report += '1. **This Week:**\n';
  report += '   - Run CR Blitz to collect missing Q04/Q06 responses\n';
  report += '   - Deliver Q02 mini-lesson on z-score → proportion\n';
  report += '   - Meet with red-light students (1:1 or small group)\n\n';

  report += '2. **Next Week:**\n';
  report += '   - Exit ticket to assess Q02 misconception fix\n';
  report += '   - Begin Unit 2 with confidence, knowing Unit 1 gaps are being addressed\n';
  report += '   - Continue monitoring yellow students\n\n';

  report += '3. **Ongoing:**\n';
  report += '   - Spiral review of normal distribution concepts throughout Unit 2-3\n';
  report += '   - Emphasize CR completion expectations\n';
  report += '   - Track mastery trends (see `reports/trends-summary.md`)\n\n';

  // Resources
  report += '## Available Resources\n\n';
  report += '- **Intervention Plans:** `/interventions/` directory\n';
  report += '- **Student Briefs:** `/reports/students/` directory\n';
  report += '- **Data Files:**\n';
  report += '  - `L10-item-analysis.csv` - Question metrics\n';
  report += '  - `mastery-by-student-skill.csv` - Skill-level performance\n';
  report += '  - `class-heatmap.csv` - Visual skill overview\n';
  report += '  - `weak-skills.csv` - Class-wide skill gaps\n\n';

  report += '---\n\n';
  report += '*Generated by AP Stats Analysis Pipeline - Phase 8*';

  return report;
}

function runPhase8ClassReport() {
  console.log('=== Phase 8: Class Report ===\n');

  console.log('Generating comprehensive class report...');
  const report = generateClassReport();

  const reportsDir = path.join(__dirname, '../reports');
  fs.writeFileSync(
    path.join(reportsDir, 'class-report.md'),
    report
  );

  console.log('\n✅ Phase 8 Class Report Complete!');
  console.log('   - class-report.md');
  console.log(`   - ${report.split('\n').length} lines generated`);

  return report;
}

// Run if called directly
if (require.main === module) {
  runPhase8ClassReport();
}

module.exports = { runPhase8ClassReport, generateClassReport };
