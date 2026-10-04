/**
 * TI-84 CE Screen Renderer — renders calculator state to a 320x240 canvas
 * that looks like a TI-84 LCD.
 * Module 5 of the native stat calculator reimplementation.
 *
 * No external dependencies.
 */
(function () {
  'use strict';

  // ───────────────────────────────────────────────
  //  Constants
  // ───────────────────────────────────────────────

  var WIDTH = 320;
  var HEIGHT = 240;
  var BG_COLOR = '#C6D8A0';
  var TEXT_COLOR = '#000000';
  var INVERT_BG = '#000000';
  var INVERT_FG = '#C6D8A0';
  var FONT = '12px monospace';
  var CHAR_W = 12;     // approximate width of one monospace character at 12px
  var LINE_H = 22;     // line height (fits ~10 rows in 240px)
  var COLS = 26;       // max characters per line (320 / 12 ~ 26)
  var ROWS = 10;       // max visible rows (240 / 24 = 10)
  var LEFT_PAD = 4;    // left margin in pixels
  var TOP_PAD = 2;     // top margin in pixels
  var CURSOR_CHAR = '\u25BA'; // ► menu cursor
  var SCROLL_INDICATOR = '\u25BC'; // ▼ scroll down indicator

  // ───────────────────────────────────────────────
  //  Internal drawing helpers
  // ───────────────────────────────────────────────

  function clearCanvas(ctx) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function setFont(ctx) {
    ctx.font = FONT;
    ctx.textBaseline = 'top';
  }

  /**
   * Draw a single line of text at a given row.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} row — 0-based row index
   * @param {Object} [opts] — { invert, align, xOffset }
   */
  function drawText(ctx, text, row, opts) {
    opts = opts || {};
    var y = TOP_PAD + row * LINE_H;
    var x = LEFT_PAD + (opts.xOffset || 0);

    if (opts.invert) {
      ctx.fillStyle = INVERT_BG;
      ctx.fillRect(0, y, WIDTH, LINE_H);
      ctx.fillStyle = INVERT_FG;
    } else {
      ctx.fillStyle = TEXT_COLOR;
    }

    if (opts.align === 'right') {
      var w = ctx.measureText(text).width;
      x = WIDTH - LEFT_PAD - w;
    } else if (opts.align === 'center') {
      var cw = ctx.measureText(text).width;
      x = (WIDTH - cw) / 2;
    }

    ctx.fillText(text, x, y + 4);
  }

  /**
   * Draw a horizontal divider line below a given row.
   */
  function drawDivider(ctx, row) {
    var y = TOP_PAD + (row + 1) * LINE_H;
    ctx.strokeStyle = TEXT_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  // ───────────────────────────────────────────────
  //  Graph drawing helpers
  // ───────────────────────────────────────────────

  var GRAPH_AREA = {
    x: 20,
    y: 30,
    w: 280,
    h: 170
  };

  function drawGraphFrame(ctx, title) {
    clearCanvas(ctx);
    setFont(ctx);
    drawText(ctx, title, 0);
    // Draw axes frame
    ctx.strokeStyle = TEXT_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(GRAPH_AREA.x, GRAPH_AREA.y);
    ctx.lineTo(GRAPH_AREA.x, GRAPH_AREA.y + GRAPH_AREA.h);
    ctx.lineTo(GRAPH_AREA.x + GRAPH_AREA.w, GRAPH_AREA.y + GRAPH_AREA.h);
    ctx.stroke();
  }

  function drawHistogram(ctx) {
    var barHeights = [0.3, 0.6, 0.9, 0.7, 0.45, 0.2];
    var barCount = barHeights.length;
    var barW = Math.floor(GRAPH_AREA.w / (barCount + 1));
    var baseY = GRAPH_AREA.y + GRAPH_AREA.h;

    ctx.fillStyle = TEXT_COLOR;
    for (var i = 0; i < barCount; i++) {
      var h = Math.floor(GRAPH_AREA.h * barHeights[i]);
      var x = GRAPH_AREA.x + (i + 0.5) * barW;
      ctx.fillRect(x, baseY - h, barW - 2, h);
    }
  }

  function drawBoxplot(ctx) {
    var baseY = GRAPH_AREA.y + GRAPH_AREA.h / 2;
    var boxH = 30;
    var gx = GRAPH_AREA.x;
    var gw = GRAPH_AREA.w;

    // Positions as fractions of graph width: min, Q1, Med, Q3, max
    var min = 0.05, q1 = 0.25, med = 0.45, q3 = 0.7, max = 0.95;

    ctx.strokeStyle = TEXT_COLOR;
    ctx.lineWidth = 2;

    // Whisker: min to Q1
    ctx.beginPath();
    ctx.moveTo(gx + gw * min, baseY);
    ctx.lineTo(gx + gw * q1, baseY);
    ctx.stroke();

    // Min vertical tick
    ctx.beginPath();
    ctx.moveTo(gx + gw * min, baseY - boxH / 3);
    ctx.lineTo(gx + gw * min, baseY + boxH / 3);
    ctx.stroke();

    // Box: Q1 to Q3
    ctx.strokeRect(gx + gw * q1, baseY - boxH / 2, gw * (q3 - q1), boxH);

    // Median line
    ctx.beginPath();
    ctx.moveTo(gx + gw * med, baseY - boxH / 2);
    ctx.lineTo(gx + gw * med, baseY + boxH / 2);
    ctx.stroke();

    // Whisker: Q3 to max
    ctx.beginPath();
    ctx.moveTo(gx + gw * q3, baseY);
    ctx.lineTo(gx + gw * max, baseY);
    ctx.stroke();

    // Max vertical tick
    ctx.beginPath();
    ctx.moveTo(gx + gw * max, baseY - boxH / 3);
    ctx.lineTo(gx + gw * max, baseY + boxH / 3);
    ctx.stroke();
  }

  function drawScatterplot(ctx) {
    // Roughly linear upward pattern
    var points = [
      [0.08, 0.85], [0.15, 0.72], [0.25, 0.68], [0.32, 0.55],
      [0.42, 0.50], [0.50, 0.42], [0.58, 0.38], [0.68, 0.25],
      [0.75, 0.22], [0.88, 0.10]
    ];
    var r = 3;

    ctx.fillStyle = TEXT_COLOR;
    for (var i = 0; i < points.length; i++) {
      var px = GRAPH_AREA.x + GRAPH_AREA.w * points[i][0];
      var py = GRAPH_AREA.y + GRAPH_AREA.h * points[i][1];
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  function drawResidualPlot(ctx) {
    // Dots scattered around a horizontal zero line
    var baseY = GRAPH_AREA.y + GRAPH_AREA.h / 2;

    // Zero line
    ctx.strokeStyle = TEXT_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(GRAPH_AREA.x, baseY);
    ctx.lineTo(GRAPH_AREA.x + GRAPH_AREA.w, baseY);
    ctx.stroke();

    // Scattered points
    var points = [
      [0.08, 0.15], [0.18, -0.25], [0.28, 0.10], [0.35, -0.08],
      [0.45, 0.20], [0.55, -0.15], [0.65, 0.05], [0.72, -0.22],
      [0.82, 0.12], [0.92, -0.05]
    ];
    var r = 3;
    var halfH = GRAPH_AREA.h / 2;

    ctx.fillStyle = TEXT_COLOR;
    for (var i = 0; i < points.length; i++) {
      var px = GRAPH_AREA.x + GRAPH_AREA.w * points[i][0];
      var py = baseY - halfH * points[i][1] * 0.8;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  function drawChi2Curve(ctx) {
    var gx = GRAPH_AREA.x;
    var gy = GRAPH_AREA.y;
    var gw = GRAPH_AREA.w;
    var gh = GRAPH_AREA.h;
    var steps = 60;

    // Draw the chi-square-like curve (right-skewed)
    ctx.strokeStyle = TEXT_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // Simple right-skewed shape: f(t) = t * exp(-2*t) * 5, scaled
      var raw = t * Math.exp(-2 * t) * 5;
      var x = gx + t * gw;
      var y = gy + gh - raw * gh;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Shade right tail (from ~60% onward)
    var shadeStart = 0.6;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    var startX = gx + shadeStart * gw;
    var startRaw = shadeStart * Math.exp(-2 * shadeStart) * 5;
    ctx.moveTo(startX, gy + gh - startRaw * gh);
    for (var j = Math.floor(shadeStart * steps); j <= steps; j++) {
      var t2 = j / steps;
      var raw2 = t2 * Math.exp(-2 * t2) * 5;
      ctx.lineTo(gx + t2 * gw, gy + gh - raw2 * gh);
    }
    ctx.lineTo(gx + gw, gy + gh);
    ctx.lineTo(startX, gy + gh);
    ctx.closePath();
    ctx.fill();
  }

  // ───────────────────────────────────────────────
  //  Renderer factory
  // ───────────────────────────────────────────────

  var ScreenRenderer = {

    /**
     * Create a renderer bound to a canvas element.
     * @param {HTMLCanvasElement} canvas — must be 320x240 or will be resized
     * @returns {Object} renderer instance
     */
    create: function (canvas) {
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      var ctx = canvas.getContext('2d');

      var renderer = {

        /**
         * Render home screen with previous result lines and blinking cursor.
         * @param {string[]} lines — lines of text to display
         */
        renderHome: function (lines) {
          clearCanvas(ctx);
          setFont(ctx);

          var startRow = 0;
          if (lines.length > ROWS - 1) {
            startRow = lines.length - (ROWS - 1);
          }

          for (var i = startRow; i < lines.length; i++) {
            drawText(ctx, lines[i], i - startRow);
          }

          // Blinking cursor on next available row
          var cursorRow = Math.min(lines.length - startRow, ROWS - 1);
          drawText(ctx, '\u2588', cursorRow); // solid block cursor
        },

        /**
         * Render a menu screen.
         * @param {Object} menuState — { title, tabs?, activeTab?, items[], cursorIndex }
         */
        renderMenu: function (menuState) {
          clearCanvas(ctx);
          setFont(ctx);

          var row = 0;

          // Tab strip (if present)
          if (menuState.tabs && menuState.tabs.length > 0) {
            var tabLine = '';
            for (var t = 0; t < menuState.tabs.length; t++) {
              var label = menuState.tabs[t];
              if (t === menuState.activeTab) {
                label = '[' + label + ']';
              }
              tabLine += label + '  ';
            }
            drawText(ctx, tabLine.trim(), row, { invert: true });
            row++;
          } else if (menuState.title) {
            // Title bar for non-tabbed menus
            drawText(ctx, menuState.title, row, { invert: true });
            row++;
          }

          // Menu items
          var visibleItems = ROWS - row;
          var scrollStart = 0;
          if (menuState.cursorIndex >= visibleItems) {
            scrollStart = menuState.cursorIndex - visibleItems + 1;
          }

          for (var i = scrollStart; i < menuState.items.length && (row < ROWS); i++) {
            var prefix = (i === menuState.cursorIndex) ? CURSOR_CHAR : ' ';
            var itemLabel = menuState.items[i];
            drawText(ctx, prefix + itemLabel, row);
            row++;
          }
        },

        /**
         * Render a wizard form screen.
         * @param {Object} wizardState — { title?, fields[], cursorIndex }
         *   Each field: { label, displayValue, cursorOption? }
         *   cursorOption is the uncommitted choice-row cursor (ROM:
         *   LEFT/RIGHT moves it, ENTER commits it into displayValue) —
         *   only ever set on the active row, and only when it differs
         *   from displayValue is there anything extra to draw.
         */
        renderWizard: function (wizardState) {
          clearCanvas(ctx);
          setFont(ctx);

          var row = 0;

          // Optional title
          if (wizardState.title) {
            drawText(ctx, wizardState.title, row, { invert: true });
            row++;
          }

          // Fields: label on left, value on right, active row inverted
          var visibleRows = ROWS - row;
          var scrollStart = 0;
          if (wizardState.cursorIndex >= visibleRows) {
            scrollStart = wizardState.cursorIndex - visibleRows + 1;
          }

          for (var i = scrollStart; i < wizardState.fields.length && (row < ROWS); i++) {
            var field = wizardState.fields[i];
            var isActive = (i === wizardState.cursorIndex);

            if (isActive) {
              // Inverted row for active field
              var y = TOP_PAD + row * LINE_H;
              ctx.fillStyle = INVERT_BG;
              ctx.fillRect(0, y, WIDTH, LINE_H);
              ctx.fillStyle = INVERT_FG;
              ctx.fillText(field.label, LEFT_PAD, y + 4);

              var valX = WIDTH - LEFT_PAD;
              if (field.displayValue !== undefined && field.displayValue !== null) {
                var valStr = String(field.displayValue);
                var valW = ctx.measureText(valStr).width;
                valX = WIDTH - LEFT_PAD - valW;
                ctx.fillText(valStr, valX, y + 4);
              }

              // Uncommitted choice-row cursor, boxed, left of the committed
              // value — only drawn when it hasn't been committed yet.
              if (field.cursorOption !== undefined && field.cursorOption !== null &&
                  field.cursorOption !== field.displayValue) {
                var curStr = String(field.cursorOption);
                var curW = ctx.measureText(curStr).width;
                var curX = valX - CHAR_W - curW;
                ctx.fillText(curStr, curX, y + 4);
                ctx.strokeStyle = INVERT_FG;
                ctx.lineWidth = 1;
                ctx.strokeRect(curX - 2, y + 1, curW + 4, LINE_H - 2);
              }
            } else {
              ctx.fillStyle = TEXT_COLOR;
              var ny = TOP_PAD + row * LINE_H;
              ctx.fillText(field.label, LEFT_PAD, ny + 4);
              if (field.displayValue !== undefined && field.displayValue !== null) {
                var nvalStr = String(field.displayValue);
                var nvalW = ctx.measureText(nvalStr).width;
                ctx.fillText(nvalStr, WIDTH - LEFT_PAD - nvalW, ny + 4);
              }
            }

            row++;
          }
        },

        /**
         * Render a result screen.
         * @param {Object} resultState — { lines[], scrollable, title? }
         */
        renderResult: function (resultState) {
          clearCanvas(ctx);
          setFont(ctx);

          var row = 0;

          // Optional title
          if (resultState.title) {
            drawText(ctx, resultState.title, row, { invert: true });
            row++;
          }

          for (var i = 0; i < resultState.lines.length && row < ROWS; i++) {
            drawText(ctx, resultState.lines[i], row);
            row++;
          }

          // Scroll indicator
          if (resultState.scrollable) {
            ctx.fillStyle = TEXT_COLOR;
            var indicatorX = WIDTH - LEFT_PAD - CHAR_W;
            var indicatorY = HEIGHT - LINE_H + 4;
            ctx.fillText(SCROLL_INDICATOR, indicatorX, indicatorY);
          }
        },

        /**
         * Render a list editor screen.
         * @param {Object} editorState — { columns[], rows[][], cursorRow, cursorCol }
         *   columns: ['L1', 'L2', ...], rows: arrays of cell values
         */
        renderEditor: function (editorState) {
          clearCanvas(ctx);
          setFont(ctx);

          var colCount = editorState.columns.length;
          var colW = Math.floor(WIDTH / colCount);

          // Column headers
          ctx.fillStyle = INVERT_BG;
          ctx.fillRect(0, TOP_PAD, WIDTH, LINE_H);
          ctx.fillStyle = INVERT_FG;
          for (var c = 0; c < colCount; c++) {
            var hx = c * colW + LEFT_PAD;
            ctx.fillText(editorState.columns[c], hx, TOP_PAD + 4);
          }

          // Data rows
          var visibleDataRows = ROWS - 1; // minus header
          var scrollStart = 0;
          if (editorState.cursorRow >= visibleDataRows) {
            scrollStart = editorState.cursorRow - visibleDataRows + 1;
          }

          for (var r = scrollStart; r < editorState.rows.length && (r - scrollStart) < visibleDataRows; r++) {
            var rowIdx = 1 + (r - scrollStart);
            var rowData = editorState.rows[r];
            for (var cc = 0; cc < colCount && cc < rowData.length; cc++) {
              var cx = cc * colW + LEFT_PAD;
              var cy = TOP_PAD + rowIdx * LINE_H;
              var isActive = (r === editorState.cursorRow && cc === editorState.cursorCol);

              if (isActive) {
                ctx.fillStyle = INVERT_BG;
                ctx.fillRect(cc * colW, cy, colW, LINE_H);
                ctx.fillStyle = INVERT_FG;
              } else {
                ctx.fillStyle = TEXT_COLOR;
              }
              ctx.fillText(String(rowData[cc] !== undefined ? rowData[cc] : ''), cx, cy + 4);
            }
          }
        },

        /**
         * Render a graph screen (static mock illustration).
         * @param {Object} graphState — { type, title, traceMode, traceInfo }
         */
        renderGraph: function (graphState) {
          drawGraphFrame(ctx, graphState.title || '');

          switch (graphState.type) {
            case 'histogram':
              drawHistogram(ctx);
              break;
            case 'modified-boxplot':
              drawBoxplot(ctx);
              break;
            case 'scatterplot':
              drawScatterplot(ctx);
              break;
            case 'residual-plot':
              drawResidualPlot(ctx);
              break;
            case 'chi2-draw':
              drawChi2Curve(ctx);
              break;
            default:
              // Unknown graph type — show placeholder text
              setFont(ctx);
              drawText(ctx, '[Graph: ' + (graphState.type || 'unknown') + ']', 5, { align: 'center' });
              break;
          }

          // Trace info at bottom
          if (graphState.traceMode && graphState.traceInfo) {
            setFont(ctx);
            var traceText = '';
            var info = graphState.traceInfo;
            if (info.x !== undefined) traceText += 'x=' + info.x;
            if (info.y !== undefined) traceText += ' y=' + info.y;
            if (info.n !== undefined) traceText += ' n=' + info.n;
            traceText = traceText.trim();

            // Draw trace info on the last row with inverted background
            var traceRow = ROWS - 1;
            drawText(ctx, traceText, traceRow, { invert: true });
          }
        },

        /**
         * Clear the canvas to the LCD background color.
         */
        clear: function () {
          clearCanvas(ctx);
        }
      };

      return renderer;
    }
  };

  // ───────────────────────────────────────────────
  //  Export
  // ───────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window.TI84ScreenRenderer = ScreenRenderer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScreenRenderer;
  }
})();
