function generateChartColors(count) {
    const colors = [
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

function getTextColor() {
    return isDarkMode() ? '#e0e0e0' : '#333333';
}

function getGridColor() {
    return isDarkMode() ? '#444444' : '#e0e0e0';
}

function getScatterPointColor() {
    return isDarkMode() ? '#5BC0EB' : '#36A2EB';
}