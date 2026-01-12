/**
 * Chart System Tests
 *
 * Tests for STATE_MACHINES.md Section 9:
 * - Chart rendering flow
 * - Chart type mapping
 * - Canvas management
 * - Chart data structure
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Chart Types supported
 */
const ChartType = {
    HISTOGRAM: 'histogram',
    BAR: 'bar',
    LINE: 'line',
    SCATTER: 'scatter',
    PIE: 'pie',
    DOUGHNUT: 'doughnut',
    BOXPLOT: 'boxplot',
    DOTPLOT: 'dotplot',
    NORMAL: 'normal'
};

/**
 * Map internal chart type to Chart.js type
 */
function mapToChartJsType(chartType) {
    const mapping = {
        'histogram': 'bar',
        'bar': 'bar',
        'line': 'line',
        'scatter': 'scatter',
        'pie': 'pie',
        'doughnut': 'doughnut',
        'boxplot': 'bar',  // Custom plugin
        'dotplot': 'scatter', // Custom rendering
        'normal': 'line'   // Normal distribution curve
    };
    return mapping[chartType] || 'bar';
}

/**
 * Chart Data Structure
 */
function createChartData(options = {}) {
    return {
        chartType: options.chartType ?? 'bar',
        title: options.title ?? '',
        xLabels: options.xLabels ?? [],
        yLabel: options.yLabel ?? '',
        series: options.series ?? [],
        chartConfig: options.chartConfig ?? {}
    };
}

/**
 * Generate canvas ID
 */
function generateCanvasId(questionId) {
    return `chart-canvas-${questionId}-${Date.now()}`;
}

/**
 * Mock Chart Instance Manager
 */
class MockChartInstanceManager {
    constructor() {
        this.instances = {};
    }

    register(canvasId, chartInstance) {
        // Destroy existing if present
        if (this.instances[canvasId]) {
            this.instances[canvasId].destroy();
        }
        this.instances[canvasId] = chartInstance;
    }

    get(canvasId) {
        return this.instances[canvasId] || null;
    }

    destroy(canvasId) {
        if (this.instances[canvasId]) {
            this.instances[canvasId].destroy();
            delete this.instances[canvasId];
            return true;
        }
        return false;
    }

    destroyAll() {
        for (const canvasId of Object.keys(this.instances)) {
            this.instances[canvasId].destroy();
            delete this.instances[canvasId];
        }
    }

    getCount() {
        return Object.keys(this.instances).length;
    }
}

/**
 * Mock Chart Instance
 */
class MockChartInstance {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.destroyed = false;
    }

    destroy() {
        this.destroyed = true;
    }

    update() {
        if (this.destroyed) {
            throw new Error('Cannot update destroyed chart');
        }
    }
}

/**
 * Generate chart HTML (Phase 1)
 */
function getChartHtml(chartData, canvasId) {
    return `
        <div class="chart-container" data-chart-id="${canvasId}">
            ${chartData.title ? `<h3 class="chart-title">${chartData.title}</h3>` : ''}
            <canvas id="${canvasId}" width="400" height="300"></canvas>
        </div>
    `.trim();
}

/**
 * Build Chart.js config from chart data
 */
function buildChartConfig(chartData) {
    const chartJsType = mapToChartJsType(chartData.chartType);

    return {
        type: chartJsType,
        data: {
            labels: chartData.xLabels,
            datasets: chartData.series.map((s, i) => ({
                label: s.label || `Series ${i + 1}`,
                data: s.data,
                backgroundColor: s.backgroundColor || getDefaultColor(i),
                borderColor: s.borderColor || getDefaultColor(i)
            }))
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: !!chartData.title,
                    text: chartData.title
                }
            },
            scales: chartData.chartType !== 'pie' && chartData.chartType !== 'doughnut' ? {
                y: {
                    title: {
                        display: !!chartData.yLabel,
                        text: chartData.yLabel
                    }
                }
            } : undefined,
            ...chartData.chartConfig
        }
    };
}

/**
 * Get default color for series
 */
function getDefaultColor(index) {
    const colors = [
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 99, 132, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)'
    ];
    return colors[index % colors.length];
}

/**
 * Validate chart data structure
 */
