/**
 * FRQ Grading Rules - Rubric-based grading for AP Statistics free-response questions
 *
 * Each rule defines:
 * - type: 'regex' | 'numeric' | 'ai' | 'dual'
 * - rubric: Array of required elements to check
 * - scoring: Thresholds for E/P/I scores
 * - forbidden: Patterns that indicate incorrect understanding
 * - promptTemplate: Template for AI grading (optional)
 */

const FRQGradingRules = {
  // ============================================
  // UNIT 1: ONE-VARIABLE DATA
  // ============================================

  /**
   * Describe distribution shape (histogram, dotplot, stemplot)
   */
  describeDistributionShape: {
    type: 'regex',
    rubric: [
      {
        id: 'shape',
        required: true,
        patterns: [
          /\b(symmetric|skewed|uniform|bimodal|unimodal|roughly symmetric|approximately symmetric)\b/i,
          /\b(skewed (left|right)|left[\s-]?skewed|right[\s-]?skewed)\b/i
        ],
        description: 'Identify the shape (symmetric, skewed left/right, uniform, bimodal)'
      },
      {
        id: 'direction',
        required: false,
        patterns: [/\b(left|right|positive|negative)\b/i],
        description: 'Specify direction of skew if applicable',
        contextCondition: ctx => ctx.expectSkew
      },
      {
        id: 'outliers',
        required: false,
        patterns: [
          /\b(outlier|unusual|extreme|gap)\b/i,
          /\bno (apparent |visible |obvious )?(outlier|unusual)/i
        ],
        description: 'Mention presence or absence of outliers'
      }
    ],
    scoring: { E: { minRequired: 2 }, P: { minRequired: 1 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Describe distribution with SOCS (Shape, Outliers, Center, Spread)
   */
  describeDistributionSOCS: {
    type: 'dual',
    rubric: [
      {
        id: 'shape',
        required: true,
        patterns: [
          /\b(symmetric|skewed|uniform|bimodal|unimodal|bell[\s-]?shaped|mound[\s-]?shaped)\b/i
        ],
        description: 'Describe the shape of the distribution'
      },
      {
        id: 'outliers',
        required: true,
        patterns: [
          /\b(outlier|unusual observation|extreme value|gap|no (apparent )?outlier)\b/i
        ],
        description: 'Identify outliers or state none exist'
      },
      {
        id: 'center',
        required: true,
        patterns: [
          /\b(center|mean|median|average|typical|around|approximately)\b.*\b\d/i,
          /\b(mean|median|center)\b.*\b(is|equals|=|about|approximately)\b/i
        ],
        description: 'Describe the center (mean or median with value)'
      },
      {
        id: 'spread',
        required: true,
        patterns: [
          /\b(spread|range|variability|standard deviation|IQR|varies|from .* to)\b/i
        ],
        description: 'Describe the spread (range, SD, or IQR)'
      },
      {
        id: 'context',
        required: true,
        patterns: [/\w{4,}/],
        description: 'Use context-specific language',
        validate: (match, ctx) => {
          // Check if answer uses variable names from context
          if (ctx.variable) {
            return new RegExp(ctx.variable, 'i').test(match.input);
          }
          return true;
        }
      }
    ],
    scoring: { E: { minRequired: 5 }, P: { minRequired: 3 }, I: { minRequired: 0 } },
    forbidden: [],
    promptTemplate: `You are an AP Statistics teacher grading a student's description of a distribution.

The student should describe the distribution using SOCS:
- Shape (symmetric, skewed, bimodal, etc.)
- Outliers (presence or absence)
- Center (mean or median with approximate value)
- Spread (range, IQR, or standard deviation)
- Context (using variable names from the problem)

Context: {{topic}}
Variable: {{variable}}

Student's Answer:
{{answer}}

Grade using E (all 4-5 elements), P (2-3 elements), I (0-1 elements).
Respond in JSON: {"score": "E/P/I", "feedback": "...", "matched": [...], "missing": [...]}`
  },

  /**
   * Calculate and interpret z-score
   */
  zScoreCalculation: {
    type: 'dual',
    rubric: [
      {
        id: 'formula',
        required: true,
        patterns: [
          /z\s*=\s*\(?\s*x\s*[-−]\s*(μ|mu|mean)\s*\)?\s*[\/÷]\s*(σ|sigma|sd|standard deviation)/i,
          /\(?\s*\d+(\.\d+)?\s*[-−]\s*\d+(\.\d+)?\s*\)?\s*[\/÷]\s*\d+(\.\d+)?/i
        ],
        description: 'Show z-score formula or calculation'
      },
      {
        id: 'calculation',
        required: true,
        patterns: [/z\s*[=≈]\s*[-−]?\d+(\.\d+)?/i],
        description: 'Calculate numeric z-score value'
      },
      {
        id: 'interpretation',
        required: true,
        patterns: [
          /\b(standard deviation|SD)s?\b.*\b(above|below|from|greater|less)\b/i,
          /\b(above|below)\b.*\b(mean|average)\b/i
        ],
        description: 'Interpret z-score as standard deviations from mean'
      },
      {
        id: 'context',
        required: true,
        patterns: [/.*/],
        description: 'Use context-specific language',
        validate: (match, ctx) => ctx.variable ? new RegExp(ctx.variable, 'i').test(match.input) : true
      }
    ],
    scoring: { E: { minRequired: 4 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Compare using z-scores
   */
  zScoreComparison: {
    type: 'dual',
    rubric: [
      {
        id: 'bothZScores',
        required: true,
        patterns: [/z\s*[=≈]\s*[-−]?\d+(\.\d+)?.*z\s*[=≈]\s*[-−]?\d+(\.\d+)?/is],
        description: 'Calculate both z-scores'
      },
      {
        id: 'comparison',
        required: true,
        patterns: [
          /\b(higher|lower|greater|less|more|further|closer)\b.*\b(z|score|standard deviation)/i,
          /\bz\b.*\b(>|<|greater|less)\b/i
        ],
        description: 'Compare the z-scores'
      },
      {
        id: 'conclusion',
        required: true,
        patterns: [
          /\b(more likely|less likely|unusual|typical|relative position)\b/i,
          /\b(therefore|so|thus|this means)\b/i
        ],
        description: 'Draw conclusion from comparison'
      }
    ],
    scoring: { E: { minRequired: 3 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  // ============================================
  // UNIT 2: TWO-VARIABLE DATA
  // ============================================

  /**
   * Interpret slope of regression line
   */
  interpretSlope: {
    type: 'dual',
    rubric: [
      {
        id: 'prediction',
        required: true,
        patterns: [
          /\b(predict|predicted|expect|expected|estimate|estimated|on average|average)\b/i
        ],
        description: 'Use prediction language (e.g., "predicted", "on average")'
      },
      {
        id: 'direction',
        required: true,
        patterns: [
          /\b(increase|decrease|goes up|goes down|rise|fall|higher|lower)\b/i
        ],
        description: 'State the direction of change (increases/decreases)'
      },
      {
        id: 'slopeValue',
        required: true,
        patterns: [/\b\d+(\.\d+)?\b/],
        description: 'Include the slope value',
        validate: (match, ctx) => {
          if (!ctx.slope) return true;
          const found = parseFloat(match[0]);
          const expected = Math.abs(parseFloat(ctx.slope));
          return Math.abs(found - expected) <= expected * 0.15;
        }
      },
      {
        id: 'forEveryOne',
        required: true,
        patterns: [
          /\b(for (every|each)|per|for (a |one |1 )?(unit|additional))\b/i,
          /\bone[\s-](unit|additional)\b/i
        ],
        description: 'Include "for every 1 [unit]" or "for each [unit]"'
      },
      {
        id: 'xVariable',
        required: true,
        patterns: [/.*/],
        description: 'Mention the x-variable',
        contextPattern: ctx => ctx.xVar ? new RegExp(ctx.xVar, 'i') : /x[\s-]?variable/i
      },
      {
        id: 'yVariable',
        required: true,
        patterns: [/.*/],
        description: 'Mention the y-variable',
        contextPattern: ctx => ctx.yVar ? new RegExp(ctx.yVar, 'i') : /y[\s-]?variable/i
      }
    ],
    scoring: { E: { minRequired: 6 }, P: { minRequired: 4 }, I: { minRequired: 0 } },
    forbidden: [
      /\bcaus/i  // "cause", "causes", "caused" - implies causation
    ],
    promptTemplate: `You are an AP Statistics teacher grading a slope interpretation.

Required elements:
1. Prediction language ("predicted", "on average", "estimated")
2. Direction (increases/decreases)
3. Slope value ({{slope}})
4. "For every 1 [unit]" or similar
5. X-variable name ({{xVar}})
6. Y-variable name ({{yVar}})

IMPORTANT: Deduct if student implies causation (uses "causes", "makes", etc.)

Student's Answer:
{{answer}}

Grade: E (all 6), P (4-5), I (0-3).
JSON: {"score": "E/P/I", "feedback": "...", "matched": [...], "missing": [...]}`
  },

  /**
   * Interpret y-intercept
   */
  interpretIntercept: {
    type: 'dual',
    rubric: [
      {
        id: 'whenXZero',
        required: true,
        patterns: [
          /\b(when|if|at)\b.*\b(0|zero)\b/i,
          /\bx\s*=\s*0\b/i
        ],
        description: 'Reference when x equals 0'
      },
      {
        id: 'prediction',
        required: true,
        patterns: [
          /\b(predict|predicted|expect|expected|estimate|estimated)\b/i
        ],
        description: 'Use prediction language'
      },
      {
        id: 'yVariable',
        required: true,
        patterns: [/.*/],
        description: 'Mention the y-variable',
        contextPattern: ctx => ctx.yVar ? new RegExp(ctx.yVar, 'i') : /y[\s-]?variable/i
      },
      {
        id: 'meaningfulness',
        required: false,
        patterns: [
          /\b(no meaning|not meaningful|doesn't make sense|does not make sense|meaningless|not practical|unrealistic|extrapolat)\b/i
        ],
        description: 'Note if y-intercept is not meaningful in context',
        contextCondition: ctx => ctx.interceptMeaningful === false
      }
    ],
    scoring: { E: { minRequired: 3 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Describe scatterplot association
   */
  describeAssociation: {
    type: 'regex',
    rubric: [
      {
        id: 'direction',
        required: true,
        patterns: [/\b(positive|negative|no (clear |apparent )?association)\b/i],
        description: 'Describe direction (positive/negative)'
      },
      {
        id: 'form',
        required: true,
        patterns: [/\b(linear|nonlinear|non-linear|curved|quadratic)\b/i],
        description: 'Describe form (linear/nonlinear)'
      },
      {
        id: 'strength',
        required: true,
        patterns: [/\b(strong|moderate|weak)\b/i],
        description: 'Describe strength (weak/moderate/strong)'
      },
      {
        id: 'outliers',
        required: false,
        patterns: [/\b(outlier|unusual|influential|no (apparent )?outlier)\b/i],
        description: 'Mention outliers if present'
      }
    ],
    scoring: { E: { minRequired: 3 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Calculate and interpret residual
   */
  residualInterpretation: {
    type: 'dual',
    rubric: [
      {
        id: 'formula',
        required: true,
        patterns: [
          /residual\s*=\s*(actual|observed|y)\s*[-−]\s*(predicted|expected|ŷ|y[\s-]?hat)/i,
          /\b(actual|observed)\b.*[-−].*\b(predicted|expected)\b/i
        ],
        description: 'Show residual formula (actual - predicted)'
      },
      {
        id: 'calculation',
        required: true,
        patterns: [/residual\s*[=≈]\s*[-−]?\d+(\.\d+)?/i],
        description: 'Calculate numeric residual value'
      },
      {
        id: 'direction',
        required: true,
        patterns: [
          /\b(above|below|greater|less|more|over|under)[\s-]?(predict|expect|estimate)/i,
          /\b(positive|negative)\b.*\bresidual\b/i
        ],
        description: 'Interpret direction (above/below predicted)'
      },
      {
        id: 'context',
        required: true,
        patterns: [/.*/],
        description: 'Use context-specific language',
        validate: (match, ctx) => ctx.yVar ? new RegExp(ctx.yVar, 'i').test(match.input) : true
      }
    ],
    scoring: { E: { minRequired: 4 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Interpret coefficient of determination (r²)
   */
  interpretRSquared: {
    type: 'dual',
    rubric: [
      {
        id: 'percentage',
        required: true,
        patterns: [/\b\d+(\.\d+)?\s*%/],
        description: 'Express r² as a percentage'
      },
      {
        id: 'variation',
        required: true,
        patterns: [
          /\b(variation|variability)\b.*\b(explained|accounted|due to)\b/i,
          /\bexplain.*\bvariation\b/i
        ],
        description: 'Mention variation explained'
      },
      {
        id: 'yVariable',
        required: true,
        patterns: [/.*/],
        description: 'Reference the y-variable',
        contextPattern: ctx => ctx.yVar ? new RegExp(ctx.yVar, 'i') : /y[\s-]?variable/i
      },
      {
        id: 'model',
        required: true,
        patterns: [
          /\b(model|regression|linear|relationship)\b/i,
          /\b(least[\s-]?squares|LSRL)\b/i
        ],
        description: 'Reference the regression model'
      }
    ],
    scoring: { E: { minRequired: 4 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  // ============================================
  // UNIT 3: COLLECTING DATA
  // ============================================

  /**
   * Explain advantages of stratified sampling
   */
  stratifiedSamplingAdvantage: {
    type: 'dual',
    rubric: [
      {
        id: 'representation',
        required: true,
        patterns: [
          /\b(represent|representation|ensure|guarantee)\b.*\b(group|strat|subgroup|category)\b/i,
          /\b(each|all|both)\b.*\b(group|strat|category)\b.*\b(include|sample|select)\b/i
        ],
        description: 'Ensures representation of all groups'
      },
      {
        id: 'reducesVariability',
        required: false,
        patterns: [
          /\b(reduce|decrease|lower)\b.*\b(variability|variation|variance)\b/i,
          /\bmore precise\b/i
        ],
        description: 'Reduces variability compared to SRS'
      },
      {
        id: 'comparison',
        required: false,
        patterns: [
          /\b(compar|differ)\b.*\b(group|strat|category)\b/i
        ],
        description: 'Allows comparison between groups'
      }
    ],
    scoring: { E: { minRequired: 2 }, P: { minRequired: 1 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Explain control group purpose
   */
  controlGroupPurpose: {
    type: 'dual',
    rubric: [
      {
        id: 'baseline',
        required: true,
        patterns: [
          /\b(baseline|comparison|reference|benchmark)\b/i,
          /\bcompare (to|with|against)\b/i
        ],
        description: 'Provides baseline for comparison'
      },
      {
        id: 'noTreatment',
        required: true,
        patterns: [
          /\b(no treatment|without treatment|placebo|untreated)\b/i,
          /\bnot (receive|given|expose)\b/i
        ],
        description: 'Receives no treatment or placebo'
      },
      {
        id: 'effectiveness',
        required: false,
        patterns: [
          /\b(effect|effective|work|impact)\b/i
        ],
        description: 'Determines if treatment is effective'
      }
    ],
    scoring: { E: { minRequired: 2 }, P: { minRequired: 1 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Explain random assignment
   */
  randomAssignmentPurpose: {
    type: 'dual',
    rubric: [
      {
        id: 'confounding',
        required: true,
        patterns: [
          /\b(confound|lurking|extraneous)\b/i,
          /\b(control|account|balance)\b.*\b(variable|factor)\b/i
        ],
        description: 'Controls for confounding variables'
      },
      {
        id: 'equalGroups',
        required: true,
        patterns: [
          /\b(equal|similar|equivalent|balance|comparable)\b.*\b(group|treatment)\b/i,
          /\b(group|treatment)\b.*\b(equal|similar|equivalent|balance)\b/i
        ],
        description: 'Creates comparable treatment groups'
      },
      {
        id: 'causation',
        required: false,
        patterns: [
          /\b(caus|causal|cause-and-effect)\b/i,
          /\battribut.*\btreatment\b/i
        ],
        description: 'Allows causal inference'
      }
    ],
    scoring: { E: { minRequired: 2 }, P: { minRequired: 1 }, I: { minRequired: 0 } },
    forbidden: []
  },

  // ============================================
  // UNITS 6-7: INFERENCE
  // ============================================

  /**
   * State and check conditions for inference
   */
  inferenceConditions: {
    type: 'dual',
    rubric: [
      {
        id: 'random',
        required: true,
        patterns: [
          /\b(random|randomly|SRS|simple random)\b/i
        ],
        description: 'Random sample or random assignment'
      },
      {
        id: 'independence',
        required: true,
        patterns: [
          /\b(independen|10%|ten percent|n\s*[<≤]\s*(0\.1|0\.10)?\s*N)\b/i,
          /\b(less than|at most|no more than)\b.*\b10\s*%/i
        ],
        description: '10% condition for independence'
      },
      {
        id: 'normality',
        required: true,
        patterns: [
          /\b(normal|large|CLT|central limit|np|n\(1-p\)|success|failure)\b/i,
          /\b(n\s*[≥>]\s*30|at least 30)\b/i
        ],
        description: 'Normal/Large sample condition'
      }
    ],
    scoring: { E: { minRequired: 3 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Interpret confidence interval
   */
  interpretConfidenceInterval: {
    type: 'dual',
    rubric: [
      {
        id: 'confidence',
        required: true,
        patterns: [
          /\b(\d+)\s*%?\s*(confident|confidence)\b/i,
          /\bconfiden.*\b(\d+)\s*%/i
        ],
        description: 'State confidence level'
      },
      {
        id: 'trueParameter',
        required: true,
        patterns: [
          /\b(true|population|actual)\b.*\b(mean|proportion|parameter|μ|p)\b/i,
          /\b(μ|mu|p|population)\b.*\b(is|lies|falls|between)\b/i
        ],
        description: 'Reference true population parameter'
      },
      {
        id: 'interval',
        required: true,
        patterns: [
          /\b(between|from|interval)\b.*\band\b/i,
          /\(\s*[\d.]+\s*,\s*[\d.]+\s*\)/
        ],
        description: 'Reference the interval bounds'
      },
      {
        id: 'context',
        required: true,
        patterns: [/.*/],
        description: 'Use context-specific language',
        validate: (match, ctx) => ctx.variable ? new RegExp(ctx.variable, 'i').test(match.input) : true
      }
    ],
    scoring: { E: { minRequired: 4 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: [
      /\b(\d+)\s*%\s*(chance|probability)\b.*\btrue\b/i  // Wrong interpretation
    ]
  },

  /**
   * State hypotheses
   */
  stateHypotheses: {
    type: 'regex',
    rubric: [
      {
        id: 'null',
        required: true,
        patterns: [
          /H[_0oO]\s*:\s*(μ|p|β)\s*=\s*[\d.]+/i,
          /\bnull\b.*\b(hypothesis|H)\b/i
        ],
        description: 'State null hypothesis with parameter and value'
      },
      {
        id: 'alternative',
        required: true,
        patterns: [
          /H[_aA1]\s*:\s*(μ|p|β)\s*[<>≠]\s*[\d.]+/i,
          /\balternative\b.*\b(hypothesis|H)\b/i
        ],
        description: 'State alternative hypothesis with direction'
      },
      {
        id: 'parameterDefined',
        required: true,
        patterns: [
          /\b(μ|mu|p)\b.*\b(=|is|represent|denote)\b.*\b(true|population)\b/i,
          /\b(let|where)\b.*\b(μ|p)\b/i
        ],
        description: 'Define the parameter in context'
      }
    ],
    scoring: { E: { minRequired: 3 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: []
  },

  /**
   * Interpret p-value
   */
  interpretPValue: {
    type: 'dual',
    rubric: [
      {
        id: 'assumeNull',
        required: true,
        patterns: [
          /\b(assum|given|if)\b.*\b(null|H[_0oO]|true)\b/i,
          /\b(null|H[_0oO])\b.*\b(true|assum)\b/i
        ],
        description: 'Assume null hypothesis is true'
      },
      {
        id: 'probability',
        required: true,
        patterns: [
          /\b(probability|chance|likelihood)\b/i,
          /p[\s-]?value\s*[=≈<>]\s*[\d.]+/i
        ],
        description: 'Describe as probability'
      },
      {
        id: 'asOrMoreExtreme',
        required: true,
        patterns: [
          /\b(extreme|as extreme|more extreme|at least as)\b/i,
          /\b(or greater|or more|or less|or smaller)\b/i
        ],
        description: 'Reference "as extreme or more extreme"'
      },
      {
        id: 'observed',
        required: true,
        patterns: [
          /\b(observed|sample|data|result|statistic)\b/i
        ],
        description: 'Reference observed data/statistic'
      }
    ],
    scoring: { E: { minRequired: 4 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: [
      /\bprobability\b.*\bnull\b.*\b(true|false)\b/i  // Common misconception
    ]
  },

  /**
   * State conclusion from hypothesis test
   */
  hypothesisConclusion: {
    type: 'dual',
    rubric: [
      {
        id: 'compareAlpha',
        required: true,
        patterns: [
          /\bp[\s-]?value\s*[<>]\s*(α|alpha|0\.\d+)/i,
          /\b(significance|alpha)\b.*\b(level|α)\b/i
        ],
        description: 'Compare p-value to significance level'
      },
      {
        id: 'decision',
        required: true,
        patterns: [
          /\b(reject|fail to reject|do not reject)\b.*\b(null|H[_0oO])\b/i
        ],
        description: 'State decision about null hypothesis'
      },
      {
        id: 'evidence',
        required: true,
        patterns: [
          /\b(sufficient|convincing|significant|not sufficient|no convincing)\b.*\bevidence\b/i,
          /\bevidence\b.*\b(sufficient|convincing|significant)\b/i
        ],
        description: 'Reference evidence (convincing or not)'
      },
      {
        id: 'context',
        required: true,
        patterns: [/.*/],
        description: 'State conclusion in context',
        validate: (match, ctx) => ctx.claim ? new RegExp(ctx.claim.substring(0, 20), 'i').test(match.input) : true
      }
    ],
    scoring: { E: { minRequired: 4 }, P: { minRequired: 2 }, I: { minRequired: 0 } },
    forbidden: [
      /\baccept\b.*\bnull\b/i  // Should never "accept" null
    ]
  },

  // ============================================
  // GENERIC/FALLBACK RULES
  // ============================================

  /**
   * Generic FRQ - uses AI grading with general rubric
   */
  genericFRQ: {
    type: 'ai',
    rubric: [],
    promptTemplate: `You are an AP Statistics teacher grading a free-response question.

Question: {{prompt}}
Part: {{partId}}

Grading criteria:
1. Correct statistical methods and formulas
2. Accurate calculations
3. Proper interpretation in context
4. Complete explanation/justification

Student's Answer:
{{answer}}

Grade using AP FRQ rubric:
- E (Essentially correct): All key elements present, minor errors acceptable
- P (Partially correct): Some key elements present, or correct with significant errors
- I (Incorrect): Missing most key elements or major conceptual errors

Respond in JSON format:
{
  "score": "E" or "P" or "I",
  "feedback": "Specific feedback explaining the score",
  "matched": ["list of correct elements"],
  "missing": ["list of missing or incorrect elements"]
}`
  }
};

/**
 * Get grading rule for a question part
 * Matches based on question topic/type and part requirements
 */
function getGradingRule(questionId, partId, question) {
  // Extract unit and lesson from question ID (e.g., "U1-L10-Q04" -> unit 1, lesson 10)
  const match = questionId.match(/U(\d+)-L(\d+)/i);
  const unit = match ? parseInt(match[1]) : 0;

  // Get part description if available
  const part = question?.solution?.parts?.find(p => p.partId === partId);
  const description = (part?.description || '').toLowerCase();
  const prompt = (question?.prompt || '').toLowerCase();

  // Match rules based on content
  if (description.includes('shape') || description.includes('distribution')) {
    if (description.includes('describe') || prompt.includes('describe')) {
      return description.includes('socs') || (
        description.includes('center') || description.includes('spread')
      ) ? FRQGradingRules.describeDistributionSOCS : FRQGradingRules.describeDistributionShape;
    }
  }

  if (description.includes('z-score') || description.includes('standardized score')) {
    if (description.includes('compare') || prompt.includes('more likely')) {
      return FRQGradingRules.zScoreComparison;
    }
    return FRQGradingRules.zScoreCalculation;
  }

  if (description.includes('slope')) {
    return FRQGradingRules.interpretSlope;
  }

  if (description.includes('intercept') || description.includes('y-intercept')) {
    return FRQGradingRules.interpretIntercept;
  }

  if (description.includes('association') || description.includes('scatterplot')) {
    return FRQGradingRules.describeAssociation;
  }

  if (description.includes('residual')) {
    return FRQGradingRules.residualInterpretation;
  }

  if (description.includes('r-squared') || description.includes('r²') || description.includes('coefficient of determination')) {
    return FRQGradingRules.interpretRSquared;
  }

  if (description.includes('stratified') || description.includes('sampling method')) {
    return FRQGradingRules.stratifiedSamplingAdvantage;
  }

  if (description.includes('control') && (description.includes('group') || description.includes('experiment'))) {
    return FRQGradingRules.controlGroupPurpose;
  }

  if (description.includes('random assignment') || description.includes('randomly assign')) {
    return FRQGradingRules.randomAssignmentPurpose;
  }

  if (description.includes('condition') && (description.includes('inference') || description.includes('verify'))) {
    return FRQGradingRules.inferenceConditions;
  }

  if (description.includes('confidence interval') && description.includes('interpret')) {
    return FRQGradingRules.interpretConfidenceInterval;
  }

  if (description.includes('hypothes') && (description.includes('state') || description.includes('indicate'))) {
    return FRQGradingRules.stateHypotheses;
  }

  if (description.includes('p-value') && description.includes('interpret')) {
    return FRQGradingRules.interpretPValue;
  }

  if (description.includes('conclud') || description.includes('decision')) {
    return FRQGradingRules.hypothesisConclusion;
  }

  // Default to generic AI grading
  return FRQGradingRules.genericFRQ;
}

// Export for use in browser
window.FRQGradingRules = FRQGradingRules;
window.getGradingRule = getGradingRule;
