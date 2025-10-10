# LLM Prompt Library for AP Statistics Analysis

**Purpose:** Standardized prompts for consistent automated scoring and analysis
**Target Models:** GPT-4, Claude, or similar LLMs with strong reasoning
**Last Updated:** October 9, 2025

---

## Table of Contents

1. [CR Scoring Prompts](#cr-scoring-prompts)
2. [Misconception Mining](#misconception-mining)
3. [Student Brief Generation](#student-brief-generation)
4. [Intervention Design](#intervention-design)
5. [Data Quality Checks](#data-quality-checks)

---

## CR Scoring Prompts

### Prompt 1: Q04 Histogram Scoring (4 points)

```
You are scoring a student's constructed response to an AP Statistics question about histograms.

**Question:**
The weights of Reese's Peanut Butter Cups are approximately normal with mean 48.5g and standard deviation 1.2g. Create a histogram showing this distribution and describe its shape and center.

**Rubric (4 points total):**
- 1 pt: Histogram drawn with appropriate bars/intervals
- 1 pt: Shape correctly described as symmetric/bell-shaped/mound-shaped
- 1 pt: Center identified (48-49g range acceptable)
- 1 pt: Distribution described in context of Reese's weights

**Student Response:**
{STUDENT_ANSWER}

**Your Task:**
Return a JSON object with:
{
  "score": <number 0-4>,
  "rationale": "<1-2 sentence explanation of scoring>",
  "flags": [<array of strings indicating issues, e.g., "missing-context", "incorrect-shape">]
}

**Scoring Guidelines:**
- Be lenient on drawing quality if concept is clear
- Accept "symmetric", "bell", "mound", "normal" for shape
- Accept numeric center ±1 from actual mean
- Require explicit mention of Reese's/cups/weights for context point
```

**Example Input:**
```json
{
  "questionId": "U1-L10-Q04",
  "studentUsername": "apple_monkey",
  "studentAnswer": "The histogram shows a bell shape centered around 48-49 grams. Most Reese's cups are near the mean."
}
```

**Example Output:**
```json
{
  "score": 3,
  "rationale": "Student described shape (bell), identified center (48-49g), and provided context (Reese's cups). Missing: No histogram drawn or described with bars/intervals.",
  "flags": ["missing-visual-component"]
}
```

---

### Prompt 2: Q06 Z-Score Scoring (3 points)

```
You are scoring a student's constructed response to an AP Statistics question about z-scores and proportions.

**Question:**
Using μ = 48.5g and σ = 1.2g:
a) Calculate the z-score for a Reese's cup weighing 46g
b) Calculate the z-score for one weighing 51g
c) What proportion of cups weigh between 46g and 51g?

**Rubric (3 points total):**
- 1 pt: Correct z-score for 46g (z ≈ -2.08, accept -2.0 to -2.1)
- 1 pt: Correct z-score for 51g (z ≈ 2.08, accept 2.0 to 2.1)
- 1 pt: Correct proportion calculated (≈ 96%, accept 95-97% or 0.95-0.97)

**Student Response:**
{STUDENT_ANSWER}

**Your Task:**
Return a JSON object with:
{
  "score": <number 0-3>,
  "rationale": "<1-2 sentence explanation>",
  "flags": [<issues array>],
  "partialScores": {
    "partA": <0 or 1>,
    "partB": <0 or 1>,
    "partC": <0 or 1>
  }
}

**Scoring Guidelines:**
- Accept z-scores rounded to 1-2 decimal places
- For part C, accept percentage (96%) or decimal (0.96)
- Award part C point even if prior z-scores slightly off, if proportion method is correct
- Look for formula z = (x - μ) / σ even if arithmetic errors present
```

**Example Input:**
```json
{
  "questionId": "U1-L10-Q06",
  "studentUsername": "papaya_eagle",
  "studentAnswer": "a) z = (46-48.5)/1.2 = -2.08\nb) z = (51-48.5)/1.2 = 2.08\nc) Using table: 0.9812 - 0.0188 = 0.9624 = 96%"
}
```

**Example Output:**
```json
{
  "score": 3,
  "rationale": "All z-scores correct and proportion calculated accurately using table values.",
  "flags": [],
  "partialScores": {
    "partA": 1,
    "partB": 1,
    "partC": 1
  }
}
```

---

## Misconception Mining

### Prompt 3: Identify Misconception from Distractor Analysis

```
You are analyzing student responses to identify underlying misconceptions in AP Statistics.

**Context:**
- Question ID: {QUESTION_ID}
- Correct Answer: {CORRECT_ANSWER}
- Top Distractor: {DISTRACTOR_KEY} selected by {PERCENT}% of students

**Question Prompt:**
{QUESTION_TEXT}

**Answer Choices:**
{FORMATTED_CHOICES}

**Your Task:**
Analyze why students selected the distractor and provide:

{
  "misconceptionLabel": "<short name for the misconception>",
  "studentThinking": "<what students likely thought that led to this error>",
  "teachingNote": "<1-2 sentence note for teacher about addressing this>",
  "correctiveProm": "<a question or prompt that challenges the misconception>"
}

**Example for Q02 (z-score → proportion):**
- Correct: A (0.019)
- Distractor: B (0.06) selected by 33%
```

**Example Output:**
```json
{
  "misconceptionLabel": "Z-score confused with proportion",
  "studentThinking": "Students likely calculated the z-score (-2.08) correctly but then misinterpreted it as the proportion itself, or selected an answer that 'looked like' their z-score value instead of using the normal table.",
  "teachingNote": "Emphasize that z-scores and proportions are different units. The z-score tells you how many standard deviations away from the mean, while the proportion (from Table A) tells you the percentage of values below that z-score.",
  "correctivePrompt": "You calculated z = -2.08. What does this number represent? (Hint: It's NOT the proportion.) Now, what do you need to DO with this z-score to find the proportion of values below 46g?"
}
```

---

## Student Brief Generation

### Prompt 4: Personalized Student Feedback (120-180 words)

```
You are creating personalized feedback for an AP Statistics student based on their performance data.

**Student:** {STUDENT_NAME} ({USERNAME})

**Performance Data:**
- L10 MC Score: {MC_SCORE} ({MC_PERCENT}%)
- Skills Mastered (≥80%): {STRONG_SKILLS}
- Skills Needing Work (<60%): {WEAK_SKILLS}
- Overall Trend: {EARLY_TO_LATE_TREND}

**Available Topics for Linking:**
{UNIT1_TOPICS_JSON}

**Your Task:**
Generate a 120-180 word student brief with this structure:

1. **Opening (1-2 sentences):** Acknowledge strengths
2. **Priority Area (1-2 sentences):** Identify 1-2 key skills to improve
3. **Concrete Next Step (1 sentence):** Specific action they can take
4. **Linked Topics (1 sentence):** Reference 2 specific Unit 1 topics by number and name

**Tone:** Encouraging but honest, student-facing, avoid jargon

Return only the brief text, no JSON wrapper.
```

**Example Input:**
```json
{
  "studentName": "Janelle",
  "username": "mango_panda",
  "mcScore": "3/6",
  "mcPercent": 50,
  "strongSkills": ["CONTEXT (75%)"],
  "weakSkills": ["Z_TO_PROP (40%)", "DISPLAYS (50%)"],
  "earlyToLateTrend": "stable",
  "unit1Topics": {
    "1-10": "The Normal Distribution",
    "1-8": "Graphical Representations of Summary Statistics"
  }
}
```

**Example Output:**
```
You show good effort tackling constructed response questions, scoring 75% on interpreting results in context. Your MC performance at 50% indicates opportunities to strengthen z-score to proportion conversions and statistical displays. Focus on practicing normal table usage: for "proportion below," use the table value directly; for "above," subtract from 1. Review **Topic 1-10: The Normal Distribution** and **Topic 1-8: Graphical Representations of Summary Statistics** for targeted practice, especially on converting z-scores to meaningful proportions and creating histograms that accurately represent data distributions.
```

---

## Intervention Design

### Prompt 5: Generate Mini-Lesson Outline

```
You are designing a targeted mini-lesson to address a specific misconception identified in student data.

**Misconception:**
{MISCONCEPTION_LABEL}

**Evidence:**
- {PERCENT}% of students affected
- Specific error: {ERROR_DESCRIPTION}

**Learning Objective:**
{OBJECTIVE}

**Time Limit:** 10-12 minutes

**Your Task:**
Create a mini-lesson outline with:

{
  "hook": "<1-2 sentence opening that names the problem>",
  "iDo": {
    "duration": "3-4 min",
    "content": "<step-by-step teacher demonstration>"
  },
  "weDo": {
    "duration": "3-4 min",
    "content": "<guided practice problem>"
  },
  "youDo": {
    "duration": "3-4 min",
    "content": "<independent exit ticket, 2-3 items>"
  },
  "keyPoints": ["<critical teaching point 1>", "<point 2>", "<point 3>"]
}
```

**Example Input:**
```json
{
  "misconceptionLabel": "Empirical rule percentage confusion",
  "percent": 45,
  "errorDescription": "Students confuse 68% (±1σ) with 95% (±2σ)",
  "objective": "Correctly apply 68-95-99.7 rule to estimate proportions"
}
```

**Example Output:**
```json
{
  "hook": "Almost half of you mixed up the 68% and 95% rules on the last quiz. Let's nail down 68-95-99.7 once and for all.",
  "iDo": {
    "duration": "4 min",
    "content": "Draw normal curve on board. Mark μ in center. Show: μ±1σ captures middle 68%, μ±2σ captures 95%, μ±3σ captures 99.7%. Emphasize: 1σ → 68, 2σ → 95, 3σ → 99.7. Do example: If μ=50, σ=10, then 68% are between 40-60, 95% between 30-70."
  },
  "weDo": {
    "duration": "3 min",
    "content": "Given: Test scores μ=75, σ=5. Ask class: What percent of scores are between 70-80? (Answer: 68%, because 70-80 is μ±1σ). What percent above 85? (Answer: 2.5%, because 85 is μ+2σ, and 95% are within ±2σ, so 5% in tails, 2.5% in each tail)."
  },
  "youDo": {
    "duration": "3 min",
    "content": "Exit ticket: 1) What percent within μ±2σ? 2) Heights μ=65in, σ=3in. What percent between 62-68in? 3) Using same heights, what percent above 71in?"
  },
  "keyPoints": [
    "1σ → 68%, 2σ → 95%, 3σ → 99.7%",
    "Within means middle %, tails get the remainder",
    "Sketch curve to visualize before calculating"
  ]
}
```

---

## Data Quality Checks

### Prompt 6: Validate Student Response

```
You are checking if a student's response is valid for automated analysis.

**Response:**
{STUDENT_ANSWER}

**Context:**
- Question Type: {MC | CR}
- Expected Format: {FORMAT_DESCRIPTION}

**Your Task:**
Determine if this response can be scored. Return:

{
  "isValid": <true | false>,
  "reason": "<why valid or invalid>",
  "suggestedAction": "<what to do if invalid>"
}

**Invalid Reasons:**
- Empty or whitespace only
- Gibberish or nonsense
- Off-topic (e.g., "idk" or "I don't know")
- Test data (e.g., "test", "asdf")
- Multiple choice: not A-E format
```

**Example Input (Invalid):**
```json
{
  "studentAnswer": "idk lol",
  "questionType": "CR",
  "expectedFormat": "Multi-part calculation with explanation"
}
```

**Example Output:**
```json
{
  "isValid": false,
  "reason": "Response contains only informal dismissal ('idk lol') with no attempt at answering the question",
  "suggestedAction": "Flag for teacher review. Consider re-prompting student or marking as incomplete."
}
```

**Example Input (Valid but Incorrect):**
```json
{
  "studentAnswer": "z = (46-48.5)/1.2 = -3.5",
  "questionType": "CR",
  "expectedFormat": "Z-score calculation"
}
```

**Example Output:**
```json
{
  "isValid": true,
  "reason": "Student showed work and attempted calculation, even though arithmetic is incorrect (-2.08 is correct, not -3.5)",
  "suggestedAction": "Score normally. Incorrect answer but shows understanding of formula."
}
```

---

## Usage Notes

### Integration with Pipeline

1. **Phase 4 (CR Scoring):**
   - Use Prompt 1 & 2 for automated CR scoring
   - Save outputs to `reports/cr-scored-llm.json`
   - Compare with triage estimates for validation

2. **Phase 5 (Misconception Mining):**
   - Use Prompt 3 after distractor analysis
   - Enhance `L10-misconceptions.md` with LLM insights
   - Feed into intervention planning

3. **Phase 8 (Student Briefs):**
   - Use Prompt 4 to enhance current briefs
   - Target 120-180 word count automatically
   - Ensure topic linking is accurate

4. **Phase 9 (Interventions):**
   - Use Prompt 5 to generate additional mini-lessons
   - Customize for newly discovered misconceptions
   - Adapt to class-specific needs

5. **Data QA:**
   - Use Prompt 6 to filter out invalid responses
   - Run before Phase 3 consolidation
   - Flag for manual review if needed

### Best Practices

- **Temperature:** Use 0.3-0.5 for scoring (consistency), 0.7-0.9 for generation (creativity)
- **Validation:** Always spot-check LLM outputs with manual review initially
- **Iteration:** Refine prompts based on accuracy of outputs
- **Fallback:** If LLM unavailable, pipeline should gracefully degrade to triage-only

### Example API Call (Python)

```python
import openai

def score_cr_response(question_id, student_answer, rubric):
    prompt = f"""
    You are scoring a student's constructed response...
    [Use Prompt 1 or 2 template here]
    """

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are an AP Statistics expert scorer."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)
```

---

*Prompt library maintained by: Data Team*
*Next review: Monthly or after major rubric changes*
