const fs = require('fs');
const path = require('path');

/**
 * Phase 7: Cohort Mastery Analysis
 * Calculate per-skill mastery for each student across entire Unit 1
 */

function loadConsolidatedAnswers() {
  const answersPath = path.join(__dirname, '../reports/answers-consolidated.json');
  return JSON.parse(fs.readFileSync(answersPath, 'utf-8'));
}

function loadSkillMap() {
  const skillMapPath = path.join(__dirname, '../reports/skill-map.json');
  return JSON.parse(fs.readFileSync(skillMapPath, 'utf-8'));
}

function loadMCScored() {
  // Load from Phase 4 output
  const scoredPath = path.join(__dirname, '../reports/L10-MC-scored.csv');
  const content = fs.readFileSync(scoredPath, 'utf-8');

  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');

  const scored = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    scored.push({
      primaryUsername: values[0],
      studentName: values[1],
      period: values[2],
      questionId: values[3],
      answerValue: values[4],
      correctAnswer: values[5],
      isCorrect: values[6] === 'correct'
    });
  }

  return scored;
}

function calculateStudentSkillMastery(studentUsername, allAnswers, skillMap) {
  const skillMastery = {};

  // Get student's answers
  const studentAnswers = allAnswers.filter(a => a.primaryUsername === studentUsername);

  // For each answer, find associated skills
  studentAnswers.forEach(answer => {
    const mapping = skillMap.mappings.find(m => m.questionId === answer.questionId);

    if (!mapping) return;

    mapping.skills.forEach(skill => {
      if (!skillMastery[skill]) {
        skillMastery[skill] = {
          correct: 0,
          total: 0,
          questions: []
        };
      }

      skillMastery[skill].total++;
      skillMastery[skill].questions.push(answer.questionId);

      // Check if correct (for MC)
      if (answer.isCorrect === true || answer.isCorrect === 'correct') {
        skillMastery[skill].correct++;
      } else if (answer.answerKey && answer.answerValue) {
        // Fallback: check answer key
        if (answer.answerValue.toUpperCase() === answer.answerKey.toUpperCase()) {
          skillMastery[skill].correct++;
        }
      }
    });
  });

  // Calculate percentages and reliability
  Object.keys(skillMastery).forEach(skill => {
    const { correct, total } = skillMastery[skill];
    skillMastery[skill].percentage = total > 0 ? (correct / total * 100).toFixed(1) : 0;

    // Reliability based on sample size
    if (total >= 5) {
      skillMastery[skill].reliability = 'HIGH';
    } else if (total >= 3) {
      skillMastery[skill].reliability = 'MED';
    } else {
      skillMastery[skill].reliability = 'LOW';
    }
  });

  return skillMastery;
}

function analyzeTrends(allAnswers, skillMap) {
  const earlyLessons = ['L2', 'L3', 'L4', 'L5'];
  const lateLessons = ['L8', 'L9', 'L10'];

  const trends = {};

  // Get unique students
  const students = [...new Set(allAnswers.map(a => a.primaryUsername))];

  students.forEach(student => {
    const studentAnswers = allAnswers.filter(a => a.primaryUsername === student);

    // Separate by lesson period
    const earlyAnswers = studentAnswers.filter(a => {
      const lessonMatch = a.questionId.match(/U1-L(\d+)-/);
      if (!lessonMatch) return false;
      const lesson = `L${lessonMatch[1]}`;
      return earlyLessons.includes(lesson);
    });

    const lateAnswers = studentAnswers.filter(a => {
      const lessonMatch = a.questionId.match(/U1-L(\d+)-/);
      if (!lessonMatch) return false;
      const lesson = `L${lessonMatch[1]}`;
      return lateLessons.includes(lesson);
    });

    // Calculate mastery for each period
    const earlyMastery = calculateStudentSkillMastery(student, earlyAnswers, skillMap);
    const lateMastery = calculateStudentSkillMastery(student, lateAnswers, skillMap);

    // Compare shared skills
    const sharedSkills = Object.keys(earlyMastery).filter(skill => lateMastery[skill]);

    if (sharedSkills.length > 0) {
      trends[student] = {
        studentName: studentAnswers[0]?.studentName || student,
        improvements: [],
        regressions: [],
        stable: []
      };

      sharedSkills.forEach(skill => {
        const earlyPct = parseFloat(earlyMastery[skill].percentage);
        const latePct = parseFloat(lateMastery[skill].percentage);
        const delta = latePct - earlyPct;

        if (delta > 20) {
          trends[student].improvements.push({
            skill,
            early: earlyPct,
            late: latePct,
            delta: delta.toFixed(1)
          });
        } else if (delta < -20) {
          trends[student].regressions.push({
            skill,
            early: earlyPct,
            late: latePct,
            delta: delta.toFixed(1)
          });
        } else {
          trends[student].stable.push({
            skill,
            early: earlyPct,
            late: latePct
          });
        }
      });
    }
  });

  return trends;
}

