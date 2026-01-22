// AP Statistics Course Framework Data
// Source: AP Statistics Course and Exam Description (College Board)
// Used to provide context-aware AI grading feedback

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
          "Random variation can produce patterns that appear meaningful",
          "Not all patterns indicate non-random behavior",
          "Distinguishing random from non-random patterns requires statistical reasoning"
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
              "UNC-2.A.2: An outcome is the result of a trial of a random process.",
              "UNC-2.A.3: An event is a collection of outcomes.",
              "UNC-2.A.4: Simulation is a way to model random events, such that simulated outcomes closely match real-world outcomes. All possible outcomes are associated with a value to be determined by chance. Record the counts of simulated outcomes and the count total.",
              "UNC-2.A.5: The relative frequency of an outcome or event in simulated or empirical data can be used to estimate the probability of that outcome or event.",
              "UNC-2.A.6: The law of large numbers states that simulated (empirical) probabilities tend to get closer to the true probability as the number of trials increases."
            ]
          }
        ],
        keyConcepts: [
          "Simulation models random processes using chance devices (coins, dice, random number generators)",
          "Relative frequency = (count of event) / (total trials)",
          "More trials lead to better probability estimates (Law of Large Numbers)",
          "A trial is one run of the simulation; an outcome is the result of a trial",
          "An event can include multiple outcomes"
        ],
        commonMisconceptions: [
          "Thinking a few trials are enough to estimate probability accurately",
          "Confusing outcomes (single results) with events (collections of outcomes)",
          "Expecting simulated probabilities to exactly match theoretical probabilities"
        ]
      },

      3: {
        topic: "Introduction to Probability",
        skills: [
          "3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations",
          "4.B: Interpret statistical calculations and findings to assign meaning or assess a claim"
        ],
        learningObjectives: [
          {
            id: "VAR-4.A",
            text: "Calculate probabilities for events and their complements",
            essentialKnowledge: [
              "VAR-4.A.1: The sample space of a random process is the set of all possible non-overlapping outcomes.",
              "VAR-4.A.2: If all outcomes in the sample space are equally likely, then the probability an event E will occur is: (number of outcomes in event E) / (total number of outcomes in sample space).",
              "VAR-4.A.3: The probability of an event is a number between 0 and 1, inclusive.",
              "VAR-4.A.4: The probability of the complement of an event E, denoted E' or E^C (i.e., not E), is equal to 1 - P(E)."
            ]
          },
          {
            id: "VAR-4.B",
            text: "Interpret probabilities for events",
            essentialKnowledge: [
              "VAR-4.B.1: Probabilities of events in repeatable situations can be interpreted as the relative frequency with which the event will occur in the long run."
            ]
          }
        ],
        keyConcepts: [
          "Sample space contains all possible outcomes",
          "P(E) = favorable outcomes / total outcomes (when equally likely)",
          "0 ≤ P(E) ≤ 1 for any event",
          "P(E') = 1 - P(E) is the complement rule",
          "Probability represents long-run relative frequency"
        ],
        keyFormulas: [
          "P(E) = n(E) / n(S) when outcomes are equally likely",
          "P(E') = 1 - P(E)"
        ]
      },

      4: {
        topic: "Mutually Exclusive Events",
        skills: ["4.B: Interpret statistical calculations and findings to assign meaning or assess a claim"],
        learningObjectives: [
          {
            id: "VAR-4.C",
            text: "Explain why two events are (or are not) mutually exclusive",
            essentialKnowledge: [
              "VAR-4.C.1: The probability that events A and B both will occur, sometimes called the joint probability, is the probability of the intersection of A and B, denoted P(A ∩ B).",
              "VAR-4.C.2: Two events are mutually exclusive or disjoint if they cannot occur at the same time. So P(A ∩ B) = 0."
            ]
          }
        ],
        keyConcepts: [
          "Mutually exclusive events cannot happen together",
          "If A and B are mutually exclusive, P(A ∩ B) = 0",
          "Joint probability P(A ∩ B) represents both events occurring",
          "Being mutually exclusive is different from being independent"
        ],
        commonMisconceptions: [
          "Confusing mutually exclusive with independent events",
          "Thinking mutually exclusive events are always complementary"
        ]
      },

      5: {
        topic: "Conditional Probability",
        skills: ["3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations"],
        learningObjectives: [
          {
            id: "VAR-4.D",
            text: "Calculate conditional probabilities",
            essentialKnowledge: [
              "VAR-4.D.1: The probability that event A will occur given that event B has occurred is called a conditional probability and denoted P(A|B) = P(A ∩ B) / P(B).",
              "VAR-4.D.2: The multiplication rule states that the probability that events A and B both will occur is equal to the probability that event A will occur multiplied by the probability that event B will occur, given that A has occurred. This is denoted P(A ∩ B) = P(A) · P(B|A)."
            ]
          }
        ],
        keyConcepts: [
          "P(A|B) means probability of A given B has occurred",
          "Conditional probability restricts the sample space to event B",
          "P(A|B) = P(A ∩ B) / P(B) is the conditional probability formula",
          "P(A ∩ B) = P(A) · P(B|A) is the general multiplication rule",
          "Two-way tables and tree diagrams help visualize conditional probabilities"
        ],
        keyFormulas: [
          "P(A|B) = P(A ∩ B) / P(B)",
          "P(A ∩ B) = P(A) · P(B|A)",
          "P(A ∩ B) = P(B) · P(A|B)"
        ]
      },

      6: {
        topic: "Independent Events and Unions of Events",
        skills: ["3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations"],
        learningObjectives: [
          {
            id: "VAR-4.E",
            text: "Calculate probabilities for independent events and for the union of two events",
            essentialKnowledge: [
              "VAR-4.E.1: Events A and B are independent if, and only if, knowing whether event A has occurred (or will occur) does not change the probability that event B will occur.",
              "VAR-4.E.2: If, and only if, events A and B are independent, then P(A|B) = P(A), P(B|A) = P(B), and P(A ∩ B) = P(A) · P(B).",
              "VAR-4.E.3: The probability that event A or event B (or both) will occur is the probability of the union of A and B, denoted P(A ∪ B).",
              "VAR-4.E.4: The addition rule states that the probability that event A or event B or both will occur is equal to the probability that event A will occur plus the probability that event B will occur minus the probability that both events A and B will occur. This is denoted P(A ∪ B) = P(A) + P(B) - P(A ∩ B)."
            ]
          }
        ],
        keyConcepts: [
          "Independent events: one occurring doesn't affect the other's probability",
          "For independent events: P(A ∩ B) = P(A) · P(B)",
          "Union (A or B) uses the addition rule",
          "Always subtract P(A ∩ B) to avoid double-counting",
          "For mutually exclusive events: P(A ∪ B) = P(A) + P(B)"
        ],
        keyFormulas: [
          "P(A ∩ B) = P(A) · P(B) [if independent]",
          "P(A ∪ B) = P(A) + P(B) - P(A ∩ B) [general addition rule]"
        ],
        commonMisconceptions: [
          "Confusing independent with mutually exclusive",
          "Forgetting to subtract P(A ∩ B) in the addition rule",
          "Assuming events are independent without justification"
        ]
      },

      7: {
        topic: "Introduction to Random Variables and Probability Distributions",
        skills: [
          "2.B: Construct numerical or graphical representations of distributions",
          "4.B: Interpret statistical calculations and findings to assign meaning or assess a claim"
        ],
        learningObjectives: [
          {
            id: "VAR-5.A",
            text: "Represent the probability distribution for a discrete random variable",
            essentialKnowledge: [
              "VAR-5.A.1: The values of a random variable are the numerical outcomes of random behavior.",
              "VAR-5.A.2: A discrete random variable is a variable that can only take a countable number of values. Each value has a probability associated with it. The sum of the probabilities over all of the possible values must be 1.",
              "VAR-5.A.3: A probability distribution can be represented as a graph, table, or function showing the probabilities associated with values of a random variable.",
              "VAR-5.A.4: A cumulative probability distribution can be represented as a table or function showing the probability of being less than or equal to each value of the random variable."
            ]
          },
          {
            id: "VAR-5.B",
            text: "Interpret a probability distribution",
            essentialKnowledge: [
              "VAR-5.B.1: An interpretation of a probability distribution provides information about the shape, center, and spread of a population and allows one to make conclusions about the population of interest."
            ]
          }
        ],
        keyConcepts: [
          "Random variable assigns numerical values to outcomes",
          "Discrete random variable has countable possible values",
          "All probabilities must sum to 1",
          "Probability distributions show all values and their probabilities",
          "Interpret shape, center, and spread in context"
        ],
        commonMisconceptions: [
          "Forgetting that probabilities must sum to 1",
          "Not distinguishing between probability and cumulative probability"
        ]
      },

      8: {
        topic: "Mean and Standard Deviation of Random Variables",
        skills: [
          "3.B: Determine parameters for probability distributions",
          "4.B: Interpret statistical calculations and findings to assign meaning or assess a claim"
        ],
        learningObjectives: [
          {
            id: "VAR-5.C",
            text: "Calculate parameters for a discrete random variable",
            essentialKnowledge: [
              "VAR-5.C.1: A numerical value measuring a characteristic of a population or the distribution of a random variable is known as a parameter, which is a single, fixed value.",
              "VAR-5.C.2: The mean, or expected value, for a discrete random variable X is μ_X = Σ x_i · P(x_i).",
              "VAR-5.C.3: The standard deviation for a discrete random variable X is σ_X = √[Σ (x_i - μ_X)² · P(x_i)]."
            ]
          },
          {
            id: "VAR-5.D",
            text: "Interpret parameters for a discrete random variable",
            essentialKnowledge: [
              "VAR-5.D.1: Parameters for a discrete random variable should be interpreted using appropriate units and within the context of a specific population."
            ]
          }
        ],
        keyConcepts: [
          "Expected value (mean) is the long-run average",
          "μ = Σ x · P(x) weights each value by its probability",
          "Standard deviation measures spread around the mean",
          "Interpretations must include context and units"
        ],
        keyFormulas: [
          "μ_X = Σ x_i · P(x_i)",
          "σ_X = √[Σ (x_i - μ_X)² · P(x_i)]",
          "Variance: σ²_X = Σ (x_i - μ_X)² · P(x_i)"
        ]
      },

      9: {
        topic: "Combining Random Variables",
        skills: [
          "3.B: Determine parameters for probability distributions",
          "3.C: Describe probability distributions"
        ],
        learningObjectives: [
          {
            id: "VAR-5.E",
            text: "Calculate parameters for linear combinations of random variables",
            essentialKnowledge: [
              "VAR-5.E.1: For random variables X and Y and real numbers a and b, the mean of aX + bY is aμ_X + bμ_Y.",
              "VAR-5.E.2: Two random variables are independent if knowing information about one of them does not change the probability distribution of the other.",
              "VAR-5.E.3: For independent random variables X and Y and real numbers a and b, the mean of aX + bY is aμ_X + bμ_Y, and the variance of aX + bY is a²σ²_X + b²σ²_Y."
            ]
          },
          {
            id: "VAR-5.F",
            text: "Describe the effects of linear transformations of parameters of random variables",
            essentialKnowledge: [
              "VAR-5.F.1: For Y = a + bX, the probability distribution of the transformed random variable, Y, has the same shape as the probability distribution for X, so long as a > 0 and b > 0. The mean of Y is μ_Y = a + bμ_X. The standard deviation of Y is σ_Y = |b|σ_X."
            ]
          }
        ],
        keyConcepts: [
          "Means add: μ_{X+Y} = μ_X + μ_Y",
          "Means subtract: μ_{X-Y} = μ_X - μ_Y",
          "Variances always add (for independent variables): σ²_{X±Y} = σ²_X + σ²_Y",
          "Linear transformation Y = a + bX: μ_Y = a + bμ_X and σ_Y = |b|σ_X",
          "Shape is preserved under linear transformation"
        ],
        keyFormulas: [
          "μ_{aX+bY} = aμ_X + bμ_Y",
          "σ²_{aX+bY} = a²σ²_X + b²σ²_Y [if independent]",
          "μ_{a+bX} = a + bμ_X",
          "σ_{a+bX} = |b|σ_X"
        ],
        commonMisconceptions: [
          "Subtracting variances when combining random variables",
          "Forgetting to square coefficients when computing variance",
          "Applying variance formulas to non-independent variables"
        ]
      },

      10: {
        topic: "Introduction to the Binomial Distribution",
        skills: ["3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations"],
        learningObjectives: [
          {
            id: "UNC-3.A",
            text: "Estimate probabilities of binomial random variables using data from a simulation",
            essentialKnowledge: [
              "UNC-3.A.1: A probability distribution can be constructed using the rules of probability or estimated with a simulation using random number generators.",
              "UNC-3.A.2: A binomial random variable, X, counts the number of successes in n repeated independent trials, each trial having two possible outcomes (success or failure), with the probability of success p and the probability of failure 1 - p."
            ]
          },
          {
            id: "UNC-3.B",
            text: "Calculate probabilities for a binomial distribution",
            essentialKnowledge: [
              "UNC-3.B.1: The probability that a binomial random variable, X, has exactly x successes for n independent trials, when the probability of success is p, is calculated as P(X = x) = C(n,x) · p^x · (1-p)^(n-x), x = 0, 1, 2, ..., n. This is the binomial probability function."
            ]
          }
        ],
        keyConcepts: [
          "BINS: Binary outcomes, Independent trials, Number of trials fixed, Same probability of success",
          "Binomial counts number of successes in n trials",
          "Use binomial when checking if BINS conditions are met",
          "P(X = x) uses combinations and probability powers"
        ],
        keyFormulas: [
          "P(X = x) = C(n,x) · p^x · (1-p)^(n-x)",
          "C(n,x) = n! / [x!(n-x)!]"
        ],
        commonMisconceptions: [
          "Applying binomial when trials are not independent",
          "Forgetting to check all BINS conditions",
          "Confusing binomial with geometric distributions"
        ]
      },

      11: {
        topic: "Parameters for a Binomial Distribution",
        skills: [
          "3.B: Determine parameters for probability distributions",
          "4.B: Interpret statistical calculations and findings to assign meaning or assess a claim"
        ],
        learningObjectives: [
          {
            id: "UNC-3.C",
            text: "Calculate parameters for a binomial distribution",
            essentialKnowledge: [
              "UNC-3.C.1: If a random variable is binomial, its mean, μ_X, is np and its standard deviation, σ_X, is √[np(1-p)]."
            ]
          },
          {
            id: "UNC-3.D",
            text: "Interpret probabilities and parameters for a binomial distribution",
            essentialKnowledge: [
              "UNC-3.D.1: Probabilities and parameters for a binomial distribution should be interpreted using appropriate units and within the context of a specific population or situation."
            ]
          }
        ],
        keyConcepts: [
          "Mean of binomial: μ = np (expected number of successes)",
          "Standard deviation: σ = √[np(1-p)]",
          "Interpretations must include context and units",
          "Mean represents the expected count in many repetitions"
        ],
        keyFormulas: [
          "μ_X = np",
          "σ_X = √[np(1-p)]"
        ]
      },

      12: {
        topic: "The Geometric Distribution",
        skills: [
          "3.A: Determine relative frequencies, proportions, or probabilities using simulation or calculations",
          "3.B: Determine parameters for probability distributions",
          "4.B: Interpret statistical calculations and findings to assign meaning or assess a claim"
        ],
        learningObjectives: [
          {
            id: "UNC-3.E",
            text: "Calculate probabilities for geometric random variables",
            essentialKnowledge: [
              "UNC-3.E.1: For a sequence of independent trials, a geometric random variable, X, gives the number of the trial on which the first success occurs. Each trial has two possible outcomes (success or failure) with the probability of success p and the probability of failure 1 - p.",
              "UNC-3.E.2: The probability that the first success for repeated independent trials with probability of success p occurs on trial x is calculated as P(X = x) = (1-p)^(x-1) · p, x = 1, 2, 3, ... This is the geometric probability function."
            ]
          },
          {
            id: "UNC-3.F",
            text: "Calculate parameters of a geometric distribution",
            essentialKnowledge: [
              "UNC-3.F.1: If a random variable is geometric, its mean, μ_X, is 1/p and its standard deviation, σ_X, is √(1-p)/p."
            ]
          },
          {
            id: "UNC-3.G",
            text: "Interpret probabilities and parameters for a geometric distribution",
            essentialKnowledge: [
              "UNC-3.G.1: Probabilities and parameters for a geometric distribution should be interpreted using appropriate units and within the context of a specific population or situation."
            ]
          }
        ],
        keyConcepts: [
          "Geometric counts trials until FIRST success",
          "No fixed number of trials (unlike binomial)",
          "Mean = 1/p (expected trials until first success)",
          "Probability decreases as x increases (waiting longer is less likely)"
        ],
        keyFormulas: [
          "P(X = x) = (1-p)^(x-1) · p",
          "μ_X = 1/p",
          "σ_X = √(1-p) / p"
        ],
        commonMisconceptions: [
          "Confusing geometric (first success) with binomial (counting successes)",
          "Using geometric when number of trials is fixed",
          "Forgetting geometric starts counting at x = 1, not 0"
        ]
      }
    }
  }
};