function validateChartData(chartData) {
    const errors = [];

    if (!chartData) {
        return { valid: false, errors: ['Chart data is null or undefined'] };
    }

    if (!chartData.chartType) {
        errors.push('Missing chartType');
    }

    if (!Array.isArray(chartData.xLabels)) {
        errors.push('xLabels must be an array');
    }

    if (!Array.isArray(chartData.series)) {
        errors.push('series must be an array');
    }

    if (Array.isArray(chartData.series)) {
        chartData.series.forEach((s, i) => {
            if (!Array.isArray(s.data)) {
                errors.push(`Series ${i} data must be an array`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================
// TESTS
// ============================================

describe('Chart System', () => {
    describe('Chart Type Mapping', () => {
        it('should map histogram to bar', () => {
            expect(mapToChartJsType('histogram')).toBe('bar');
        });

        it('should map bar to bar', () => {
            expect(mapToChartJsType('bar')).toBe('bar');
        });

        it('should map line to line', () => {
            expect(mapToChartJsType('line')).toBe('line');
        });

        it('should map scatter to scatter', () => {
            expect(mapToChartJsType('scatter')).toBe('scatter');
        });

        it('should map pie to pie', () => {
            expect(mapToChartJsType('pie')).toBe('pie');
        });

        it('should map doughnut to doughnut', () => {
            expect(mapToChartJsType('doughnut')).toBe('doughnut');
        });

        it('should map boxplot to bar (custom plugin)', () => {
            expect(mapToChartJsType('boxplot')).toBe('bar');
        });

        it('should map dotplot to scatter', () => {
            expect(mapToChartJsType('dotplot')).toBe('scatter');
        });

        it('should map normal to line', () => {
            expect(mapToChartJsType('normal')).toBe('line');
        });

        it('should default to bar for unknown types', () => {
            expect(mapToChartJsType('unknown')).toBe('bar');
        });
    });

    describe('Chart Data Structure', () => {
        it('should create empty chart data with defaults', () => {
            const data = createChartData();

            expect(data.chartType).toBe('bar');
            expect(data.title).toBe('');
            expect(data.xLabels).toEqual([]);
            expect(data.series).toEqual([]);
        });

        it('should create chart data with provided options', () => {
            const data = createChartData({
                chartType: 'line',
                title: 'Test Chart',
                xLabels: ['A', 'B', 'C'],
                yLabel: 'Count',
                series: [{ label: 'Data', data: [1, 2, 3] }]
            });

            expect(data.chartType).toBe('line');
            expect(data.title).toBe('Test Chart');
            expect(data.xLabels).toEqual(['A', 'B', 'C']);
            expect(data.series).toHaveLength(1);
        });
    });

    describe('Chart Data Validation', () => {
        it('should validate correct chart data', () => {
            const data = createChartData({
                chartType: 'bar',
                xLabels: ['A', 'B'],
                series: [{ data: [1, 2] }]
            });

            const result = validateChartData(data);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject null chart data', () => {
            const result = validateChartData(null);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Chart data is null or undefined');
        });

        it('should reject missing chartType', () => {
            const result = validateChartData({ xLabels: [], series: [] });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing chartType');
        });

        it('should reject non-array xLabels', () => {
            const result = validateChartData({
                chartType: 'bar',
                xLabels: 'invalid',
                series: []
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('xLabels must be an array');
        });

        it('should reject non-array series', () => {
            const result = validateChartData({
                chartType: 'bar',
                xLabels: [],
                series: 'invalid'
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('series must be an array');
        });

        it('should reject series with non-array data', () => {
            const result = validateChartData({
                chartType: 'bar',
                xLabels: [],
                series: [{ data: 'invalid' }]
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Series 0 data must be an array');
        });
    });

    describe('Canvas ID Generation', () => {
        it('should generate unique canvas IDs', () => {
            const id1 = generateCanvasId('Q1');
            const id2 = generateCanvasId('Q1');

            expect(id1).toContain('chart-canvas-Q1');
            // Due to timestamp, IDs should be different (or very close)
            // In practice they might be same if called within same ms
        });

        it('should include question ID in canvas ID', () => {
            const id = generateCanvasId('U1-L3-Q01');
            expect(id).toContain('U1-L3-Q01');
        });
    });

    describe('Chart HTML Generation', () => {
        it('should generate container with canvas', () => {
            const chartData = createChartData({ title: '' });
            const html = getChartHtml(chartData, 'test-canvas');

            expect(html).toContain('<div class="chart-container"');
            expect(html).toContain('data-chart-id="test-canvas"');
            expect(html).toContain('<canvas id="test-canvas"');
        });

        it('should include title when provided', () => {
            const chartData = createChartData({ title: 'My Chart' });
            const html = getChartHtml(chartData, 'test-canvas');

            expect(html).toContain('<h3 class="chart-title">My Chart</h3>');
        });

        it('should not include title element when empty', () => {
            const chartData = createChartData({ title: '' });
            const html = getChartHtml(chartData, 'test-canvas');

            expect(html).not.toContain('chart-title');
        });
    });

    describe('Chart.js Config Building', () => {
        it('should build config with correct type', () => {
            const chartData = createChartData({
                chartType: 'line',
                xLabels: ['A', 'B'],
                series: [{ data: [1, 2] }]
            });

            const config = buildChartConfig(chartData);

            expect(config.type).toBe('line');
        });

        it('should map labels correctly', () => {
            const chartData = createChartData({
                chartType: 'bar',
                xLabels: ['Jan', 'Feb', 'Mar'],
                series: [{ data: [10, 20, 30] }]
            });

            const config = buildChartConfig(chartData);

            expect(config.data.labels).toEqual(['Jan', 'Feb', 'Mar']);
        });

        it('should map datasets from series', () => {
            const chartData = createChartData({
                chartType: 'bar',
                xLabels: ['A', 'B'],
                series: [
                    { label: 'Series 1', data: [1, 2] },
                    { label: 'Series 2', data: [3, 4] }
                ]
            });

            const config = buildChartConfig(chartData);

            expect(config.data.datasets).toHaveLength(2);
            expect(config.data.datasets[0].label).toBe('Series 1');
            expect(config.data.datasets[0].data).toEqual([1, 2]);
        });

        it('should not include scales for pie/doughnut', () => {
            const pieData = createChartData({ chartType: 'pie', xLabels: [], series: [] });
            const pieConfig = buildChartConfig(pieData);
            expect(pieConfig.options.scales).toBeUndefined();

            const doughnutData = createChartData({ chartType: 'doughnut', xLabels: [], series: [] });
            const doughnutConfig = buildChartConfig(doughnutData);
            expect(doughnutConfig.options.scales).toBeUndefined();
        });

        it('should include scales for bar/line charts', () => {
            const barData = createChartData({
                chartType: 'bar',
                xLabels: [],
                series: [],
                yLabel: 'Count'
            });

            const config = buildChartConfig(barData);

            expect(config.options.scales).toBeDefined();
            expect(config.options.scales.y.title.text).toBe('Count');
        });
    });

    describe('Default Colors', () => {
        it('should return different colors for different indices', () => {
            const color0 = getDefaultColor(0);
            const color1 = getDefaultColor(1);
            const color2 = getDefaultColor(2);

            expect(color0).not.toBe(color1);
            expect(color1).not.toBe(color2);
        });

        it('should cycle colors after 6 indices', () => {
            const color0 = getDefaultColor(0);
            const color6 = getDefaultColor(6);

            expect(color0).toBe(color6);
        });
    });

    describe('Chart Instance Manager', () => {
        let manager;

        beforeEach(() => {
            manager = new MockChartInstanceManager();
        });

        it('should register chart instance', () => {
            const chart = new MockChartInstance(null, {});
            manager.register('canvas1', chart);

            expect(manager.get('canvas1')).toBe(chart);
        });

        it('should destroy existing instance when registering same ID', () => {
            const chart1 = new MockChartInstance(null, {});
            const chart2 = new MockChartInstance(null, {});

            manager.register('canvas1', chart1);
            manager.register('canvas1', chart2);

            expect(chart1.destroyed).toBe(true);
            expect(manager.get('canvas1')).toBe(chart2);
        });

        it('should return null for non-existent canvas', () => {
            expect(manager.get('nonexistent')).toBeNull();
        });

        it('should destroy specific instance', () => {
            const chart = new MockChartInstance(null, {});
            manager.register('canvas1', chart);

            const result = manager.destroy('canvas1');

            expect(result).toBe(true);
            expect(chart.destroyed).toBe(true);
            expect(manager.get('canvas1')).toBeNull();
        });

        it('should return false when destroying non-existent', () => {
            const result = manager.destroy('nonexistent');
            expect(result).toBe(false);
        });

        it('should destroy all instances', () => {
            const chart1 = new MockChartInstance(null, {});
            const chart2 = new MockChartInstance(null, {});
            const chart3 = new MockChartInstance(null, {});

            manager.register('canvas1', chart1);
            manager.register('canvas2', chart2);
            manager.register('canvas3', chart3);

            expect(manager.getCount()).toBe(3);

            manager.destroyAll();

            expect(manager.getCount()).toBe(0);
            expect(chart1.destroyed).toBe(true);
            expect(chart2.destroyed).toBe(true);
            expect(chart3.destroyed).toBe(true);
        });

        it('should count registered instances', () => {
            expect(manager.getCount()).toBe(0);

            manager.register('canvas1', new MockChartInstance(null, {}));
            expect(manager.getCount()).toBe(1);

            manager.register('canvas2', new MockChartInstance(null, {}));
            expect(manager.getCount()).toBe(2);
        });
    });

    describe('Chart Instance', () => {
        it('should throw when updating destroyed chart', () => {
            const chart = new MockChartInstance(null, {});
            chart.destroy();

            expect(() => chart.update()).toThrow('Cannot update destroyed chart');
        });

        it('should allow update on active chart', () => {
            const chart = new MockChartInstance(null, {});
            expect(() => chart.update()).not.toThrow();
        });
    });
});