function createHeatmapData(allMastery, skillMap) {
  const skills = Object.keys(skillMap.taxonomy);
  const students = Object.keys(allMastery);

  const heatmap = [];

  students.forEach(student => {
    const row = {
      student: allMastery[student].studentName || student,
      username: student
    };

    skills.forEach(skill => {
      const mastery = allMastery[student][skill];
      if (mastery) {
        const pct = parseFloat(mastery.percentage);
        const n = mastery.total;

        // Traffic light color
        let color = 'gray';
        if (n > 0) {
          if (pct >= 80) color = 'green';
          else if (pct >= 60) color = 'yellow';
          else color = 'red';
        }

        row[skill] = {
          percentage: pct,
          n,
          color,
          reliability: mastery.reliability
        };
      } else {
        row[skill] = {
          percentage: null,
          n: 0,
          color: 'gray',
          reliability: 'NONE'
        };
      }
    });

    heatmap.push(row);
  });

  return heatmap;
}

function generateWeakSkills(heatmap, skillMap) {
  const skills = Object.keys(skillMap.taxonomy);
  const weakSkills = [];

  skills.forEach(skill => {
    let redCount = 0;
    let yellowCount = 0;
    let totalWithData = 0;

    heatmap.forEach(row => {
      const data = row[skill];
      if (data && data.n > 0) {
        totalWithData++;
        if (data.color === 'red') redCount++;
        if (data.color === 'yellow') yellowCount++;
      }
    });

    const strugglingPercent = totalWithData > 0
      ? ((redCount + yellowCount) / totalWithData * 100).toFixed(1)
      : 0;

    if (strugglingPercent >= 50) {
      weakSkills.push({
        skill,
        skillName: skillMap.taxonomy[skill].name,
        studentsStruggling: redCount + yellowCount,
        totalStudents: totalWithData,
        strugglingPercent,
        redCount,
        yellowCount
      });
    }
  });

  return weakSkills.sort((a, b) => b.strugglingPercent - a.strugglingPercent);
}

