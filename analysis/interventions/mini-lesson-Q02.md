# Mini-Lesson: Z-Scores to Proportions (Q02 Misconception)

**Duration:** 12 minutes
**Target Skill:** Converting z-scores to proportions using normal distribution
**Misconception:** 33% of students selected B instead of A on Q02

---

## The Problem

**Q02 Performance:**
- Correct Answer: A
- **33% selected B** (3/9 students)
- This indicates systematic confusion about z-score → proportion conversion

**Root Cause:** Students may be:
- Confusing z-score calculation with proportion lookup
- Misreading the normal table
- Not understanding what "proportion below" means

---

## Lesson Plan (12 minutes)

### Opening: Name the Problem (2 min)

**Say:**
> "One-third of you selected B on Q02. This tells me we need to clarify how z-scores connect to proportions. Let's fix this right now so it never trips you up again."

**Write on Board:**
```
Q02: What proportion of Reese's cups weigh LESS THAN 46g?
Given: μ = 48.5g, σ = 1.2g

Wrong Answer (B): 33% of you chose this
Right Answer (A): Let's see why
```

---

### I Do: Model the Complete Process (4 min)

**Step 1: Label the Parameters**
```
μ = 48.5g  (population mean)
σ = 1.2g   (population standard deviation)
x = 46g    (value we're asking about)
```

**Step 2: Calculate the Z-Score**
```
z = (x - μ) / σ
z = (46 - 48.5) / 1.2
z = -2.5 / 1.2
z = -2.08
```

**Step 3: Use Normal Table or Technology**
- Look up z = -2.08 in Table A
- Find: 0.0188
- **This IS the proportion below 46g**

**Step 4: Interpret in Context**
> "About 1.9% of Reese's Peanut Butter Cups weigh less than 46g."

**Key Point:**
> "The table value IS the answer for 'proportion below.' You don't need to do anything else!"

---

### We Do: Guided Practice (3 min)

**Problem:**
> "What proportion of Reese's cups weigh MORE than 51g?"

**Guide Students Through:**
1. **Label:** μ = 48.5, σ = 1.2, x = 51
2. **Calculate z:**
   - z = (51 - 48.5) / 1.2 = 2.5 / 1.2 ≈ 2.08
3. **Table lookup:** z = 2.08 → 0.9812
4. **BUT WAIT!** Question asks for "more than"
   - Proportion above = 1 - 0.9812 = 0.0188 ≈ 1.9%

**Key Point:**
> "Table gives 'below.' For 'above,' subtract from 1."

---

### You Do: Exit Ticket (3 min)

Distribute exit ticket (see exit-ticket-Q02.csv). Students complete 3 items:

1. **Straight z → proportion below**
2. **z → proportion above** (requires 1 - p)
3. **Interpretation in context**

**Circulate and check:**
- Are students writing the z-formula correctly?
- Are they using the table correctly?
- Are they answering "above" vs "below" correctly?

---

## Common Misconceptions to Address

### Misconception 1: "I need to do extra calculations after finding the table value"
**Correction:** "No! For 'proportion below,' the table value IS your answer."

### Misconception 2: "Negative z-scores are bad or wrong"
**Correction:** "Negative just means below the mean. Table A handles negatives just fine."

### Misconception 3: "I can't tell if I need to subtract from 1"
**Correction:** "Read carefully: BELOW → use table directly. ABOVE → subtract from 1. BETWEEN → find both and subtract."

---

## Materials Needed

1. **Normal Distribution Table (Table A)** - one per student
2. **Exit Ticket** (printed from exit-ticket-Q02.csv)
3. **Calculator** (for z-score calculations)

---

## Success Criteria

Students can:
- ✓ Calculate z-scores using the formula z = (x - μ) / σ
- ✓ Use Table A to find proportions below a z-score
- ✓ Distinguish "below" (direct) from "above" (1 - p)
- ✓ Interpret proportions in context

---

## Assessment: Exit Ticket

See `exit-ticket-Q02.csv` for 3 assessment items.

**Scoring:**
- 3/3 correct: Mastery
- 2/3 correct: Developing
- 0-1/3 correct: Needs reteaching

**Follow-up:**
- Students scoring 0-1/3 get targeted practice packet
- Review most-missed item with whole class tomorrow

---

## Why This Matters

This skill appears on:
- Unit 1 Test (multiple items)
- AP Exam (Free Response Questions require z → p conversions)
- Unit 5 (sampling distributions)

**Mastering this now prevents cascading misconceptions later.**

---

## Extension (If Time Allows)

**Challenge:** "What weight marks the 90th percentile for Reese's cups?"
- This reverses the process: proportion → z-score → x value
- Shows deeper understanding

---

## Notes for Teacher

- **Pace:** Keep tight 12-min schedule to maintain energy
- **Misconception:** The 33% who chose B may have confused z-score (-2.08) with proportion
- **Hook:** Emphasize this is a "fixable" error - they were close!
- **Connection:** Link to empirical rule (68-95-99.7) students already know

**Tomorrow:** Review exit ticket results and address any remaining confusion.
