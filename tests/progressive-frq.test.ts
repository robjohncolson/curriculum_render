/**
 * Progressive Multi-Part FRQ System Tests
 *
 * @description Tests for the accordion-based FRQ system that allows students
 * to answer parts sequentially with visual feedback.
 *
 * @state-machine Progressive FRQ State Machine
 * States: locked | current | completed | allComplete
 * See docs/state-machines.md for full diagram.
 *
 * @data-format Progressive Answer Format
 * {
 *   value: {
 *     parts: { [partId]: string },
 *     currentPart: string | null,
 *     completedParts: string[],
 *     allComplete: boolean
 *   },
 *   timestamp: number
 * }
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// TYPE DEFINITIONS (for LLM clarity)
// ============================================

interface FRQPart {
  partId: string;
  description: string;
  response?: string;
}

interface ProgressiveState {
  parts: Record<string, string>;
  currentPart: string | null;
  completedParts: string[];
  allComplete: boolean;
  legacyAnswer?: string;
}

interface SavedAnswer {
  value: string | ProgressiveState;
  timestamp: number;
}

interface NormalizedAnswer {
  parts: Record<string, string>;
  completedParts: string[];
  allComplete: boolean;
  legacyAnswer?: string;
}

// ============================================
// IMPLEMENTATION UNDER TEST
// Isolated copies of production functions
// ============================================

/**
 * FRQ Part State Manager
 * Manages the sequential answering of multi-part FRQs
 */
class FRQPartStateManager {
  questions: Record<string, ProgressiveState> = {};
  private getSavedAnswer: ((questionId: string) => SavedAnswer | null) | null = null;

  /**
   * Initialize or restore state for a question
   * @param questionId - Unique question identifier (e.g., "U3-L5-Q02")
   * @param parts - Array of question parts from curriculum data
   * @returns Current state for the question
   */
  initialize(questionId: string, parts: FRQPart[]): ProgressiveState {
    const savedAnswer = this.getSavedAnswer?.(questionId) ?? null;
    const normalized = this.normalizeAnswer(savedAnswer);

    if (normalized?.legacyAnswer) {
      // Legacy single-string answer - treat as all parts complete
      this.questions[questionId] = {
        parts: {},
        legacyAnswer: normalized.legacyAnswer,
        currentPart: null,
        completedParts: parts.map(p => p.partId),
        allComplete: true
      };
    } else if (normalized?.parts) {
      // Restore from saved progressive state
      this.questions[questionId] = {
        parts: normalized.parts,
        currentPart: normalized.allComplete ? null : this.findNextPart(parts, normalized.completedParts),
        completedParts: normalized.completedParts,
        allComplete: normalized.allComplete
      };
    } else {
      // Fresh start - first part is current
      this.questions[questionId] = {
        parts: {},
        currentPart: parts[0]?.partId || null,
        completedParts: [],
        allComplete: false
      };
    }
    return this.questions[questionId];
  }

  /**
   * Find the next incomplete part
   */
  private findNextPart(parts: FRQPart[], completedParts: string[]): string | null {
    for (const part of parts) {
      if (!completedParts.includes(part.partId)) {
        return part.partId;
      }
    }
    return null;
  }

  /**
   * Normalize saved answer to handle both legacy and progressive formats
   * @param savedAnswer - Raw saved answer from storage
   * @returns Normalized answer structure or null
   */
  normalizeAnswer(savedAnswer: SavedAnswer | null): NormalizedAnswer | null {
    if (!savedAnswer?.value) return null;

    // Legacy format: single string
    if (typeof savedAnswer.value === 'string') {
      return {
        legacyAnswer: savedAnswer.value,
        parts: {},
        completedParts: [],
        allComplete: true
      };
    }

    // Progressive format: structured object
    return savedAnswer.value as NormalizedAnswer;
  }

  /**
   * Get current state for a question
   */
  getState(questionId: string): ProgressiveState | undefined {
    return this.questions[questionId];
  }

