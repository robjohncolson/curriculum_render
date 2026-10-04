/**
 * TI-84 CE Result Formatter — takes computed results and produces display lines
 * matching TI-84 output.
 * Module 4 of the native stat calculator reimplementation.
 *
 * Depends on:
 *   - window.TI84FieldTables  (field-tables.js)
 *   - window.TI84StatMath     (stat-math.js)
 */
(function () {
  'use strict';

  // ───────────────────────────────────────────────
  //  Resolve dependencies
  // ───────────────────────────────────────────────

  function getFieldTables() {
    if (typeof window !== 'undefined' && window.TI84FieldTables) {
      return window.TI84FieldTables;
    }
    if (typeof require === 'function') {
      return require('./field-tables.js');
    }
    throw new Error('TI84FieldTables not available');
  }

  function getStatMath() {
    if (typeof window !== 'undefined' && window.TI84StatMath) {
      return window.TI84StatMath;
    }
    if (typeof require === 'function') {
      return require('./stat-math.js');
    }
    throw new Error('TI84StatMath not available');
  }

  // ───────────────────────────────────────────────
  //  Placeholder replacement
  // ───────────────────────────────────────────────

  /**
   * Replace all {placeholder} tokens in a template line with formatted values.
   * The special token {alt} is replaced with the altHypothesis string directly
   * (not formatted as a number).
   */
  function replacePlaceholders(templateLine, computedValues, altHypothesis, formatTI) {
    return templateLine.replace(/\{(\w+)\}/g, function (match, key) {
      if (key === 'alt') {
        return altHypothesis || '';
      }
      if (computedValues.hasOwnProperty(key)) {
        var val = computedValues[key];
        if (typeof val === 'number') {
          return formatTI(val);
        }
        return String(val);
      }
      return match; // leave unreplaced if key not found
    });
  }

  // ───────────────────────────────────────────────
  //  Public API
  // ───────────────────────────────────────────────

  var ResultFormatter = {

    /**
     * Format a result screen given its template ID, computed values, and
     * optionally the alternative hypothesis string.
     *
     * @param {string} resultScreenId — key into TI84FieldTables.RESULTS
     * @param {Object} computedValues — map of placeholder names to numeric values
     * @param {string} [altHypothesis] — e.g., '\u2260', '<', '>', '\u2260p\u2080', etc.
     * @returns {{ lines: string[], scrollable: boolean, nextPage: string|null }}
     */
    format: function (resultScreenId, computedValues, altHypothesis) {
      var tables = getFieldTables();
      var math = getStatMath();
      var template = tables.RESULTS[resultScreenId];

      if (!template) {
        return { lines: ['ERR: unknown screen'], scrollable: false, nextPage: null };
      }

      var formatTI = math.formatTI;
      var lines = [];

      for (var i = 0; i < template.lines.length; i++) {
        lines.push(replacePlaceholders(template.lines[i], computedValues, altHypothesis, formatTI));
      }

      return {
        lines: lines,
        scrollable: template.scrollable,
        nextPage: template.nextPage || null
      };
    }
  };

  // ───────────────────────────────────────────────
  //  Export
  // ───────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window.TI84ResultFormatter = ResultFormatter;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultFormatter;
  }
})();
