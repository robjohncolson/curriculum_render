function generateChartColors(count) {
    // Generate colors based on current theme
    const isDark = isDarkMode();
    const colors = isDark ? [
        '#5BC0EB', '#FF6B6B', '#4ECDC4', '#FFD700', '#95E1D3',
        '#F38181', '#AA96DA', '#8FCACA', '#FFC93C', '#6C5CE7'
    ] : [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
    ];
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
}

function isDarkMode() {
    return document.body.classList.contains('dark-theme');
}

function getCSSVariable(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function getTextColor() {
    // Get the chart text color from CSS variables
    const varName = isDarkMode() ? '--chart-text' : '--chart-text';
    const color = getCSSVariable(varName);
    return color || (isDarkMode() ? '#e0e0e0' : '#333333');
}

function getGridColor() {
    // Get the chart grid color from CSS variables
    const varName = isDarkMode() ? '--chart-grid' : '--chart-grid';
    const color = getCSSVariable(varName);
    return color || (isDarkMode() ? '#444444' : '#e0e0e0');
}

function getScatterPointColor() {
    // Get the chart point color from CSS variables
    const varName = isDarkMode() ? '--chart-point' : '--chart-point';
    const color = getCSSVariable(varName);
    return color || (isDarkMode() ? '#5BC0EB' : '#36A2EB');
}