/**
 * Framework Context Tests
 *
 * Tests for the AP Statistics framework data system used to provide
 * context-aware AI grading feedback during appeals.
 *
 * Tests cover:
 * - Framework data structure validation
 * - Question ID parsing
 * - Framework lookup by question ID
 * - Context string generation for AI prompts
 */

import { describe, it, expect } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// (Mirrors data/frameworks.js for testing)
// ============================================

/**
 * Sample Unit 4 framework data for testing
 */
const UNIT_FRAMEWORKS = {
  4: {
    title: "Probability, Random Variables, and Probability Distributions",
    examWeight: "10-20%",
    bigIdeas: [
      { id: "VAR", name: "Variation and Distribution", question: "How can an event be both random and predictable?" },
      { id: "UNC", name: "Patterns and Uncertainty", question: "About how many rolls of a fair six-sided die would we anticipate it taking to get three 1s?" }
    ],
    lessons: {
      1: {
        topic: "Introducing Statistics: Random and Non-Random Patterns?",
        skills: ["1.A: Identify the question to be answered or problem to be solved"],
        learningObjectives: [
          {
            id: "VAR-1.F",
            text: "Identify questions suggested by patterns in data",
            essentialKnowledge: [
              "VAR-1.F.1: Patterns in data do not necessarily mean that variation is not random."
            ]
          }
        ],
        keyConcepts: [
          "Random variation can produce patterns that appear meaningful"
        ]
      },
      2: {
        topic: "Estimating Probabilities Using Simulation",
        skills: ["3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations"],
        learningObjectives: [
          {
            id: "UNC-2.A",
            text: "Estimate probabilities using simulation",
            essentialKnowledge: [
              "UNC-2.A.1: A random process generates results that are determined by chance.",
              "UNC-2.A.5: The relative frequency of an outcome or event in simulated or empirical data can be used to estimate the probability of that outcome or event.",
              "UNC-2.A.6: The law of large numbers states that simulated (empirical) probabilities tend to get closer to the true probability as the number of trials increases."
            ]
          }
        ],
        keyConcepts: [
          "Simulation models random processes using chance devices",
          "Relative frequency = (count of event) / (total trials)",
          "More trials lead to better probability estimates (Law of Large Numbers)"
        ],
        commonMisconceptions: [
          "Thinking a few trials are enough to estimate probability accurately"
        ]
      },
      10: {
        topic: "Introduction to the Binomial Distribution",
        skills: ["3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations"],
        learningObjectives: [
          {
            id: "UNC-3.B",
            text: "Calculate probabilities for a binomial distribution",
            essentialKnowledge: [
              "UNC-3.B.1: The probability that a binomial random variable, X, has exactly x successes..."
            ]
          }
        ],
        keyConcepts: [
          "BINS: Binary outcomes, Independent trials, Number of trials fixed, Same probability of success"
        ],
        keyFormulas: [
          "P(X = x) = C(n,x) · p^x · (1-p)^(n-x)"
        ]
      }
    }
  }
};

/**
 * Parse question ID to extract unit and lesson numbers
 */
function parseQuestionId(questionId) {
  if (!questionId) return null;

  const match = questionId.match(/^U(\d+)-L(\d+)-Q(\d+)$/i);
  if (!match) return null;

  return {
    unit: parseInt(match[1], 10),
    lesson: parseInt(match[2], 10),
    question: parseInt(match[3], 10)
  };
}

/**
 * Get framework data for a specific unit and lesson
 */
function getFramework(unit, lesson) {
  const unitData = UNIT_FRAMEWORKS[unit];
  if (!unitData) return null;

  const lessonData = unitData.lessons[lesson];
  if (!lessonData) return null;

  return {
    unit: unit,
    unitTitle: unitData.title,
    lesson: lesson,
    ...lessonData
  };
}

/**
 * Get framework for a question based on its ID
 */
function getFrameworkForQuestion(questionId) {
  const parsed = parseQuestionId(questionId);
  if (!parsed) return null;

  return getFramework(parsed.unit, parsed.lesson);
}

/**
 * Build a concise framework context string for AI prompts
 */
