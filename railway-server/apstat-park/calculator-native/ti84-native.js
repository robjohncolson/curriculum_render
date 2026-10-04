/**
 * TI-84 CE Native Orchestrator — wires together all modules.
 * Module 7 of the native stat calculator reimplementation.
 *
 * Manages screen state, routes key presses, triggers computations,
 * and exposes both the bridge-compatible API (for app.js swap) and
 * a richer native-only API with event hooks.
 *
 * Requires (loaded before this file):
 *   window.TI84EventBus        (event-bus.js)
 *   window.TI84StatMath        (stat-math.js)
 *   window.TI84MenuTables      (menu-tables.js)
 *   window.TI84FieldTables     (field-tables.js)
 *   window.TI84MenuNav         (menu-nav.js)
 *   window.TI84FormEngine      (form-engine.js)
 *   window.TI84ResultFormatter (result-formatter.js)
 *   window.TI84ScreenRenderer  (screen-renderer.js)
 */
(function () {
  'use strict';

  // ── Dependency resolution ─────────────────────────────────────────────

  function dep(name, windowKey) {
    if (typeof window !== 'undefined' && window[windowKey]) return window[windowKey];
    if (typeof require !== 'undefined') return require('./' + name);
    throw new Error(windowKey + ' not available');
  }

  function getEventBus()        { return dep('event-bus',        'TI84EventBus'); }
  function getStatMath()        { return dep('stat-math',        'TI84StatMath'); }
  function getMenuTables()      { return dep('menu-tables',      'TI84MenuTables'); }
  function getFieldTables()     { return dep('field-tables',     'TI84FieldTables'); }
  function getMenuNav()         { return dep('menu-nav',         'TI84MenuNav'); }
  function getFormEngine()      { return dep('form-engine',      'TI84FormEngine'); }
  function getResultFormatter() { return dep('result-formatter', 'TI84ResultFormatter'); }
  function getScreenRenderer()  { return dep('screen-renderer',  'TI84ScreenRenderer'); }

  // ── 2ND key mapping ───────────────────────────────────────────────────
  // Maps physical key to the secondary function when 2ND is active.

  var SECOND_MAP = {
    'VARS':      '2ND_VARS',       // open distr-menu
    'Y_EQUALS':  '2ND_Y_EQUALS',   // open stat-plot-menu
    'X_INVERSE': '2ND_X_INVERSE',  // open matrix-menu
    'STAT':      '2ND_STAT',       // open list-names-menu
    'MODE':      '2ND_MODE',       // QUIT -> home
    '1':         'L1',
    '2':         'L2',
    '3':         'L3',
    '4':         'L4',
    '5':         'L5',
    '6':         'L6'
  };

  // ── Wizard -> StatMath computation routing ────────────────────────────

  /**
   * Maps a wizard ID to the appropriate StatMath function call.
   * Returns { resultScreenId, computedValues, altHypothesis } or null.
   */
  function runComputation(wizardId, fieldValues, inputMode, lists, matrices) {
    var StatMath = getStatMath();

    // Helper: parse a numeric field value, falling back to 0
    function num(label) {
      var v = fieldValues[label];
      if (v === undefined || v === '' || v === null) return 0;
      return parseFloat(v);
    }

    // Helper: parse an integer field value
    function int(label) {
      var v = fieldValues[label];
      if (v === undefined || v === '' || v === null) return 0;
      return parseInt(v, 10);
    }

    // Helper: resolve a list selector to actual array data
    function resolveList(label) {
      var listName = fieldValues[label];
      if (!listName) return [];
      if (listName === '1') return null; // freq=1 means no frequency list
      return lists[listName] || [];
    }

    // Helper: resolve a matrix selector to actual 2D array
    function resolveMatrix(label) {
      var matName = fieldValues[label];
      if (!matName) return [];
      return matrices[matName] || [];
    }

    // Helper: get the alternative hypothesis string from a choice field
    function getAlt(label) {
      return fieldValues[label] || '\u2260';
    }

    var result, resultScreenId, alt;

    switch (wizardId) {

      // ── STAT > CALC ──────────────────────────────────────────────────

      case 'one-var-stats-wizard': {
        var data = resolveList('List');
        var freq = resolveList('FreqList');
        result = StatMath.oneVarStats(data, freq);
        if (!result) return null;
        resultScreenId = 'one-var-stats-result-page1';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      case 'linreg-wizard': {
        var xList = resolveList('Xlist');
        var yList = resolveList('Ylist');
        var freqL = resolveList('FreqList');
        result = StatMath.linReg(xList, yList, freqL);
        if (!result) return null;
        resultScreenId = 'linreg-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      // ── DISTR (paste to home) ────────────────────────────────────────

      case 'normalcdf-wizard': {
        var ncVal = StatMath.normalcdf(num('lower'), num('upper'), num('\u03BC'), num('\u03C3'));
        resultScreenId = 'distribution-home-result';
        return { resultScreenId: resultScreenId, computedValues: { value: ncVal }, altHypothesis: null, pasteToHome: true };
      }

      case 'invnorm-wizard': {
        var tail = fieldValues['Tail'] || 'LEFT';
        var inVal = StatMath.invNorm(num('area'), num('\u03BC'), num('\u03C3'), tail);
        resultScreenId = 'distribution-home-result';
        return { resultScreenId: resultScreenId, computedValues: { value: inVal }, altHypothesis: null, pasteToHome: true };
      }

      case 'binompdf-wizard': {
        var bpVal = StatMath.binompdf(num('trials'), num('p'), int('x'));
        resultScreenId = 'distribution-home-result';
        return { resultScreenId: resultScreenId, computedValues: { value: bpVal }, altHypothesis: null, pasteToHome: true };
      }

      case 'binomcdf-wizard': {
        var bcVal = StatMath.binomcdf(num('trials'), num('p'), int('x'));
        resultScreenId = 'distribution-home-result';
        return { resultScreenId: resultScreenId, computedValues: { value: bcVal }, altHypothesis: null, pasteToHome: true };
      }

      case 'geometpdf-wizard': {
        var gpVal = StatMath.geometpdf(num('p'), int('x'));
        resultScreenId = 'distribution-home-result';
        return { resultScreenId: resultScreenId, computedValues: { value: gpVal }, altHypothesis: null, pasteToHome: true };
      }

      case 'geometcdf-wizard': {
        var gcVal = StatMath.geometcdf(num('p'), int('x'));
        resultScreenId = 'distribution-home-result';
        return { resultScreenId: resultScreenId, computedValues: { value: gcVal }, altHypothesis: null, pasteToHome: true };
      }

      // ── STAT > TESTS: t-tests (data/stats) ──────────────────────────

      case 't-test-data-wizard':
      case 't-test-stats-wizard': {
        alt = getAlt('\u03BC ? \u03BC0');
        if (inputMode === 'Stats' || wizardId === 't-test-stats-wizard') {
          result = StatMath.tTest(num('\u03BC0'), num('x\u0304'), num('Sx'), int('n'), alt);
        } else {
          var tData = resolveList('List');
          var tFreq = resolveList('Freq');
          if (!tData || tData.length === 0) return null;
          var expanded = expandWithFreq(tData, tFreq);
          var stats = quickStats(expanded);
          result = StatMath.tTest(num('\u03BC0'), stats.xbar, stats.Sx, stats.n, alt);
        }
        resultScreenId = 't-test-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: alt };
      }

      case 't-interval-data-wizard':
      case 't-interval-stats-wizard': {
        if (inputMode === 'Stats' || wizardId === 't-interval-stats-wizard') {
          result = StatMath.tInterval(num('x\u0304'), num('Sx'), int('n'), num('C-Level'));
        } else {
          var tiData = resolveList('List');
          var tiFreq = resolveList('Freq');
          if (!tiData || tiData.length === 0) return null;
          var tiExp = expandWithFreq(tiData, tiFreq);
          var tiStats = quickStats(tiExp);
          result = StatMath.tInterval(tiStats.xbar, tiStats.Sx, tiStats.n, num('C-Level'));
        }
        resultScreenId = 't-interval-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      // ── STAT > TESTS: two-sample t ───────────────────────────────────

      case 'two-samp-ttest-stats-wizard': {
        alt = getAlt('\u03BC1 ? \u03BC2');
        var pooled = fieldValues['Pooled'] === 'Yes';
        result = StatMath.twoSampTTest(
          num('x\u03041'), num('Sx1'), int('n1'),
          num('x\u03042'), num('Sx2'), int('n2'),
          alt, pooled
        );
        // Map x1/x2 to xbar1/xbar2 for the result formatter
        result.xbar1 = result.x1;
        result.xbar2 = result.x2;
        resultScreenId = 'two-samp-ttest-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: alt };
      }

      case 'two-samp-tint-stats-wizard': {
        var tiPooled = fieldValues['Pooled'] === 'Yes';
        result = StatMath.twoSampTInt(
          num('x\u03041'), num('Sx1'), int('n1'),
          num('x\u03042'), num('Sx2'), int('n2'),
          num('C-Level'), tiPooled
        );
        result.xbar1 = result.x1;
        result.xbar2 = result.x2;
        resultScreenId = 'two-samp-tint-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      // ── STAT > TESTS: proportions ────────────────────────────────────

      case 'one-propztest-wizard': {
        alt = getAlt('prop');
        result = StatMath.onePropZTest(num('p0'), int('x'), int('n'), alt);
        resultScreenId = 'one-propztest-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: alt };
      }

      case 'one-propzint-wizard': {
        result = StatMath.onePropZInt(int('x'), int('n'), num('C-Level'));
        resultScreenId = 'one-propzint-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      // ── STAT > TESTS: chi-square ─────────────────────────────────────

      case 'two-propztest-wizard': {
        alt = getAlt('p1');
        result = StatMath.twoPropZTest(int('x1'), int('n1'), int('x2'), int('n2'), alt);
        resultScreenId = 'two-propztest-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: alt };
      }

      case 'two-propzint-wizard': {
        result = StatMath.twoPropZInt(int('x1'), int('n1'), int('x2'), int('n2'), num('C-Level'));
        resultScreenId = 'two-propzint-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      case 'chi2gof-wizard': {
        var obs = resolveList('Observed');
        var exp = resolveList('Expected');
        result = StatMath.chi2GOFTest(obs, exp, int('df'));
        resultScreenId = 'chi2gof-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      case 'chi2test-wizard': {
        var obsMat = resolveMatrix('Observed');
        var expMat = resolveMatrix('Expected');
        result = StatMath.chi2Test(obsMat, expMat.length > 0 ? expMat : undefined);
        // Store expected matrix back if computed
        if (result.expected && matrices) {
          var expKey = fieldValues['Expected'] || '[B]';
          matrices[expKey] = result.expected;
        }
        resultScreenId = 'chi2test-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      // ── STAT > TESTS: regression inference ───────────────────────────

      case 'linreg-ttest-wizard': {
        var lrtX = resolveList('Xlist');
        var lrtY = resolveList('Ylist');
        var lrtF = resolveList('Freq');
        alt = getAlt('\u03B2 and \u03C1');
        result = StatMath.linRegTTest(lrtX, lrtY, lrtF, alt);
        resultScreenId = 'linreg-ttest-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: alt };
      }

      case 'linreg-tint-wizard': {
        var lriX = resolveList('Xlist');
        var lriY = resolveList('Ylist');
        var lriF = resolveList('Freq');
        result = StatMath.linRegTInt(lriX, lriY, lriF, num('C-Level'));
        resultScreenId = 'linreg-tint-result';
        return { resultScreenId: resultScreenId, computedValues: result, altHypothesis: null };
      }

      default:
        return null;
    }
  }

  // ── Helpers for data-mode computations ────────────────────────────────

  function expandWithFreq(data, freq) {
    if (!freq) return data.slice();
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var f = freq[i] || 1;
      for (var j = 0; j < f; j++) out.push(data[i]);
    }
    return out;
  }

  function quickStats(arr) {
    var n = arr.length;
    if (n === 0) return { xbar: 0, Sx: 0, n: 0 };
    var sum = 0;
    for (var i = 0; i < n; i++) sum += arr[i];
    var xbar = sum / n;
    var ssq = 0;
    for (var j = 0; j < n; j++) {
      var d = arr[j] - xbar;
      ssq += d * d;
    }
    var Sx = n > 1 ? Math.sqrt(ssq / (n - 1)) : 0;
    return { xbar: xbar, Sx: Sx, n: n };
  }

  // ── Orchestrator factory ──────────────────────────────────────────────

  function create(canvas, options) {
    options = options || {};

    var EventBus        = getEventBus();
    var MenuNav         = getMenuNav();
    var FormEngine      = getFormEngine();
    var ResultFormatter = getResultFormatter();
    var ScreenRenderer  = getScreenRenderer();
    var StatMath        = getStatMath();

    // ── Internal state ──────────────────────────────────────────────────

    var bus = EventBus.create();
    // A scene may paint the same menu/form/result payloads into its world.
    // Standalone trainers still mount the normal LCD renderer below.
    var renderer = options.renderer || null;

    // Screen state
    var screen = {
      type: 'home',   // 'home' | 'menu' | 'wizard' | 'result' | 'editor' | 'graph'
      id: 'home',
      state: {}
    };

    // Active sub-module instances
    var activeMenu = null;
    var activeWizard = null;

    // Home screen lines
    var homeLines = [];

    // Raw command entry on the home screen (U3 randomization substrate):
    // typed characters + pasted MATH▸PRB commands accumulate here until ENTER.
    var homeEntry = '';

    // MOCK PRNG — deterministic mock output for native/no-ROM mode ONLY.
    // This is NOT TI's RNG and makes no claim of calculator equivalence;
    // real-emulator mode shows the ROM's true output, and handheld
    // validation is property-based, never exact-value. Seeding via
    // "{n}→rand" reseeds the stream so mock output is reproducible.
    var mockRandState = 0x2545f491;

    function mockRandSeed(seed) {
      mockRandState = (seed >>> 0) || 0x2545f491;
    }

    function mockRandNext() {
      mockRandState = (mockRandState + 0x6d2b79f5) | 0;
      var t = Math.imul(mockRandState ^ (mockRandState >>> 15), 1 | mockRandState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // n integers in [lo, hi]; distinct via partial Fisher-Yates when noRep.
    function mockRandInts(lo, hi, n, noRep) {
      var range = hi - lo + 1;
      if (noRep && n > range) return null; // ERR:DOMAIN on the real calc
      if (!noRep) {
        var out = [];
        for (var i = 0; i < n; i++) out.push(lo + Math.floor(mockRandNext() * range));
        return out;
      }
      var pool = [];
      for (var v = lo; v <= hi; v++) pool.push(v);
      var picked = [];
      for (var k = 0; k < n; k++) {
        var idx = k + Math.floor(mockRandNext() * (pool.length - k));
        var tmp = pool[k]; pool[k] = pool[idx]; pool[idx] = tmp;
        picked.push(pool[k]);
      }
      return picked;
    }

    // Result screen state
    var resultState = null;   // { lines, scrollable, nextPage }
    var resultHistory = [];   // stack of previous result screen IDs for UP navigation
    var resultComputedValues = null;
    var resultAltHypothesis = null;

    // Graph screen state
    var graphState = {
      type: 'unknown',
      title: '',
      traceMode: false,
      tracePosition: 0,
      traceInfo: null
    };

    // 2ND modifier flag
    var secondActive = false;

    // List storage (L1-L6)
    var lists = {
      'L1': [], 'L2': [], 'L3': [], 'L4': [], 'L5': [], 'L6': []
    };

    // Matrix storage ([A]-[J])
    var matrices = {
      '[A]': [], '[B]': [], '[C]': [], '[D]': [], '[E]': [],
      '[F]': [], '[G]': [], '[H]': [], '[I]': [], '[J]': []
    };

    // ── Renderer management ─────────────────────────────────────────────

    function mountCanvas(canvasEl) {
      canvas = canvasEl;
      if (canvas) {
        renderer = ScreenRenderer.create(canvas);
      }
    }

    if (canvas) {
      mountCanvas(canvas);
    }

    // ── Screen transition ───────────────────────────────────────────────

    function setScreen(type, id, state) {
      var prev = { type: screen.type, id: screen.id };
      screen.type = type;
      screen.id = id;
      screen.state = state || {};

      if (prev.type !== type || prev.id !== id) {
        bus.emit('screen-change', {
          from: { type: prev.type, id: prev.id },
          to: { type: type, id: id },
          trigger: 'key'
        });
      }
    }

    // ── Rendering ───────────────────────────────────────────────────────

    /**
     * Build the field-row payload for renderWizard. The active row's
     * cursorOption (uncommitted choice-row cursor) rides along so the
     * renderer can draw it next to the committed value when they differ.
     */
    function wizardFieldsForRender(wState) {
      return wState.fields.map(function (f, i) {
        var out = { label: f.label, displayValue: f.value };
        if (i === wState.cursorIndex && wState.activeField && wState.activeField.type === 'choice') {
          out.cursorOption = wState.activeField.cursorOption;
        }
        return out;
      });
    }

    function render() {
      if (!renderer) return;

      switch (screen.type) {
        case 'home':
          renderer.renderHome(homeEntry ? homeLines.concat([homeEntry]) : homeLines);
          break;
        case 'menu':
          if (activeMenu) {
            var menuState = activeMenu.getState();
            renderer.renderMenu(menuState);
          }
          break;
        case 'wizard':
          if (activeWizard) {
            var wState = activeWizard.getState();
            renderer.renderWizard({
              title: screen.id,
              fields: wizardFieldsForRender(wState),
              cursorIndex: wState.cursorIndex
            });
          }
          break;
        case 'result':
          if (resultState) {
            renderer.renderResult({
              lines: resultState.lines,
              scrollable: resultState.scrollable
            });
          }
          break;
        case 'editor':
          if (activeWizard) {
            var eState = activeWizard.getState();
            renderer.renderWizard({
              title: screen.id,
              fields: wizardFieldsForRender(eState),
              cursorIndex: eState.cursorIndex
            });
          }
          break;
        case 'graph':
          renderer.renderGraph(graphState);
          break;
      }
    }

    // ── Open a menu ─────────────────────────────────────────────────────

    function openMenu(menuId) {
      activeMenu = MenuNav.create(menuId);
      activeWizard = null;

      activeMenu.onSelect(function (evt) {
        handleMenuSelect(evt);
      });

      setScreen('menu', menuId, activeMenu.getState());
    }

    // ── Handle menu item selection ──────────────────────────────────────

    function handleMenuSelect(evt) {
      var target = evt.targetScreen;
      if (!target) return; // no action mapped

      bus.emit('menu-select', {
        menuId: evt.menuId,
        itemIndex: evt.itemIndex,
        itemLabel: evt.itemLabel
      });

      // paste:X — append X to the home entry line (raw command entry)
      // instead of opening a wizard/editor. Only argument-less commands use
      // this (e.g. MATH▸PRB▸rand); arg-taking commands open wizards.
      if (typeof target === 'string' && target.indexOf('paste:') === 0) {
        var pasted = target.slice(6);
        goHome();
        homeEntry += pasted;
        return;
      }

      // Determine if the target is a wizard or editor
      var FieldTables = getFieldTables();
      var isWizard = FieldTables.WIZARDS && FieldTables.WIZARDS[target];
      var isEditor = target === 'stat-edit-lists' || (FormEngine.EDITORS && FormEngine.EDITORS[target]);

      if (isWizard) {
        openWizard(target);
      } else if (isEditor) {
        openEditor(target);
      }
    }

    // ── Open a wizard ───────────────────────────────────────────────────

    function openWizard(wizardId) {
      // Don't pass the shared bus to FormEngine — the orchestrator is the
      // single source of truth for compute/field events on the bus.
      activeWizard = FormEngine.create(wizardId);
      activeMenu = null;

      // Wire FormEngine callbacks to the orchestrator's bus
      activeWizard.onFieldFocus(function (evt) {
        bus.emit('field-focus', evt);
      });
      activeWizard.onFieldChange(function (evt) {
        bus.emit('field-change', evt);
      });
      activeWizard.onSubmit(function (evt) {
        handleWizardSubmit(evt);
      });

      setScreen('wizard', wizardId, activeWizard.getState());
    }

    // ── Open an editor ──────────────────────────────────────────────────

    function openEditor(editorId) {
      try {
        activeWizard = FormEngine.create(editorId);
      } catch (e) {
        // editor not defined in FormEngine, create a stub
        activeWizard = null;
      }
      activeMenu = null;
      setScreen('editor', editorId, activeWizard ? activeWizard.getState() : {});
    }

    // ── Handle wizard submit ────────────────────────────────────────────

    function handleWizardSubmit(evt) {
      var action = evt.action;

      // U3 randomization wizards mirror the real CE: Paste composes the
      // command onto the home entry line, and a second ENTER evaluates it
      // (via the mock PRNG in no-ROM mode).
      if (action === 'Paste' && (evt.wizardId === 'randint-wizard' || evt.wizardId === 'randintnorep-wizard')) {
        var randFn = evt.wizardId === 'randintnorep-wizard' ? 'randIntNoRep' : 'randInt';
        var rv = evt.values || {};
        activeWizard = null;
        setScreen('home', 'home', {});
        homeEntry += randFn + '(' + (rv.lower || '') + ',' + (rv.upper || '') + ',' + (rv.n || '') + ')';
        return;
      }

      if (action === 'Calculate' || action === 'Paste') {
        var compResult = runComputation(
          evt.wizardId, evt.values, evt.inputMode, lists, matrices
        );

        if (!compResult) return;

        bus.emit('compute', {
          type: evt.wizardId,
          inputs: evt.values,
          results: compResult.computedValues
        });

        // Format the result
        var formatted = ResultFormatter.format(
          compResult.resultScreenId,
          compResult.computedValues,
          compResult.altHypothesis
        );

        resultComputedValues = compResult.computedValues;
        resultAltHypothesis = compResult.altHypothesis;

        if (compResult.pasteToHome) {
          // Distribution functions paste to home screen
          var val = compResult.computedValues.value;
          var displayVal = StatMath.formatTI(val);
          homeLines.push(displayVal);
          activeWizard = null;
          setScreen('home', 'home', {});

          bus.emit('result-display', {
            screenId: compResult.resultScreenId,
            lines: [displayVal]
          });
        } else {
          // Show result screen
          resultState = formatted;
          resultHistory = [];
          activeWizard = null;
          setScreen('result', compResult.resultScreenId, {});

          bus.emit('result-display', {
            screenId: compResult.resultScreenId,
            lines: formatted.lines
          });
        }
      } else if (action === 'Draw') {
        // Mock graph screen
        graphState = {
          type: inferGraphType(evt.wizardId),
          title: evt.wizardId.replace(/-wizard$/, ''),
          traceMode: false,
          tracePosition: 0,
          traceInfo: null
        };
        activeWizard = null;
        setScreen('graph', 'graph', graphState);
      }
    }

    function inferGraphType(wizardId) {
      if (wizardId.indexOf('chi2') !== -1) return 'chi2-draw';
      if (wizardId.indexOf('ttest') !== -1 || wizardId.indexOf('t-test') !== -1) return 'normal-curve';
      if (wizardId.indexOf('propz') !== -1) return 'normal-curve';
      return 'normal-curve';
    }

    // ── Key press pipeline ──────────────────────────────────────────────

    // Physical key -> alpha character for menu letter selection
    var ALPHA_MAP = {
      MATH: 'A', APPS: 'B', PRGM: 'C', X_INVERSE: 'D',
      SIN: 'E', COS: 'F', TAN: 'G', POWER: 'H',
    };
    var alphaActive = false;

    function pressKey(key) {
      bus.emit('key-press', { key: key, handled: true, blocked: false });

      // 1a. Handle ALPHA modifier
      if (key === 'ALPHA') {
        alphaActive = true;
        return;
      }

      // 1b. If ALPHA was active, resolve to letter for menu selection
      if (alphaActive) {
        alphaActive = false;
        var letter = ALPHA_MAP[key];
        if (letter && screen.type === 'menu') {
          // Send the letter character to the menu nav
          handleMenuKey(letter);
          render();
          return;
        }
        // Outside menus or unknown key — ignore alpha
      }

      // 1c. Handle 2ND modifier
      if (key === '2ND') {
        secondActive = !secondActive;
        return;
      }

      // 2. If 2ND was active, resolve the secondary function
      if (secondActive) {
        secondActive = false;
        var resolved = SECOND_MAP[key];

        if (resolved === '2ND_VARS') {
          openMenu('distr-menu');
          render();
          return;
        }
        if (resolved === '2ND_Y_EQUALS') {
          openMenu('stat-plot-menu');
          render();
          return;
        }
        if (resolved === '2ND_X_INVERSE') {
          openMenu('matrix-menu-names');
          render();
          return;
        }
        if (resolved === '2ND_STAT') {
          openMenu('list-names-menu');
          render();
          return;
        }
        if (resolved === '2ND_MODE') {
          // QUIT -> home
          goHome();
          render();
          return;
        }

        // L1-L6: pass to wizard if in wizard/editor mode
        if (resolved && resolved.charAt(0) === 'L' && resolved.length === 2) {
          if (screen.type === 'wizard' && activeWizard) {
            // Set the current field to the list name if it's a list-selector
            var wState = activeWizard.getState();
            if (wState.activeField && wState.activeField.type === 'list-selector') {
              // Simulate setting the value by cycling to the right list
              // We'll just directly manipulate via key events to match the list
              // Actually, FormEngine does not expose setValue, so we rely on
              // the field being a list-selector that cycles with LEFT/RIGHT.
              // For now, emit the list name event for the trainer to use.
            }
          }
          render();
          return;
        }

        // Unknown 2ND combo -- ignore
        render();
        return;
      }

      // 3. Route to current screen handler
      switch (screen.type) {
        case 'home':
          handleHomeKey(key);
          break;
        case 'menu':
          handleMenuKey(key);
          break;
        case 'wizard':
          handleWizardKey(key);
          break;
        case 'result':
          handleResultKey(key);
          break;
        case 'editor':
          handleEditorKey(key);
          break;
        case 'graph':
          handleGraphKey(key);
          break;
      }

      // 4. Render
      render();
    }

    // ── Home screen key handler ─────────────────────────────────────────

    // Characters typeable into the raw home entry line.
    var HOME_KEY_CHARS = {
      ZERO: '0', ONE: '1', TWO: '2', THREE: '3', FOUR: '4',
      FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9',
      DECIMAL: '.', COMMA: ',', LPAREN: '(', RPAREN: ')',
      NEGATIVE: '-', STO: '→'
    };

    function handleHomeKey(key) {
      if (key === 'STAT') {
        openMenu('stat-menu');
        return;
      }
      if (key === 'ZOOM') {
        openMenu('zoom-menu');
        return;
      }
      if (key === 'MATH') {
        openMenu('math-menu');
        return;
      }
      if (key === 'CLEAR') {
        // CLEAR wipes the entry line first (TI behavior), then the history.
        if (homeEntry) homeEntry = '';
        else homeLines = [];
        return;
      }
      if (key === 'ENTER') {
        if (homeEntry) evaluateHomeEntry();
        return;
      }
      var ch = HOME_KEY_CHARS[key];
      if (ch !== undefined) {
        homeEntry += ch;
        return;
      }
      // Other keys on home: ignore for now
    }

    // Evaluates the raw home entry. Only the U3 randomization commands are
    // modeled; anything else echoes with an ERR:SYNTAX line (mock-only).
    function evaluateHomeEntry() {
      var entry = homeEntry;
      homeEntry = '';
      homeLines.push(entry);

      var seedMatch = /^(-?\d+(?:\.\d+)?)→rand$/.exec(entry);
      if (seedMatch) {
        var seed = Number(seedMatch[1]);
        mockRandSeed(Math.abs(Math.round(seed * 1000)));
        homeLines.push(String(seed));
        return;
      }

      if (entry === 'rand') {
        homeLines.push(String(Math.round(mockRandNext() * 1e10) / 1e10));
        return;
      }

      var callMatch = /^(randInt|randIntNoRep)\((-?\d+),(-?\d+)(?:,(\d+))?\)$/.exec(entry);
      if (callMatch) {
        var lo = Number(callMatch[2]);
        var hi = Number(callMatch[3]);
        var n = callMatch[4] ? Number(callMatch[4]) : (callMatch[1] === 'randIntNoRep' ? hi - lo + 1 : 1);
        var values = (lo <= hi && n >= 1)
          ? mockRandInts(lo, hi, n, callMatch[1] === 'randIntNoRep')
          : null;
        homeLines.push(values ? '{' + values.join(' ') + '}' : 'ERR:DOMAIN');
        return;
      }

      homeLines.push('ERR:SYNTAX');
    }

    // ── Menu screen key handler ─────────────────────────────────────────

    function handleMenuKey(key) {
      if (!activeMenu) return;

      if (key === 'CLEAR') {
        goHome();
        return;
      }

      // Menu-nav expects prefix CHARS ('1'-'9', '0'); convert digit button ids
      // so number-key jump-and-select works (e.g. 8 on MATH▸PRB).
      var digit = HOME_KEY_CHARS[key];
      if (digit !== undefined && digit >= '0' && digit <= '9') {
        key = digit;
      }

      var result = activeMenu.handleKey(key);

      // If the onSelect callback already transitioned away from the menu
      // (e.g., opened a wizard), don't overwrite with a tab-change update.
      if (screen.type !== 'menu') return;

      // Update screen ID if tab changed
      if (result && result.menuId !== screen.id) {
        setScreen('menu', result.menuId, result);
      }
    }

    // ── Wizard screen key handler ───────────────────────────────────────

    function handleWizardKey(key) {
      if (!activeWizard) return;

      if (key === 'CLEAR') {
        // CLEAR in wizard: if on number field clear it, otherwise go home
        var state = activeWizard.getState();
        if (state.activeField &&
            (state.activeField.type === 'number' || state.activeField.type === 'integer') &&
            state.activeField.value !== '') {
          activeWizard.handleKey('CLEAR');
        } else {
          goHome();
        }
        return;
      }

      // FormEngine expects digit CHARS ('1'-'9', '0'); convert digit button
      // ids so direct key entry works (same conversion as handleMenuKey).
      var wizardDigit = HOME_KEY_CHARS[key];
      if (wizardDigit !== undefined && wizardDigit >= '0' && wizardDigit <= '9') {
        key = wizardDigit;
      }

      activeWizard.handleKey(key);
    }

    // ── Result screen key handler ───────────────────────────────────────

    function handleResultKey(key) {
      if (key === 'CLEAR') {
        goHome();
        return;
      }

      if (key === 'DOWN' && resultState && resultState.scrollable && resultState.nextPage) {
        // Scroll to next page
        var nextPageId = resultState.nextPage;
        resultHistory.push(screen.id);
        var nextFormatted = ResultFormatter.format(
          nextPageId, resultComputedValues, resultAltHypothesis
        );
        resultState = nextFormatted;
        setScreen('result', nextPageId, {});
        return;
      }

      if (key === 'UP' && resultHistory.length > 0) {
        // Scroll back
        var prevId = resultHistory.pop();
        var prevFormatted = ResultFormatter.format(
          prevId, resultComputedValues, resultAltHypothesis
        );
        resultState = prevFormatted;
        setScreen('result', prevId, {});
        return;
      }
    }

    // ── Editor screen key handler ───────────────────────────────────────

    function handleEditorKey(key) {
      if (key === 'CLEAR') {
        goHome();
        return;
      }
      if (key === 'ZOOM') {
        openMenu('zoom-menu');
        return;
      }
      if (activeWizard) {
        activeWizard.handleKey(key);
      }
    }

    // ── Graph screen key handler ────────────────────────────────────────

    function handleGraphKey(key) {
      if (key === 'CLEAR') {
        goHome();
        return;
      }
      if (key === 'TRACE') {
        graphState.traceMode = !graphState.traceMode;
        if (graphState.traceMode) {
          graphState.traceInfo = { x: 0, y: 0 };
        } else {
          graphState.traceInfo = null;
        }
        return;
      }
      if (key === 'LEFT' && graphState.traceMode) {
        graphState.tracePosition = Math.max(0, graphState.tracePosition - 1);
        graphState.traceInfo = { x: graphState.tracePosition, y: 0 };
        return;
      }
      if (key === 'RIGHT' && graphState.traceMode) {
        graphState.tracePosition++;
        graphState.traceInfo = { x: graphState.tracePosition, y: 0 };
        return;
      }
    }

    // ── Go home ─────────────────────────────────────────────────────────

    function goHome() {
      activeMenu = null;
      activeWizard = null;
      resultState = null;
      resultHistory = [];
      resultComputedValues = null;
      resultAltHypothesis = null;
      setScreen('home', 'home', {});
    }

    // ── Public API ──────────────────────────────────────────────────────

    var calc = {

      // ── Bridge-compatible API ───────────────────────────────────────

      init: function () {
        return Promise.resolve(true);
      },

      mountCanvas: mountCanvas,

      sendButton: function (buttonId) {
        pressKey(buttonId);
        return true;
      },

      prepareHome: function () {
        homeLines = [];
        goHome();
        render();
      },

      isRealEmulator: function () {
        return false;
      },

      getStatus: function () {
        return {
          code: 'ready',
          detail: 'Native mode',
          usingMock: false,
          romMeta: null
        };
      },

      // ── Native-only API ─────────────────────────────────────────────

      pressKey: pressKey,

      getScreen: function () {
        return {
          type: screen.type,
          id: screen.id,
          state: screen.state
        };
      },

      getWizardValues: function () {
        if (activeWizard) {
          return activeWizard.getAllValues();
        }
        return null;
      },

      getWizardState: function () {
        if (activeWizard) {
          return activeWizard.getState();
        }
        return null;
      },

      reset: function () {
        homeLines = [];
        goHome();
        render();
      },

      setList: function (name, data) {
        lists[name] = data ? data.slice() : [];
      },

      getList: function (name) {
        return lists[name] ? lists[name].slice() : [];
      },

      setMatrix: function (name, data) {
        matrices[name] = data ? data.map(function (row) { return row.slice(); }) : [];
      },

      getMatrix: function (name) {
        if (!matrices[name]) return [];
        return matrices[name].map(function (row) { return row.slice(); });
      },

      on: function (event, callback) {
        bus.on(event, callback);
      },

      off: function (event, callback) {
        bus.off(event, callback);
      },

      save: function () {
        return {
          screen: { type: screen.type, id: screen.id },
          homeLines: homeLines.slice(),
          lists: JSON.parse(JSON.stringify(lists)),
          matrices: JSON.parse(JSON.stringify(matrices)),
          secondActive: secondActive
        };
      },

      load: function (state) {
        if (!state) return;
        homeLines = state.homeLines || [];
        if (state.lists) {
          for (var k in state.lists) {
            lists[k] = state.lists[k];
          }
        }
        if (state.matrices) {
          for (var m in state.matrices) {
            matrices[m] = state.matrices[m];
          }
        }
        secondActive = state.secondActive || false;
        // Restore screen
        if (state.screen) {
          setScreen(state.screen.type, state.screen.id, {});
        }
        render();
      },

      // Expose internals for testing
      _getHomeLines: function () { return homeLines; },
      _getBus: function () { return bus; },

      /** Last computed result values (set after ENTER on a wizard). */
      getComputedValues: function () { return resultComputedValues; }
    };

    return calc;
  }

  // ── Module export ───────────────────────────────────────────────────

  var TI84Native = { create: create };

  if (typeof window !== 'undefined') {
    window.TI84Native = TI84Native;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TI84Native;
  }
})();
