const fs = require('fs');
const path = require('path');
const {
  SKILL_TAXONOMY,
  SKILL_KEYWORDS,
  MANUAL_SKILL_OVERRIDES,
  LESSON_TO_TOPICS
} = require('../config/skill-taxonomy');

/**
 * Phase 6: Skill Tagging Across Unit 1
 * Maps all U1 questions to AP Stats skills for granular mastery tracking
 */

function loadCurriculum() {
  const curriculumPath = path.join(__dirname, '../../data/curriculum.js');
  const content = fs.readFileSync(curriculumPath, 'utf-8');

  // Extract the array content - handle both with and without semicolon
  let match = content.match(/const EMBEDDED_CURRICULUM = (\[[\s\S]*\]);/);
  if (!match) {
    // Try without semicolon
    match = content.match(/const EMBEDDED_CURRICULUM = (\[[\s\S]*\])/);
  }

  if (!match) {
    throw new Error('Could not parse curriculum.js');
  }

  return JSON.parse(match[1]);
}

function detectSkillsFromText(text) {
  const detectedSkills = new Set();
  const lowerText = text.toLowerCase();

  // Check each skill's keywords
  Object.entries(SKILL_KEYWORDS).forEach(([skill, keywords]) => {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        detectedSkills.add(skill);
        break; // Found a match for this skill, move to next
      }
    }
  });

  return Array.from(detectedSkills);
}

function mapQuestionToSkills(question) {
  const { id, prompt, type } = question;

  // Check for manual override first
  if (MANUAL_SKILL_OVERRIDES[id]) {
    return {
      questionId: id,
      skills: MANUAL_SKILL_OVERRIDES[id],
      method: 'manual_override',
      confidence: 'high'
    };
  }

  // Auto-detect from prompt
  const detectedSkills = detectSkillsFromText(prompt);

  // Special handling for constructed response
  if (type === 'constructed-response') {
    // CR questions typically assess multiple skills
    if (detectedSkills.length === 0) {
      detectedSkills.push('CONTEXT'); // All CR require context
    } else if (!detectedSkills.includes('CONTEXT')) {
      detectedSkills.push('CONTEXT');
    }
  }

  // Default to CONTEXT if no skills detected
  if (detectedSkills.length === 0) {
    detectedSkills.push('CONTEXT');
  }

  return {
    questionId: id,
    skills: detectedSkills,
    method: 'auto_detect',
    confidence: detectedSkills.length > 0 ? 'medium' : 'low'
  };
}

function generateSkillMap(curriculum) {
  const skillMap = [];
  const unit1Questions = curriculum.filter(q => q.id.startsWith('U1-'));

  console.log(`Found ${unit1Questions.length} Unit 1 questions to map`);

  unit1Questions.forEach(question => {
    const mapping = mapQuestionToSkills(question);
    skillMap.push(mapping);
  });

  return skillMap;
}

function validateSkillMap(skillMap) {
  const stats = {
    total: skillMap.length,
    manualOverrides: 0,
    autoDetected: 0,
    multiSkill: 0,
    singleSkill: 0,
    skillDistribution: {}
  };

  // Initialize skill distribution
  Object.keys(SKILL_TAXONOMY).forEach(skill => {
    stats.skillDistribution[skill] = 0;
  });

  skillMap.forEach(mapping => {
    // Count methods
    if (mapping.method === 'manual_override') {
      stats.manualOverrides++;
    } else {
      stats.autoDetected++;
    }

    // Count skill counts
    if (mapping.skills.length > 1) {
      stats.multiSkill++;
    } else {
      stats.singleSkill++;
    }

    // Count skill distribution
    mapping.skills.forEach(skill => {
      if (stats.skillDistribution[skill] !== undefined) {
        stats.skillDistribution[skill]++;
      }
    });
  });

  stats.coveragePercent = (stats.total / stats.total * 100).toFixed(1);

  return stats;
}

function generateSkillCoverage(skillMap, curriculum) {
  const lessons = {};

  // Get unique lessons
  curriculum
    .filter(q => q.id.startsWith('U1-'))
    .forEach(q => {
      const lessonMatch = q.id.match(/U1-L(\d+)-/);
      if (lessonMatch) {
        const lesson = `L${lessonMatch[1]}`;
        if (!lessons[lesson]) {
          lessons[lesson] = new Set();
        }
      }
    });

  // Map skills to lessons
  skillMap.forEach(mapping => {
    const lessonMatch = mapping.questionId.match(/U1-L(\d+)-/);
    if (lessonMatch) {
      const lesson = `L${lessonMatch[1]}`;
      mapping.skills.forEach(skill => {
        if (lessons[lesson]) {
          lessons[lesson].add(skill);
        }
      });
    }
  });

  // Convert sets to arrays and count
  const coverage = [];
  Object.entries(lessons).forEach(([lesson, skillSet]) => {
    const skillArray = Array.from(skillSet);
    coverage.push({
      lesson,
      skills: skillArray,
      skillCount: skillArray.length,
      topics: LESSON_TO_TOPICS[lesson] || []
    });
  });

  return coverage.sort((a, b) => {
    const aNum = parseInt(a.lesson.replace('L', ''));
    const bNum = parseInt(b.lesson.replace('L', ''));
    return aNum - bNum;
  });
}