  /**
   * Submit a part answer and advance to next part
   * @param questionId - Question ID
   * @param partId - Part being submitted (e.g., "a", "b-i")
   * @param answer - Student's answer text
   * @param allPartIds - All part IDs in order
   * @returns Updated state
   */
  submitPart(
    questionId: string,
    partId: string,
    answer: string,
    allPartIds: string[]
  ): ProgressiveState | null {
    const state = this.questions[questionId];
    if (!state) return null;

    // Save answer for this part
    state.parts[partId] = answer;

    // Mark as completed (avoid duplicates)
    if (!state.completedParts.includes(partId)) {
      state.completedParts.push(partId);
    }

    // Find next incomplete part
    const nextPart = allPartIds.find(id => !state.completedParts.includes(id));
    state.currentPart = nextPart || null;
    state.allComplete = state.completedParts.length === allPartIds.length;

    return state;
  }

  /**
   * Update an already-completed part's answer
   */
  updatePart(questionId: string, partId: string, answer: string): ProgressiveState | null {
    const state = this.questions[questionId];
    if (!state) return null;
    state.parts[partId] = answer;
    return state;
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.questions = {};
    this.getSavedAnswer = null;
  }

  /**
   * Set saved answer provider (for testing)
   */
  setSavedAnswerProvider(fn: (questionId: string) => SavedAnswer | null): void {
    this.getSavedAnswer = fn;
  }
}

/**
 * Check if a question has been answered
 * Handles both legacy (string) and progressive (object) formats
 */
function isQuestionAnswered(answer: SavedAnswer | null): boolean {
  if (!answer) return false;

  // Progressive format: check allComplete flag
  if (typeof answer.value === 'object' && answer.value !== null) {
    const progressive = answer.value as ProgressiveState;
    if (progressive.allComplete !== undefined) {
      return progressive.allComplete === true;
    }
  }

  // Legacy format: any truthy string value
  return answer.value !== undefined && answer.value !== null && answer.value !== '';
}

/**
 * Format partId for display
 * Examples: "a" → "(a)", "b-i" → "(b)(i)"
 */
