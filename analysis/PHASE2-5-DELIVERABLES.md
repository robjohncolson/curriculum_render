# Phase 2-5 Deliverables Index

**Project:** AP Statistics Period B Unit 1 Analysis Pipeline
**Phases Completed:** Phase 2-5 (Roster Resolution → Item Analysis)
**Date:** October 9, 2025
**Status:** ✅ COMPLETE

---

## 📋 Quick Start

**Read these first:**
1. `PHASE2-5-SUMMARY.md` ⭐ - Complete implementation summary
2. `reports/L10-traffic-light.csv` - Student performance at-a-glance
3. `reports/L10-item-analysis.csv` - Question difficulty and discrimination

---

## 📁 All Generated Files (14 total)

### Phase 2: Roster Resolution (4 files)

1. **data.json**
   - Resolved roster with primary usernames
   - Username lookup table (26 usernames → students)
   - Period B/E tags for all students

2. **phase2-report.json**
   - Stats: 24 students, 8 Period B, 16 Period E
   - Validation results
   - Alias consolidation summary

3. **phase2-period-assignments.csv** ⭐
   - Student roster with assignments
   - Columns: studentName, primaryUsername, aliases, period, l10Attempts, l10Questions
   - **Use this for Period B student list**

4. **phase2-alias-consolidation.md**
   - Shared username resolutions (1 case)
   - Student alias mappings (3 students)
   - Decision rationale for each case

---

### Phase 3: Attempt Consolidation (3 files)

5. **answers-consolidated.json**
   - All Unit 1 consolidated answers (618 records)
   - Latest attempt per student×question
   - Includes primary username mapping

6. **L10-answers-latest.json**
   - L10-only subset (55 records)
   - Ready for item analysis
   - 8 questions covered

7. **phase3-duplicates-report.md**
   - Before/after statistics (688 → 628)
   - 60 duplicates removed
   - Examples of consolidation decisions

---

### Phase 4: Scoring and Triage (3 files)

8. **L10-MC-scored.csv** ⭐
   - All 51 MC responses with correctness
   - Columns: primaryUsername, studentName, period, questionId, answerValue, correctAnswer, isCorrect
   - **Use this for MC performance analysis**

9. **L10-CR-triage.csv**
   - 4 CR responses with triage buckets
   - Columns: primaryUsername, studentName, questionId, triageBucket, triageScore, needsReview
   - Keyword matches and confidence levels

10. **L10-CR-calibration-pack.md** ⭐
    - 4 sample responses for manual scoring
    - Includes rubric references
    - **ACTION REQUIRED:** Score these to validate triage

---

### Phase 5: Item Analysis (4 files)

11. **L10-item-analysis.csv** ⭐
    - Psychometric analysis for 6 MC questions
    - Columns: questionId, n, pValue, difficulty, discrimination, topDistractor
    - **Use this for item quality assessment**

12. **L10-misconceptions.md**
    - Top 3 misconceptions with evidence
    - Q02: 33% selected B instead of A (most significant)
    - Q03: 22% selected D instead of A
    - Q01: 20% selected B instead of D

13. **L10-student-subscores.csv** ⭐
    - Individual student performance (8 Period B students)
    - Columns: studentName, primaryUsername, mcScore, mcPercent, mcTraffic, q04Score, q06Score
    - **Use this for individual student reports**

14. **L10-traffic-light.csv** ⭐ **MOST IMPORTANT**
    - Quick visual performance summary
    - Columns: studentName, primaryUsername, MC, Q04_Histogram, Q06_ZScores
    - Traffic light values: green/yellow/red/gray
    - **Use this for at-a-glance class status**

---

## 🎯 Key Statistics

| Metric | Value |
|--------|-------|
| **Period B Students** | 8 |
| **L10 Attempts** | 55 total |
| **MC Responses** | 51 (6 questions) |
| **CR Responses** | 4 (2 questions) |
| **Duplicates Removed** | 60 |
| **MC Accuracy** | 74.5% (38/51 correct) |
| **Students Green** | 5 (≥80%) |
| **Students Yellow** | 1 (60-79%) |
| **Students Red** | 2 (<60%) |

---

## 📊 Item Analysis Summary

### Difficulty Distribution
- **Easy:** 4 questions (Q01, Q05, Q07, Q08) - p > 0.70
- **Medium:** 2 questions (Q02, Q03) - p = 0.67

