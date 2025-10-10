// Scoring Rubrics for U1-L10 Constructed Response Questions
// Version 1.0.0

const L10_RUBRICS = {
  'U1-L10-Q04': {
    questionId: 'U1-L10-Q04',
    type: 'constructed-response',
    topic: 'Histogram Construction and Distribution Description',
    totalPoints: 4,
    parts: [
      {
        partId: 'a-i',
        description: 'Histogram construction',
        maxPoints: 2,
        rubric: {
          components: [
            'Six bars with approximately correct heights (8, 14, 25, 27, 12, 5)',
            'Horizontal axis labeled with correct numbers and verbal description (Amounts in dollars)',
            'Vertical axis labeled with correct numbers and verbal description (Frequency)',
            'Bars have no gaps between them (histogram property)'
          ],
          scoring: {
            'E (Essentially Correct)': 'All 4 components present',
            'P (Partially Correct)': '3 of 4 components present',
            'I (Incorrect)': 'Fewer than 3 components'
          },
          pointMapping: {
            'E': 2,
            'P': 1,
            'I': 0
          }
        },
        keywords: {
          accept: ['histogram', 'bar', 'frequency', 'amount', 'dollar'],
          reject: ['line graph', 'scatter', 'pie chart']
        }
      },
      {
        partId: 'a-ii',
        description: 'Shape description',
        maxPoints: 1,
        rubric: {
          criteria: [
            'Must describe shape as roughly symmetric AND mound-shaped OR approximately normal'
          ],
          acceptableTerms: [
            'symmetric',
            'mound-shaped',
            'bell-shaped',
            'approximately normal',
            'normal distribution',
            'unimodal and symmetric'
          ],
          scoring: {
            '1 point': 'Correctly identifies shape with appropriate statistical vocabulary',
            '0 points': 'Incorrect shape description or missing vocabulary'
          }
        },
        keywords: {
          accept: ['symmetric', 'mound', 'bell', 'normal', 'unimodal'],
          flags: ['skewed', 'bimodal', 'uniform'] // These indicate misconceptions
        }
      },
      {
        partId: 'b',
        description: 'Median identification and justification',
        maxPoints: 1,
        rubric: {
          correctAnswer: {
            range: [10, 15], // $10 up to but not including $15
            rangeLowerInclusive: true,
            rangeUpperInclusive: false
          },
          criteria: [
            'Identifies median value in the interval [$10, $15)',
            'Provides justification using cumulative frequency or median position'
          ],
          scoring: {
            'E (Essentially Correct)': 'Correct interval AND valid justification',
            'P (Partially Correct)': 'Correct interval BUT weak/incomplete justification',
            'I (Incorrect)': 'Wrong interval or no justification'
          },
          pointMapping: {
            'E': 1,
            'P': 0.5,
            'I': 0
          }
        },
        acceptableJustifications: [
          'n=91, median is 46th value, cumulative frequency shows 46th falls in $10-15 range',
          'First three bars sum to 47 (8+14+25), so 46th value is in third bar',
          'Median position is (91+1)/2 = 46, which is in the $10-15 interval'
        ],
        keywords: {
          accept: ['46', 'median', 'cumulative', 'position', '91'],
          flags: ['mean', 'average', 'middle value'] // Potential confusion
        }
      }
    ],
    commonMisconceptions: [
      {
        misconception: 'Confusing histogram with bar chart (gaps between bars)',
        evidence: 'Bars shown with gaps'
      },
      {
        misconception: 'Using "bell curve" without mentioning symmetry',
        evidence: 'Only says "bell curve" or "normal" without shape description'
      },
      {
        misconception: 'Confusing median with mean or mode',
        evidence: 'Uses average calculation or identifies most frequent bar'
      },
      {
        misconception: 'Incorrect median position for odd n',
        evidence: 'Uses n/2 instead of (n+1)/2 for position'
      }
    ],
    triageKeywords: {
      likelyHigh: ['symmetric', 'mound', 'histogram', '46', 'cumulative'],
      likelyMid: ['bell', 'normal', 'median', 'middle'],
      likelyLow: ['average', 'bar chart', 'gaps', 'mean']
    }
  },

  'U1-L10-Q06': {
    questionId: 'U1-L10-Q06',
    type: 'constructed-response',
    topic: 'Z-scores, Proportions, and Standard Deviation Interpretation',
    totalPoints: 3, // Estimated based on 3 parts
    parts: [
      {
        partId: 'a',
        description: 'Calculate and interpret Clay\'s standardized score',
        maxPoints: 1,
        rubric: {
          correctCalculation: {
            formula: 'z = (x - μ) / σ',
            values: { x: 289, μ: 242, σ: 29 },
            correctAnswer: 1.62, // (289-242)/29 ≈ 1.62
            acceptanceRange: [1.60, 1.64]
          },
          interpretation: 'Clay\'s finishing time is 1.62 standard deviations above/greater than the men\'s mean',
          criteria: [
            'Correct z-score calculation (1.62 ± 0.02)',
            'Interpretation in context mentioning standard deviations above mean'
          ],
          scoring: {
            '1 point': 'Correct calculation AND proper interpretation',
            '0.5 points': 'Correct calculation OR proper interpretation (not both)',
            '0 points': 'Incorrect calculation and interpretation'
          }
        },
        keywords: {
          accept: ['1.62', 'z-score', 'standard deviation', 'above', 'mean', '289', '242', '29'],
          flags: ['below', 'less than'] // Wrong direction
        }
      },
      {
        partId: 'b',
        description: 'Proportion of women with finishing time less than Kathy\'s',
        maxPoints: 1,
        rubric: {
          correctCalculation: {
            step1: 'z = (272 - 259) / 32 ≈ 0.41',
            step2: 'P(Z < 0.41) using table or technology',
            correctAnswer: 0.66,
            acceptanceRange: [0.64, 0.68] // Allow for table/technology variation
          },
          criteria: [
            'Calculates z-score for Kathy (0.41 ± 0.03)',
            'Uses normal table/technology to find proportion',
            'Reports proportion as approximately 0.66'
          ],
          scoring: {
            '1 point': 'All steps correct with final answer in acceptance range',
            '0.5 points': 'Correct process but minor calculation error',
            '0 points': 'Incorrect approach or major errors'
          }
        },
        keywords: {
          accept: ['0.41', '0.66', 'z-score', 'proportion', 'normal table', 'technology', '272', '259', '32'],
          flags: ['0.34', '0.50'] // Common wrong answers
        }
      },
      {
        partId: 'c',
        description: 'Interpret difference in standard deviations',
        maxPoints: 1,
        rubric: {
          correctInterpretation: 'Greater variability in women\'s times; women\'s times are more spread out from their mean than men\'s times',
          criteria: [
            'Mentions variability or spread',
            'Compares women to men',
            'Relates to distance from mean'
          ],
          acceptableResponses: [
            'More variability in women\'s finishing times',
            'Women\'s times are more spread out from the mean',
            'Greater spread in women\'s distribution',
            'Women\'s times deviate more from their mean on average'
          ],
          scoring: {
            '1 point': 'Clear statement about greater variability/spread in women\'s times',
            '0.5 points': 'Mentions variability but lacks clarity or comparison',
            '0 points': 'Incorrect or irrelevant interpretation'
          }
        },
        keywords: {
          accept: ['variability', 'spread', 'variation', 'deviate', 'dispersion', 'scattered'],
          reject: ['women are slower', 'men are faster'] // These miss the point
        }
      }
    ],
    commonMisconceptions: [
      {
        misconception: 'Using wrong direction for z-score interpretation',
        evidence: 'Says "below mean" when z is positive'
      },
      {
        misconception: 'Finding P(Z > 0.41) instead of P(Z < 0.41)',
        evidence: 'Reports proportion as 0.34 instead of 0.66'
      },
      {
        misconception: 'Interpreting SD difference as difference in performance',
        evidence: 'Says "women are slower" instead of "more variable"'
      },
      {
        misconception: 'Not using technology/table for normal proportion',
        evidence: 'Uses empirical rule incorrectly for non-standard z-values'
      }
    ],
    triageKeywords: {
      likelyHigh: ['1.62', '0.66', 'variability', 'spread', 'standard deviation'],
      likelyMid: ['z-score', 'proportion', 'normal', 'mean'],
      likelyLow: ['slower', 'faster', '0.34', 'wrong direction']
    }
  }
};

// Scoring guidance for CR questions
const CR_SCORING_GUIDANCE = {
  calibrationSampleSize: 10, // Score this many responses together to calibrate

  scoringProcess: [
    '1. Read all responses for a question first (overview)',
    '2. Score calibration sample (10 responses) together',
    '3. Use keyword triage to pre-bucket remaining responses',
    '4. Score each bucket, flagging ambiguous cases',
    '5. Human review flagged responses',
    '6. Calculate inter-rater reliability on calibration sample'
  ],

  flaggingCriteria: [
    'Response uses unexpected but potentially valid approach',
    'Keywords present but logic unclear',
    'Partial credit unclear (between P and E)',
    'Novel misconception not in rubric'
  ],

  interRaterTarget: {
    agreementRate: 0.85, // Target 85% agreement
    cohensKappa: 0.75    // Target substantial agreement
  }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    L10_RUBRICS,
    CR_SCORING_GUIDANCE
  };
}
