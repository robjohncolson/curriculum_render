const fs = require('fs');
const path = require('path');

/**
 * Phase 8: Student Brief Generator
 * Creates personalized 120-180 word feedback reports for each student
 */

function loadMastery() {
  const masteryPath = path.join(__dirname, '../reports/mastery-by-student-skill.csv');
  const content = fs.readFileSync(masteryPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const mastery = {};

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const username = parts[1];

    if (!mastery[username]) {
      mastery[username] = {
        studentName: parts[0],
        skills: {}
      };
    }

    const skill = parts[2];
    mastery[username].skills[skill] = {
      correct: parseInt(parts[4]),
      total: parseInt(parts[5]),
      percentage: parseFloat(parts[6]),
      reliability: parts[7]
    };
  }

  return mastery;
}

function loadL10Subscores() {
  const subscoresPath = path.join(__dirname, '../reports/L10-student-subscores.csv');
  const content = fs.readFileSync(subscoresPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const subscores = {};

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const username = parts[1];
    subscores[username] = {
      studentName: parts[0],
      mcScore: parts[3],
      mcPercent: parseFloat(parts[4])
    };
  }

  return subscores;
}

// Unit 1 topic names from units.js
const UNIT1_TOPICS = {
  '1-1': 'Introducing Statistics: What Can We Learn from Data?',
  '1-2': 'The Language of Variation: Variables',
  '1-3': 'Representing a Categorical Variable with Tables',
  '1-4': 'Representing a Categorical Variable with Graphs',
  '1-5': 'Representing a Quantitative Variable with Graphs',
  '1-6': 'Describing the Distribution of a Quantitative Variable',
  '1-7': 'Summary Statistics for a Quantitative Variable',
  '1-8': 'Graphical Representations of Summary Statistics',
  '1-9': 'Comparing Distributions of a Quantitative Variable',
  '1-10': 'The Normal Distribution'
};

function identifyStrengths(mastery) {
  const skills = Object.entries(mastery.skills);
  const strengths = skills
    .filter(([, data]) => data.percentage >= 80 && data.total >= 3)
    .sort((a, b) => b[1].percentage - a[1].percentage)
    .slice(0, 2);

  return strengths.map(([skill]) => skill);
}

function identifyWeaknesses(mastery) {
  const skills = Object.entries(mastery.skills);
  const weaknesses = skills
    .filter(([, data]) => data.percentage < 60 && data.total >= 2)
    .sort((a, b) => a[1].percentage - b[1].percentage)
    .slice(0, 2);

  return weaknesses.map(([skill]) => skill);
}

function skillToTopicMapping(skill) {
  const mapping = {
    'SHAPE': ['1-6', '1-9'],
    'CENTER': ['1-7', '1-9'],
    'SPREAD': ['1-7', '1-9'],
    'DISPLAYS': ['1-5', '1-8'],
    'COMPARISON': ['1-9'],
    'NORMAL': ['1-10'],
    'Z_SCORES': ['1-10'],
    'Z_TO_PROP': ['1-10'],
    'EMPIRICAL': ['1-10'],
    'CONTEXT': ['1-1', '1-6'],
    'VARIABLES': ['1-2'],
    'PARAMETERS': ['1-10']
  };

  return mapping[skill] || ['1-1'];
}

function skillToName(skill) {
  const names = {
    'SHAPE': 'distribution shapes',
    'CENTER': 'measures of center',
    'SPREAD': 'measures of spread',
    'DISPLAYS': 'statistical displays',
    'COMPARISON': 'comparing distributions',
    'NORMAL': 'normal distribution',
    'Z_SCORES': 'z-score calculations',
    'Z_TO_PROP': 'z-scores to proportions',
    'EMPIRICAL': 'empirical rule',
    'CONTEXT': 'interpretation in context',
    'VARIABLES': 'variable types',
    'PARAMETERS': 'parameters vs statistics'
  };

  return names[skill] || skill;
}

