// Phase 0: Scope, Inputs, and Assumptions Configuration
// This file defines the canonical scope for Period B, Unit 1, Lessons 1-10 analysis

const PHASE_0_CONFIG = {
  // Scope Definition
  scope: {
    period: 'B',
    unit: 'unit1',
    unitNumber: 1,
    lessons: {
      range: [1, 10],
      spotlight: 10, // Lesson 10 is the focus
      all: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10']
    },
    description: 'Period B students, Unit 1 (Exploring One-Variable Data), Lessons 1-10 with Lesson 10 spotlight'
  },

  // Input Files (paths relative to project root)
  inputs: {
    answersData: '../docs/answers_rows (1).csv',
    rosterMapping: '../docs/student2username.csv',
    curriculum: '../data/curriculum.js',
    units: '../data/units.js'
  },

  // Core Assumptions
  assumptions: [
    'All students who attempted U1-L10 are Period B students',
    'Students without U1-L10 attempts are Period E students',
    'Latest attempt per student×question is the canonical answer',
    'Timestamp field is primary; updated_at is fallback for recency',
    'Username normalization: lowercase, hyphens→underscores, trim whitespace'
  ],

  // Period Assignment Rules
  periodAssignment: {
    periodB: {
      criteria: 'Has at least one U1-L10 question attempt',
      identifier: 'U1-L10'
    },
    periodE: {
      criteria: 'No U1-L10 question attempts',
      fallback: true
    }
  },

  // Lesson 10 Question Structure
  lesson10Questions: {
    multipleChoice: ['U1-L10-Q01', 'U1-L10-Q02', 'U1-L10-Q03', 'U1-L10-Q05', 'U1-L10-Q07', 'U1-L10-Q08'],
    constructedResponse: ['U1-L10-Q04', 'U1-L10-Q06'],
    total: 8
  },

  // Answer Key (extracted from curriculum.js)
  answerKey: {
    'U1-L10-Q01': 'D', // μ = 80; σ = 10
    'U1-L10-Q02': 'A', // 0.17
    'U1-L10-Q03': 'A', // 0.023
    'U1-L10-Q05': 'B', // 16% on small, 84% on large
    'U1-L10-Q07': 'C', // 16%
    'U1-L10-Q08': 'A'  // 26 inches
  },

  // Metadata
  version: '1.0.0',
  createdDate: new Date().toISOString(),
  analysisPhase: 'Phase 0 - Scope Definition'
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PHASE_0_CONFIG;
}