function runPhase7() {
  console.log('=== Phase 7: Cohort Mastery Analysis ===\n');

  // Load data
  console.log('Loading consolidated answers...');
  const allAnswers = loadConsolidatedAnswers();

  console.log('Loading skill map...');
  const skillMap = loadSkillMap();

  // Calculate mastery for each student
  console.log('Calculating per-student mastery...');
  const students = [...new Set(allAnswers.map(a => a.primaryUsername))];
  const allMastery = {};

  students.forEach(student => {
    allMastery[student] = {
      studentName: allAnswers.find(a => a.primaryUsername === student)?.studentName || student,
      ...calculateStudentSkillMastery(student, allAnswers, skillMap)
    };
  });

  // Analyze trends
  console.log('Analyzing trends (early vs late)...');
  const trends = analyzeTrends(allAnswers, skillMap);

  // Create heatmap
  console.log('Generating heatmap data...');
  const heatmap = createHeatmapData(allMastery, skillMap);

  // Identify weak skills
  console.log('Identifying weak skills...');
  const weakSkills = generateWeakSkills(heatmap, skillMap);

  // Generate outputs
  const reportsDir = path.join(__dirname, '../reports');

  // 1. mastery-by-student-skill.csv
  let csvContent = 'studentName,primaryUsername,skill,skillName,correct,total,percentage,reliability\n';
  Object.entries(allMastery).forEach(([username, data]) => {
    const studentName = data.studentName;
    delete data.studentName;

    Object.entries(data).forEach(([skill, mastery]) => {
      const skillName = skillMap.taxonomy[skill]?.name || skill;
      csvContent += `${studentName},${username},${skill},"${skillName}",${mastery.correct},${mastery.total},${mastery.percentage},${mastery.reliability}\n`;
    });
  });

  fs.writeFileSync(
    path.join(reportsDir, 'mastery-by-student-skill.csv'),
    csvContent
  );

  // 2. class-heatmap.csv
  const skills = Object.keys(skillMap.taxonomy);
  let heatmapCsv = 'student,username,' + skills.join(',') + '\n';

  heatmap.forEach(row => {
    let line = `${row.student},${row.username}`;
    skills.forEach(skill => {
      const data = row[skill];
      const display = data.percentage !== null
        ? `${data.color}(${data.percentage}%,n=${data.n})`
        : 'gray(N/A)';
      line += `,${display}`;
    });
    heatmapCsv += line + '\n';
  });

  fs.writeFileSync(
    path.join(reportsDir, 'class-heatmap.csv'),
    heatmapCsv
  );

  // 3. trends-summary.md
  let trendsMd = '# Unit 1 Trends Analysis: Early vs Late Performance\n\n';
  trendsMd += `**Generated:** ${new Date().toISOString()}\n\n`;
  trendsMd += '**Comparison:** L2-L5 (early) vs L8-L10 (late)\n\n';
  trendsMd += '---\n\n';

  Object.entries(trends).forEach(([username, data]) => {
    trendsMd += `## ${data.studentName} (${username})\n\n`;

    if (data.improvements.length > 0) {
      trendsMd += `### ✅ Improvements\n`;
      data.improvements.forEach(imp => {
        const skillName = skillMap.taxonomy[imp.skill]?.name || imp.skill;
        trendsMd += `- **${skillName}:** ${imp.early}% → ${imp.late}% (+${imp.delta}%)\n`;
      });
      trendsMd += '\n';
    }

    if (data.regressions.length > 0) {
      trendsMd += `### ⚠️ Regressions\n`;
      data.regressions.forEach(reg => {
        const skillName = skillMap.taxonomy[reg.skill]?.name || reg.skill;
        trendsMd += `- **${skillName}:** ${reg.early}% → ${reg.late}% (${reg.delta}%)\n`;
      });
      trendsMd += '\n';
    }

    trendsMd += '---\n\n';
  });

  fs.writeFileSync(
    path.join(reportsDir, 'trends-summary.md'),
    trendsMd
  );

  // 4. weak-skills.csv
  let weakCsv = 'skill,skillName,studentsStruggling,totalStudents,strugglingPercent,redCount,yellowCount\n';
  weakSkills.forEach(ws => {
    weakCsv += `${ws.skill},"${ws.skillName}",${ws.studentsStruggling},${ws.totalStudents},${ws.strugglingPercent},${ws.redCount},${ws.yellowCount}\n`;
  });

  fs.writeFileSync(
    path.join(reportsDir, 'weak-skills.csv'),
    weakCsv
  );

  console.log('\n✅ Phase 7 Complete!');
  console.log(`   - mastery-by-student-skill.csv (${Object.keys(allMastery).length} students)`);
  console.log(`   - class-heatmap.csv (${heatmap.length} rows)`);
  console.log(`   - trends-summary.md (${Object.keys(trends).length} students analyzed)`);
  console.log(`   - weak-skills.csv (${weakSkills.length} skills identified)`);

  return { allMastery, trends, heatmap, weakSkills };
}

// Run if called directly
if (require.main === module) {
  runPhase7();
}

module.exports = { runPhase7, calculateStudentSkillMastery };
