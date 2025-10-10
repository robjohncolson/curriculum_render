# Analysis Pipeline Runbook

**Purpose:** Automate weekly/unit-end AP Statistics analysis workflow
**Owner:** Period B Teacher / Data Team
**Last Updated:** October 9, 2025

---

## Quick Start

```bash
cd analysis

# Full pipeline (all phases)
npm run pipeline:full

# Or run phases individually
npm run phase:0-1    # Normalization
npm run phase:2-5    # Roster → Item Analysis
npm run phase:6-12   # Skills → Reports
```

---

## Weekly Cadence (Every Monday 8am)

### Step 1: Pull Latest Data
```bash
# Update answer data from source
cp /path/to/latest/answers.csv docs/answers_rows.csv

# Update roster if needed
cp /path/to/latest/roster.csv docs/student2username.csv
```

### Step 2: Run Full Pipeline
```bash
cd analysis
node pipeline-full.js
```

**Expected Runtime:** ~10 seconds

### Step 3: Review Outputs
Check `reports/` directory for:
- ✅ `L10-traffic-light.csv` - Quick class status
- ✅ `class-report.md` - Full analysis
- ✅ `weak-skills.csv` - Class-wide gaps
- ✅ `L10-CR-missing.csv` - Missing responses

### Step 4: Health Checks (Automated)

The pipeline automatically checks for:

1. **New Usernames:**
   - Any username not in previous run
   - Logged to `reports/new-usernames.log`
   - **Action:** Review and update `student2username.csv` if needed

2. **CR Completion Rate:**
   - Flag if <40% for any CR question
   - Logged to `reports/cr-alerts.log`
   - **Action:** Run CR Blitz intervention

3. **Skill Mastery Drops:**
   - Flag if any skill drops >15% week-over-week
   - Logged to `reports/mastery-alerts.log`
   - **Action:** Review instruction for that skill

---

## Unit-End Workflow (After Major Assessment)

### 1. Data Collection (Day 1)
```bash
# Export answers from quiz platform
# Place in: docs/answers_rows_unit[X].csv

# Run full analysis
npm run pipeline:full
```

### 2. Review & Intervention Planning (Day 2-3)
- Read `class-report.md` for key findings
- Check `weak-skills.csv` for class-wide gaps
- Review individual `reports/students/*.md` briefs
- Plan mini-lessons from `interventions/` folder

### 3. Student Feedback (Day 4)
- Distribute student briefs (print or digital)
- Schedule 1:1s with red-light students
- Assign targeted practice packets

### 4. Instruction Adjustments (Day 5+)
- Deliver mini-lessons for top misconceptions
- Run exit tickets to verify understanding
- Update pacing based on weak skills

---

## Automation Setup (Optional)

### Cron Job (Linux/Mac)
```bash
# Edit crontab
crontab -e

# Add weekly Monday 8am run
0 8 * * 1 cd /path/to/analysis && node pipeline-full.js >> logs/cron.log 2>&1
```

### Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task: "AP Stats Weekly Analysis"
3. Trigger: Weekly, Monday 8:00 AM
4. Action: Start Program
   - Program: `node`
   - Arguments: `pipeline-full.js`
   - Start in: `C:\path\to\analysis`

---

## Health Check Reference

### Normal vs Alert Conditions

| Metric | Normal | Alert | Action |
|--------|--------|-------|--------|
| **CR Completion** | ≥60% | <40% | Run CR Blitz |
| **New Usernames** | 0-1 per week | >2 per week | Check roster drift |
| **Skill Mastery Drop** | <10% | >15% | Review instruction |
| **Red Students** | 0-2 | >3 | Intervention meeting |
| **Item Discrimination** | >0.3 | <0.2 | Review question quality |

---

## What-If Scenarios

### Scenario: New student added mid-unit
**Solution:**
1. Add to `docs/student2username.csv`
2. Re-run Phase 2: `node data-processing/phase2-roster-resolution.js`
3. Re-run rest of pipeline: `npm run phase:2-5 && npm run phase:6-12`

### Scenario: Student uses new username
**Solution:**
1. Check `reports/new-usernames.log`
2. Add alias to `phase2-alias-consolidation.md`
3. Update roster mapping
4. Re-run pipeline

### Scenario: CR responses missing from data export
**Solution:**
1. Check source platform for export errors
2. If persistent, use `L10-CR-missing.csv` to track manually
3. Run CR Blitz to collect in-class

### Scenario: Item discrimination suddenly drops
**Solution:**
1. Review question for ambiguity
2. Check if majority got it correct (too easy)
3. Check if majority got it wrong (unclear/mis-keyed)
4. Consider dropping from analysis if flawed

### Scenario: Week-over-week mastery regression
**Solution:**
1. Check `trends-summary.md` for specific skills affected
2. Review what was taught that week
3. Consider if assessment was harder, not instruction weaker
4. Plan remediation for regressed skills

---

## Maintenance Tasks

### Monthly
- [ ] Review and update skill taxonomy if curriculum changes
- [ ] Audit CR triage accuracy (manual spot-check 5-10 responses)
- [ ] Archive old reports: `mv reports/ archive/reports-$(date +%Y%m)/`

### Quarterly
- [ ] Update answer keys if questions revised
- [ ] Review rubrics for CR scoring consistency
- [ ] Validate roster against official enrollment

### Annually
- [ ] Update skill taxonomy for new AP CED
- [ ] Refresh intervention templates
- [ ] Train new teacher on pipeline usage

---

## Troubleshooting

### Pipeline fails at Phase 2
**Likely cause:** Roster structure changed
**Fix:**
```bash
# Check roster format
head -5 docs/student2username.csv

# Verify expected format:
# student name,fruit_animal
# edgar,apple_monkey
```

### Pipeline fails at Phase 6
**Likely cause:** Curriculum.js malformed
**Fix:**
```bash
# Validate JSON structure
node -c data/curriculum.js
```

### No items in item analysis
**Likely cause:** questionType field missing
**Fix:** Edit `phase5-analysis.js` to use `mcScored` array directly (already fixed in v1.0.0)

### Mastery shows 0% for all skills
**Likely cause:** Answer key mismatch
**Fix:**
```bash
# Check answer key format in config/phase0-config.js
# Ensure keys match question IDs exactly (e.g., "U1-L10-Q01": "D")
```

---

## Support & Documentation

### Key Files
- **Configuration:** `config/` directory
- **Processing:** `data-processing/` directory
- **Reporting:** `reporting/` directory
- **Interventions:** `interventions/` directory

### Documentation
- `PHASE0-1-SUMMARY.md` - Initial setup
- `PHASE2-5-SUMMARY.md` - Core analysis
- `PHASE6-12-SUMMARY.md` - Skills & reporting
- `DELIVERABLES-INDEX.md` - All outputs catalog

### Getting Help
1. Check `change-log.md` for recent fixes
2. Review `qa-checklist.md` for validation steps
3. Consult phase-specific summary docs
4. Contact: [Data Team / Tech Lead]

---

## Success Metrics

Track these to measure pipeline effectiveness:

- **Time Saved:** Manual analysis ~4 hours → Automated ~10 seconds
- **Intervention Speed:** Same-week vs next-week response to data
- **Student Outcomes:** % mastery improvement after interventions
- **Teacher Satisfaction:** Ease of use, actionability of reports

---

*Last reviewed: October 9, 2025*
*Next review: November 2025*
