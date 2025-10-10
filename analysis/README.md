# AP Statistics Period B Unit 1 Analysis Pipeline

Multi-phase automated pipeline for analyzing Period B student performance on Unit 1, with spotlight on Lesson 10.

## Quick Start

```bash
cd analysis
node phase0-1-pipeline.js
```

## Status: Phase 0 & 1 Complete ✅

### What's Been Implemented

**Phase 0: Scope Definition**
- ✅ Period B, Unit 1, Lessons 1-10 defined
- ✅ L10 answer key extracted (6 MC questions)
- ✅ Rubrics created for 2 CR questions (Q04, Q06)

**Phase 1: Data Normalization**
- ✅ 688 valid answer records loaded
- ✅ 24 unique students identified
- ✅ 8 L10 questions validated
- ✅ Normalization: 639 usernames modified, 6 hyphens→underscores

### Key Results

| Metric | Value |
|--------|-------|
| **Valid Records** | 688 / 710 (97%) |
| **Students Mapped** | 24 unique |
| **L10 Questions** | 8 (6 MC + 2 CR) |
| **Normalization Success** | 639 / 742 usernames |

### Data Quality Issues

🔴 **Critical (1)**
- 22 invalid records (test data, malformed question IDs)

🟡 **Warnings (5)**
1. 7 test records (filterable)
2. 33 potential duplicates (same timestamp)
3. 6 shared usernames (capitalization variants)
4. 3 students with multiple usernames (aliases)
5. Q06 missing full solution in curriculum

## Project Structure

```
analysis/
├── config/
│   ├── phase0-config.js      # Scope & assumptions
│   ├── rubrics.js             # L10 CR scoring rubrics
│   └── schemas.js             # Data schemas
├── data-processing/
│   ├── normalizer.js          # Normalization functions
│   ├── loader.js              # CSV/data loading
│   └── validator.js           # Data validation
├── reports/                   # Generated JSON reports
│   ├── phase0-scope-report.json
│   ├── phase1-normalization-report.json
│   └── normalized-data.json   # 2.2MB normalized data
├── phase0-1-pipeline.js       # Main pipeline
├── PHASE0-1-SUMMARY.md        # Detailed summary
└── package.json
```

## Generated Artifacts

### Reports
- `reports/phase0-scope-report.json` - Scope, answer keys, rubrics
- `reports/phase1-normalization-report.json` - Validation results (7KB)
- `reports/normalized-data.json` - Clean normalized data (2.2MB)

### Answer Key (L10 MC)
- Q01: **D** (μ = 80; σ = 10)
- Q02: **A** (0.17)
- Q03: **A** (0.023)
- Q05: **B** (16% / 84%)
- Q07: **C** (16%)
- Q08: **A** (26 inches)

### Rubrics (L10 CR)
- **Q04:** Histogram construction (4 pts) - shape, bars, median
- **Q06:** Z-scores & proportions (3 pts) - calculation, interpretation

## Next Phase: Roster Resolution (Phase 2)

**Goals:**
1. Resolve 6 shared usernames (capitalization)
2. Consolidate 3 student aliases
3. Assign Period B/E based on L10 attempts
4. Create clean student roster

**Hand off to:** Opus for Phase 2 planning

## Configuration

All configuration in `config/phase0-config.js`:

```javascript
scope: {
  period: 'B',
  unit: 'unit1',
  lessons: { range: [1, 10], spotlight: 10 }
}
```

## Running the Pipeline

**Direct execution:**
```bash
node phase0-1-pipeline.js
```

**With npm:**
```bash
npm run phase0-1
```

**Exit codes:**
- 0 = Success (validation passed)
- 1 = Issues found (check reports)

## Key Insights

1. **High Data Quality:** 97% of records valid (688/710)
2. **Username Normalization:** Resolved 86% of inconsistencies
3. **Roster Complexity:** 6 duplicates + 3 aliases need manual review
4. **L10 Complete:** All 8 questions with answer keys/rubrics
5. **Production Ready:** Clean structure, validated, ready for Period B tagging

## Review Checklist

- [ ] Verify answer keys in `reports/phase0-scope-report.json`
- [ ] Review validation warnings in `reports/phase1-normalization-report.json`
- [ ] Approve CR rubrics in `config/rubrics.js`
- [ ] Check roster issues (shared usernames, aliases)
- [ ] Sign off on Phase 0 & 1 → proceed to Phase 2

---

**Documentation:** See `PHASE0-1-SUMMARY.md` for complete implementation details

**Last Updated:** October 9, 2025