function formatPartLabel(partId: string | null | undefined): string {
  if (!partId) return '';
  if (partId.includes('-')) {
    return partId.split('-').map(s => `(${s})`).join('');
  }
  return `(${partId})`;
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================
// TEST SUITES
// ============================================

describe('FRQPartStateManager', () => {
  let manager: FRQPartStateManager;

  beforeEach(() => {
    manager = new FRQPartStateManager();
  });

  // ----------------------------------------
  // normalizeAnswer Tests
  // ----------------------------------------
  describe('normalizeAnswer', () => {
    it('should return null for null/undefined input', () => {
      expect(manager.normalizeAnswer(null)).toBeNull();
      expect(manager.normalizeAnswer({ value: '', timestamp: 0 } as any)).toBeNull();
    });

    it('should detect legacy string answers and mark as complete', () => {
      const legacyAnswer: SavedAnswer = {
        value: 'This is a legacy answer',
        timestamp: 123
      };
      const result = manager.normalizeAnswer(legacyAnswer);

      expect(result).not.toBeNull();
      expect(result?.legacyAnswer).toBe('This is a legacy answer');
      expect(result?.allComplete).toBe(true);
      expect(result?.parts).toEqual({});
    });

    it('should pass through progressive format answers unchanged', () => {
      const progressiveAnswer: SavedAnswer = {
        value: {
          parts: { 'a': 'answer a', 'b': 'answer b' },
          completedParts: ['a', 'b'],
          currentPart: 'c',
          allComplete: false
        },
        timestamp: 123
      };
      const result = manager.normalizeAnswer(progressiveAnswer);

      expect(result?.parts).toEqual({ 'a': 'answer a', 'b': 'answer b' });
      expect(result?.completedParts).toEqual(['a', 'b']);
      expect(result?.allComplete).toBe(false);
    });
  });

  // ----------------------------------------
  // initialize Tests
  // ----------------------------------------
  describe('initialize', () => {
    const mockParts: FRQPart[] = [
      { partId: 'a', description: 'Part A' },
      { partId: 'b', description: 'Part B' },
      { partId: 'c', description: 'Part C' }
    ];

    it('should initialize fresh state for new questions', () => {
      const state = manager.initialize('Q1', mockParts);

      expect(state.currentPart).toBe('a');
      expect(state.completedParts).toEqual([]);
      expect(state.parts).toEqual({});
      expect(state.allComplete).toBe(false);
    });

    it('should restore state from progressive format', () => {
      manager.setSavedAnswerProvider(() => ({
        value: {
          parts: { 'a': 'saved answer a' },
          completedParts: ['a'],
          currentPart: 'b',
          allComplete: false
        },
        timestamp: 123
      }));

      const state = manager.initialize('Q1', mockParts);

      expect(state.currentPart).toBe('b');
      expect(state.completedParts).toEqual(['a']);
      expect(state.parts['a']).toBe('saved answer a');
    });

    it('should treat legacy answers as fully complete', () => {
      manager.setSavedAnswerProvider(() => ({
        value: 'This is a legacy single-string answer',
        timestamp: 123
      }));

      const state = manager.initialize('Q1', mockParts);

      expect(state.currentPart).toBeNull();
      expect(state.completedParts).toEqual(['a', 'b', 'c']);
      expect(state.allComplete).toBe(true);
      expect(state.legacyAnswer).toBe('This is a legacy single-string answer');
    });

    it('should handle empty parts array', () => {
      const state = manager.initialize('Q1', []);

      expect(state.currentPart).toBeNull();
      expect(state.completedParts).toEqual([]);
    });
  });

  // ----------------------------------------
  // submitPart Tests
  // ----------------------------------------
  describe('submitPart', () => {
    const partIds = ['a', 'b', 'c'];

    beforeEach(() => {
      manager.initialize('Q1', [
        { partId: 'a', description: 'Part A' },
        { partId: 'b', description: 'Part B' },
        { partId: 'c', description: 'Part C' }
      ]);
    });

    it('should save answer and advance to next part', () => {
      const state = manager.submitPart('Q1', 'a', 'Answer for A', partIds);

      expect(state?.parts['a']).toBe('Answer for A');
      expect(state?.completedParts).toContain('a');
      expect(state?.currentPart).toBe('b');
      expect(state?.allComplete).toBe(false);
    });

    it('should mark allComplete when last part submitted', () => {
      manager.submitPart('Q1', 'a', 'Answer A', partIds);
      manager.submitPart('Q1', 'b', 'Answer B', partIds);
      const state = manager.submitPart('Q1', 'c', 'Answer C', partIds);

      expect(state?.allComplete).toBe(true);
      expect(state?.currentPart).toBeNull();
      expect(state?.completedParts).toEqual(['a', 'b', 'c']);
    });

    it('should not duplicate part in completedParts if resubmitted', () => {
      manager.submitPart('Q1', 'a', 'Answer 1', partIds);
      const state = manager.submitPart('Q1', 'a', 'Answer 2', partIds);

      expect(state?.completedParts.filter(p => p === 'a').length).toBe(1);
      expect(state?.parts['a']).toBe('Answer 2');
    });

    it('should handle complex partIds like b-i, b-ii', () => {
      const complexParts = [
        { partId: 'a', description: 'Part A' },
        { partId: 'b-i', description: 'Part B-i' },
        { partId: 'b-ii', description: 'Part B-ii' },
        { partId: 'c', description: 'Part C' }
      ];
      const complexIds = ['a', 'b-i', 'b-ii', 'c'];

      manager.initialize('Q2', complexParts);
      manager.submitPart('Q2', 'a', 'A', complexIds);
      const state = manager.submitPart('Q2', 'b-i', 'B-i', complexIds);

      expect(state?.currentPart).toBe('b-ii');
      expect(state?.completedParts).toEqual(['a', 'b-i']);
    });

    it('should return null for non-existent question', () => {
      const state = manager.submitPart('NonExistent', 'a', 'Answer', partIds);
      expect(state).toBeNull();
    });
  });

  // ----------------------------------------
  // updatePart Tests
  // ----------------------------------------
  describe('updatePart', () => {
    it('should update existing part answer', () => {
      manager.initialize('Q1', [{ partId: 'a', description: 'Part A' }]);
      manager.submitPart('Q1', 'a', 'Original', ['a']);

      const state = manager.updatePart('Q1', 'a', 'Updated');

      expect(state?.parts['a']).toBe('Updated');
    });

    it('should return null for non-existent question', () => {
      const state = manager.updatePart('NonExistent', 'a', 'Answer');
      expect(state).toBeNull();
    });

    it('should preserve other state when updating', () => {
      manager.initialize('Q1', [
        { partId: 'a', description: 'Part A' },
        { partId: 'b', description: 'Part B' }
      ]);
      manager.submitPart('Q1', 'a', 'Original A', ['a', 'b']);

      const state = manager.updatePart('Q1', 'a', 'Updated A');

      expect(state?.currentPart).toBe('b');
      expect(state?.completedParts).toContain('a');
    });
  });
});

// ----------------------------------------
// isQuestionAnswered Tests
// ----------------------------------------
describe('isQuestionAnswered', () => {
  it('should return false for null/undefined answers', () => {
    expect(isQuestionAnswered(null)).toBe(false);
    expect(isQuestionAnswered(undefined as any)).toBe(false);
  });

  it('should return true for legacy string answers', () => {
    expect(isQuestionAnswered({ value: 'Some answer', timestamp: 0 })).toBe(true);
    expect(isQuestionAnswered({ value: 'A', timestamp: 0 })).toBe(true);
  });

  it('should return false for empty string answers', () => {
    expect(isQuestionAnswered({ value: '', timestamp: 0 })).toBe(false);
  });

  it('should return true for progressive answers with allComplete=true', () => {
    const answer: SavedAnswer = {
      value: {
        parts: { 'a': 'A', 'b': 'B' },
        completedParts: ['a', 'b'],
        currentPart: null,
        allComplete: true
      },
      timestamp: 0
    };
    expect(isQuestionAnswered(answer)).toBe(true);
  });

  it('should return false for progressive answers with allComplete=false', () => {
    const answer: SavedAnswer = {
      value: {
        parts: { 'a': 'A' },
        completedParts: ['a'],
        currentPart: 'b',
        allComplete: false
      },
      timestamp: 0
    };
    expect(isQuestionAnswered(answer)).toBe(false);
  });

  it('should return false for in-progress progressive answers', () => {
    const answer: SavedAnswer = {
      value: {
        parts: {},
        completedParts: [],
        currentPart: 'a',
        allComplete: false
      },
      timestamp: 0
    };
    expect(isQuestionAnswered(answer)).toBe(false);
  });
});

// ----------------------------------------
// formatPartLabel Tests
// ----------------------------------------
describe('formatPartLabel', () => {
  it('should format simple part IDs', () => {
    expect(formatPartLabel('a')).toBe('(a)');
    expect(formatPartLabel('b')).toBe('(b)');
    expect(formatPartLabel('c')).toBe('(c)');
  });

  it('should format compound part IDs with dashes', () => {
    expect(formatPartLabel('b-i')).toBe('(b)(i)');
    expect(formatPartLabel('b-ii')).toBe('(b)(ii)');
    expect(formatPartLabel('a-i')).toBe('(a)(i)');
  });

  it('should handle triple-compound IDs', () => {
    expect(formatPartLabel('a-i-1')).toBe('(a)(i)(1)');
  });

  it('should return empty string for null/undefined', () => {
    expect(formatPartLabel(null)).toBe('');
    expect(formatPartLabel(undefined)).toBe('');
    expect(formatPartLabel('')).toBe('');
  });
});

// ----------------------------------------
// truncateText Tests
// ----------------------------------------
describe('truncateText', () => {
  it('should not truncate short text', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
    expect(truncateText('Test', 10)).toBe('Test');
  });

  it('should truncate long text with ellipsis', () => {
    expect(truncateText('This is a long text', 10)).toBe('This is...');
  });

  it('should handle null/undefined', () => {
    expect(truncateText(null, 10)).toBe('');
    expect(truncateText(undefined, 10)).toBe('');
  });

  it('should handle exact length text', () => {
    expect(truncateText('1234567890', 10)).toBe('1234567890');
  });

  it('should handle text shorter than ellipsis would make it', () => {
    expect(truncateText('Hi', 10)).toBe('Hi');
  });
});