function buildFrameworkContext(framework) {
  if (!framework) return '';

  let context = `## AP Statistics Framework Context\n`;
  context += `**Unit ${framework.unit}: ${framework.unitTitle}**\n`;
  context += `**Topic ${framework.unit}.${framework.lesson}: ${framework.topic}**\n\n`;

  // Skills
  context += `### Skills Being Assessed\n`;
  framework.skills.forEach(skill => {
    context += `- ${skill}\n`;
  });
  context += '\n';

  // Learning objectives and essential knowledge
  context += `### Learning Objectives & Essential Knowledge\n`;
  framework.learningObjectives.forEach(lo => {
    context += `**${lo.id}: ${lo.text}**\n`;
    lo.essentialKnowledge.forEach(ek => {
      context += `  - ${ek}\n`;
    });
  });
  context += '\n';

  // Key concepts
  if (framework.keyConcepts && framework.keyConcepts.length > 0) {
    context += `### Key Concepts Students Should Demonstrate\n`;
    framework.keyConcepts.forEach(concept => {
      context += `- ${concept}\n`;
    });
    context += '\n';
  }

  // Key formulas
  if (framework.keyFormulas && framework.keyFormulas.length > 0) {
    context += `### Relevant Formulas\n`;
    framework.keyFormulas.forEach(formula => {
      context += `- ${formula}\n`;
    });
    context += '\n';
  }

  // Common misconceptions
  if (framework.commonMisconceptions && framework.commonMisconceptions.length > 0) {
    context += `### Common Student Misconceptions\n`;
    framework.commonMisconceptions.forEach(misc => {
      context += `- ${misc}\n`;
    });
    context += '\n';
  }

  return context;
}

// ============================================
// TEST SUITES
// ============================================

describe('Framework Data Structure', () => {
  describe('Unit 4 Framework', () => {
    it('should have correct unit title and exam weight', () => {
      const unit4 = UNIT_FRAMEWORKS[4];
      expect(unit4).toBeDefined();
      expect(unit4.title).toBe("Probability, Random Variables, and Probability Distributions");
      expect(unit4.examWeight).toBe("10-20%");
    });

    it('should have big ideas with required fields', () => {
      const bigIdeas = UNIT_FRAMEWORKS[4].bigIdeas;
      expect(bigIdeas).toHaveLength(2);

      bigIdeas.forEach(bi => {
        expect(bi).toHaveProperty('id');
        expect(bi).toHaveProperty('name');
        expect(bi).toHaveProperty('question');
      });
    });

    it('should have VAR and UNC big ideas', () => {
      const bigIdeas = UNIT_FRAMEWORKS[4].bigIdeas;
      const ids = bigIdeas.map(bi => bi.id);
      expect(ids).toContain('VAR');
      expect(ids).toContain('UNC');
    });
  });

  describe('Lesson Structure', () => {
    it('should have required fields for each lesson', () => {
      const lessons = UNIT_FRAMEWORKS[4].lessons;

      Object.values(lessons).forEach(lesson => {
        expect(lesson).toHaveProperty('topic');
        expect(lesson).toHaveProperty('skills');
        expect(lesson).toHaveProperty('learningObjectives');
        expect(lesson).toHaveProperty('keyConcepts');
        expect(Array.isArray(lesson.skills)).toBe(true);
        expect(Array.isArray(lesson.learningObjectives)).toBe(true);
        expect(Array.isArray(lesson.keyConcepts)).toBe(true);
      });
    });

    it('should have learning objectives with essential knowledge', () => {
      const lesson2 = UNIT_FRAMEWORKS[4].lessons[2];

      lesson2.learningObjectives.forEach(lo => {
        expect(lo).toHaveProperty('id');
        expect(lo).toHaveProperty('text');
        expect(lo).toHaveProperty('essentialKnowledge');
        expect(Array.isArray(lo.essentialKnowledge)).toBe(true);
        expect(lo.essentialKnowledge.length).toBeGreaterThan(0);
      });
    });

    it('should have lesson 2 with simulation-specific content', () => {
      const lesson2 = UNIT_FRAMEWORKS[4].lessons[2];
      expect(lesson2.topic).toContain("Simulation");

      const ekTexts = lesson2.learningObjectives[0].essentialKnowledge.join(' ');
      expect(ekTexts).toContain("relative frequency");
      expect(ekTexts).toContain("law of large numbers");
    });

    it('should have lesson 10 with binomial-specific content', () => {
      const lesson10 = UNIT_FRAMEWORKS[4].lessons[10];
      expect(lesson10.topic).toContain("Binomial");
      expect(lesson10.keyFormulas).toBeDefined();
      expect(lesson10.keyFormulas.some(f => f.includes('C(n,x)'))).toBe(true);
    });
  });
});

