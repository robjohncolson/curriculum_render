// Skill Taxonomy for Unit 1: Exploring One-Variable Data
// Maps AP Statistics skills to learning objectives

const SKILL_TAXONOMY = {
  // Distribution Description Skills
  'SHAPE': {
    id: 'SHAPE',
    name: 'Distribution Shape',
    description: 'Describing and comparing distribution shapes (symmetric, skewed, uniform)',
    apStandard: 'VAR-1',
    examples: ['Identify skewness', 'Compare distribution shapes', 'Describe symmetry']
  },

  'CENTER': {
    id: 'CENTER',
    name: 'Measures of Center',
    description: 'Calculating and interpreting mean, median, and mode',
    apStandard: 'VAR-1',
    examples: ['Calculate mean', 'Find median', 'Determine mode', 'Choose appropriate center measure']
  },

  'SPREAD': {
    id: 'SPREAD',
    name: 'Measures of Spread',
    description: 'Understanding range, IQR, variance, and standard deviation',
    apStandard: 'VAR-1',
    examples: ['Calculate standard deviation', 'Find IQR', 'Interpret variability']
  },

  // Visualization Skills
  'DISPLAYS': {
    id: 'DISPLAYS',
    name: 'Statistical Displays',
    description: 'Creating and interpreting histograms, boxplots, and dotplots',
    apStandard: 'UNC-1',
    examples: ['Create histogram', 'Interpret boxplot', 'Choose appropriate display']
  },

  'COMPARISON': {
    id: 'COMPARISON',
    name: 'Comparing Distributions',
    description: 'Comparing two or more distributions using shape, center, and spread',
    apStandard: 'VAR-3',
    examples: ['Compare two groups', 'Identify meaningful differences', 'Describe relative performance']
  },

  // Normal Distribution Skills
  'NORMAL': {
    id: 'NORMAL',
    name: 'Normal Distribution Properties',
    description: 'Understanding normal distribution characteristics and the empirical rule',
    apStandard: 'VAR-2',
    examples: ['Recognize normal shape', 'Apply 68-95-99.7 rule', 'Identify parameters μ and σ']
  },

  'Z_SCORES': {
    id: 'Z_SCORES',
    name: 'Z-Score Calculation',
    description: 'Calculating and interpreting z-scores for standardization',
    apStandard: 'VAR-2',
    examples: ['Calculate z = (x - μ) / σ', 'Interpret standardized values', 'Compare across distributions']
  },

  'Z_TO_PROP': {
    id: 'Z_TO_PROP',
    name: 'Z-Scores to Proportions',
    description: 'Converting z-scores to proportions and percentiles using normal tables',
    apStandard: 'VAR-2',
    examples: ['Use Table A', 'Find proportion below/above', 'Calculate percentiles']
  },

  'EMPIRICAL': {
    id: 'EMPIRICAL',
    name: 'Empirical Rule Application',
    description: 'Applying the 68-95-99.7 rule for approximate proportions',
    apStandard: 'VAR-2',
    examples: ['Apply 68% rule', 'Estimate proportions', 'Identify unusual values']
  },

  // Communication Skills
  'CONTEXT': {
    id: 'CONTEXT',
    name: 'Interpretation in Context',
    description: 'Interpreting statistical results within the data context',
    apStandard: 'UNC-1',
    examples: ['Write context-specific conclusions', 'Relate to real-world situations', 'Avoid statistical jargon']
  },

  // Data Collection & Variables
  'VARIABLES': {
    id: 'VARIABLES',
    name: 'Variable Identification',
    description: 'Distinguishing categorical vs quantitative variables',
    apStandard: 'DAT-1',
    examples: ['Classify variable types', 'Identify discrete vs continuous']
  },

  'PARAMETERS': {
    id: 'PARAMETERS',
    name: 'Parameters vs Statistics',
    description: 'Understanding population parameters vs sample statistics notation',
    apStandard: 'UNC-3',
    examples: ['Use μ vs x̄', 'Use σ vs s', 'Distinguish population from sample']
  }
};

// Keywords for automatic skill detection in question prompts
const SKILL_KEYWORDS = {
  'SHAPE': ['shape', 'skewed', 'symmetric', 'distribution looks', 'mound', 'uniform', 'bimodal'],
  'CENTER': ['mean', 'median', 'mode', 'average', 'typical', 'center'],
  'SPREAD': ['standard deviation', 'variance', 'range', 'IQR', 'interquartile', 'variability', 'spread'],
  'DISPLAYS': ['histogram', 'boxplot', 'dotplot', 'graph', 'plot', 'display', 'chart'],
  'COMPARISON': ['compare', 'difference between', 'which group', 'relative to'],
  'NORMAL': ['normal distribution', 'bell', 'normally distributed', 'approximately normal'],
  'Z_SCORES': ['z-score', 'standardize', 'standard units', 'how many standard deviations'],
  'Z_TO_PROP': ['proportion', 'percent', 'probability', 'percentile', 'table A'],
  'EMPIRICAL': ['68', '95', '99.7', 'empirical rule', 'within one standard deviation'],
  'CONTEXT': ['interpret', 'explain', 'describe in context', 'what does this mean'],
  'VARIABLES': ['categorical', 'quantitative', 'variable', 'discrete', 'continuous'],
  'PARAMETERS': ['parameter', 'μ', 'sigma', 'σ', 'population', 'sample statistic']
};

// Manual override mappings for specific questions
// Format: { questionId: ['SKILL1', 'SKILL2'] }
const MANUAL_SKILL_OVERRIDES = {
  // L10 questions based on Phase 5 findings
  'U1-L10-Q01': ['PARAMETERS', 'NORMAL'],  // Parameter notation for normal distribution
  'U1-L10-Q02': ['Z_TO_PROP', 'NORMAL'],   // z-score to proportion (33% misconception)
  'U1-L10-Q03': ['Z_TO_PROP', 'NORMAL'],   // Normal proportion >33g
  'U1-L10-Q04': ['DISPLAYS', 'SHAPE', 'CENTER', 'CONTEXT'],  // Histogram CR
  'U1-L10-Q05': ['EMPIRICAL', 'NORMAL'],   // Empirical rule application
  'U1-L10-Q06': ['Z_SCORES', 'Z_TO_PROP', 'CONTEXT'],  // Z-scores CR
  'U1-L10-Q07': ['NORMAL', 'Z_TO_PROP'],   // Normal distribution application
  'U1-L10-Q08': ['NORMAL', 'Z_TO_PROP']    // Normal distribution application
};

// Lesson-to-topic mapping for context
const LESSON_TO_TOPICS = {
  'L1': ['1-1'],  // Introducing Statistics
  'L2': ['1-2'],  // Variables
  'L3': ['1-3', '1-4'],  // Categorical representation
  'L4': ['1-5'],  // Quantitative graphs
  'L5': ['1-6'],  // Describing distributions
  'L6': ['1-7'],  // Summary statistics
  'L7': ['1-8'],  // Graphical representations of summary stats
  'L8': ['1-9'],  // Comparing distributions
  'L9': ['1-10'], // Normal distribution (first part)
  'L10': ['1-10'] // Normal distribution (second part)
};

module.exports = {
  SKILL_TAXONOMY,
  SKILL_KEYWORDS,
  MANUAL_SKILL_OVERRIDES,
  LESSON_TO_TOPICS
};