// ----------------------------------------
// Data Structure Integrity Tests
// ----------------------------------------
describe('Data Structure Integrity', () => {
  let manager: FRQPartStateManager;

  beforeEach(() => {
    manager = new FRQPartStateManager();
  });

  it('should maintain answer data through full workflow', () => {
    const parts: FRQPart[] = [
      { partId: 'a', description: 'Part A' },
      { partId: 'b', description: 'Part B' },
      { partId: 'c', description: 'Part C' }
    ];
    const partIds = ['a', 'b', 'c'];

    manager.initialize('Q1', parts);
    manager.submitPart('Q1', 'a', 'Answer A', partIds);
    manager.submitPart('Q1', 'b', 'Answer B', partIds);
    manager.updatePart('Q1', 'a', 'Updated Answer A');
    const finalState = manager.submitPart('Q1', 'c', 'Answer C', partIds);

    expect(finalState?.parts['a']).toBe('Updated Answer A');
    expect(finalState?.parts['b']).toBe('Answer B');
    expect(finalState?.parts['c']).toBe('Answer C');
    expect(finalState?.allComplete).toBe(true);
    expect(finalState?.completedParts).toEqual(['a', 'b', 'c']);
  });

  it('should serialize to valid JSON', () => {
    manager.initialize('Q1', [{ partId: 'a', description: 'Part A' }]);
    manager.submitPart('Q1', 'a', 'Test answer with "quotes" and special chars: <>&', ['a']);

    const state = manager.getState('Q1');
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    expect(parsed.parts['a']).toBe('Test answer with "quotes" and special chars: <>&');
  });

  it('should maintain state across multiple questions', () => {
    const parts: FRQPart[] = [{ partId: 'a', description: 'Part A' }];

    manager.initialize('Q1', parts);
    manager.initialize('Q2', parts);
    manager.submitPart('Q1', 'a', 'Answer Q1', ['a']);
    manager.submitPart('Q2', 'a', 'Answer Q2', ['a']);

    expect(manager.getState('Q1')?.parts['a']).toBe('Answer Q1');
    expect(manager.getState('Q2')?.parts['a']).toBe('Answer Q2');
  });
});

