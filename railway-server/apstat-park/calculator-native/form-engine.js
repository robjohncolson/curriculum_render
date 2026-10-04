/**
 * TI-84 CE Form Engine — wizard and editor form manager.
 * Module 2 of the native stat calculator reimplementation.
 *
 * Handles all wizard screens (20 stat wizards) and editor screens
 * (plot editors). Manages cursor navigation, field value entry,
 * Data/Stats input mode toggling, and submit actions.
 *
 * Requires: window.TI84FieldTables (field-tables.js)
 *           window.TI84EventBus   (event-bus.js) — optional
 *
 * Usage:
 *   var wizard = TI84FormEngine.create('normalcdf-wizard');
 *   wizard.handleKey('DOWN');
 *   wizard.handleKey('1');
 *   wizard.handleKey('2');
 *   wizard.handleKey('ENTER');
 *   var state = wizard.getState();
 */
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────

  var LIST_OPTIONS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];

  var COLOR_OPTIONS = [
    'BLUE', 'RED', 'BLACK', 'MAGENTA', 'GREEN', 'ORANGE',
    'BROWN', 'NAVY', 'LTBLUE', 'YELLOW', 'WHITE', 'LTGRAY',
    'MEDGRAY', 'DARKGRAY'
  ];

  var EQUATION_OPTIONS = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y0'];

  var MATRIX_OPTIONS = ['[A]', '[B]', '[C]', '[D]', '[E]', '[F]', '[G]', '[H]', '[I]', '[J]'];

  var MARK_OPTIONS = ['square', 'plus', 'dot'];

  var PLOT_TYPE_OPTIONS = ['Scatter', 'xyLine', 'Histogram', 'ModBoxplot', 'Boxplot', 'NormProbPlot'];

  var ON_OFF_OPTIONS = ['On', 'Off'];

  // ── Editor screen definitions ─────────────────────────────────────────
  // Extracted from ti84-procedures-data.json editor screens.

  var EDITORS = {
    'plot1-editor-scatter': {
      fields: [
        { label: 'On/Off',  type: 'choice',          options: ON_OFF_OPTIONS, default: 'On' },
        { label: 'Type',    type: 'choice',          options: PLOT_TYPE_OPTIONS, default: 'Scatter' },
        { label: 'Xlist',   type: 'list-selector',   default: 'L1' },
        { label: 'Ylist',   type: 'list-selector',   default: 'L2' },
        { label: 'Mark',    type: 'choice',          options: MARK_OPTIONS, default: 'square' },
        { label: 'Color',   type: 'color-selector',  default: 'BLUE' }
      ]
    },
    'plot1-editor-hist': {
      fields: [
        { label: 'On/Off',  type: 'choice',          options: ON_OFF_OPTIONS, default: 'On' },
        { label: 'Type',    type: 'choice',          options: PLOT_TYPE_OPTIONS, default: 'Histogram' },
        { label: 'Xlist',   type: 'list-selector',   default: 'L1' },
        { label: 'Freq',    type: 'list-selector',   default: '1' },
        { label: 'Color',   type: 'color-selector',  default: 'BLUE' }
      ]
    },
    'plot1-editor-modbox': {
      fields: [
        { label: 'On/Off',  type: 'choice',          options: ON_OFF_OPTIONS, default: 'On' },
        { label: 'Type',    type: 'choice',          options: PLOT_TYPE_OPTIONS, default: 'ModBoxplot' },
        { label: 'Xlist',   type: 'list-selector',   default: 'L1' },
        { label: 'Freq',    type: 'list-selector',   default: '1' },
        { label: 'Color',   type: 'color-selector',  default: 'BLUE' }
      ]
    },
    'plot1-editor-resid': {
      fields: [
        { label: 'On/Off',  type: 'choice',          options: ON_OFF_OPTIONS, default: 'On' },
        { label: 'Type',    type: 'choice',          options: PLOT_TYPE_OPTIONS, default: 'Scatter' },
        { label: 'Xlist',   type: 'list-selector',   default: 'L1' },
        { label: 'Ylist',   type: 'list-selector',   default: 'RESID' },
        { label: 'Mark',    type: 'choice',          options: MARK_OPTIONS, default: 'square' },
        { label: 'Color',   type: 'color-selector',  default: 'BLUE' }
      ]
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  function fieldTables() {
    if (typeof window !== 'undefined' && window.TI84FieldTables) {
      return window.TI84FieldTables;
    }
    if (typeof require !== 'undefined') {
      return require('./field-tables');
    }
    throw new Error('TI84FieldTables not available');
  }

  function eventBusModule() {
    if (typeof window !== 'undefined' && window.TI84EventBus) {
      return window.TI84EventBus;
    }
    if (typeof require !== 'undefined') {
      try { return require('./event-bus'); } catch (e) { /* optional */ }
    }
    return null;
  }

  /**
   * Deep-clone a fields array so mutations don't affect the template.
   */
  function cloneFields(fields) {
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var c = {
        label: f.label,
        type: f.type
      };
      if (f.default !== undefined) c.default = f.default;
      if (f.options) c.options = f.options.slice();
      out.push(c);
    }
    return out;
  }

  /**
   * Cycle through an options array. direction: +1 or -1.
   */
  function cycleOption(options, current, direction) {
    var idx = options.indexOf(current);
    if (idx === -1) idx = 0;
    idx += direction;
    if (idx < 0) idx = options.length - 1;
    if (idx >= options.length) idx = 0;
    return options[idx];
  }

  /**
   * Get the cycling options for a field based on its type.
   */
  function getCycleOptions(field) {
    switch (field.type) {
      case 'list-selector':     return LIST_OPTIONS;
      case 'color-selector':    return COLOR_OPTIONS;
      case 'equation-selector': return EQUATION_OPTIONS;
      case 'matrix-selector':   return MATRIX_OPTIONS;
      case 'choice':            return field.options || [];
      case 'action-selector':   return field.options || ['Calculate', 'Draw'];
      default:                  return null;
    }
  }

  /**
   * Get the default value for a field.
   */
  function getFieldDefault(field) {
    if (field.default !== undefined) return field.default;
    switch (field.type) {
      case 'list-selector':     return 'L1';
      case 'color-selector':    return 'BLUE';
      case 'equation-selector': return 'Y1';
      case 'matrix-selector':   return '[A]';
      case 'action-selector':   return field.options ? field.options[0] : 'Calculate';
      case 'choice':            return field.options ? field.options[0] : '';
      case 'action-button':     return field.label;
      default:                  return '';
    }
  }

  /**
   * Returns true if the field type accepts digit entry.
   */
  function isEntryField(type) {
    return type === 'number' || type === 'integer';
  }

  /**
   * Returns true if the field type commits on LEFT/RIGHT (cycle-in-place).
   * 'choice' is handled separately in handleKey — it moves an uncommitted
   * in-row cursor instead (ROM-verified: LEFT/RIGHT don't commit a choice).
   */
  function isCycleField(type) {
    return type === 'list-selector' ||
           type === 'color-selector' ||
           type === 'equation-selector' ||
           type === 'matrix-selector' ||
           type === 'action-selector';
  }

  /**
   * Returns true if the field type triggers submit on ENTER.
   */
  function isActionField(type) {
    return type === 'action-button' || type === 'action-selector';
  }

  /**
   * Is this a digit key? Returns true for '0'-'9'.
   */
  function isDigitKey(key) {
    return key.length === 1 && key >= '0' && key <= '9';
  }

  // ── FormEngine factory ────────────────────────────────────────────────

  function create(wizardId, externalEventBus) {
    // Resolve definition: check WIZARDS first, then EDITORS
    var wizardDef = null;
    var isEditor = false;
    var tables = fieldTables();

    if (tables.WIZARDS && tables.WIZARDS[wizardId]) {
      wizardDef = tables.WIZARDS[wizardId];
    } else if (EDITORS[wizardId]) {
      wizardDef = EDITORS[wizardId];
      isEditor = true;
    } else {
      throw new Error('Unknown wizard/editor: ' + wizardId);
    }

    // ── Internal state ──
    var currentWizardId = wizardId;
    var inputMode = null;        // 'Data' | 'Stats' | null
    var cursorIndex = 0;
    var choiceCursor = 0;        // in-row cursor for the active 'choice' field, uncommitted
    var freshEntry = false;      // true when cursor just moved to a number/integer field
    var activeFields = [];       // current visible field definitions
    var values = {};             // label -> current value string
    var preservedValues = {};    // values preserved across Data/Stats toggle

    // ── Callbacks ──
    var fieldFocusCallbacks = [];
    var fieldChangeCallbacks = [];
    var submitCallbacks = [];

    // ── Event bus (optional) ──
    var bus = externalEventBus || null;

    // ── Initialization ──

    function initFields() {
      var inputModes = wizardDef.inputModes;

      if (inputModes) {
        // Determine initial input mode from the Inpt field default
        var inptField = wizardDef.fields[0];
        inputMode = (inptField && inptField.default) || 'Data';
        rebuildFieldsForMode(inputMode);
      } else {
        activeFields = cloneFields(wizardDef.fields);
        inputMode = null;
      }

      // Initialize values from defaults
      for (var i = 0; i < activeFields.length; i++) {
        var f = activeFields[i];
        var label = f.label;
        if (values[label] === undefined) {
          values[label] = getFieldDefault(f);
        }
      }

      // Set fresh entry for first field if it's a number/integer
      if (activeFields.length > 0 && isEntryField(activeFields[0].type)) {
        freshEntry = true;
      }
    }

    /**
     * Rebuild the active fields array based on the current input mode.
     * For Data/Stats toggling: the inputModes object tells us which
     * labels to show. We look up the field definitions from either
     * the current wizard or the paired wizard.
     */
    function rebuildFieldsForMode(mode) {
      var inputModes = wizardDef.inputModes;
      if (!inputModes) return;

      var labelList = (mode === 'Data') ? inputModes.dataFields : inputModes.statsFields;

      // Build a map of all available field definitions from both wizards
      var allFieldDefs = {};
      addFieldDefs(allFieldDefs, wizardDef.fields);

      if (inputModes.pairedWizard) {
        var tables2 = fieldTables();
        var pairedDef = tables2.WIZARDS[inputModes.pairedWizard];
        if (pairedDef) {
          addFieldDefs(allFieldDefs, pairedDef.fields);
        }
      }

      // Build the active fields from the label list
      activeFields = [];
      for (var i = 0; i < labelList.length; i++) {
        var label = labelList[i];
        var def = allFieldDefs[label];
        if (def) {
          activeFields.push(cloneFields([def])[0]);
          // Ensure value exists
          if (values[label] === undefined) {
            values[label] = getFieldDefault(def);
          }
        }
      }
    }

    function addFieldDefs(map, fields) {
      for (var i = 0; i < fields.length; i++) {
        if (!map[fields[i].label]) {
          map[fields[i].label] = fields[i];
        }
      }
    }

    // ── Event emitters ──

    function fireFieldFocus(fieldIndex) {
      var field = activeFields[fieldIndex];
      if (!field) return;
      var evt = {
        wizardId: currentWizardId,
        fieldIndex: fieldIndex,
        fieldLabel: field.label,
        fieldType: field.type,
        value: values[field.label]
      };
      for (var i = 0; i < fieldFocusCallbacks.length; i++) {
        fieldFocusCallbacks[i](evt);
      }
      if (bus) {
        bus.emit('field-focus', evt);
      }
    }

    function fireFieldChange(label, oldValue, newValue) {
      var evt = {
        wizardId: currentWizardId,
        fieldLabel: label,
        oldValue: oldValue,
        newValue: newValue
      };
      for (var i = 0; i < fieldChangeCallbacks.length; i++) {
        fieldChangeCallbacks[i](evt);
      }
      if (bus) {
        bus.emit('field-change', evt);
      }
    }

    function fireSubmit(actionLabel) {
      var evt = {
        wizardId: currentWizardId,
        action: actionLabel,
        values: getAllValues(),
        inputMode: inputMode
      };
      for (var i = 0; i < submitCallbacks.length; i++) {
        submitCallbacks[i](evt);
      }
      if (bus) {
        bus.emit('compute', evt);
      }
    }

    // ── Cursor movement ──

    function moveCursor(direction) {
      var prevIndex = cursorIndex;
      cursorIndex += direction;
      if (cursorIndex < 0) cursorIndex = activeFields.length - 1;
      if (cursorIndex >= activeFields.length) cursorIndex = 0;

      // Leaving a choice row discards its uncommitted in-row cursor (ROM-verified).
      choiceCursor = 0;

      // Set fresh entry flag when entering a number/integer field
      var field = activeFields[cursorIndex];
      if (field && isEntryField(field.type)) {
        freshEntry = true;
      } else {
        freshEntry = false;
      }

      if (cursorIndex !== prevIndex) {
        fireFieldFocus(cursorIndex);
      }
    }

    // ── Input mode switching (Data/Stats) ──
    // Called after the Inpt choice field commits a new value on ENTER
    // (Inpt's own value/committed-vs-cursor bookkeeping is handled by the
    // generic choice-field path — this only handles the field-set swap).

    function applyInputModeChange(newMode) {
      // Preserve current values
      for (var key in values) {
        preservedValues[key] = values[key];
      }

      inputMode = newMode;
      values['Inpt'] = newMode;

      // Rebuild fields for the new mode
      rebuildFieldsForMode(newMode);

      // Restore preserved values for fields that exist in the new mode
      for (var i = 0; i < activeFields.length; i++) {
        var label = activeFields[i].label;
        if (preservedValues[label] !== undefined) {
          values[label] = preservedValues[label];
        }
      }

      // Make sure the Inpt value reflects the new mode
      values['Inpt'] = newMode;

      // ENTER commits and stays on the row (ROM-verified) — Inpt is
      // always field index 0, so the cursor is already there.
      cursorIndex = 0;
      freshEntry = false;
    }

    // ── Key handling ──

    function handleKey(key) {
      if (!activeFields.length) return getState();

      var field = activeFields[cursorIndex];
      if (!field) return getState();

      var normalizedKey = key;

      // ── DOWN: next field ──
      if (normalizedKey === 'DOWN') {
        moveCursor(1);
        return getState();
      }

      // ── UP: previous field ──
      if (normalizedKey === 'UP') {
        moveCursor(-1);
        return getState();
      }

      // ── LEFT / RIGHT ──
      if (normalizedKey === 'LEFT' || normalizedKey === 'RIGHT') {
        var direction = (normalizedKey === 'RIGHT') ? 1 : -1;

        // Choice fields: LEFT/RIGHT move an in-row cursor only — nothing
        // commits until ENTER. The ROM clamps at the ends, it does not wrap.
        // Inpt is a plain choice field too (ROM-verified) — no special case.
        if (field.type === 'choice') {
          var choiceOptions = getCycleOptions(field);
          if (choiceOptions && choiceOptions.length > 0) {
            choiceCursor += direction;
            if (choiceCursor < 0) choiceCursor = 0;
            if (choiceCursor >= choiceOptions.length) choiceCursor = choiceOptions.length - 1;
          }
          return getState();
        }

        // Cycle fields: list-selector, action-selector, etc.
        if (isCycleField(field.type)) {
          var options = getCycleOptions(field);
          if (options && options.length > 0) {
            var oldVal = values[field.label];
            var newVal = cycleOption(options, oldVal, direction);
            values[field.label] = newVal;
            if (oldVal !== newVal) {
              fireFieldChange(field.label, oldVal, newVal);
            }
          }
          return getState();
        }

        // LEFT/RIGHT on number/integer fields: no action
        return getState();
      }

      // ── ENTER ──
      if (normalizedKey === 'ENTER') {
        // Action fields trigger submit
        if (isActionField(field.type)) {
          var actionLabel = values[field.label] || field.label;
          fireSubmit(actionLabel);
          return getState();
        }

        // Choice fields: ENTER commits the option under the in-row cursor
        // and stays on the row (ROM-verified — it does not advance).
        if (field.type === 'choice') {
          var enterOptions = getCycleOptions(field);
          if (enterOptions && enterOptions.length > 0) {
            var oldChoiceVal = values[field.label];
            var newChoiceVal = enterOptions[choiceCursor];
            values[field.label] = newChoiceVal;
            if (oldChoiceVal !== newChoiceVal) {
              fireFieldChange(field.label, oldChoiceVal, newChoiceVal);

              // Inpt is a choice field like any other, but committing a
              // new value additionally swaps the Data/Stats field set.
              if (field.label === 'Inpt' && wizardDef.inputModes) {
                applyInputModeChange(newChoiceVal);
              }
            }
          }
          return getState();
        }

        // Number/integer/selector fields: move to next field
        moveCursor(1);
        return getState();
      }

      // ── CLEAR: clear current number/integer field ──
      if (normalizedKey === 'CLEAR') {
        if (isEntryField(field.type)) {
          var oldClearVal = values[field.label];
          values[field.label] = '';
          freshEntry = false;
          if (oldClearVal !== '') {
            fireFieldChange(field.label, oldClearVal, '');
          }
        }
        return getState();
      }

      // ── DEL: backspace on number/integer field ──
      if (normalizedKey === 'DEL') {
        if (isEntryField(field.type)) {
          var val = values[field.label] || '';
          if (val.length > 0) {
            var oldDelVal = val;
            values[field.label] = val.slice(0, -1);
            freshEntry = false;
            fireFieldChange(field.label, oldDelVal, values[field.label]);
          }
        }
        return getState();
      }

      // ── NEGATIVE: toggle leading minus on number/integer field ──
      if (normalizedKey === 'NEGATIVE') {
        if (isEntryField(field.type)) {
          var negVal = values[field.label] || '';
          var oldNegVal = negVal;

          if (freshEntry) {
            // Fresh entry: start with just a minus sign
            values[field.label] = '-';
            freshEntry = false;
          } else if (negVal.charAt(0) === '-') {
            values[field.label] = negVal.substring(1);
          } else {
            values[field.label] = '-' + negVal;
          }

          if (oldNegVal !== values[field.label]) {
            fireFieldChange(field.label, oldNegVal, values[field.label]);
          }
        }
        return getState();
      }

      // ── DECIMAL: add decimal point to number field ──
      if (normalizedKey === 'DECIMAL') {
        if (field.type === 'number') {
          var decVal = values[field.label] || '';
          var oldDecVal = decVal;

          if (freshEntry) {
            values[field.label] = '.';
            freshEntry = false;
          } else if (decVal.indexOf('.') === -1) {
            // Only add decimal if there isn't one already
            values[field.label] = decVal + '.';
          }

          if (oldDecVal !== values[field.label]) {
            fireFieldChange(field.label, oldDecVal, values[field.label]);
          }
        }
        // Integer type: DECIMAL is ignored
        return getState();
      }

      // ── Digit keys (0-9) ──
      if (isDigitKey(normalizedKey)) {
        if (isEntryField(field.type)) {
          var digitVal = values[field.label] || '';
          var oldDigitVal = digitVal;

          if (freshEntry) {
            // First keystroke on a fresh field clears any default value
            values[field.label] = normalizedKey;
            freshEntry = false;
          } else {
            values[field.label] = digitVal + normalizedKey;
          }

          if (oldDigitVal !== values[field.label]) {
            fireFieldChange(field.label, oldDigitVal, values[field.label]);
          }
        }
        return getState();
      }

      // Unrecognized key — no-op
      return getState();
    }

    // ── State accessors ──

    function getState() {
      var field = activeFields[cursorIndex] || null;
      var isChoiceField = !!field && field.type === 'choice';

      var activeField = null;
      if (field) {
        activeField = {
          label: field.label,
          type: field.type,
          value: values[field.label]
        };
        if (isChoiceField) {
          // In-row cursor position, not yet committed — a future renderer
          // can draw it; unused elsewhere in this module.
          var choiceOptions = getCycleOptions(field);
          activeField.cursorOption = choiceOptions ? choiceOptions[choiceCursor] : null;
        }
      }

      return {
        wizardId: currentWizardId,
        fields: activeFields.map(function (f) {
          return {
            label: f.label,
            type: f.type,
            value: values[f.label],
            options: f.options || null
          };
        }),
        cursorIndex: cursorIndex,
        activeField: activeField,
        values: getAllValues(),
        inputMode: inputMode,
        isEditor: isEditor,
        choiceCursor: isChoiceField ? choiceCursor : null
      };
    }

    function getValue(label) {
      return values[label] !== undefined ? values[label] : undefined;
    }

    function getAllValues() {
      var out = {};
      for (var i = 0; i < activeFields.length; i++) {
        var label = activeFields[i].label;
        out[label] = values[label];
      }
      return out;
    }

    // ── Callback registration ──

    function onFieldFocus(cb) {
      if (typeof cb === 'function') fieldFocusCallbacks.push(cb);
    }

    function onFieldChange(cb) {
      if (typeof cb === 'function') fieldChangeCallbacks.push(cb);
    }

    function onSubmit(cb) {
      if (typeof cb === 'function') submitCallbacks.push(cb);
    }

    // ── Initialize and return ──

    initFields();

    // Fire initial focus event
    if (activeFields.length > 0) {
      fireFieldFocus(0);
    }

    return {
      handleKey: handleKey,
      getState: getState,
      getValue: getValue,
      getAllValues: getAllValues,
      onFieldFocus: onFieldFocus,
      onFieldChange: onFieldChange,
      onSubmit: onSubmit
    };
  }

  // ── Module export ───────────────────────────────────────────────────

  var FormEngine = {
    create: create,
    // Expose constants for testing
    LIST_OPTIONS: LIST_OPTIONS,
    COLOR_OPTIONS: COLOR_OPTIONS,
    EQUATION_OPTIONS: EQUATION_OPTIONS,
    MATRIX_OPTIONS: MATRIX_OPTIONS,
    EDITORS: EDITORS
  };

  if (typeof window !== 'undefined') {
    window.TI84FormEngine = FormEngine;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormEngine;
  }
})();
