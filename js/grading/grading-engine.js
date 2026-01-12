/**
 * Grading Engine - Flexible grading system for AP Statistics FRQ questions
 * Supports regex/rubric-based grading and AI grading via server
 *
 * Grading scores follow AP Statistics FRQ rubric:
 * - E (Essentially correct) - Full credit
 * - P (Partially correct) - Partial credit
 * - I (Incorrect) - No credit
 */

class GradingEngine {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || window.RAILWAY_SERVER_URL || 'https://apstats-turbo-server.up.railway.app';
    this.defaultTolerance = config.defaultTolerance || 0.01;
    this.aiEnabled = config.aiEnabled !== false;
  }

  /**
   * Grade a single FRQ answer
   * @param {string} answer - Student's answer text
   * @param {object} rule - Grading rule from frq-grading-rules.js
   * @param {object} context - Question context (variables, expected values, etc.)
   * @returns {Promise<object>} Grading result with score, feedback, details
   */
  async gradeAnswer(answer, rule, context = {}) {
    if (!answer || !answer.trim()) {
      return {
        score: 'I',
        correct: false,
        feedback: 'No answer provided.',
        matched: [],
        missing: rule.rubric?.filter(r => r.required).map(r => r.id) || []
      };
    }

    switch (rule.type) {
      case 'numeric':
        return this.gradeNumeric(answer, rule, context);
      case 'regex':
      case 'rubric':
        return this.gradeRegex(answer, rule, context);
      case 'exact':
        return this.gradeExact(answer, rule, context);
      case 'ai':
        return this.gradeWithAI(answer, rule, context);
      case 'dual':
        return this.gradeDual(answer, rule, context);
      default:
        // Default to regex/rubric grading
        return this.gradeRegex(answer, rule, context);
    }
  }

  /**
   * Grade multiple parts of an FRQ
   * @param {object} answers - Map of partId -> answer
   * @param {object} rules - Map of partId -> grading rule
   * @param {object} context - Shared question context
   * @returns {Promise<object>} Combined grading results
   */
  async gradeAll(answers, rules, context = {}) {
    const results = {};
    const promises = [];

    for (const [partId, answer] of Object.entries(answers)) {
      const rule = rules[partId];
      if (!rule) continue;

      promises.push(
        this.gradeAnswer(answer, rule, context)
          .then(result => ({ partId, result }))
      );
    }

    const resolved = await Promise.all(promises);
    for (const { partId, result } of resolved) {
      results[partId] = result;
    }

    // Calculate composite score
    const scores = Object.values(results).map(r => r.score);
    const scoreValues = { 'E': 4, 'P': 2, 'I': 0 };
    const totalScore = scores.reduce((sum, s) => sum + (scoreValues[s] || 0), 0);
    const maxScore = scores.length * 4;
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    let overallScore;
    if (percentage >= 80) {
      overallScore = 'E';
    } else if (percentage >= 40) {
      overallScore = 'P';
    } else {
      overallScore = 'I';
    }

    return {
      parts: results,
      overallScore,
      percentage: Math.round(percentage),
      allCorrect: scores.every(s => s === 'E')
    };
  }

  // ============== GRADING STRATEGIES ==============

  /**
   * Numeric grading with tolerance
   */
  gradeNumeric(answer, rule, context) {
    const userValue = parseFloat(answer.replace(/[^0-9.-]/g, ''));

    if (isNaN(userValue)) {
      return {
        score: 'I',
        correct: false,
        feedback: 'Please enter a valid number.'
      };
    }

    // Calculate expected value
    let expected = rule.expected;
    if (typeof expected === 'string') {
      expected = this.evaluateFormula(expected, context);
    }
    if (typeof expected === 'function') {
      expected = expected(context);
    }

    const tolerance = rule.tolerance ?? this.defaultTolerance;
    const diff = Math.abs(userValue - expected);
    const correct = diff <= Math.abs(expected * tolerance);

    return {
      score: correct ? 'E' : 'I',
      correct,
      expected,
      userValue,
      diff,
      feedback: correct
        ? 'Correct!'
        : `Expected approximately ${expected.toFixed(rule.decimals || 2)}, you entered ${userValue.toFixed(rule.decimals || 2)}.`
    };
  }

  /**
   * Exact match grading
   */
  gradeExact(answer, rule, context) {
    let expected = rule.expected;
    if (typeof expected === 'string') {
      expected = this.interpolate(expected, context);
    }

    const normalize = str => str.toString().toLowerCase().trim().replace(/\s+/g, ' ');
    const correct = normalize(answer) === normalize(expected);

    return {
      score: correct ? 'E' : 'I',
      correct,
      feedback: correct ? 'Correct!' : `Expected "${expected}".`
    };
  }

  /**
   * Regex/rubric grading - checks for required patterns
   */
  gradeRegex(answer, rule, context) {
    const text = answer.toString().toLowerCase();
    const results = {
      required: {},
      forbidden: [],
      matched: [],
      missing: [],
      score: 'E'
    };

    // Check required patterns
    let matchedCount = 0;
    let totalRequired = 0;
    const rubric = rule.rubric || rule.required || [];

    for (const item of rubric) {
      // Skip items with context conditions that don't apply
      if (item.contextCondition && !item.contextCondition(context)) {
        continue;
      }

      if (!item.required) continue;
      totalRequired++;

      // Get pattern (static or context-based)
      let pattern = item.pattern;
      if (item.contextPattern) {
        pattern = item.contextPattern(context);
      }
      if (Array.isArray(item.patterns)) {
        pattern = item.patterns;
      }

      if (!pattern) continue;

      // Test pattern(s)
      const patterns = Array.isArray(pattern) ? pattern : [pattern];
      let matched = false;

      for (let p of patterns) {
        // Interpolate context variables in string patterns
        if (typeof p === 'string') {
          p = this.interpolate(p, context);
          p = new RegExp(p, 'i');
        }

        const match = text.match(p);
        if (match) {
          // Validate match if validator exists
          if (item.validate) {
            matched = item.validate(match, context);
          } else {
            matched = true;
          }
          if (matched) break;
        }
      }

      results.required[item.id] = matched;
      if (matched) {
        matchedCount++;
        results.matched.push(item.id);
      } else {
        results.missing.push(item.id);
      }
    }

    // Check forbidden patterns
    const forbidden = rule.forbidden || [];
    for (const word of forbidden) {
      const pattern = typeof word === 'string' ? new RegExp(word, 'i') : word;
      if (pattern.test(text)) {
        results.forbidden.push(typeof word === 'string' ? word : word.source);
      }
    }

    // Determine score
    if (results.forbidden.length > 0) {
      results.score = 'I';
      results.feedback = `Avoid using "${results.forbidden[0]}" - it may imply something incorrect.`;
    } else {
      const scoring = rule.scoring || { E: { minRequired: totalRequired }, P: { minRequired: Math.ceil(totalRequired * 0.5) }, I: { minRequired: 0 } };
      const ratio = totalRequired > 0 ? matchedCount / totalRequired : 0;

      if (matchedCount >= (scoring.E?.minRequired || totalRequired)) {
        results.score = 'E';
        results.feedback = 'Excellent! All key elements included.';
      } else if (matchedCount >= (scoring.P?.minRequired || Math.ceil(totalRequired * 0.5))) {
        results.score = 'P';
        const missingItems = results.missing.slice(0, 3);
        results.feedback = `Good, but consider including: ${missingItems.join(', ')}.`;
      } else {
        results.score = 'I';
        results.feedback = 'Missing key elements. Review the rubric requirements.';
      }
    }

    results.correct = results.score === 'E';
    results.matchedCount = matchedCount;
    results.totalRequired = totalRequired;
    return results;
  }

  /**
   * AI grading via Railway server
   */
  async gradeWithAI(answer, rule, context) {
    if (!this.aiEnabled) {
      return {
        score: null,
        feedback: 'AI grading is disabled.',
        correct: null,
        _aiGraded: false
      };
    }

    try {
      const prompt = this.buildAIPrompt(rule.promptTemplate, answer, context);

      const response = await fetch(`${this.serverUrl}/api/ai/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            topic: context.topic || 'AP Statistics FRQ',
            questionId: context.questionId,
            partId: context.partId,
            expectedElements: rule.rubric?.map(r => r.description) || [],
            ...context
          },
          answers: { [context.partId || 'answer']: answer },
          prompt,
          aiPromptTemplate: rule.promptTemplate
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'AI grading failed');
      }

      // Extract score from result
      const fieldResult = result[context.partId] || result.answer || result;

      return {
        score: fieldResult.score || 'I',
        feedback: fieldResult.feedback || '',
        matched: fieldResult.matched || result.matched || [],
        missing: fieldResult.missing || result.missing || [],
        correct: (fieldResult.score) === 'E',
        _aiGraded: true,
        _provider: result._provider || 'groq',
        _model: result._model || 'llama-3.3-70b-versatile'
      };
    } catch (err) {
      console.error('AI grading error:', err);
      return {
        score: null,
        feedback: 'AI grading unavailable. Using rubric-based grading.',
        correct: null,
        _error: err.message,
        _aiGraded: false
      };
    }
  }

  /**
   * Dual grading: regex + AI
   * KEY RULE: AI can only UPGRADE a score, never downgrade
   * This prevents AI hallucinations from hurting students
   */
  async gradeDual(answer, rule, context) {
    // Run regex grading first (instant, reliable baseline)
    const regexResult = this.gradeRegex(answer, rule, context);

    // Run AI grading
    let aiResult = null;
    if (this.aiEnabled) {
      try {
        aiResult = await this.gradeWithAI(answer, rule, context);
      } catch (err) {
        console.warn('AI grading failed, using regex only:', err);
      }
    }

    // Score ordering: E > P > I
    const scoreOrder = { 'E': 3, 'P': 2, 'I': 1 };

    // AI CAN ONLY UPGRADE - never downgrade
    // This is critical for student fairness
    if (aiResult && aiResult.score && !aiResult._error) {
      const regexScore = scoreOrder[regexResult.score] || 0;
      const aiScore = scoreOrder[aiResult.score] || 0;

      if (aiScore > regexScore) {
        // AI upgraded the score - use AI result
        return {
          ...aiResult,
          _regexScore: regexResult.score,
          _upgraded: true,
          _bestOf: 'ai'
        };
      } else if (aiScore < regexScore) {
        // AI would downgrade - IGNORE AI, keep regex score
        // But include AI feedback as supplementary info
        console.log(`AI would downgrade ${regexResult.score} → ${aiResult.score}, keeping regex score`);
        return {
          ...regexResult,
          _aiScore: aiResult.score,
          _aiFeedback: aiResult.feedback,
          _aiIgnored: true,
          _bestOf: 'regex'
        };
      } else {
        // Same score - prefer AI feedback (usually more detailed)
        return {
          score: regexResult.score,
          feedback: aiResult.feedback || regexResult.feedback,
          matched: [...new Set([...(regexResult.matched || []), ...(aiResult.matched || [])])],
          missing: aiResult.missing || regexResult.missing,
          correct: regexResult.correct,
          _aiGraded: true,
          _provider: aiResult._provider,
          _model: aiResult._model,
          _bestOf: 'both'
        };
      }
    }

    // AI failed or unavailable - use regex result
    return {
      ...regexResult,
      _aiResult: aiResult,
      _bestOf: 'regex'
    };
  }

  // ============== HELPERS ==============

  /**
   * Evaluate a formula string with context values
   */
  evaluateFormula(formula, context) {
    let expr = formula;
    for (const [key, value] of Object.entries(context)) {
      expr = expr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    try {
      if (!/^[\d\s+\-*/().]+$/.test(expr)) {
        throw new Error('Invalid formula');
      }
      return Function(`"use strict"; return (${expr})`)();
    } catch (e) {
      console.error('Formula evaluation failed:', formula, e);
      return NaN;
    }
  }

  /**
   * Interpolate {{variables}} in a string
   */
  interpolate(template, context) {
    if (typeof template !== 'string') return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] !== undefined ? context[key] : match;
    });
  }

  /**
   * Build AI prompt from template
   */
  buildAIPrompt(template, answer, context) {
    // Default prompt if no template provided
    if (!template) {
      template = `You are an AP Statistics teacher grading a student's free-response answer.

Question: {{prompt}}
Topic: {{topic}}
Part: {{partId}}

Expected elements to check:
{{expectedElements}}

Student's Answer:
{{answer}}

Grade the response using these scores:
- E (Essentially correct): All key elements present and correct
- P (Partially correct): Some key elements present, minor errors
- I (Incorrect): Missing most key elements or major errors

Respond in JSON format:
{
  "score": "E" or "P" or "I",
  "feedback": "Brief explanation of the score",
  "matched": ["list of correct elements"],
  "missing": ["list of missing elements"]
}`;
    }

    let prompt = this.interpolate(template, context);
    prompt = prompt.replace(/\{\{answer\}\}/g, answer);
    prompt = prompt.replace(/\{\{expectedElements\}\}/g,
      (context.expectedElements || []).map((e, i) => `${i + 1}. ${e}`).join('\n'));

    return prompt;
  }
}

// Export for use in browser
window.GradingEngine = GradingEngine;
