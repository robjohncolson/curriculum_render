# Analysis Pipeline Change Log

All notable changes to the AP Stats Period B analysis pipeline.

---

## [1.0.0] - 2025-10-09

### Phase 0-1: Data Normalization
**Added:**
- Initial configuration files (scope, assumptions, answer keys)
- CR rubrics for Q04 (histogram, 4pts) and Q06 (z-scores, 3pts)
- CSV parsers and data loaders
- Normalization pipeline (lowercase, hyphen→underscore)
- Validation modules

**Results:**
- 688 valid records from 710 total
- 22 invalid records documented

---

## [1.0.0] - 2025-10-09

### Phase 2: Roster Resolution
**Added:**
- Username to student mapping logic
- Alias consolidation system
- Period B/E tagging based on L10 attempts

**Fixed:**
- Roster data structure handling (no usernameToStudents field in input)
- CSV header parsing (header at line 20, not top)

**Results:**
- 8 Period B students identified
- 3 students with aliases consolidated
- 1 shared username case resolved

---

## [1.0.0] - 2025-10-09

### Phase 3: Attempt Consolidation
**Added:**
- Latest-attempt rule implementation
- Unit 1 filtering
- L10-specific view generation

**Results:**
- 60 duplicates removed (688 → 628)
- 55 L10 records isolated

---

## [1.0.0] - 2025-10-09

### Phase 4: Scoring and Triage
**Added:**
- MC answer key application
- CR keyword-based triage
- Calibration pack generation

**Results:**
- 51 MC responses scored (74.5% correct)
- 4 CR responses triaged
- Q02 identified as 33% misconception

---

## [1.0.0] - 2025-10-09

### Phase 5: Item Analysis
**Added:**
- P-value calculation (difficulty)
- Point-biserial discrimination
- Distractor analysis
- Misconception mining
- Traffic light system (green/yellow/red)

**Fixed:**
- Item analysis showing 0 items (questionType field issue)
- Now uses mcScored array directly

**Results:**
- 6 MC items analyzed
- Q02 best discriminator (0.825)
- Top misconception: Q02 with 33% selecting B

---

## [1.0.0] - 2025-10-09

### Phase 6: Skill Tagging
**Added:**
- Unit 1 skill taxonomy (12 skills)
- Keyword-based auto-detection
- Manual override system for L10 questions
- Skill coverage analysis

**Results:**
- 76 Unit 1 questions mapped
- 8 manual overrides, 68 auto-detected
- 100% coverage achieved

---

## [1.0.0] - 2025-10-09

### Phase 7: Cohort Mastery
**Added:**
- Per-student × skill mastery calculation
- Reliability scoring (HIGH/MED/LOW based on n)
- Trend analysis (early L2-L5 vs late L8-L10)
- Class heatmap generation
- Weak skill identification

**Results:**
- 30 students analyzed
- 12 weak skills identified (≥50% struggling)
- 20 students with trend data

---

## [1.0.0] - 2025-10-09

### Phase 8: Student & Class Reporting
**Added:**
- Student brief generator (120-180 words)
- Topic linking to units.js
- Class report with actionable insights
- Mini-lesson recommendations

**Results:**
- 7 Period B student briefs
- Comprehensive class report (165 lines)
- 3 mini-lesson plans recommended

---

## [1.0.0] - 2025-10-09

### Phase 9: Intervention Planning
**Added:**
- CR missing roster (L10-CR-missing.csv)
- CR Blitz plan (10-12 min in-class intervention)
- Q02 mini-lesson (z-score → proportion)
- Exit ticket for Q02 (3 items)
- Targeted practice for Janelle and Gabriella

**Results:**
- 5 students missing Q04, 7 missing Q06
- Full intervention suite ready for deployment

---

## [1.0.0] - 2025-10-09

### Phase 10: QA and Governance
**Added:**
- QA checklist with validation status
- Version control system
- Roster drift detection rules
- CR double-scoring protocol

---

## [1.0.0] - 2025-10-09

### Phase 11: Automation Cadence
**Added:**
- Weekly runbook for pipeline execution
- Health check monitoring
- Drift detection automation

---

## [1.0.0] - 2025-10-09

### Phase 12: Prompt Library
**Added:**
- CR scoring prompts for LLM
- Misconception mining templates
- Student brief generation prompts
- Example inputs/outputs for each

---

## Known Issues

### Active
- **Low CR completion rates:**
  - Q04: 38% (3/8 students)
  - Q06: 13% (1/8 students)
  - **Mitigation:** CR Blitz plan created

- **7 unmapped usernames:**
  - Not in student2username.csv
  - Students can still be analyzed by username
  - **Impact:** Minor - no effect on analysis

### Resolved
- ✅ Roster data structure mismatch - Fixed in Phase 2
- ✅ CSV header parsing - Fixed in Phase 2
- ✅ Item analysis 0 items - Fixed in Phase 5

---

## Upcoming Changes

### Next Sprint (Phases 13+)
- Unit 2 expansion of skill taxonomy
- Automated CR scoring via LLM integration
- Real-time dashboard generation
- Parent-facing report templates
