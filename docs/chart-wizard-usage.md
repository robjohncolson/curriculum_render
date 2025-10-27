# Chart Wizard MVP Usage

## Launching the Wizard
- Navigate to an eligible FRQ (currently `U1-L10-Q04` and `U1-L10-Q06`).
- Click **Create Chart** (or **Edit Chart**) to open the chart wizard modal.
- The wizard is keyboard-friendly: use <kbd>Tab</kbd> to move between controls and <kbd>Enter</kbd> to activate buttons.

## Workflow Overview
1. **Chart type** – pick from the suggested chart types for the question. The suggested type is highlighted but you can choose any of the supported options (bar, line, scatter, bubble, radar, polar area, pie, doughnut, histogram, dotplot, box plot, normal curve, chi-square curve, number line). Orientation toggles (for example, horizontal bars) appear automatically when a chart supports them.
2. **Data entry** – enter labels/values or points. You can paste CSV data (comma or tab-separated) and use the “Parse CSV” helper, or add rows manually. Provide axis labels, series name, and optional title/description.
3. **Preview & save** – review the rendered preview. Use **Save Chart** to persist the configuration, or **Delete** to remove the saved chart.

The chart list is driven by the read-only registry at `window.CHART_TYPE_LIST` (defined in `js/chart_registry.js`), so adding a renderer only requires updating the registry entry.

The wizard stores charts immediately in localStorage. Saved charts are rendered below the FRQ prompt and can be edited or deleted without reopening the wizard.

## Standard Internal Format (SIF)
Each chart is saved as a JSON object with common metadata plus type-specific payloads. Common fields include:

- `type`: chart identifier (`"bar"`, `"line"`, `"scatter"`, `"bubble"`, `"radar"`, `"polarArea"`, `"pie"`, `"doughnut"`, `"histogram"`, `"dotplot"`, `"boxplot"`, `"normal"`, `"chisquare"`, `"numberline"`).
- Optional `xLabel`, `yLabel`, `title`, and `description` (also stored under `options`).
- `meta`: timestamps for creation/update.

Type-specific content:

- **Bar / Line** – `series: [{ name, values: number[] }]` plus optional `categories` array. Bar charts also include `orientation` (`"vertical"` or `"horizontal"`).
- **Scatter** – `points: [{ x, y, label? }]` storing numeric coordinates and optional labels.
- **Bubble** – `points: [{ x, y, r, label? }]` with numeric radii.
- **Radar** – `categories: string[]` and `datasets: [{ name, values: number[] }]` (all datasets share the category order).
- **PolarArea / Pie / Doughnut** – `segments: [{ label, value }]` describing each slice or sector.
- **Histogram** – `data.bins: [{ label, value }]` and `data.seriesName` for the frequency series.
- **Dotplot** – `data.values: number[]` representing the raw observations.
- **Boxplot** – `data.fiveNumber` (min, q1, median, q3, max).
- **Normal curve** – `data.mean`, `data.sd`, optional `data.shade`, `data.xMin`, `data.xMax`, and `data.tickInterval`.
- **Chi-square curve** – `data.dfList`, `data.labels`, and optional domain/tick metadata.
- **Number line** – `data.ticks: [{ x, label, bottomLabel }]` plus optional `data.xMin`/`data.xMax`.

## Storage Location
Charts are persisted in two places for backward compatibility:

- `classData.users[USERNAME].answers[QUESTION_ID] = { type: "chart-response", value: <SIF>, timestamp }`
- `classData.users[USERNAME].charts[QUESTION_ID] = <SIF>`

The wizard automatically maintains both structures and calls `saveClassData()` after every save or delete.

## Submission & Sync
When you submit an answer:
- The wizard stringifies the SIF object and stores it in `answer_value` alongside the FRQ response.
- Railway and Supabase receive the same payload (username, question_id, answer_value, timestamp) via the proxy helper.
- Deleting a chart updates localStorage immediately. To clear the remote copy, submit the FRQ again after deleting.

## Tips
- Use meaningful axis labels so the preview is self-explanatory.
- CSV parsing expects `label,value` rows for histograms, a list of numbers for dotplots, and `x,y` pairs for scatterplots.
- Boxplots require the five-number summary; the wizard validates that each entry is numeric.
- All features work offline (`file://`) and reuse existing Chart.js helpers—no extra dependencies required.