describe('Question ID Parsing', () => {
  describe('parseQuestionId', () => {
    it('should parse valid question IDs', () => {
      const result = parseQuestionId('U4-L2-Q01');
      expect(result).toEqual({ unit: 4, lesson: 2, question: 1 });
    });

    it('should handle different unit/lesson/question numbers', () => {
      expect(parseQuestionId('U1-L1-Q01')).toEqual({ unit: 1, lesson: 1, question: 1 });
      expect(parseQuestionId('U4-L12-Q15')).toEqual({ unit: 4, lesson: 12, question: 15 });
      expect(parseQuestionId('U10-L5-Q99')).toEqual({ unit: 10, lesson: 5, question: 99 });
    });

    it('should be case-insensitive', () => {
      expect(parseQuestionId('u4-l2-q01')).toEqual({ unit: 4, lesson: 2, question: 1 });
      expect(parseQuestionId('U4-l2-Q01')).toEqual({ unit: 4, lesson: 2, question: 1 });
    });

    it('should return null for invalid formats', () => {
      expect(parseQuestionId(null)).toBeNull();
      expect(parseQuestionId('')).toBeNull();
      expect(parseQuestionId('invalid')).toBeNull();
      expect(parseQuestionId('U4-L2')).toBeNull();
      expect(parseQuestionId('U4-L2-')).toBeNull();
      expect(parseQuestionId('U4L2Q01')).toBeNull();
      expect(parseQuestionId('4-2-1')).toBeNull();
    });

    it('should return null for malformed IDs', () => {
      expect(parseQuestionId('U-L2-Q01')).toBeNull();
      expect(parseQuestionId('U4-L-Q01')).toBeNull();
      expect(parseQuestionId('U4-L2-Q')).toBeNull();
    });
  });
});

describe('Framework Lookup', () => {
  describe('getFramework', () => {
    it('should return framework for valid unit and lesson', () => {
      const framework = getFramework(4, 2);
      expect(framework).toBeDefined();
      expect(framework.unit).toBe(4);
      expect(framework.lesson).toBe(2);
      expect(framework.topic).toContain("Simulation");
    });

    it('should include unit title in result', () => {
      const framework = getFramework(4, 2);
      expect(framework.unitTitle).toBe("Probability, Random Variables, and Probability Distributions");
    });

    it('should return null for non-existent unit', () => {
      expect(getFramework(99, 1)).toBeNull();
    });

    it('should return null for non-existent lesson', () => {
      expect(getFramework(4, 99)).toBeNull();
    });
  });

  describe('getFrameworkForQuestion', () => {
    it('should return framework for valid question ID', () => {
      const framework = getFrameworkForQuestion('U4-L2-Q01');
      expect(framework).toBeDefined();
      expect(framework.unit).toBe(4);
      expect(framework.lesson).toBe(2);
    });

    it('should work for different lessons', () => {
      const f1 = getFrameworkForQuestion('U4-L1-Q01');
      const f2 = getFrameworkForQuestion('U4-L2-Q05');
      const f10 = getFrameworkForQuestion('U4-L10-Q03');

      expect(f1.topic).toContain("Random and Non-Random");
      expect(f2.topic).toContain("Simulation");
      expect(f10.topic).toContain("Binomial");
    });

    it('should return null for invalid question IDs', () => {
      expect(getFrameworkForQuestion('invalid')).toBeNull();
      expect(getFrameworkForQuestion(null)).toBeNull();
    });

    it('should return null for questions in non-existent units', () => {
      expect(getFrameworkForQuestion('U99-L1-Q01')).toBeNull();
    });
  });
});

describe('Framework Context Generation', () => {
  describe('buildFrameworkContext', () => {
    it('should return empty string for null framework', () => {
      expect(buildFrameworkContext(null)).toBe('');
    });

    it('should include unit and topic header', () => {
      const framework = getFramework(4, 2);
      const context = buildFrameworkContext(framework);

      expect(context).toContain('## AP Statistics Framework Context');
      expect(context).toContain('**Unit 4:');
      expect(context).toContain('Probability, Random Variables');
      expect(context).toContain('**Topic 4.2:');
      expect(context).toContain('Simulation');
    });

    it('should include skills section', () => {
      const framework = getFramework(4, 2);
      const context = buildFrameworkContext(framework);

      expect(context).toContain('### Skills Being Assessed');
      expect(context).toContain('3.A:');
    });

    it('should include learning objectives and essential knowledge', () => {
      const framework = getFramework(4, 2);
      const context = buildFrameworkContext(framework);

      expect(context).toContain('### Learning Objectives & Essential Knowledge');
      expect(context).toContain('**UNC-2.A:');
      expect(context).toContain('UNC-2.A.1:');
      expect(context).toContain('random process');
    });

    it('should include key concepts', () => {
      const framework = getFramework(4, 2);
      const context = buildFrameworkContext(framework);

      expect(context).toContain('### Key Concepts Students Should Demonstrate');
      expect(context).toContain('Relative frequency');
      expect(context).toContain('Law of Large Numbers');
    });

    it('should include formulas when present', () => {
      const framework = getFramework(4, 10);
      const context = buildFrameworkContext(framework);

      expect(context).toContain('### Relevant Formulas');
      expect(context).toContain('C(n,x)');
    });

    it('should include common misconceptions when present', () => {
      const framework = getFramework(4, 2);
      const context = buildFrameworkContext(framework);

      expect(context).toContain('### Common Student Misconceptions');
      expect(context).toContain('few trials');
    });

    it('should omit sections without data', () => {
      const framework = getFramework(4, 1);
      const context = buildFrameworkContext(framework);

      // Lesson 1 doesn't have formulas or misconceptions in our test data
      expect(context).not.toContain('### Relevant Formulas');
      expect(context).not.toContain('### Common Student Misconceptions');
    });
  });
});