// ----------------------------------------
// Edge Cases
// ----------------------------------------
describe('Edge Cases', () => {
  let manager: FRQPartStateManager;

  beforeEach(() => {
    manager = new FRQPartStateManager();
  });

  it('should handle single-part FRQs', () => {
    manager.initialize('Q1', [{ partId: 'a', description: 'Only part' }]);
    const state = manager.submitPart('Q1', 'a', 'Answer', ['a']);

    expect(state?.allComplete).toBe(true);
    expect(state?.currentPart).toBeNull();
  });

  it('should handle out-of-order part submission', () => {
    const parts: FRQPart[] = [
      { partId: 'a', description: 'Part A' },
      { partId: 'b', description: 'Part B' },
      { partId: 'c', description: 'Part C' }
    ];
    const partIds = ['a', 'b', 'c'];

    manager.initialize('Q1', parts);

    // Submit out of order (simulating UI manipulation)
    manager.submitPart('Q1', 'b', 'B', partIds);
    manager.submitPart('Q1', 'a', 'A', partIds);
    const state = manager.submitPart('Q1', 'c', 'C', partIds);

    expect(state?.allComplete).toBe(true);
    expect(state?.completedParts).toContain('a');
    expect(state?.completedParts).toContain('b');
    expect(state?.completedParts).toContain('c');
  });

  it('should handle very long answers', () => {
    manager.initialize('Q1', [{ partId: 'a', description: 'Part A' }]);

    const longAnswer = 'A'.repeat(10000);
    const state = manager.submitPart('Q1', 'a', longAnswer, ['a']);

    expect(state?.parts['a'].length).toBe(10000);
  });

  it('should handle special characters in answers', () => {
    manager.initialize('Q1', [{ partId: 'a', description: 'Part A' }]);

    const specialAnswer = '∑∏∫ √π ≤≥ αβγ "quotes" <html> &amp;';
    const state = manager.submitPart('Q1', 'a', specialAnswer, ['a']);

    expect(state?.parts['a']).toBe(specialAnswer);
  });

  it('should handle unicode in part IDs', () => {
    // While not typical, ensure robustness
    manager.initialize('Q1', [{ partId: 'α', description: 'Greek alpha part' }]);
    const state = manager.submitPart('Q1', 'α', 'Answer', ['α']);

    expect(state?.parts['α']).toBe('Answer');
    expect(state?.allComplete).toBe(true);
  });

  it('should handle rapid successive submissions', () => {
    manager.initialize('Q1', [
      { partId: 'a', description: 'Part A' },
      { partId: 'b', description: 'Part B' }
    ]);
    const partIds = ['a', 'b'];

    // Rapid submissions (simulating fast clicking)
    manager.submitPart('Q1', 'a', 'A1', partIds);
    manager.submitPart('Q1', 'a', 'A2', partIds);
    manager.submitPart('Q1', 'a', 'A3', partIds);

    const state = manager.getState('Q1');
    expect(state?.parts['a']).toBe('A3'); // Last value wins
    expect(state?.completedParts.filter(p => p === 'a').length).toBe(1); // No duplicates
  });
});

