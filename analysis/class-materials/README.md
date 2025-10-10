# Period B Class Materials - October 10, 2025

## Overview

This folder contains all classroom materials for tomorrow's Period B lesson and the 3-day weekend assignment. All materials have been generated based on data-driven analysis of student performance on Unit 1, Lesson 10.

## Quick Start

**To compile all PDFs:**
```bash
./create-all-materials.sh
```

This will generate 6 PDFs ready for printing.

## Files in This Directory

### LaTeX Source Files (.tex)
1. **exit-ticket-Q02.tex** - Exit ticket for Q02 mini-lesson (quarter-sheet format)
2. **weekend-assignment.tex** - 3-day weekend assignment (differentiated)
3. **student-briefs-all.tex** - All 7 student performance briefs in one document
4. **targeted-practice-Janelle.tex** - Practice packet for Janelle (mango_panda)
5. **targeted-practice-Gabriella.tex** - Practice packet for Gabriella (guava_cat)
6. **teacher-quick-reference.tex** - Teacher guide with schedule, scripts, and student data

### Generated PDFs (.pdf)
1. **exit-ticket-Q02.pdf** (47 KB) - 4 tickets per page, 2 pages total
2. **weekend-assignment.pdf** (69 KB) - 3 pages
3. **student-briefs-all.pdf** (102 KB) - 3 pages (7 student briefs)
4. **targeted-practice-Janelle.pdf** (124 KB) - 5 pages
5. **targeted-practice-Gabriella.pdf** (127 KB) - 6 pages
6. **teacher-quick-reference.pdf** (130 KB) - 4 pages

### Supporting Files
- **create-all-materials.sh** - Bash script to compile all LaTeX → PDF
- **README.md** - This file

## Print Instructions

### Print Tonight (Before Class)

| Document | Copies | Notes |
|----------|--------|-------|
| exit-ticket-Q02.pdf | 3 copies | Cut into 12 quarter-sheets (need ~10-12 total) |
| student-briefs-all.pdf | 7 copies | 1 per student |
| weekend-assignment.pdf | 7 copies | 1 per student |
| targeted-practice-Janelle.pdf | 1 copy | Staple (5 pages) |
| targeted-practice-Gabriella.pdf | 1 copy | Staple (6 pages) |
| teacher-quick-reference.pdf | 1 copy | For your reference during class |

**Total pages to print:** ~20-25 pages

## Upload to LMS Tonight

**Location:** `../docs/Unit1-Review-Flashcards.csv`

**Action:** Import this CSV to Blooket (or your LMS flashcard system) and share the link with students.

**Contents:** 35 Unit 1 review questions covering:
- Distribution shapes and properties
- Measures of center and spread
- Z-scores and standardization
- Normal distribution properties
- Empirical rule
- Variables (categorical vs quantitative)
- Parameters vs statistics
- Graphical displays

## Class Schedule (50 minutes)

1. **5 min:** Do Now / Settling
2. **12 min:** CR Blitz (collect missing Q04/Q06 responses)
3. **15 min:** Q02 Mini-lesson (z-score to proportion conversion)
4. **3 min:** Exit ticket (Q02 practice)
5. **10 min:** Distribute materials & explain weekend work
6. **5 min:** Wrap-up & questions

## Student Summary

### Traffic Light Status (MC Performance)

**Green (≥80%):** Edgar (100%), Ana (83%), Francois (100%), Keily (83%)
**Yellow (60-79%):** Hazel (67%)
**Red (<60%):** Janelle (50%), Gabriella (50%)

### CR Completion Status

- **Q04 missing:** Edgar, Ana, Francois, Keily, Gabriella (5 students)
- **Q06 missing:** All except Hazel (7 students)
- **Only Hazel completed both CR questions!**

### Materials Distribution

**All students receive:**
- Personalized performance brief
- Weekend assignment sheet

**Additional for Janelle & Gabriella:**
- Targeted practice packet (individualized)
- Due Tuesday for feedback

## Weekend Assignment Requirements

### For ALL Students
1. Complete **TWO 20-minute Blooket practice sessions** (space out Sat + Sun)
2. Review video resources linked in personalized brief
3. Focus on identified weak skills

### For Janelle & Gabriella (Red-Light Students)
4. **Complete targeted practice packet**
5. Show all work
6. Bring to class Tuesday for feedback

### For Julissa & Emily (if they're in your class - data shows missing quiz)
7. Complete L10 quiz with Q04 and Q06
8. Due Monday night, 11:59pm

## Key Teaching Points

### CR Blitz (12 min)
- **Script:** "Most of you skipped the constructed response questions on L10. These are worth significant points and test critical skills. You have 12 minutes to complete both. Timer starts now."
- **Board:** Write success criteria for Q04 (4 pts) and Q06 (3 pts) before class
- **Circulate:** Watch Janelle & Gabriella, provide encouragement
- **Collect:** All responses at end of 12 min

### Q02 Mini-Lesson (15 min)
- **Common error:** Students confuse z-score value with proportion (e.g., z=1.5 → "1.5%")
- **Teaching focus:**
  - Z-score = distance from mean in SDs
  - Table A converts z → proportion
  - z=1.5 → 0.9332 (93.32%, NOT 1.5%!)
- **Example:** Reese's cups (μ=48.5g, σ=1.2g), find P(X < 47g)

### Exit Ticket (3 min)
- Distribute quarter-sheets
- Students practice z → proportion conversion
- Collect for formative assessment

## Post-Class Actions

- [ ] Score CR Blitz responses (30-40 min tonight)
- [ ] Upload Unit1-Review-Flashcards.csv to LMS
- [ ] Update gradebook with exit ticket scores
- [ ] Prepare feedback for Janelle & Gabriella packets (due Tuesday)

## Student Usernames (for reference)

| Name | Username | Status | Special Notes |
|------|----------|--------|---------------|
| Edgar | apple_monkey | Green | Missing both CR |
| Ana | papaya_eagle | Green | Missing both CR |
| Francois | apricot_horse | Green | Missing both CR |
| Keily | apricot_fox | Green | Missing both CR |
| Hazel | apple_rabbit | Yellow | Only student who completed both CR! |
| Janelle | mango_panda | Red | Has targeted packet, missing Q06 |
| Gabriella | guava_cat | Red | Has targeted packet, missing both CR |

## Notes

- All LaTeX documents use `tcolorbox` for visual organization
- Color coding: Green (good performance), Yellow (caution), Red (needs support)
- Targeted packets include answer keys at the end
- Materials emphasize growth mindset and personalized support (not punishment)
- CR Blitz aims to normalize CR completion expectations

## Questions?

Contact the data analysis pipeline maintainer or review the following source files:
- `/analysis/reports/L10-traffic-light.csv` - Student performance summary
- `/analysis/reports/L10-CR-missing.csv` - CR completion tracking
- `/analysis/interventions/` - Detailed intervention plans
- `/analysis/reports/students/` - Individual student markdown briefs

---

**Generated:** October 9, 2025
**Class Date:** October 10, 2025
**Assignment Due:** Tuesday, October 15, 2025
