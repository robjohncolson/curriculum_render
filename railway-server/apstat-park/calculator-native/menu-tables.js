/**
 * TI-84 CE Menu Tables — embedded menu screen data.
 * Extracted from ti84-procedures-data.json (all screens where type='menu').
 * Cross-referenced with procedure steps to build MENU_ACTIONS.
 *
 * Module data for the native stat calculator reimplementation.
 */
(function () {
  'use strict';

  var MenuTables = {
    /**
     * All 12 menu screens from the procedures JSON.
     * Each entry has:
     *   items:     string[] — the menu items exactly as displayed
     *   tabs:      string[] | null — tab names for tabbed menus
     *   activeTab: string | null — which tab is active
     *   title:     string — menu title bar text
     *   cursor:    number — default cursor position
     */
    MENUS: {
      'stat-menu': {
        title: 'STAT',
        tabs: ['EDIT', 'CALC', 'TESTS'],
        activeTab: 'EDIT',
        items: [
          '1:Edit...',
          '2:SortA(',
          '3:SortD(',
          '4:ClrList',
          '5:SetUpEditor'
        ],
        cursor: 0
      },

      'stat-calc-menu': {
        title: 'STAT',
        tabs: ['EDIT', 'CALC', 'TESTS'],
        activeTab: 'CALC',
        items: [
          '1:1-Var Stats',
          '2:2-Var Stats',
          '3:Med-Med',
          '4:LinReg(ax+b)',
          '5:QuadReg',
          '6:CubicReg',
          '7:QuartReg',
          '8:LinReg(a+bx)',
          '9:LnReg',
          '0:ExpReg',
          'A:PowerReg',
          'B:Logistic',
          'C:SinReg',
          'D:Manual-Fit'
        ],
        cursor: 0
      },

      'stat-tests-menu': {
        title: 'STAT',
        tabs: ['EDIT', 'CALC', 'TESTS'],
        activeTab: 'TESTS',
        items: [
          '1:Z-Test...',
          '2:T-Test...',
          '3:2-SampZTest...',
          '4:2-SampTTest...',
          '5:1-PropZTest...',
          '6:2-PropZTest...',
          '7:ZInterval...',
          '8:TInterval...',
          '9:2-SampZInt...',
          '0:2-SampTInt...',
          'A:1-PropZInt...',
          'B:2-PropZInt...',
          'C:\u03C7\u00B2-Test...',
          'D:\u03C7\u00B2GOF-Test...',
          'E:2-SampFTest...',
          'F:LinRegTTest...',
          'G:LinRegTInt...',
          'H:ANOVA(...'
        ],
        cursor: 0
      },

      'distr-menu': {
        title: 'DISTR',
        tabs: null,
        activeTab: null,
        items: [
          '1:normalpdf(',
          '2:normalcdf(',
          '3:invNorm(',
          '4:invT(',
          '5:tpdf(',
          '6:tcdf(',
          '7:\u03C7\u00B2pdf(',
          '8:\u03C7\u00B2cdf(',
          '9:Fpdf(',
          '0:Fcdf(',
          'A:binompdf(',
          'B:binomcdf(',
          'C:invBinom(',
          'D:poissonpdf(',
          'E:poissoncdf(',
          'F:geometpdf(',
          'G:geometcdf('
        ],
        cursor: 0
      },

      'stat-plot-menu': {
        title: 'STAT PLOTS',
        tabs: null,
        activeTab: null,
        items: [
          '1:Plot1...',
          '2:Plot2...',
          '3:Plot3...'
        ],
        cursor: 0
      },

      'zoom-menu': {
        title: 'ZOOM',
        tabs: null,
        activeTab: null,
        items: [
          '9:ZoomStat'
        ],
        cursor: 0
      },

      // MATH menu (U3 randomization substrate) — all five real CE tabs,
      // matching the physical calculator's navigation exactly.
      'math-menu': {
        title: 'MATH',
        tabs: ['MATH', 'NUM', 'CMPLX', 'PRB', 'FRAC'],
        activeTab: 'MATH',
        items: [
          '1:▶Frac',
          '2:▶Dec',
          '3:³',
          '4:³√(',
          '5:ˣ√',
          '6:fMin(',
          '7:fMax(',
          '8:nDeriv(',
          '9:fnInt(',
          '0:summation Σ(',
          'A:logBASE(',
          'B:piecewise('
        ],
        cursor: 0
      },

      'math-num-menu': {
        title: 'MATH',
        tabs: ['MATH', 'NUM', 'CMPLX', 'PRB', 'FRAC'],
        activeTab: 'NUM',
        items: [
          '1:abs(',
          '2:round(',
          '3:iPart(',
          '4:fPart(',
          '5:int(',
          '6:min(',
          '7:max(',
          '8:lcm(',
          '9:gcd(',
          '0:remainder('
        ],
        cursor: 0
      },

      'math-cmplx-menu': {
        title: 'MATH',
        tabs: ['MATH', 'NUM', 'CMPLX', 'PRB', 'FRAC'],
        activeTab: 'CMPLX',
        items: [
          '1:conj(',
          '2:real(',
          '3:imag(',
          '4:angle(',
          '5:abs(',
          '6:▶Rect',
          '7:▶Polar'
        ],
        cursor: 0
      },

      'math-prb-menu': {
        title: 'MATH',
        tabs: ['MATH', 'NUM', 'CMPLX', 'PRB', 'FRAC'],
        activeTab: 'PRB',
        items: [
          '1:rand',
          '2:nPr',
          '3:nCr',
          '4:!',
          '5:randInt(',
          '6:randNorm(',
          '7:randBin(',
          '8:randIntNoRep('
        ],
        cursor: 0
      },

      'math-frac-menu': {
        title: 'MATH',
        tabs: ['MATH', 'NUM', 'CMPLX', 'PRB', 'FRAC'],
        activeTab: 'FRAC',
        items: [
          '1:n/d',
          '2:Un/d',
          '3:▶n/d◀▶Un/d',
          '4:▶F◀▶D'
        ],
        cursor: 0
      },

      'list-names-menu': {
        title: 'LIST NAMES',
        tabs: null,
        activeTab: null,
        items: [
          '1:L1',
          '2:L2',
          '3:L3',
          '4:L4',
          '5:L5',
          '6:L6',
          '7:RESID'
        ],
        cursor: 0
      },

      'catalog-top': {
        title: 'CATALOG',
        tabs: null,
        activeTab: null,
        items: [
          'abs(',
          'and',
          'angle('
        ],
        cursor: 0
      },

      'catalog-d-section': {
        title: 'CATALOG',
        tabs: null,
        activeTab: null,
        items: [
          'DiagnosticOff',
          'DiagnosticOn',
          'dim('
        ],
        cursor: 1
      },

      'matrix-menu-names': {
        title: 'MATRIX',
        tabs: ['NAMES', 'MATH', 'EDIT'],
        activeTab: 'NAMES',
        items: [
          '1:[A]',
          '2:[B]',
          '3:[C]'
        ],
        cursor: 0
      },

      'matrix-menu-math': {
        title: 'MATRIX',
        tabs: ['NAMES', 'MATH', 'EDIT'],
        activeTab: 'MATH',
        items: [
          '1:det(',
          '2:T',
          '3:dim('
        ],
        cursor: 0
      },

      'matrix-menu-edit': {
        title: 'MATRIX',
        tabs: ['NAMES', 'MATH', 'EDIT'],
        activeTab: 'EDIT',
        items: [
          '1:[A]',
          '2:[B]',
          '3:[C]'
        ],
        cursor: 0
      }
    },

    /**
     * Maps tab name to the menu screen ID that should load when that tab is
     * selected. Only populated for menus with multiple tabs.
     *
     * STAT: EDIT/CALC/TESTS
     * MATRIX: NAMES/MATH/EDIT
     */
    TAB_MAP: {
      // STAT tabs
      'EDIT':  'stat-menu',
      'CALC':  'stat-calc-menu',
      'TESTS': 'stat-tests-menu',

      // MATRIX tabs
      'NAMES': 'matrix-menu-names',
      'MATH':  'matrix-menu-math',
      // Note: 'EDIT' collides with STAT EDIT. The menu-nav engine resolves
      // this by checking the current menu's tab family rather than doing a
      // flat lookup. These are provided for reference.
      'MATRIX_EDIT': 'matrix-menu-edit'
    },

    /**
     * Maps tab families so the nav engine knows which set of tabs to cycle
     * through and which menu IDs they correspond to.
     */
    TAB_FAMILIES: {
      'stat': {
        tabs: ['EDIT', 'CALC', 'TESTS'],
        menuIds: ['stat-menu', 'stat-calc-menu', 'stat-tests-menu']
      },
      'matrix': {
        tabs: ['NAMES', 'MATH', 'EDIT'],
        menuIds: ['matrix-menu-names', 'matrix-menu-math', 'matrix-menu-edit']
      },
      // All five real CE tabs — the walkthrough teaches PHYSICAL keys, so
      // the tab order must match the real calculator: PRB is three RIGHTs
      // from MATH (caught by the physical-calculator smoke, 2026-07-05).
      'math': {
        tabs: ['MATH', 'NUM', 'CMPLX', 'PRB', 'FRAC'],
        menuIds: ['math-menu', 'math-num-menu', 'math-cmplx-menu', 'math-prb-menu', 'math-frac-menu']
      }
    },

    /**
     * Maps (menu screen ID, item index) -> target wizard/editor screen ID.
     *
     * Built by cross-referencing procedure steps: each procedure navigates a
     * menu, then the step that uses a number key or ENTER lands on a wizard.
     *
     * Only AP Statistics-relevant actions are mapped. Items not listed here
     * either open editors (STAT > EDIT > 1:Edit) or are out of scope.
     */
    MENU_ACTIONS: {
      'stat-menu': {
        0: 'stat-edit-lists'         // 1:Edit... -> list editor
      },

      'stat-calc-menu': {
        0: 'one-var-stats-wizard',   // 1:1-Var Stats
        7: 'linreg-wizard'           // 8:LinReg(a+bx)
      },

      'stat-tests-menu': {
        1:  't-test-data-wizard',          // 2:T-Test
        3:  'two-samp-ttest-stats-wizard', // 4:2-SampTTest
        4:  'one-propztest-wizard',        // 5:1-PropZTest
        5:  'two-propztest-wizard',        // 6:2-PropZTest
        7:  't-interval-data-wizard',      // 8:TInterval
        9:  'two-samp-tint-stats-wizard',  // 0:2-SampTInt
        10: 'one-propzint-wizard',         // A:1-PropZInt
        11: 'two-propzint-wizard',         // B:2-PropZInt
        12: 'chi2test-wizard',             // C:chi2-Test
        13: 'chi2gof-wizard',              // D:chi2GOF-Test
        15: 'linreg-ttest-wizard',         // F:LinRegTTest
        16: 'linreg-tint-wizard'           // G:LinRegTInt
      },

      'distr-menu': {
        1:  'normalcdf-wizard',   // 2:normalcdf(
        2:  'invnorm-wizard',     // 3:invNorm(
        // index 9 is 0:Fcdf( — no wizard implemented, left unmapped
        // (out of scope, same as invBinom/Fpdf/poissonpdf/poissoncdf below).
        10: 'binompdf-wizard',    // A:binompdf(
        11: 'binomcdf-wizard',    // B:binomcdf(
        15: 'geometpdf-wizard',   // F:geometpdf(
        16: 'geometcdf-wizard'    // G:geometcdf(
      },

      'stat-plot-menu': {
        0: 'plot1-editor-scatter', // 1:Plot1...
        1: 'plot1-editor-scatter', // 2:Plot2...
        2: 'plot1-editor-scatter'  // 3:Plot3...
      },

      // rand pastes directly (no arguments); the arg-taking commands open
      // wizard prompts like the real CE (wizards ON), which compose the
      // command onto the home entry line on Paste.
      'math-prb-menu': {
        0: 'paste:rand',            // 1:rand
        4: 'randint-wizard',        // 5:randInt(
        7: 'randintnorep-wizard'    // 8:randIntNoRep(
      }
    },

    /**
     * Prefix-to-index map for each menu. On the TI-84, items are prefixed
     * with 1-9, then 0, then A-H. This maps the prefix character to the
     * item's 0-based index so the nav engine can do direct-key selection.
     *
     * Generated from the items arrays:
     *   '1' -> index 0, '2' -> index 1, ... '9' -> index 8,
     *   '0' -> index 9, 'A' -> index 10, ... 'H' -> index 17
     */
    PREFIX_ORDER: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
                   'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  };

  // Freeze for safety
  Object.freeze(MenuTables.PREFIX_ORDER);

  if (typeof window !== 'undefined') {
    window.TI84MenuTables = MenuTables;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MenuTables;
  }
})();