function generateStudentBrief(username, mastery, l10Data) {
  const studentName = mastery.studentName;
  const strengths = identifyStrengths(mastery);
  const weaknesses = identifyWeaknesses(mastery);

  let brief = '';

  // Opening strength statement (1-2 sentences)
  if (strengths.length > 0) {
    const strengthNames = strengths.map(skillToName).join(' and ');
    const l10Performance = l10Data?.mcPercent >= 80 ? ' and strong performance on L10' : '';
    brief += `You demonstrate solid understanding of ${strengthNames}${l10Performance}. `;
  } else if (l10Data?.mcPercent >= 60) {
    brief += `You show developing skills in Unit 1 concepts with ${l10Data.mcScore} correct on L10. `;
  } else {
    brief += `You're building foundational skills in Unit 1 statistics. `;
  }

  // Priority skill needing work (1-2 sentences)
  if (weaknesses.length > 0) {
    const prioritySkill = weaknesses[0];
    const priorityName = skillToName(prioritySkill);
    const percentage = mastery.skills[prioritySkill]?.percentage || 0;

    brief += `Your performance on ${priorityName} (${percentage}% correct) indicates this as a priority area for growth. `;

    // Concrete next step
    if (prioritySkill === 'Z_TO_PROP') {
      brief += `Focus on practicing z-score to proportion conversions using the normal table, paying close attention to "below" vs "above" language. `;
    } else if (prioritySkill === 'Z_SCORES') {
      brief += `Work on calculating z-scores using the formula z = (x - μ) / σ and interpreting what they represent. `;
    } else if (prioritySkill === 'DISPLAYS') {
      brief += `Practice creating and interpreting histograms and boxplots, focusing on what each display reveals about the data. `;
    } else if (prioritySkill === 'SHAPE') {
      brief += `Strengthen your ability to describe distribution shapes (symmetric, skewed left/right) and what they indicate. `;
    } else {
      brief += `Review the fundamentals of ${priorityName} and complete targeted practice problems. `;
    }

    // Linked topics
    const topics = skillToTopicMapping(prioritySkill).slice(0, 2);
    const topicNames = topics.map(t => `**Topic ${t}: ${UNIT1_TOPICS[t]}**`).join(' and ');
    brief += `Review ${topicNames} for targeted support.`;
  } else {
    // No clear weaknesses - encourage next level
    brief += `Continue building on your foundation by attempting more challenging constructed response questions. `;

    const topics = strengths.length > 0
      ? skillToTopicMapping(strengths[0]).slice(0, 2)
      : ['1-9', '1-10'];

    const topicNames = topics.map(t => `**Topic ${t}: ${UNIT1_TOPICS[t]}**`).join(' and ');
    brief += `Deepen your understanding with ${topicNames}.`;
  }

  return brief;
}

function runPhase8StudentBriefs() {
  console.log('=== Phase 8: Student Briefs ===\n');

  // Load data
  console.log('Loading mastery data...');
  const allMastery = loadMastery();

  console.log('Loading L10 subscores...');
  const l10Data = loadL10Subscores();

  // Filter to Period B students only (those with L10 data)
  const periodBStudents = Object.keys(l10Data);

  console.log(`Generating briefs for ${periodBStudents.length} Period B students...\n`);

  const briefs = [];
  const reportsDir = path.join(__dirname, '../reports');
  const studentDir = path.join(reportsDir, 'students');

  // Create students directory if it doesn't exist
  if (!fs.existsSync(studentDir)) {
    fs.mkdirSync(studentDir, { recursive: true });
  }

  periodBStudents.forEach(username => {
    const mastery = allMastery[username];
    const l10 = l10Data[username];

    if (!mastery) {
      console.log(`⚠️  No mastery data for ${username}, skipping...`);
      return;
    }

    const brief = generateStudentBrief(username, mastery, l10);
    const wordCount = brief.split(' ').length;

    briefs.push({
      studentName: mastery.studentName,
      username,
      brief,
      wordCount
    });

    // Write individual file
    const briefMd = `# Student Brief: ${mastery.studentName}\n\n`;
    const content = briefMd + `**Username:** ${username}\n**L10 Performance:** ${l10.mcScore} (${l10.mcPercent}%)\n\n---\n\n${brief}\n`;

    fs.writeFileSync(
      path.join(studentDir, `${username}-brief.md`),
      content
    );

    console.log(`✓ ${mastery.studentName} (${wordCount} words)`);
  });

  // Generate summary CSV
  let csvContent = 'studentName,username,l10Performance,wordCount,brief\n';
  briefs.forEach(b => {
    const l10 = l10Data[b.username];
    const briefEscaped = b.brief.replace(/"/g, '""');
    csvContent += `${b.studentName},${b.username},${l10.mcScore},${b.wordCount},"${briefEscaped}"\n`;
  });

  fs.writeFileSync(
    path.join(reportsDir, 'student-briefs-summary.csv'),
    csvContent
  );

  console.log(`\n✅ Phase 8 Student Briefs Complete!`);
  console.log(`   - ${briefs.length} individual .md files in reports/students/`);
  console.log(`   - student-briefs-summary.csv`);
  console.log(`   - Average word count: ${(briefs.reduce((sum, b) => sum + b.wordCount, 0) / briefs.length).toFixed(0)} words`);

  return briefs;
}

// Run if called directly
if (require.main === module) {
  runPhase8StudentBriefs();
}

module.exports = { runPhase8StudentBriefs, generateStudentBrief };