/**
 * Get framework data for a specific unit and lesson
 * @param {number} unit - Unit number (e.g., 4)
 * @param {number} lesson - Lesson number (e.g., 2)
 * @returns {Object|null} Lesson framework data or null if not found
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
 * Parse question ID to extract unit and lesson numbers
 * @param {string} questionId - Question ID in format "U{unit}-L{lesson}-Q{number}"
 * @returns {Object|null} { unit, lesson, question } or null if invalid format
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
 * Get framework for a question based on its ID
 * @param {string} questionId - Question ID in format "U{unit}-L{lesson}-Q{number}"
 * @returns {Object|null} Framework data or null if not found
 */
function getFrameworkForQuestion(questionId) {
  const parsed = parseQuestionId(questionId);
  if (!parsed) return null;

  return getFramework(parsed.unit, parsed.lesson);
}

/**
 * Build a concise framework context string for AI prompts
 * @param {Object} framework - Framework object from getFramework()
 * @returns {string} Formatted context string
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

  // Common misconceptions (helps AI identify where student might be going wrong)
  if (framework.commonMisconceptions && framework.commonMisconceptions.length > 0) {
    context += `### Common Student Misconceptions\n`;
    framework.commonMisconceptions.forEach(misc => {
      context += `- ${misc}\n`;
    });
    context += '\n';
  }

  return context;
}

// ESM exports for Railway server (Node.js with "type": "module")
export {
  UNIT_FRAMEWORKS,
  getFramework,
  parseQuestionId,
  getFrameworkForQuestion,
  buildFrameworkContext
};
