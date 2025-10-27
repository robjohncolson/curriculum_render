# FRQ Chart Inventory Analysis

This directory contains derived data that inventories every free-response question (FRQ) in `data/curriculum.js` and classifies whether each item requires a chart.

## Outputs
- `frq_chart_inventory.json`: Summary counts by chart type plus the list of ambiguous FRQs that have no detected chart keywords or flags.
- `frq_chart_inventory.csv`: Row-level listing of FRQs with detection details and prompt snippets.

## Detection rules
1. Direct flags (`requiresGraph`, `chartType`) take priority. String values are mapped to the chart vocabulary when possible.
2. Keyword scan of prompt, solution, instructions, reasoning, and context strings. The scan is case-insensitive, normalizes whitespace, and strips common LaTeX markers. Recognized chart keywords include histogram, dotplot, boxplot, scatter, bar, pie, line, number line, normal, chi-square, and specialty charts such as stem-and-leaf, mosaic, violin, treemap, sankey, heatmap, or matrix.
3. Multiple detected chart types mark the FRQ as `multi`, capturing the array of chart types.
4. FRQs without any matches are tagged `words-only` and appear in the `unknowns` list for manual review.

## Re-running the analysis
```bash
node scripts/analyze_frq_charts.js
```
The script will regenerate both output files and print a console summary.