### Discrimination Quality
- **Excellent:** Q02 (0.825) - best differentiator
- **Good:** Q07, Q08 (0.785)
- **Adequate:** Q03 (0.516)
- **Marginal:** Q01, Q05 (0.232-0.258) - too easy, less discriminating

### Top Misconceptions
1. **Q02 (33%):** Z-score to proportion conversion
2. **Q03 (22%):** Extreme value probability
3. **Q01 (20%):** Parameter notation confusion

---

## 📈 Student Performance Breakdown

### High Performers (Green - 5 students)
- edgar (apple_monkey): 100% MC
- Justin (apricot_horse): 100% MC
- francois (apricot_horse): 100% MC
- Ana (papaya_eagle): 83% MC
- Keily (apricot_fox): 83% MC

### Medium Performers (Yellow - 1 student)
- Hazel (apple_rabbit): 67% MC, attempted Q04 (50%)

### Struggling (Red - 2 students)
- Janelle (mango_panda): 50% MC, attempted Q04 (75%)
- Gabriella (guava_cat): 50% MC, no CR

---

## ⚠️ Critical Findings

### 🔴 Low CR Completion Rates
- **Q04 (Histogram):** 3/8 students (38%)
- **Q06 (Z-scores):** 1/8 students (13%)

**Implications:**
- Most students not attempting constructed response
- Cannot fully assess histogram/z-score skills
- May indicate time pressure or question clarity issues

**Recommendation:** Investigate barriers to CR completion

### 🔴 Significant Distractor (Q02)
- 33% of students selected B instead of A
- Suggests systematic misconception about normal proportions
- Warrants targeted intervention

---

## 🎯 Recommended Actions

### Immediate (Next Class)
1. **Mini-lesson:** Q02 misconception (z-score → proportion)
   - Focus on normal table usage
   - Practice converting z-scores to proportions

2. **Check-in:** Meet with red-light students
   - Janelle (mango_panda)
   - Gabriella (guava_cat)

### Short-term (This Week)
1. **CR Completion Investigation:**
   - Survey students about Q04/Q06 barriers
   - Consider time allocation or question format

2. **Practice Problems:**
   - Additional normal distribution exercises
   - Focus on Q02-type problems (proportion calculations)

3. **Manual CR Calibration:**
   - Score `L10-CR-calibration-pack.md` responses
   - Validate triage accuracy

---

## 🔄 Data Flow

```
Phase 0-1 normalized-data.json
         ↓
Phase 2: Roster resolution → data.json, period assignments
         ↓
Phase 3: Consolidation → L10-answers-latest.json (55 records)
         ↓
Phase 4: Scoring → L10-MC-scored.csv (51), L10-CR-triage.csv (4)
         ↓
Phase 5: Analysis → item-analysis.csv, student-subscores.csv, traffic-light.csv
```

---

## 📞 Files for Specific Use Cases

### For Teacher Dashboard
- `L10-traffic-light.csv` - Quick class overview
- `L10-misconceptions.md` - What to address in class

### For Item Analysis
- `L10-item-analysis.csv` - Question quality metrics
- `L10-MC-scored.csv` - All individual responses

### For Student Reports
- `L10-student-subscores.csv` - Individual performance
- `phase2-period-assignments.csv` - Student roster

### For Intervention Planning
- `L10-misconceptions.md` - Top 3 errors
- `L10-student-subscores.csv` - Students needing help (filter red/yellow)

### For Quality Assurance
- `phase3-duplicates-report.md` - Data consolidation
- `phase2-alias-consolidation.md` - Roster resolution decisions

---

## ✅ Validation Checklist

- [x] All 8 Period B students appear in results
- [x] No Period E students in L10 data
- [x] No duplicate student×question combinations
- [x] All MC questions (6) analyzed
- [x] Discrimination values computed
- [x] Misconceptions identified with evidence
- [x] Traffic light assigned to all students
- [x] CR triage completed for all responses

---

## 🚀 Running the Pipeline

```bash
cd analysis
node phase2-5-pipeline.js
```

**Prerequisites:** Phase 0-1 complete
**Runtime:** ~2-3 seconds
**Output:** 14 files in `reports/` directory

---

## 📚 Additional Documentation

- `PHASE2-5-SUMMARY.md` - Detailed implementation notes
- `PHASE0-1-SUMMARY.md` - Previous phases summary
- `README.md` - Quick start guide
- `DELIVERABLES-INDEX.md` - Phase 0-1 deliverables

---

**Status:** ✅ Phase 2-5 Complete - Ready for Phases 6-12 or manual CR calibration

*Last Updated: October 9, 2025*
