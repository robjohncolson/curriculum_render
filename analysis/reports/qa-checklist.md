# QA Checklist and Governance

**Last Updated:** October 9, 2025

---

## Phase 0-5 Validation ✅

### Data Quality
- [x] All 688 valid records processed
- [x] 22 invalid records documented
- [x] No duplicate student×question after consolidation (60 removed)
- [x] All Period B students identified (8 total)
- [x] Answer key applied to all MC questions
- [x] Item analysis covers all 6 L10 MC questions

### Output Integrity
- [x] 14 Phase 2-5 files generated successfully
- [x] Traffic light assignments for all students
- [x] Misconceptions identified with evidence
- [x] CR triage completed (4 responses)

---

## Phase 6-8 Validation ✅

### Skill Mapping
- [x] 76 Unit 1 questions mapped to skills
- [x] 8 manual overrides for L10 questions
- [x] 68 auto-detected mappings
- [x] 100% coverage of Unit 1 questions

### Mastery Analysis
- [x] 30 students with skill-level mastery scores
- [x] Reliability flags added (HIGH/MED/LOW based on n)
- [x] Trends calculated (early L2-L5 vs late L8-L10)
- [x] 12 weak skills identified (≥50% struggling)

### Reporting
- [x] 7 Period B student briefs generated
- [x] Class report with actionable recommendations
- [x] All intervention materials created

---

## CR Scoring Double-Check (Manual Task)

### Sample Selection
Select 6-8 CR responses spanning triage buckets for validation:

**High Confidence:**
- (None in current dataset - all Medium/Low)

**Medium Confidence:**
- Q04: Hazel (triage score: 50%)
- Q04: Janelle (triage score: 75%)

**Low Confidence:**
- Q06: Hazel (flagged for review)

**Action Required:**
1. Score these responses manually using rubrics in `config/rubrics.js`
2. Compare manual scores to triage estimates
3. Calculate inter-rater reliability
4. Document any rubric clarifications needed

**Expected Output:**
- `reports/cr-reliability.csv` with agreement stats

---

## Roster Drift Monitoring

### Current Status
- **Known Aliases:** 3 students with multiple usernames
- **Shared Usernames:** 1 case resolved (capitalization)
- **Unmapped Usernames:** 7 (students not in student2username.csv)

### Drift Detection Rules
1. **New Username Alert:** Flag any username not in original roster
2. **Alias Detection:** Identify potential aliases when:
   - Same student name with different username
   - Similar answer patterns across usernames
3. **Update Process:**
   - Document in `phase2-alias-consolidation.md`
   - Rebuild roster with updated mappings
   - Re-run pipeline if significant changes

---

## Version Control

### Current Versions

```json
{
  "answerKey": "1.0.0",
  "lastModified": "Phase 0 (Oct 9, 2025)",
  "rubrics": "1.0.0",
  "lastModified": "Phase 1 (Oct 9, 2025)",
  "skillTaxonomy": "1.0.0",
  "lastModified": "Phase 6 (Oct 9, 2025)",
  "pipeline": {
    "phase0-1": "1.0.0",
    "phase2-5": "1.0.0",
    "phase6-12": "1.0.0"
  },
  "dataSnapshot": "2025-10-09"
}