function createHumanReadableReport(skillMap, stats, coverage) {
  let report = '# Unit 1 Skill Mapping Report\n\n';
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += '---\n\n';

  // Summary stats
  report += '## Summary Statistics\n\n';
  report += `- **Total Questions Mapped:** ${stats.total}\n`;
  report += `- **Manual Overrides:** ${stats.manualOverrides}\n`;
  report += `- **Auto-Detected:** ${stats.autoDetected}\n`;
  report += `- **Multi-Skill Questions:** ${stats.multiSkill}\n`;
  report += `- **Single-Skill Questions:** ${stats.singleSkill}\n`;
  report += `- **Coverage:** ${stats.coveragePercent}%\n\n`;

  // Skill distribution
  report += '## Skill Distribution\n\n';
  report += '| Skill | Count | Percentage |\n';
  report += '|-------|-------|------------|\n';

  const sortedSkills = Object.entries(stats.skillDistribution)
    .sort(([,a], [,b]) => b - a);

  sortedSkills.forEach(([skill, count]) => {
    const pct = ((count / stats.total) * 100).toFixed(1);
    const skillName = SKILL_TAXONOMY[skill]?.name || skill;
    report += `| ${skillName} | ${count} | ${pct}% |\n`;
  });

  report += '\n---\n\n';

  // Lesson coverage
  report += '## Skill Coverage by Lesson\n\n';
  coverage.forEach(({ lesson, skills, topics }) => {
    report += `### ${lesson}\n`;
    report += `**Topics:** ${topics.join(', ')}\n\n`;
    report += `**Skills Covered (${skills.length}):**\n`;
    skills.forEach(skill => {
      const skillName = SKILL_TAXONOMY[skill]?.name || skill;
      report += `- ${skillName} (${skill})\n`;
    });
    report += '\n';
  });

  report += '---\n\n';

  // Sample mappings
  report += '## Sample Question Mappings\n\n';

  // L10 questions (spotlight)
  const l10Questions = skillMap.filter(m => m.questionId.includes('L10'));
  if (l10Questions.length > 0) {
    report += '### Lesson 10 (Spotlight)\n\n';
    l10Questions.forEach(mapping => {
      report += `**${mapping.questionId}:**\n`;
      mapping.skills.forEach(skill => {
        const skillName = SKILL_TAXONOMY[skill]?.name || skill;
        report += `- ${skillName}\n`;
      });
      report += `*Method: ${mapping.method}, Confidence: ${mapping.confidence}*\n\n`;
    });
  }

  return report;
}

function runPhase6() {
  console.log('=== Phase 6: Skill Tagging ===\n');

  // Load curriculum
  console.log('Loading curriculum...');
  const curriculum = loadCurriculum();

  // Generate skill map
  console.log('Generating skill mappings...');
  const skillMap = generateSkillMap(curriculum);

  // Validate
  console.log('Validating mappings...');
  const stats = validateSkillMap(skillMap);

  // Generate coverage
  console.log('Analyzing coverage...');
  const coverage = generateSkillCoverage(skillMap, curriculum);

  // Create outputs
  const reportsDir = path.join(__dirname, '../reports');

  // 1. skill-map.json
  const skillMapJson = {
    generated: new Date().toISOString(),
    metadata: {
      totalQuestions: stats.total,
      manualOverrides: stats.manualOverrides,
      autoDetected: stats.autoDetected
    },
    mappings: skillMap,
    taxonomy: SKILL_TAXONOMY
  };

  fs.writeFileSync(
    path.join(reportsDir, 'skill-map.json'),
    JSON.stringify(skillMapJson, null, 2)
  );

  // 2. skill-map.md
  const report = createHumanReadableReport(skillMap, stats, coverage);
  fs.writeFileSync(
    path.join(reportsDir, 'skill-map.md'),
    report
  );

  // 3. skill-coverage.csv
  let csvContent = 'lesson,skillCount,skills,topics\n';
  coverage.forEach(({ lesson, skills, skillCount, topics }) => {
    csvContent += `${lesson},${skillCount},"${skills.join('; ')}","${topics.join('; ')}"\n`;
  });

  fs.writeFileSync(
    path.join(reportsDir, 'skill-coverage.csv'),
    csvContent
  );

  console.log('\n✅ Phase 6 Complete!');
  console.log(`   - skill-map.json (${skillMap.length} mappings)`);
  console.log(`   - skill-map.md (human-readable)`);
  console.log(`   - skill-coverage.csv (${coverage.length} lessons)`);
  console.log(`\nStats: ${stats.total} questions, ${stats.manualOverrides} manual, ${stats.autoDetected} auto-detected`);

  return { skillMap, stats, coverage };
}

// Run if called directly
if (require.main === module) {
  runPhase6();
}

module.exports = { runPhase6, mapQuestionToSkills, generateSkillMap };