describe('Appeal Prompt Integration', () => {
  /**
   * Mock buildAppealPrompt that mirrors server.js implementation
   */
  function buildAppealPrompt(scenario, answers, appealText, previousResults) {
    const framework = getFrameworkForQuestion(scenario.questionId);
    const frameworkContext = framework ? buildFrameworkContext(framework) : '';

    const studentAnswers = Object.entries(answers)
      .map(([field, value]) => `- ${field}: "${value}"`)
      .join('\n');

    return `You are an AP Statistics teacher reviewing a student's APPEAL.

${frameworkContext}## Question Context
Question: ${scenario.prompt || 'AP Statistics Question'}

## Student's Answer
${studentAnswers}

## Student's Appeal
"${appealText}"`;
  }

  it('should include framework context for valid question ID', () => {
    const prompt = buildAppealPrompt(
      { questionId: 'U4-L2-Q01', prompt: 'What is simulation?' },
      { answer: 'Using random numbers' },
      'I think my answer demonstrates understanding of simulation'
    );

    expect(prompt).toContain('## AP Statistics Framework Context');
    expect(prompt).toContain('Topic 4.2');
    expect(prompt).toContain('Simulation');
    expect(prompt).toContain('UNC-2.A');
  });

  it('should work without framework for invalid question ID', () => {
    const prompt = buildAppealPrompt(
      { questionId: 'invalid', prompt: 'Some question' },
      { answer: 'Some answer' },
      'My appeal'
    );

    expect(prompt).not.toContain('## AP Statistics Framework Context');
    expect(prompt).toContain('## Question Context');
    expect(prompt).toContain('Some question');
  });

  it('should include all key sections for lesson 2 questions', () => {
    const prompt = buildAppealPrompt(
      { questionId: 'U4-L2-Q05' },
      { answer: 'test' },
      'appeal text'
    );

    // Should have simulation-related content
    expect(prompt).toContain('relative frequency');
    expect(prompt).toContain('law of large numbers');
    expect(prompt).toContain('Key Concepts Students Should Demonstrate');
  });
});

describe('Edge Cases', () => {
  it('should handle lesson numbers with leading zeros in question IDs', () => {
    // Q01 vs Q1 shouldn't matter for parsing
    const r1 = parseQuestionId('U4-L2-Q01');
    const r2 = parseQuestionId('U4-L2-Q1');

    expect(r1.question).toBe(1);
    expect(r2.question).toBe(1);
  });

  it('should handle empty essential knowledge arrays gracefully', () => {
    const mockFramework = {
      unit: 4,
      unitTitle: "Test",
      lesson: 99,
      topic: "Test Topic",
      skills: ["Test skill"],
      learningObjectives: [{
        id: "TEST-1",
        text: "Test objective",
        essentialKnowledge: []
      }],
      keyConcepts: []
    };

    const context = buildFrameworkContext(mockFramework);
    expect(context).toContain('**TEST-1:');
    expect(context).not.toContain('undefined');
  });

  it('should handle special characters in content', () => {
    const mockFramework = {
      unit: 4,
      unitTitle: "Test",
      lesson: 99,
      topic: "Test with P(A|B) and μ symbols",
      skills: ["Calculate P(A ∩ B)"],
      learningObjectives: [{
        id: "TEST-1",
        text: "Use formula σ = √variance",
        essentialKnowledge: ["Formula: μ = Σx·P(x)"]
      }],
      keyConcepts: ["P(A|B) = P(A∩B)/P(B)"]
    };

    const context = buildFrameworkContext(mockFramework);
    expect(context).toContain('P(A|B)');
    expect(context).toContain('μ');
    expect(context).toContain('σ');
  });
});