// ----------------------------------------
// State Transition Tests
// ----------------------------------------
describe('State Transitions', () => {
  let manager: FRQPartStateManager;

  beforeEach(() => {
    manager = new FRQPartStateManager();
  });

  it('locked → current: should happen when previous part submitted', () => {
    manager.initialize('Q1', [
      { partId: 'a', description: 'Part A' },
      { partId: 'b', description: 'Part B' }
    ]);

    // Initially: a=current, b=locked
    let state = manager.getState('Q1');
    expect(state?.currentPart).toBe('a');

    // Submit a: a=completed, b=current
    state = manager.submitPart('Q1', 'a', 'Answer A', ['a', 'b']);
    expect(state?.currentPart).toBe('b');
    expect(state?.completedParts).toContain('a');
  });

  it('current → completed: should happen on submit', () => {
    manager.initialize('Q1', [{ partId: 'a', description: 'Part A' }]);

    const state = manager.submitPart('Q1', 'a', 'Answer', ['a']);

    expect(state?.completedParts).toContain('a');
    expect(state?.allComplete).toBe(true);
  });

  it('completed → (editable): should allow updates', () => {
    manager.initialize('Q1', [{ partId: 'a', description: 'Part A' }]);
    manager.submitPart('Q1', 'a', 'Original', ['a']);

    const state = manager.updatePart('Q1', 'a', 'Edited');

    expect(state?.parts['a']).toBe('Edited');
    expect(state?.completedParts).toContain('a'); // Still completed
  });

  it('any → allComplete: should happen when all parts done', () => {
    manager.initialize('Q1', [
      { partId: 'a', description: 'Part A' },
      { partId: 'b', description: 'Part B' }
    ]);

    manager.submitPart('Q1', 'a', 'A', ['a', 'b']);
    expect(manager.getState('Q1')?.allComplete).toBe(false);

    manager.submitPart('Q1', 'b', 'B', ['a', 'b']);
    expect(manager.getState('Q1')?.allComplete).toBe(true);
  });
});
