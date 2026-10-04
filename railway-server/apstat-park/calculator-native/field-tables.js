/**
 * TI-84 CE Field Tables — embedded wizard field data and result screen templates.
 * Extracted from ti84-procedures-data.json and ti84-rom-disassembly-results.json.
 *
 * ROM-verified field order and types are used where confidence is high.
 * Module data for the native stat calculator reimplementation.
 */
(function () {
  'use strict';

  var FieldTables = {
    /**
     * All 20 wizard field tables.
     *
     * Each wizard has:
     *   fields:     array of { label, type, default?, options? }
     *   inputModes: null | { dataFields, statsFields, pairedWizard }
     *
     * Field types: 'number', 'integer', 'list-selector', 'choice',
     *   'action-button', 'action-selector', 'color-selector',
     *   'equation-selector', 'matrix-selector'
     */
    WIZARDS: {

      // ── STAT > CALC wizards ──────────────────────────────────────────

      'one-var-stats-wizard': {
        fields: [
          { label: 'List',     type: 'list-selector',  default: 'L1' },
          { label: 'FreqList', type: 'list-selector',  default: '1' },
          { label: 'Calculate', type: 'action-button' }
        ],
        inputModes: null
      },

      'linreg-wizard': {
        fields: [
          { label: 'Xlist',        type: 'list-selector',     default: 'L1' },
          { label: 'Ylist',        type: 'list-selector',     default: 'L2' },
          { label: 'FreqList',     type: 'list-selector',     default: '1' },
          { label: 'Store RegEQ',  type: 'equation-selector', default: 'Y1' },
          { label: 'Calculate',    type: 'action-button' }
        ],
        inputModes: null
      },

      // ── DISTR wizards ────────────────────────────────────────────────

      'normalcdf-wizard': {
        fields: [
          { label: 'lower', type: 'number' },
          { label: 'upper', type: 'number' },
          { label: '\u03BC',     type: 'number', default: '0' },
          { label: '\u03C3',     type: 'number', default: '1' },
          { label: 'Paste', type: 'action-button' }
        ],
        inputModes: null
      },

      // U3 randomization: the real CE opens a field prompt for randInt(/
      // randIntNoRep( (wizards ON, the default). Paste composes the command
      // onto the home entry line; a second ENTER evaluates it.
      'randint-wizard': {
        fields: [
          { label: 'lower', type: 'integer' },
          { label: 'upper', type: 'integer' },
          { label: 'n',     type: 'integer', default: '1' },
          { label: 'Paste', type: 'action-button' }
        ],
        inputModes: null
      },

      'randintnorep-wizard': {
        fields: [
          { label: 'lower', type: 'integer' },
          { label: 'upper', type: 'integer' },
          { label: 'n',     type: 'integer' },
          { label: 'Paste', type: 'action-button' }
        ],
        inputModes: null
      },

      'invnorm-wizard': {
        fields: [
          { label: 'area', type: 'number' },
          { label: '\u03BC',    type: 'number', default: '0' },
          { label: '\u03C3',    type: 'number', default: '1' },
          { label: 'Tail', type: 'choice',  options: ['LEFT', 'CENTER', 'RIGHT'] },
          { label: 'Paste', type: 'action-button' }
        ],
        inputModes: null
      },

      'binompdf-wizard': {
        fields: [
          { label: 'trials', type: 'number' },
          { label: 'p',      type: 'number' },
          { label: 'x',      type: 'integer' },
          { label: 'Paste',  type: 'action-button' }
        ],
        inputModes: null
      },

      'binomcdf-wizard': {
        fields: [
          { label: 'trials', type: 'number' },
          { label: 'p',      type: 'number' },
          { label: 'x',      type: 'integer' },
          { label: 'Paste',  type: 'action-button' }
        ],
        inputModes: null
      },

      'geometpdf-wizard': {
        fields: [
          { label: 'p',     type: 'number' },
          { label: 'x',     type: 'integer' },
          { label: 'Paste', type: 'action-button' }
        ],
        inputModes: null
      },

      'geometcdf-wizard': {
        fields: [
          { label: 'p',     type: 'number' },
          { label: 'x',     type: 'integer' },
          { label: 'Paste', type: 'action-button' }
        ],
        inputModes: null
      },

      // ── STAT > TESTS wizards (Data/Stats pairs) ─────────────────────

      't-test-data-wizard': {
        fields: [
          { label: 'Inpt',    type: 'choice',          options: ['Data', 'Stats'], default: 'Data' },
          { label: '\u03BC0',       type: 'number' },
          { label: 'List',    type: 'list-selector',   default: 'L1' },
          { label: 'Freq',    type: 'list-selector',   default: '1' },
          { label: '\u03BC ? \u03BC0',  type: 'choice',          options: ['\u2260', '<', '>'] },
          { label: 'Color:',  type: 'color-selector' },
          { label: 'Calculate/Draw', type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: {
          dataFields:   ['Inpt', '\u03BC0', 'List', 'Freq', '\u03BC ? \u03BC0', 'Color:', 'Calculate/Draw'],
          statsFields:  ['Inpt', '\u03BC0', 'x\u0304', 'Sx', 'n', '\u03BC ? \u03BC0', 'Color:', 'Calculate/Draw'],
          pairedWizard: 't-test-stats-wizard'
        }
      },

      't-test-stats-wizard': {
        fields: [
          { label: 'Inpt',    type: 'choice',          options: ['Data', 'Stats'], default: 'Stats' },
          { label: '\u03BC0',       type: 'number' },
          { label: 'x\u0304',       type: 'number' },
          { label: 'Sx',      type: 'number' },
          { label: 'n',       type: 'integer' },
          { label: '\u03BC ? \u03BC0',  type: 'choice',          options: ['\u2260', '<', '>'] },
          { label: 'Color:',  type: 'color-selector' },
          { label: 'Calculate/Draw', type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: {
          dataFields:   ['Inpt', '\u03BC0', 'List', 'Freq', '\u03BC ? \u03BC0', 'Color:', 'Calculate/Draw'],
          statsFields:  ['Inpt', '\u03BC0', 'x\u0304', 'Sx', 'n', '\u03BC ? \u03BC0', 'Color:', 'Calculate/Draw'],
          pairedWizard: 't-test-data-wizard'
        }
      },

      't-interval-data-wizard': {
        fields: [
          { label: 'Inpt',      type: 'choice',        options: ['Data', 'Stats'], default: 'Data' },
          { label: 'List',      type: 'list-selector',  default: 'L1' },
          { label: 'Freq',      type: 'list-selector',  default: '1' },
          { label: 'C-Level',   type: 'number',         default: '.95' },
          { label: 'Calculate', type: 'action-button' }
        ],
        inputModes: {
          dataFields:   ['Inpt', 'List', 'Freq', 'C-Level', 'Calculate'],
          statsFields:  ['Inpt', 'x\u0304', 'Sx', 'n', 'C-Level', 'Calculate'],
          pairedWizard: 't-interval-stats-wizard'
        }
      },

      't-interval-stats-wizard': {
        fields: [
          { label: 'Inpt',      type: 'choice',   options: ['Data', 'Stats'], default: 'Stats' },
          { label: 'x\u0304',        type: 'number' },
          { label: 'Sx',        type: 'number' },
          { label: 'n',         type: 'integer' },
          { label: 'C-Level',   type: 'number',   default: '.95' },
          { label: 'Calculate', type: 'action-button' }
        ],
        inputModes: {
          dataFields:   ['Inpt', 'List', 'Freq', 'C-Level', 'Calculate'],
          statsFields:  ['Inpt', 'x\u0304', 'Sx', 'n', 'C-Level', 'Calculate'],
          pairedWizard: 't-interval-data-wizard'
        }
      },

      'two-samp-ttest-stats-wizard': {
        fields: [
          { label: 'Inpt',     type: 'choice',          options: ['Data', 'Stats'], default: 'Stats' },
          { label: 'x\u03041',      type: 'number' },
          { label: 'Sx1',      type: 'number' },
          { label: 'n1',       type: 'integer' },
          { label: 'x\u03042',      type: 'number' },
          { label: 'Sx2',      type: 'number' },
          { label: 'n2',       type: 'integer' },
          { label: '\u03BC1 ? \u03BC2', type: 'choice',          options: ['\u2260', '<', '>'] },
          { label: 'Pooled',   type: 'choice',          options: ['No', 'Yes'] },
          { label: 'Color:',   type: 'color-selector' },
          { label: 'Calculate/Draw', type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: {
          dataFields:   ['Inpt', 'List1', 'List2', 'Freq1', 'Freq2', '\u03BC1 ? \u03BC2', 'Pooled', 'Color:', 'Calculate/Draw'],
          statsFields:  ['Inpt', 'x\u03041', 'Sx1', 'n1', 'x\u03042', 'Sx2', 'n2', '\u03BC1 ? \u03BC2', 'Pooled', 'Color:', 'Calculate/Draw'],
          pairedWizard: null  // data-mode wizard ID not in current JSON
        }
      },

      'two-samp-tint-stats-wizard': {
        fields: [
          { label: 'Inpt',      type: 'choice',   options: ['Data', 'Stats'], default: 'Stats' },
          { label: 'x\u03041',       type: 'number' },
          { label: 'Sx1',       type: 'number' },
          { label: 'n1',        type: 'integer' },
          { label: 'x\u03042',       type: 'number' },
          { label: 'Sx2',       type: 'number' },
          { label: 'n2',        type: 'integer' },
          { label: 'C-Level',   type: 'number',   default: '.95' },
          { label: 'Pooled',    type: 'choice',   options: ['No', 'Yes'] },
          { label: 'Calculate', type: 'action-button' }
        ],
        inputModes: {
          dataFields:   ['Inpt', 'List1', 'List2', 'Freq1', 'Freq2', 'C-Level', 'Pooled', 'Calculate'],
          statsFields:  ['Inpt', 'x\u03041', 'Sx1', 'n1', 'x\u03042', 'Sx2', 'n2', 'C-Level', 'Pooled', 'Calculate'],
          pairedWizard: null  // data-mode wizard ID not in current JSON
        }
      },

      // ── STAT > TESTS wizards (no Data/Stats toggle) ─────────────────

      'one-propztest-wizard': {
        fields: [
          { label: 'p0',   type: 'number' },
          { label: 'x',    type: 'integer' },
          { label: 'n',    type: 'integer' },
          { label: 'prop', type: 'choice', options: ['\u2260p\u2080', '<p\u2080', '>p\u2080'] },
          { label: 'Color:',         type: 'color-selector' },
          { label: 'Calculate/Draw', type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: null
      },

      'one-propzint-wizard': {
        fields: [
          { label: 'x',         type: 'integer' },
          { label: 'n',         type: 'integer' },
          { label: 'C-Level',   type: 'number', default: '.95' },
          { label: 'Calculate', type: 'action-button' }
        ],
        inputModes: null
      },

      'two-propztest-wizard': {
        fields: [
          { label: 'x1',    type: 'integer' },
          { label: 'n1',    type: 'integer' },
          { label: 'x2',    type: 'integer' },
          { label: 'n2',    type: 'integer' },
          { label: 'p1',    type: 'choice', options: ['\u2260p2', '<p2', '>p2'] },
          { label: 'Color:',         type: 'color-selector' },
          { label: 'Calculate/Draw', type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: null
      },

      'two-propzint-wizard': {
        fields: [
          { label: 'x1',        type: 'integer' },
          { label: 'n1',        type: 'integer' },
          { label: 'x2',        type: 'integer' },
          { label: 'n2',        type: 'integer' },
          { label: 'C-Level',   type: 'number', default: '.95' },
          { label: 'Calculate', type: 'action-button' }
        ],
        inputModes: null
      },

      'chi2gof-wizard': {
        fields: [
          { label: 'Observed', type: 'list-selector',  default: 'L1' },
          { label: 'Expected', type: 'list-selector',  default: 'L2' },
          { label: 'df',       type: 'integer' },
          { label: 'Color:',          type: 'color-selector' },
          { label: 'Calculate/Draw',  type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: null
      },

      'chi2test-wizard': {
        fields: [
          { label: 'Observed', type: 'matrix-selector', default: '[A]' },
          { label: 'Expected', type: 'matrix-selector', default: '[B]' },
          { label: 'Color:',          type: 'color-selector' },
          { label: 'Calculate/Draw',  type: 'action-selector', options: ['Calculate', 'Draw'] }
        ],
        inputModes: null
      },

      'linreg-ttest-wizard': {
        fields: [
          { label: 'Xlist',      type: 'list-selector',     default: 'L1' },
          { label: 'Ylist',      type: 'list-selector',     default: 'L2' },
          { label: 'Freq',       type: 'list-selector',     default: '1' },
          { label: '\u03B2 and \u03C1',  type: 'choice',            options: ['\u22600', '<0', '>0'] },
          { label: 'RegEQ',      type: 'equation-selector', default: 'Y1' },
          { label: 'Calculate',  type: 'action-button' }
        ],
        inputModes: null
      },

      'linreg-tint-wizard': {
        fields: [
          { label: 'Xlist',      type: 'list-selector',     default: 'L1' },
          { label: 'Ylist',      type: 'list-selector',     default: 'L2' },
          { label: 'Freq',       type: 'list-selector',     default: '1' },
          { label: 'C-Level',    type: 'number',             default: '.95' },
          { label: 'RegEQ',      type: 'equation-selector', default: 'Y1' },
          { label: 'Calculate',  type: 'action-button' }
        ],
        inputModes: null
      }
    },

    /**
     * All 14 result screen templates.
     *
     * Each entry has:
     *   lines:      string[] — display lines with {placeholder} tokens
     *   scrollable: boolean — whether DOWN scrolls to next page
     *   nextPage:   string | null — ID of the continuation screen
     */
    RESULTS: {

      'one-var-stats-result-page1': {
        lines: [
          'x\u0304 = {xbar}',
          '\u03A3x = {sumX}',
          '\u03A3x\u00B2 = {sumX2}',
          'Sx = {Sx}',
          '\u03C3x = {sigmaX}',
          'n = {n}'
        ],
        scrollable: true,
        nextPage: 'one-var-stats-result-page2'
      },

      'one-var-stats-result-page2': {
        lines: [
          'minX = {minX}',
          'Q1 = {Q1}',
          'Med = {Med}',
          'Q3 = {Q3}',
          'maxX = {maxX}'
        ],
        scrollable: true,
        nextPage: null
      },

      'distribution-home-result': {
        lines: [
          'command(...)',
          '{value}'
        ],
        scrollable: false,
        nextPage: null
      },

      'linreg-result': {
        lines: [
          'y = a + bx',
          'a = {a}',
          'b = {b}',
          'r\u00B2 = {r2}',
          'r = {r}'
        ],
        scrollable: true,
        nextPage: null
      },

      't-test-result': {
        lines: [
          '\u03BC {alt} \u03BC0',
          't = {t}',
          'p = {p}',
          'x\u0304 = {xbar}',
          'Sx = {Sx}',
          'n = {n}'
        ],
        scrollable: false,
        nextPage: null
      },

      't-interval-result': {
        lines: [
          '({lower}, {upper})',
          'x\u0304 = {xbar}',
          'Sx = {Sx}',
          'n = {n}'
        ],
        scrollable: false,
        nextPage: null
      },

      'two-samp-ttest-result': {
        lines: [
          '\u03BC1 {alt} \u03BC2',
          't = {t}',
          'p = {p}',
          'df = {df}',
          'x\u03041 = {xbar1}',
          'x\u03042 = {xbar2}',
          'Sx1 = {Sx1}',
          'Sx2 = {Sx2}',
          'n1 = {n1}',
          'n2 = {n2}'
        ],
        scrollable: true,
        nextPage: null
      },

      'two-samp-tint-result': {
        lines: [
          '({lower}, {upper})',
          'df = {df}',
          'x\u03041 = {xbar1}',
          'x\u03042 = {xbar2}',
          'Sx1 = {Sx1}',
          'Sx2 = {Sx2}',
          'n1 = {n1}',
          'n2 = {n2}'
        ],
        scrollable: true,
        nextPage: null
      },

      'one-propztest-result': {
        lines: [
          'prop {alt} p0',
          'z = {z}',
          'p = {p}',
          'p\u0302 = {pHat}',
          'n = {n}'
        ],
        scrollable: false,
        nextPage: null
      },

      'one-propzint-result': {
        lines: [
          '({lower}, {upper})',
          'p\u0302 = {pHat}',
          'n = {n}'
        ],
        scrollable: false,
        nextPage: null
      },

      'two-propztest-result': {
        lines: [
          'p1 {alt} p2',
          'z = {z}',
          'p = {p}',
          'p\u03021 = {pHat1}',
          'p\u03022 = {pHat2}',
          'p\u0302 = {pHatPooled}',
          'n1 = {n1}',
          'n2 = {n2}'
        ],
        scrollable: true,
        nextPage: null
      },

      'two-propzint-result': {
        lines: [
          '({lower}, {upper})',
          'p\u03021 = {pHat1}',
          'p\u03022 = {pHat2}',
          'n1 = {n1}',
          'n2 = {n2}'
        ],
        scrollable: false,
        nextPage: null
      },

      'chi2gof-result': {
        lines: [
          '\u03C7\u00B2 = {chi2}',
          'p = {p}',
          'df = {df}'
        ],
        scrollable: false,
        nextPage: null
      },

      'chi2test-result': {
        lines: [
          '\u03C7\u00B2 = {chi2}',
          'p = {p}',
          'df = {df}'
        ],
        scrollable: false,
        nextPage: null
      },

      'linreg-ttest-result': {
        lines: [
          '\u03B2 and \u03C1 {alt} 0',
          't = {t}',
          'p = {p}',
          'df = {df}',
          'a = {a}',
          'b = {b}',
          's = {s}',
          'r\u00B2 = {r2}',
          'r = {r}'
        ],
        scrollable: true,
        nextPage: null
      },

      'linreg-tint-result': {
        lines: [
          '({lower}, {upper})',
          'df = {df}',
          'a = {a}',
          'b = {b}',
          's = {s}',
          'r\u00B2 = {r2}',
          'r = {r}'
        ],
        scrollable: true,
        nextPage: null
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.TI84FieldTables = FieldTables;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldTables;
  }
})();
