# Invalid Records Report

**Generated:** October 9, 2025
**Pipeline:** Phase 0 & 1 - Data Ingestion and Normalization
**Total Invalid Records:** 22 out of 710 (3.1%)

---

## Summary

All 22 invalid records failed due to **invalid question ID format**. The expected format is `U{unit}-L{lesson}-Q{question}` (e.g., `U1-L10-Q01`).

### Categories of Invalid Records

| Category | Count | Description |
|----------|-------|-------------|
| **Test Records** | 7 | Records with `test_` usernames and test question IDs |
| **Progress Check (PC)** | 4 | Question IDs with `-PC-` format (not matching expected pattern) |
| **Unit 9 Format** | 3 | Question IDs with `-MCQ-` or `-FRQ-` suffixes |
| **Malformed IDs** | 1 | Simple `q1` format |
| **Other** | 7 | Various other format issues |

---

## Detailed Record List

### Test Records (7 records)

These are test/verification records that should be excluded from analysis:

| ID | Username | Question ID | Issue |
|----|----------|-------------|-------|
| 1 | `test_user` | `test_q1` | invalid_question_id |
| 4 | `test_user` | `test_q2` | invalid_question_id |
| 1363 | `test_peer` | `q1` | invalid_question_id |
| 2512 | `test_verification` | `test_q1` | invalid_question_id |
| 2513 | `test_verification` | `test_q2` | invalid_question_id |
| 2514 | `test_verification` | `test_q1` | invalid_question_id |
| 2515 | `test_verification` | `test_q2` | invalid_question_id |

**Recommendation:** These are development/testing records. Safe to exclude from production analysis.

---

### Progress Check Format (4 records)

Question IDs use `-PC-` (Progress Check) format instead of `-L{lesson}-`:

| ID | Username | Question ID | Issue |
|----|----------|-------------|-------|
| 553 | `teacher_man` | `U1-PC-FRQ-Q02` | invalid_question_id |
| 554 | `teacher_man` | `U1-PC-MCQ-A-Q01` | invalid_question_id |
| 3050 | `Apple_Monkey` | `U1-PC-MCQ-A-Q01` | invalid_question_id |
| 3052 | `Apple_Monkey` | `U1-PC-MCQ-A-Q02` | invalid_question_id |

**Explanation:** Progress Check questions use a different ID format (`U1-PC-*`) than regular lesson questions. The current schema only validates `U{unit}-L{lesson}-Q{question}` format.

**Recommendation:** Either:
1. Exclude Progress Check questions from this analysis (they're summative, not lesson-specific)
2. Update schema to accept both formats: `U\d+-L\d+-Q\d+` OR `U\d+-PC-.*-Q\d+`

---

### Unit 9 Format Issues (3 records)

Question IDs include `-MCQ-` or `-FRQ-` designators:

| ID | Username | Question ID | Issue |
|----|----------|-------------|-------|
| 3048 | `Kiwi_Monkey` | `U9-L3-MCQ-Q02` | invalid_question_id |
| 3049 | `Kiwi_Monkey` | `U9-L3-FRQ-Q01` | invalid_question_id |
| 3051 | `Kiwi_Monkey` | `U9-L3-MCQ-Q03` | invalid_question_id |

**Explanation:** Unit 9 question IDs include the question type (`MCQ` or `FRQ`) in the ID string. Standard format is `U9-L3-Q02`, but these use `U9-L3-MCQ-Q02`.

**Recommendation:** These are Unit 9 records, outside the scope of Unit 1 analysis. Safe to exclude.

---

### Other Invalid Records (8 records)

| ID | Username | Question ID | Issue | Notes |
|----|----------|-------------|-------|-------|
| 555 | `teacher_man` | `U1-PC-MCQ-A-Q02` | invalid_question_id | Progress Check format |
| 556 | `teacher_man` | `U1-PC-MCQ-A-Q03` | invalid_question_id | Progress Check format |
| 557 | `teacher_man` | `U1-PC-MCQ-A-Q04` | invalid_question_id | Progress Check format |
| 558 | `teacher_man` | `U1-PC-MCQ-A-Q05` | invalid_question_id | Progress Check format |
| 559 | `teacher_man` | `U1-PC-MCQ-A-Q06` | invalid_question_id | Progress Check format |
| 560 | `teacher_man` | `U1-PC-MCQ-A-Q07` | invalid_question_id | Progress Check format |
| 561 | `teacher_man` | `U1-PC-MCQ-A-Q08` | invalid_question_id | Progress Check format |
| 562 | `teacher_man` | `U1-PC-MCQ-A-Q09` | invalid_question_id | Progress Check format |

All from `teacher_man` using Progress Check format.

---

## Impact Analysis

### On Period B Analysis (Unit 1, Lessons 1-10)

**Impact: MINIMAL** ✅

- ✅ **0 L10 records affected** - All invalid records are outside L10 scope
- ✅ **No Period B students affected** - Invalid records are test data or other units
- ✅ **Unit 1 regular lessons unaffected** - Only Progress Check format issues

### On Data Quality

**Current State:**
- Valid records: **688** (97%)
- Invalid records: **22** (3%)
- Production-ready: **YES** ✅

**Breakdown by Type:**
- Test data (excludable): 7
- Progress Checks (out of scope): 11
- Unit 9 (out of scope): 3
- Malformed: 1

**Net Result:** Only 1 truly malformed record (`q1`). All others are expected variations.

---

## Recommendations

### For Phase 2+

1. **Filter test records:** Exclude any username containing `test_` prefix
2. **Progress Checks:** Decide if including PC questions in analysis
   - If YES: Update question ID regex to accept `-PC-` format
   - If NO: Document exclusion in assumptions

3. **Schema Enhancement:**
   ```javascript
   // Current pattern
   /^U(\d+)-L(\d+)-Q(\d+)$/

   // Enhanced pattern (if including PC)
   /^U(\d+)-(L\d+|PC-[A-Z]+)-Q(\d+)$/
   ```

4. **Validation Level:** Consider downgrading PC format from "error" to "warning" since they're valid questions, just different scope

---

## Raw Data Access

Full details available in:
- `reports/phase1-normalization-report.json` (validation.issues array)
- `reports/normalized-data.json` (check `isValid: false` records)

---

## Sign-Off

**Data Quality: ACCEPTABLE** ✅

The 22 invalid records represent:
- Expected test data (7)
- Expected alternative formats (15)
- Zero impact on L10 analysis
- Zero impact on Period B identification

**Ready to proceed to Phase 2.**

---

*Generated by Phase 0-1 Pipeline*
