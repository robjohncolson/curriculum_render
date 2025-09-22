
function renderChart(chartData, questionId) {
    const chartId = `chart-${questionId}`;
    const config = chartData.chartConfig || {};

    // Use the chart's title if available, otherwise use the chart type
    const chartTitle = chartData.title ?
        chartData.title :
        (config.description ?
            `📊 ${chartData.chartType.toUpperCase()} CHART` :
            `📊 ${chartData.chartType.toUpperCase()} CHART`);

    // Allow a chart to request full horizontal space when rendered inside a "multiple-charts-container"
    const containerStyle = chartData.fullWidth ? 'style="flex:0 0 100%; max-width:100%; width:100%;"' : '';

    let chartHtml = `
        <div class="chart-container" ${containerStyle}>
            <div class="chart-title">${chartTitle}</div>
            ${config.description ? `<div style="font-size: 0.9em; color: #666; text-align: center; margin-bottom: 10px; font-style: italic;">${config.description}</div>` : 
''}
            <div class="chart-canvas">
                <canvas id="${chartId}"></canvas>
            </div>
        </div>
    `;

    // Return HTML first, then we'll create the chart after the DOM is updated
    setTimeout(() => {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        if (chartData.chartType === 'bar' || chartData.chartType === 'histogram') {
            // Ensure every segment in a stacked / segmented bar gets its own visually distinct color
            // 1. Compute one shared palette sized to the total number of series.
            // 2. Pick the palette entry matching the series index (wrap-around safety for very large N).
            const colorPalette = generateChartColors(chartData.series.length);

            const datasets = chartData.series.map((series, index) => {
                const color = colorPalette[index % colorPalette.length] || '#36A2EB';
                return {
                    label: series.name,
                    data: series.values,
                    backgroundColor: color,
                    borderColor: color,
                    borderWidth: 1
                };
            });

            // Use chartConfig if available, otherwise use defaults
            const yAxisConfig = config.yAxis || {};
            const xAxisConfig = config.xAxis || {};

            // Handle grid lines - support both old and new formats
            let showHorizontalGrid = true;
            let showVerticalGrid = false;

            if (config.gridLines !== undefined) {
                if (typeof config.gridLines === 'boolean') {
                    // Old format: gridLines: true/false
                    showHorizontalGrid = config.gridLines;
                    showVerticalGrid = false;
                } else if (typeof config.gridLines === 'object') {
                    // New format: gridLines: {horizontal: true, vertical: false}
                    showHorizontalGrid = config.gridLines.horizontal !== false;
                    showVerticalGrid = config.gridLines.vertical === true;
                }
            }

            // Configure bar spacing - gaps for bar charts, no gaps for histograms
            const isHistogram = chartData.chartType === 'histogram';
            const categoryPercentage = isHistogram ? 1.0 : 0.8;
            const barPercentage = isHistogram ? 1.0 : 0.9;

            // NEW: Detect orientation for bar charts (default to vertical)
            const orientation = config.orientation || 'vertical';
            const isHorizontalBar = orientation === 'horizontal';

            // NEW: Detect if bars should be stacked (applies only to bar charts)
            const isStacked = config.stacked === true || config.stacked === 'true';

            // Handle labels based on orientation - support both xLabels and yLabels
            let displayLabels = isHorizontalBar ? (chartData.yLabels || chartData.xLabels) : (chartData.xLabels || chartData.yLabels);

            // Preserve existing labelType overrides
            if (xAxisConfig.labelType === 'upperBound' && xAxisConfig.labels) {
                displayLabels = xAxisConfig.labels;
            } else if (xAxisConfig.labelType === 'range' && chartData.xLabels) {
                displayLabels = chartData.xLabels;
            } else if (xAxisConfig.labelType === 'lowerBound') {
                displayLabels = xAxisConfig.labels || chartData.xLabels;
            }

            const chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: displayLabels,
                    datasets: datasets
                },
                options: {
                    indexAxis: isHorizontalBar ? 'y' : 'x',
                    responsive: true,
                    maintainAspectRatio: false,
                    categoryPercentage: categoryPercentage,
                    barPercentage: barPercentage,
                    scales: isHorizontalBar ? {
                        x: {
                            beginAtZero: xAxisConfig.min !== undefined ? (xAxisConfig.min === 0) : true,
                            min: xAxisConfig.min,
                            max: xAxisConfig.max,
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'Value',
                                color: getTextColor()
                            },
                            grid: {
                                display: showVerticalGrid,
                                color: getGridColor()
                            },
                            stacked: isStacked,
                            ticks: {
                                stepSize: xAxisConfig.tickInterval,
                                maxTicksLimit: xAxisConfig.tickInterval ? undefined : 10,
                                precision: 2,
                                color: getTextColor(),
                                // Force Chart.js to respect our stepSize by providing a callback
                                callback: function(value, index, values) {
                                    // If we have a specific tickInterval, ensure we only show ticks at those intervals
                                    if (xAxisConfig.tickInterval) {
                                        const step = xAxisConfig.tickInterval;
                                        const min = xAxisConfig.min !== undefined ? xAxisConfig.min : 0;
                                        const adjustedValue = value - min;
                                        if (Math.abs(adjustedValue % step) < 0.000001 || Math.abs(adjustedValue % step - step) < 0.000001) {
                                            // Round to mitigate floating-point artifacts
                                            return Number(value.toFixed(6));
                                        }
                                        return '';
                                    }
                                    return value;
                                }
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: yAxisConfig.title || 'Category',
                                color: getTextColor()
                            },
                            grid: {
                                display: showHorizontalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                color: getTextColor()
                            },
                            offset: true
                        }
                    } : {
                        y: {
                            beginAtZero: yAxisConfig.min !== undefined ? (yAxisConfig.min === 0) : true,
                            min: yAxisConfig.min,
                            max: yAxisConfig.max,
                            title: {
                                display: true,
                                text: yAxisConfig.title || 'Value',
                                color: getTextColor()
                            },
                            grid: {
                                display: showHorizontalGrid,
                                color: getGridColor(),
                                lineWidth: 1,
                                drawBorder: true,
                                drawOnChartArea: true,
                                drawTicks: !yAxisConfig.hideTicks
                            },
                            stacked: isStacked,
                            ticks: {
                                stepSize: yAxisConfig.tickInterval,
                                maxTicksLimit: yAxisConfig.tickInterval ? undefined : 10,
                                precision: 2,
                                color: getTextColor(),
                                display: !yAxisConfig.hideTicks,
                                // Force Chart.js to respect our stepSize by providing a callback
                                callback: function(value, index, values) {
                                    if (yAxisConfig.hideTicks) return '';
                                    // If we have a specific tickInterval, ensure we only show ticks at those intervals
                                    if (yAxisConfig.tickInterval) {
                                        const step = yAxisConfig.tickInterval;
                                        const min = yAxisConfig.min !== undefined ? yAxisConfig.min : 0;
                                        const adjustedValue = value - min;
                                        if (Math.abs(adjustedValue % step) < 0.000001 || Math.abs(adjustedValue % step - step) < 0.000001) {
                                            // Round to mitigate floating-point artifacts
                                            return Number(value.toFixed(6));
                                        }
                                        return '';
                                    }
                                    return value;
                                }
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'Category',
                                color: getTextColor()
                            },
                            grid: {
                                display: showVerticalGrid,
                                color: getGridColor()
                            },
                            stacked: isStacked,
                            ticks: {
                                color: getTextColor()
                            },
                            offset: true
                        }
                    },
                    plugins: {
                        legend: {
                            display: datasets.length > 1,
                            labels: {
                                color: getTextColor()
                            }
                        },
                        // Enable data labels for bar/histogram charts when requested via chartConfig.showPointLabels
                        datalabels: {
                            display: config.showPointLabels === true,
                            color: getTextColor(),
                            anchor: isHorizontalBar ? 'center' : 'end',
                            align: isHorizontalBar ? 'right' : 'top',
                            formatter: (value) => value
                        }
                    }
                }
            });
            chartInstances[chartId] = chart;

        } else if (chartData.chartType === 'pie') {
            const seriesData = chartData.series[0].values;
            const labels = seriesData.map(item => item.name);
            const values = seriesData.map(item => item.value);

            const chart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: generateChartColors(values.length),
                        borderWidth: 2,
                        borderColor: isDarkMode() ? '#2d2d2d' : '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                color: getTextColor()
                            }
                        },
                        // Optional data labels for pie charts (percentages) when chartConfig.showPointLabels is true
                        datalabels: {
                            display: (config.showPointLabels === true),
                            color: getTextColor(),
                            formatter: function(value, context) {
                                const total = values.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return percentage + '%';
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = values.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return `${context.label}: ${context.parsed} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
            chartInstances[chartId] = chart;

        } else if (chartData.chartType === 'scatter') {
            const config = chartData.chartConfig || {};
            const xAxisConfig = config.xAxis || {};
            const yAxisConfig = config.yAxis || {};

            // Handle grid lines - support both old and new formats
            let showHorizontalGrid = true;
            let showVerticalGrid = true; // Scatter plots often show both grids

            if (config.gridLines !== undefined) {
                if (typeof config.gridLines === 'boolean') {
                    // Old format: gridLines: true/false
                    showHorizontalGrid = config.gridLines;
                    showVerticalGrid = config.gridLines;
                } else if (typeof config.gridLines === 'object') {
                    // New format: gridLines: {horizontal: true, vertical: false}
                    showHorizontalGrid = config.gridLines.horizontal === true;
                    showVerticalGrid = config.gridLines.vertical === true;
                }
            }

            // Build primary dataset (scatter points)
            const datasets = [{
                label: 'Data Points',
                data: chartData.points,
                backgroundColor: getScatterPointColor(),
                borderColor: getScatterPointColor(),
                pointRadius: 4,
                pointHoverRadius: 6
            }];

            // Determine if we should render point labels
            const hasPointLabels = (chartData.points || []).some(pt => pt.label !== undefined);

            // --------------------------------------------------
            // Optional regression line (least-squares)            <-- ADD
            // --------------------------------------------------
            if (config.regressionLine) {
                const pts = chartData.points || [];
                if (Array.isArray(pts) && pts.length >= 2) {
                    // Compute least-squares slope and intercept
                    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
                    pts.forEach(p => {
                        sumX += p.x;
                        sumY += p.y;
                        sumXY += p.x * p.y;
                        sumXX += p.x * p.x;
                    });
                    const n = pts.length;
                    const denominator = n * sumXX - sumX * sumX;
                    if (denominator !== 0) {
                        const slope = (n * sumXY - sumX * sumY) / denominator;
                        const intercept = (sumY - slope * sumX) / n;

                        // Determine the horizontal span for the line
                        let minX = typeof xAxisConfig.min === 'number' ? xAxisConfig.min : undefined;
                        let maxX = typeof xAxisConfig.max === 'number' ? xAxisConfig.max : undefined;
                        if (minX === undefined || maxX === undefined) {
                            const xs = pts.map(p => p.x);
                            if (minX === undefined) minX = Math.min(...xs);
                            if (maxX === undefined) maxX = Math.max(...xs);
                        }

                        // Style overrides (optional)
                        const regColor = config.regressionLineColor || getTextColor();
                        const regDash  = config.regressionLineDash  || [];

                        datasets.push({
                            label: 'Regression Line',
                            type: 'line',
                            data: [
                                { x: minX, y: slope * minX + intercept },
                                { x: maxX, y: slope * maxX + intercept }
                            ],
                            borderColor: regColor,
                            borderDash: regDash,
                            borderWidth: 2,
                            fill: false,
                            pointRadius: 0,
                            tension: 0,
                            order: 0
                        });
                    }
                }
            }

            // --------------------------------------------------
            // Optional reference line at y = 0 (useful for residual plots)
            // --------------------------------------------------
            if (config.referenceLineAtZero) {
                // Determine horizontal span of the scatter data (fallback to axis min/max)
                let minX = typeof xAxisConfig.min === 'number' ? xAxisConfig.min : undefined;
                let maxX = typeof xAxisConfig.max === 'number' ? xAxisConfig.max : undefined;
                if (minX === undefined || maxX === undefined) {
                    const xs = chartData.points.map(p => p.x);
                    if (minX === undefined) minX = Math.min(...xs);
                    if (maxX === undefined) maxX = Math.max(...xs);
                }

                datasets.push({
                    label: 'Reference Line y = 0',
                    type: 'line',
                    data: [
                        { x: minX, y: 0 },
                        { x: maxX, y: 0 }
                    ],
                    borderColor: '#CC0000',
                    borderDash: [6, 4],
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    order: 0
                });
            }

            const chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: xAxisConfig.min,
                            max: xAxisConfig.max,
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'X Variable',
                                color: getTextColor()
                            },
                            grid: {
                                display: showVerticalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                stepSize: xAxisConfig.tickInterval,
                                color: getTextColor(),
                                // Force Chart.js to respect our stepSize by providing a callback
                                callback: function(value, index, values) {
                                    // If we have a specific tickInterval, ensure we only show ticks at those intervals
                                    if (xAxisConfig.tickInterval) {
                                        const step = xAxisConfig.tickInterval;
                                        const min = xAxisConfig.min !== undefined ? xAxisConfig.min : 0;
                                        const adjustedValue = value - min;
                                        if (Math.abs(adjustedValue % step) < 0.000001 || Math.abs(adjustedValue % step - step) < 0.000001) {
                                            // Round to mitigate floating-point artifacts
                                            return Number(value.toFixed(6));
                                        }
                                        return '';
                                    }
                                    return value;
                                }
                            }
                        },
                        y: {
                            min: yAxisConfig.min,
                            max: yAxisConfig.max,
                            title: {
                                display: true,
                                text: yAxisConfig.title || 'Y Variable',
                                color: getTextColor()
                            },
                            grid: {
                                display: showHorizontalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                stepSize: yAxisConfig.tickInterval,
                                color: getTextColor(),
                                // Force Chart.js to respect our stepSize by providing a callback
                                callback: function(value, index, values) {
                                    // If we have a specific tickInterval, ensure we only show ticks at those intervals
                                    if (yAxisConfig.tickInterval) {
                                        const step = yAxisConfig.tickInterval;
                                        const min = yAxisConfig.min !== undefined ? yAxisConfig.min : 0;
                                        const adjustedValue = value - min;
                                        if (Math.abs(adjustedValue % step) < 0.000001 || Math.abs(adjustedValue % step - step) < 0.000001) {
                                            // Round to mitigate floating-point artifacts
                                            return Number(value.toFixed(6));
                                        }
                                        return '';
                                    }
                                    return value;
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        datalabels: {
                            display: (ctx) => {
                                const d = ctx.dataset.data[ctx.dataIndex];
                                // Show label if point has 'label' or global chartConfig requests labels
                                return (d && d.label !== undefined) || config.showPointLabels === true;
                            },
                            align: 'top',
                            anchor: 'center',
                            color: getTextColor(),
                            formatter: (value) => {
                                // If value has explicit label use that, otherwise display y
                                if (value.label !== undefined) return value.label;
                                if (config.showPointLabels === true) {
                                    return `(${value.x}, ${value.y})`;
                                }
                                return '';
                            },
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            });
            chartInstances[chartId] = chart;

            // Add point label plugin AFTER chart creation to ensure meta is available
            if (false && (hasPointLabels || config.showPointLabels)) {
                // Create inline plugin specific to this chart instance
                const labelPlugin = {
                    id: 'scatterPointLabels',
                    afterDatasetsDraw: (c) => {
                        if (c !== chart) return; // Only draw for this chart instance
                        const ctx = c.ctx;
                        ctx.save();
                        c.data.datasets.forEach((ds, dsi) => {
                            // Only annotate the point dataset (assumed first) or explicitly marked datasets
                            if (dsi !== 0) return;
                            const meta = c.getDatasetMeta(dsi);
                            meta.data.forEach((elem, idx) => {
                                const pointData = ds.data[idx];
                                const lbl = pointData && pointData.label;
                                if (lbl === undefined) return;
                                const {x, y} = elem.getCenterPoint();
                                ctx.fillStyle = getTextColor();
                                ctx.font = '12px sans-serif';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';
                                ctx.fillText(lbl, x, y - 6);
                            });
                        });
                        ctx.restore();
                    }
                };
                chart.options.plugins = chart.options.plugins || [];
                chart.options.plugins.push(labelPlugin);
                chart.update();
            }

        } else if (chartData.chartType === 'dotplot') {
            const config = chartData.chartConfig || {};
            const xAxisConfig = config.xAxis || {};

            // Handle grid lines - dotplots typically have no grid lines
            let showHorizontalGrid = false;
            let showVerticalGrid = false;

            if (config.gridLines !== undefined) {
                if (typeof config.gridLines === 'boolean') {
                    showHorizontalGrid = config.gridLines;
                    showVerticalGrid = config.gridLines;
                } else if (typeof config.gridLines === 'object') {
                    showHorizontalGrid = config.gridLines.horizontal === true;
                    showVerticalGrid = config.gridLines.vertical === true;
                }
            }

            // Convert raw values to frequency data for dotplot
            const valueFrequency = {};
            chartData.values.forEach(value => {
                valueFrequency[value] = (valueFrequency[value] || 0) + 1;
            });

            // Create stacked dots data
            const dotplotData = [];
            for (const [value, frequency] of Object.entries(valueFrequency)) {
                for (let i = 1; i <= frequency; i++) {
                    dotplotData.push({
                        x: parseFloat(value),
                        y: i
                    });
                }
            }

            // Find max frequency for y-axis
            const maxFrequency = Math.max(...Object.values(valueFrequency));

            // Allow caller to set dot radius (default 4)
            const dotRadius = (config.dotRadius !== undefined ? config.dotRadius : 4);

            const chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Data Points',
                        data: dotplotData,
                        backgroundColor: getScatterPointColor(),
                        borderColor: getScatterPointColor(),
                        pointRadius: dotRadius,
                        pointHoverRadius: dotRadius + 2,
                        showLine: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: xAxisConfig.min,
                            max: xAxisConfig.max,
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'Value',
                                color: getTextColor()
                            },
                            grid: {
                                display: showVerticalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                stepSize: xAxisConfig.tickInterval,
                                color: getTextColor(),
                                // Force Chart.js to respect our stepSize by providing a callback
                                callback: function(value, index, values) {
                                    // If we have a specific tickInterval, ensure we only show ticks at those intervals
                                    if (xAxisConfig.tickInterval) {
                                        const step = xAxisConfig.tickInterval;
                                        const min = xAxisConfig.min !== undefined ? xAxisConfig.min : 0;
                                        const adjustedValue = value - min;
                                        if (Math.abs(adjustedValue % step) < 0.000001 || Math.abs(adjustedValue % step - step) < 0.000001) {
                                            // Round to mitigate floating-point artifacts
                                            return Number(value.toFixed(6));
                                        }
                                        return '';
                                    }
                                    return value;
                                }
                            }
                        },
                        y: {
                            type: 'linear',
                            min: 0,
                            max: maxFrequency + 1,
                            title: {
                                display: false  // Dotplots don't typically show y-axis labels
                            },
                            grid: {
                                display: showHorizontalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                display: false,  // Hide y-axis tick labels
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        datalabels: {
                            display: () => config.showPointLabels === true,
                            align: 'top',
                            anchor: 'center',
                            color: getTextColor(),
                            formatter: (value) => value.y,
                            font: { size: 12 }
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    return `Value: ${context[0].parsed.x}`;
                                },
                                label: function(context) {
                                    return `Count: ${valueFrequency[context.parsed.x]}`;
                                }
                            }
                        }
                    }
                }
            });
             chartInstances[chartId] = chart;

            // Adjust chart height so stacked dots appear closer (rough heuristic)
            const minHeight = 120;
            const desiredHeight = Math.max(minHeight, (dotRadius * 2 + 4) * (maxFrequency + 1));
            canvas.parentElement.style.height = desiredHeight + 'px';


        } else if (chartData.chartType === 'boxplot') {
            const config = chartData.chartConfig || {};
            const xAxisConfig = config.xAxis || {};
            const boxplotData = config.boxplotData || {};

            // Handle grid lines
            let showHorizontalGrid = false;
            let showVerticalGrid = false;

            if (config.gridLines !== undefined) {
                if (typeof config.gridLines === 'boolean') {
                    showHorizontalGrid = config.gridLines;
                    showVerticalGrid = config.gridLines;
                } else if (typeof config.gridLines === 'object') {
                    showHorizontalGrid = config.gridLines.horizontal === true;
                    showVerticalGrid = config.gridLines.vertical === true;
                }
            }

            // Handle multiple boxplots (array) or single boxplot (object)
            const boxplots = Array.isArray(boxplotData) ? boxplotData : [boxplotData];

            // Check orientation from config (default to horizontal)
            const orientation = config.orientation || 'horizontal';
            const isHorizontal = orientation === 'horizontal';

            // Find overall min/max for axis scaling
            let overallMin = Infinity;
            let overallMax = -Infinity;

            boxplots.forEach(boxplot => {
                const { Q1, Q3, median, min, max, whiskerMin, whiskerMax, outliers } = boxplot;

                // Support both old format (min/max) and new format (whiskerMin/whiskerMax + outliers)
                const actualWhiskerMin = whiskerMin !== undefined ? whiskerMin : min;
                const actualWhiskerMax = whiskerMax !== undefined ? whiskerMax : max;
                const actualOutliers = outliers || [];

                // Calculate overall range including outliers
                const allValues = [actualWhiskerMin, actualWhiskerMax, ...actualOutliers];
                overallMin = Math.min(overallMin, Math.min(...allValues));
                overallMax = Math.max(overallMax, Math.max(...allValues));
                                 });

            // Create boxplot visualization with orientation support
            let datasets = [];

            // Generate colors for multiple boxplots
            const boxplotColors = generateChartColors(boxplots.length);

            boxplots.forEach((boxplot, index) => {
                const { Q1, Q3, median, min, max, whiskerMin, whiskerMax, outliers, name } = boxplot;

                // Support both old format (min/max) and new format (whiskerMin/whiskerMax + outliers)
                const actualWhiskerMin = whiskerMin !== undefined ? whiskerMin : min;
                const actualWhiskerMax = whiskerMax !== undefined ? whiskerMax : max;
                const actualOutliers = outliers || [];

                // Calculate position for multiple boxplots
                const boxplotSpacing = 0.8; // Space between boxplots
                const yPos = isHorizontal ? (index - (boxplots.length - 1) / 2) * boxplotSpacing : 0;
                const xPos = !isHorizontal ? (index - (boxplots.length - 1) / 2) * boxplotSpacing : 0;

                const color = boxplotColors[index];
                const boxplotName = name || `Boxplot ${index + 1}`;

                if (isHorizontal) {
                    // Horizontal boxplot
                    datasets.push(
                        // Median line (vertical in horizontal boxplot)
                        {
                            label: `${boxplotName} Median`,
                            data: [{ x: median, y: yPos - 0.2 }, { x: median, y: yPos + 0.2 }],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 3,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        // Lower whisker (horizontal)
                        {
                            label: `${boxplotName} Lower Whisker`,
                            data: [{ x: actualWhiskerMin, y: yPos }, { x: Q1, y: yPos }],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        // Upper whisker (horizontal)
                        {
                            label: `${boxplotName} Upper Whisker`,
                            data: [{ x: Q3, y: yPos }, { x: actualWhiskerMax, y: yPos }],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        // Whisker caps (vertical)
                        {
                            label: `${boxplotName} Lower Cap`,
                            data: [
                                { x: actualWhiskerMin, y: yPos - 0.1 },
                                { x: actualWhiskerMin, y: yPos + 0.1 }
                            ],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        {
                            label: `${boxplotName} Upper Cap`,
                            data: [
                                { x: actualWhiskerMax, y: yPos - 0.1 },
                                { x: actualWhiskerMax, y: yPos + 0.1 }
                            ],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        }
                    );

                    // Add outliers if any
                    if (actualOutliers.length > 0) {
                        const outlierData = actualOutliers.map(outlierValue => ({ x: outlierValue, y: yPos }));
                        datasets.push({
                            label: `${boxplotName} Outliers`,
                            data: outlierData,
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 5,
                            showLine: false,
                            type: 'scatter'
                        });
                    }
                } else {
                    // Vertical boxplot
                    datasets.push(
                        // Median line (horizontal in vertical boxplot)
                        {
                            label: `${boxplotName} Median`,
                            data: [{ x: xPos - 0.2, y: median }, { x: xPos + 0.2, y: median }],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 3,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        // Lower whisker (vertical)
                        {
                            label: `${boxplotName} Lower Whisker`,
                            data: [{ x: xPos, y: actualWhiskerMin }, { x: xPos, y: Q1 }],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        // Upper whisker (vertical)
                        {
                            label: `${boxplotName} Upper Whisker`,
                            data: [{ x: xPos, y: Q3 }, { x: xPos, y: actualWhiskerMax }],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        // Whisker caps (horizontal)
                        {
                            label: `${boxplotName} Lower Cap`,
                            data: [
                                { x: xPos - 0.1, y: actualWhiskerMin },
                                { x: xPos + 0.1, y: actualWhiskerMin }
                            ],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        },
                        {
                            label: `${boxplotName} Upper Cap`,
                            data: [
                                { x: xPos - 0.1, y: actualWhiskerMax },
                                { x: xPos + 0.1, y: actualWhiskerMax }
                            ],
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 0,
                            showLine: true,
                            type: 'line'
                        }
                    );

                    // Add outliers if any
                    if (actualOutliers.length > 0) {
                        const outlierData = actualOutliers.map(outlierValue => ({ x: xPos, y: outlierValue }));
                        datasets.push({
                            label: `${boxplotName} Outliers`,
                            data: outlierData,
                            backgroundColor: color,
                            borderColor: color,
                            borderWidth: 2,
                            pointRadius: 5,
                            showLine: false,
                            type: 'scatter'
                        });
                    }
                }
            }); // End of boxplots.forEach

            // High DPI canvas resize for crisp rendering
            const dpr = window.devicePixelRatio || 1;
            const parentRect = canvas.parentElement.getBoundingClientRect();
            const displayWidth = parentRect.width;
            const displayHeight = parentRect.height;
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            // Do NOT manually scale ctx – Chart.js handles DPR internally

            const chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: isHorizontal ? {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: xAxisConfig.min || (overallMin - 2),
                            max: xAxisConfig.max || (overallMax + 2),
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'Value',
                                color: getTextColor()
                            },
                            grid: {
                                display: showVerticalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                stepSize: xAxisConfig.tickInterval,
                                color: getTextColor(),
                                // Force Chart.js to respect our stepSize by providing a callback
                                callback: function(value, index, values) {
                                    // If we have a specific tickInterval, ensure we only show ticks at those intervals
                                    if (xAxisConfig.tickInterval) {
                                        const step = xAxisConfig.tickInterval;
                                        const min = xAxisConfig.min !== undefined ? xAxisConfig.min : 0;
                                        const adjustedValue = value - min;
                                        if (Math.abs(adjustedValue % step) < 0.000001 || Math.abs(adjustedValue % step - step) < 0.000001) {
                                            // Round to mitigate floating-point artifacts
                                            return Number(value.toFixed(6));
                                        }
                                        return '';
                                    }
                                    return value;
                                }
                            }
                        },
                        y: {
                            type: 'linear',
                            min: -(boxplots.length) * 0.5,
                            max: (boxplots.length) * 0.5,
                            display: boxplots.length > 1,  // Show y-axis labels for multiple boxplots
                            title: {
                                display: boxplots.length > 1,
                                text: 'Groups',
                                color: getTextColor()
                            },
                            ticks: {
                                display: boxplots.length > 1,
                                color: getTextColor(),
                                callback: function(value, index) {
                                    const boxplotIndex = Math.round(value + (boxplots.length - 1) / 2);
                                    if (boxplotIndex >= 0 && boxplotIndex < boxplots.length) {
                                        return boxplots[boxplotIndex].name || `Group ${boxplotIndex + 1}`;
                                    }
                                    return '';
                                }
                            }
                        }
                    } : {
                        x: {
                            type: 'linear',
                            min: -(boxplots.length) * 0.5,
                            max: (boxplots.length) * 0.5,
                            display: boxplots.length > 1,  // Show x-axis labels for multiple boxplots
                            title: {
                                display: boxplots.length > 1,
                                text: 'Groups',
                                color: getTextColor()
                            },
                            ticks: {
                                display: boxplots.length > 1,
                                color: getTextColor(),
                                callback: function(value, index) {
                                    const boxplotIndex = Math.round(value + (boxplots.length - 1) / 2);
                                    if (boxplotIndex >= 0 && boxplotIndex < boxplots.length) {
                                        return boxplots[boxplotIndex].name || `Group ${boxplotIndex + 1}`;
                                    }
                                    return '';
                                }
                            }
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            min: xAxisConfig.min || (overallMin - 2),
                            max: xAxisConfig.max || (overallMax + 2),
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'Value',
                                color: getTextColor()
                            },
                            grid: {
                                display: showHorizontalGrid,
                                color: getGridColor()
                            },
                            ticks: {
                                display: !config.yAxis || !config.yAxis.hideTicks,
                                stepSize: config.yAxis && config.yAxis.tickInterval,
                                color: getTextColor()
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    const dataset = context[0].dataset;
                                    return dataset.label;
                                },
                                label: function(context) {
                                    const dataset = context.dataset;

                                    if (dataset.label.includes('Median')) {
                                        const value = isHorizontal ? context.parsed.x : context.parsed.y;
                                        return `Median: ${value}`;
                                    } else if (dataset.label.includes('Outliers')) {
                                        const value = isHorizontal ? context.parsed.x : context.parsed.y;
                                        return `Outlier: ${value}`;
                                    } else if (dataset.label.includes('Whisker')) {
                                        const value = isHorizontal ? context.parsed.x : context.parsed.y;
                                        return `Whisker endpoint: ${value}`;
                                    } else if (dataset.label.includes('Cap')) {
                                        const value = isHorizontal ? context.parsed.x : context.parsed.y;
                                        return `Whisker cap: ${value}`;
                                    }
                                    const value = isHorizontal ? context.parsed.x : context.parsed.y;
                                    return `Value: ${value}`;
                                }
                            }
                        },
                        datalabels: {
                            display: (ctx) => {
                                const cfg = (chartData.chartConfig || {});
                                return cfg.showPointLabels === true; // off by default
                            },
                            color: getTextColor(),
                            align: 'top',
                            anchor: 'center'
                        }
                    }
                },
                plugins: [{
                    id: 'boxplotBox',
                    afterDraw: function(chart) {
                        const ctx = chart.ctx;
                        const chartArea = chart.chartArea;
                        ctx.save();

                        // Draw boxes for each boxplot
                        const boxplotSpacing = 0.8; // Space between boxplots
                        boxplots.forEach((boxplot, index) => {
                            const { Q1, Q3, name } = boxplot;
                            const color = boxplotColors[index];

                            // Set fill and stroke styles
                            ctx.fillStyle = color + '33'; // Add transparency
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 2;

                            if (isHorizontal) {
                                const xScale = chart.scales.x;
                                const yScale = chart.scales.y;
                                const boxHeight = 30;
                                const yPos = (index - (boxplots.length - 1) / 2) * boxplotSpacing;
                                const centerY = yScale.getPixelForValue(yPos);
                                const q1X = xScale.getPixelForValue(Q1);
                                const q3X = xScale.getPixelForValue(Q3);
                                ctx.fillRect(q1X, centerY - boxHeight/2, q3X - q1X, boxHeight);
                                ctx.strokeRect(q1X, centerY - boxHeight/2, q3X - q1X, boxHeight);
                            } else {
                                const xScale = chart.scales.x;
                                const yScale = chart.scales.y;
                                const boxWidth = 30;
                                const xPos = (index - (boxplots.length - 1) / 2) * boxplotSpacing;
                                const centerX = xScale.getPixelForValue(xPos);
                                const q1Y = yScale.getPixelForValue(Q1);
                                const q3Y = yScale.getPixelForValue(Q3);
                                ctx.fillRect(centerX - boxWidth/2, q3Y, boxWidth, q1Y - q3Y);
                                ctx.strokeRect(centerX - boxWidth/2, q3Y, boxWidth, q1Y - q3Y);
                            }
                        });

                        ctx.restore();
                    }
                }]
            });
            chartInstances[chartId] = chart;
        } else if (chartData.chartType === 'normal') {
            // --------------------------------------------------
            // Normal distribution curve with optional shaded region
            // --------------------------------------------------
            const mean = (typeof chartData.mean === 'number') ? chartData.mean : 0;
            const sd   = (typeof chartData.sd   === 'number' && chartData.sd > 0) ? chartData.sd : 1;
            const shade = chartData.shade || null; // {lower: number|null, upper: number|null}

            const config        = chartData.chartConfig || {};
            const xAxisConfig   = config.xAxis || {};
            const yAxisConfig   = config.yAxis || {};

            const xMin = (typeof xAxisConfig.min === 'number') ? xAxisConfig.min : mean - 3 * sd;
            const xMax = (typeof xAxisConfig.max === 'number') ? xAxisConfig.max : mean + 3 * sd;
            const tickInterval = (typeof xAxisConfig.tickInterval === 'number') ? xAxisConfig.tickInterval : sd;

            const pdf = (x) => (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));

            const numPoints = 120;
            const curvePoints = [];
            const shadePoints = [];

            const peakY = pdf(mean);

            for (let i = 0; i <= numPoints; i++) {
                const x = xMin + (i / numPoints) * (xMax - xMin);
                const rawY = pdf(x);
                const y = rawY / peakY; // scale
                curvePoints.push({ x, y });

                if (shade) {
                    const inLower = (shade.lower == null) || (x >= shade.lower);
                    const inUpper = (shade.upper == null) || (x <= shade.upper);
                    shadePoints.push({ x, y: (inLower && inUpper) ? y : null });
                }
            }

            const datasets = [{
                label: 'Normal Curve',
                type: 'line',
                data: curvePoints,
                borderColor: getTextColor(),
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                tension: 0.15
            }];

            if (shade) {
                const shadeColor = isDarkMode() ? 'rgba(200,200,200,0.35)' : 'rgba(0,0,0,0.25)';
                datasets.push({
                    label: 'Shaded Region',
                    type: 'line',
                    data: shadePoints,
                    borderColor: 'transparent',
                    backgroundColor: shadeColor,
                    fill: 'origin',
                    pointRadius: 0,
                    tension: 0.15,
                    borderWidth: 0
                });
            }

            const chart = new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: xMin,
                            max: xMax,
                            ticks: {
                                stepSize: tickInterval,
                                color: getTextColor()
                            },
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'Value',
                                color: getTextColor()
                            },
                            grid: { display: false }
                        },
                        y: {
                            beginAtZero: true,
                            display: false,
                            min: 0,
                            title: {
                                display: !!yAxisConfig.title,
                                text: yAxisConfig.title || '',
                                color: getTextColor()
                            },
                            grid: { display: false },
                            ticks: { display: false }
                        }
                    },
                    plugins: { legend: { display: false }, datalabels: { display: false } }
                }
            });
            chartInstances[chartId] = chart;
        } else if (chartData.chartType === 'chisquare') {
            // --- New chi-square distribution rendering ---
            const cfg = chartData.chartConfig || {};
            const xAxisConfig = cfg.xAxis || {};
            const yAxisConfig = cfg.yAxis || {};

            // Accept list of degrees of freedom or single df
            const dfList = Array.isArray(chartData.dfList) && chartData.dfList.length > 0 ?
                            chartData.dfList :
                            (typeof chartData.df === 'number' ? [chartData.df] : [1]);

            // Optional labels array; default to "df = k" notation
            const labels = Array.isArray(chartData.labels) && chartData.labels.length === dfList.length ?
                            chartData.labels : dfList.map(df => `df = ${df}`);

            const xMin = typeof xAxisConfig.min === 'number' ? xAxisConfig.min : 0;
            const xMax = typeof xAxisConfig.max === 'number' ? xAxisConfig.max : Math.max(...dfList) * 3.5;
            const numPoints = cfg.numPoints || 120;

            // Lightweight Lanczos approximation for Gamma function
            function gamma(z) {
                const p = [
                    0.99999999999980993,
                    676.5203681218851,
                    -1259.1392167224028,
                    771.32342877765313,
                    -176.61502916214059,
                    12.507343278686905,
                    -0.13857109526572012,
                    9.9843695780195716e-6,
                    1.5056327351493116e-7
                ];
                const g = 7;
                if (z < 0.5) {
                    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
                }
                z -= 1;
                let x = p[0];
                for (let i = 1; i < p.length; i++) {
                    x += p[i] / (z + i);
                }
                const t = z + g + 0.5;
                return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
            }

            // Chi-square probability density function
            function chiSquarePdf(x, k) {
                if (x <= 0) return 0;
                const coeff = 1 / (Math.pow(2, k / 2) * gamma(k / 2));
                return coeff * Math.pow(x, k / 2 - 1) * Math.exp(-x / 2);
            }

            const colorPalette = generateChartColors(dfList.length);
            const datasets = dfList.map((df, idx) => {
                const pts = [];
                for (let i = 0; i <= numPoints; i++) {
                    const xVal = xMin + (i / numPoints) * (xMax - xMin);
                    pts.push({ x: xVal, y: chiSquarePdf(xVal, df) });
                }
                const color = colorPalette[idx % colorPalette.length] || '#36A2EB';
                return {
                    label: labels[idx],
                    type: 'line',
                    data: pts,
                    borderColor: color,
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    tension: 0.15
                };
            });

            // Grid line settings (reuse existing pattern)
            let showHorizontalGrid = true;
            let showVerticalGrid = false;
            if (cfg.gridLines !== undefined) {
                if (typeof cfg.gridLines === 'boolean') {
                    showHorizontalGrid = cfg.gridLines;
                } else if (typeof cfg.gridLines === 'object') {
                    showHorizontalGrid = cfg.gridLines.horizontal !== false;
                    showVerticalGrid = cfg.gridLines.vertical === true;
                }
            }

            const chart = new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: xMin,
                            max: xMax,
                            title: {
                                display: true,
                                text: xAxisConfig.title || 'χ²',
                                color: getTextColor()
                            },
                            ticks: {
                                stepSize: xAxisConfig.tickInterval,
                                color: getTextColor()
                            },
                            grid: {
                                display: showVerticalGrid,
                                color: getGridColor()
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: !!yAxisConfig.title,
                                text: yAxisConfig.title || '',
                                color: getTextColor()
                            },
                            ticks: {
                                display: yAxisConfig.hideTicks !== true,
                                color: getTextColor()
                            },
                            grid: {
                                display: showHorizontalGrid,
                                color: getGridColor()
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: dfList.length > 1,
                            labels: { color: getTextColor() }
                        },
                        datalabels: {
                            display: cfg.showPointLabels === true,
                            color: getTextColor()
                        }
                    }
                }
            });
            chartInstances[chartId] = chart;
        } else if (chartData.chartType === 'numberline') {
            // --------------------------------------------------
            // Custom number line (baseline with ticks & labels)
            // --------------------------------------------------
            const ticksData = Array.isArray(chartData.ticks) && chartData.ticks.length > 0 ? chartData.ticks : [
                { x: -2, label: 'a' },
                { x: -1, label: 'b' },
                { x:  0, label: 'c' },
                { x:  1, label: 'd' },
                { x:  2, label: 'e' }
            ];

            // Determine horizontal span (add small margin so arrow-heads don't clip)
            const xs = ticksData.map(t => t.x);
            const minX = Math.min(...xs) - 0.5;
            const maxX = Math.max(...xs) + 0.5;

            // Build baseline dataset (straight line at y = 0)
            const baselineDS = {
                label: 'Number Line',
                type: 'line',
                data: [ { x: minX, y: 0 }, { x: maxX, y: 0 } ],
                borderColor: getTextColor(),
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0
            };

            // Inline plugin to draw ticks, labels, and arrow-heads
            const numberLinePlugin = {
                id: 'numberLinePlugin',
                afterDraw: (chart) => {
                    const ctx = chart.ctx;
                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;
                    const y0 = yScale.getPixelForValue(0);

                    ctx.save();
                    ctx.strokeStyle = getTextColor();
                    ctx.fillStyle   = getTextColor();
                    ctx.lineWidth   = 2;

                    // Arrow-heads
                    const arrowSize = 6;
                    const leftPx  = xScale.getPixelForValue(minX);
                    const rightPx = xScale.getPixelForValue(maxX);

                    // Left arrow
                    ctx.beginPath();
                    ctx.moveTo(leftPx + arrowSize, y0 - arrowSize);
                    ctx.lineTo(leftPx, y0);
                    ctx.lineTo(leftPx + arrowSize, y0 + arrowSize);
                    ctx.closePath();
                    ctx.fill();

                    // Right arrow
                    ctx.beginPath();
                    ctx.moveTo(rightPx - arrowSize, y0 - arrowSize);
                    ctx.lineTo(rightPx, y0);
                    ctx.lineTo(rightPx - arrowSize, y0 + arrowSize);
                    ctx.closePath();
                    ctx.fill();

                    // Ticks & labels
                    const tickHeight = 12; // increased for visibility
                    ctx.font = '14px sans-serif';
                    ctx.textAlign = 'center';
                    ticksData.forEach(tk => {
                        const xPx = xScale.getPixelForValue(tk.x);
                        // Tick mark
                        if (tk.drawTick !== false) {
                          ctx.beginPath();
                          ctx.moveTo(xPx, y0 - tickHeight);
                          ctx.lineTo(xPx, y0 + tickHeight);
                          ctx.stroke();
                        }
                        // Top label
                        if (tk.label || tk.topLabel) {
                          ctx.textBaseline = 'bottom';
                          ctx.fillText(tk.label || tk.topLabel, xPx, y0 - tickHeight - 4);
                        }
                        // Bottom label
                        if (tk.bottomLabel || tk.valueLabel) {
                          ctx.textBaseline = 'top';
                          ctx.fillText(tk.bottomLabel || tk.valueLabel, xPx, y0 + tickHeight + 4);
                        }
                    });
                    ctx.restore();
                }
            };

            const xAxisCfg = chartData.xAxis || {};

            const chart = new Chart(ctx, {
                type: 'line',
                data: { datasets: [baselineDS] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: {
                            type: 'linear',
                            min: xAxisCfg.min !== undefined ? xAxisCfg.min : minX,
                            max: xAxisCfg.max !== undefined ? xAxisCfg.max : maxX,
                            ticks: {
                                display: false
                            },
                            grid: { display: false },
                            title: {
                                display: !!xAxisCfg.title,
                                text: xAxisCfg.title || '',
                                color: getTextColor()
                            }
                        },
                        y: {
                            min: -1,
                            max: 1,
                            display: false,
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false }
                    }
                },
                plugins: [numberLinePlugin]
            });
            chartInstances[chartId] = chart;
        }
    }, 100);

    return chartHtml;
}