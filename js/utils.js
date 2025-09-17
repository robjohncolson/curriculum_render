// Utility Functions Module

// Chart color generation
function generateChartColors(count) {
    const colors = [];
    for(let i = 0; i < count; i++) {
        const hue = (i * 360 / count) % 360;
        colors.push(`hsl(${hue}, 70%, 50%)`);
    }
    return colors;
}

// Theme detection
function isDarkMode() {
    return document.body.classList.contains('dark-theme');
}

function getTextColor() {
    return isDarkMode() ? '#e0e0e0' : '#333';
}

function getGridColor() {
    return isDarkMode() ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
}

function getScatterPointColor() {
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'];
    return isDarkMode() 
        ? colors.map(c => c + 'CC')
        : colors;
}

// Random username generation
function generateRandomUsername() {
    const adjectives = [
        'Swift', 'Clever', 'Bright', 'Quick', 'Sharp',
        'Keen', 'Smart', 'Wise', 'Nimble', 'Astute',
        'Curious', 'Eager', 'Bold', 'Brave', 'Daring',
        'Happy', 'Jolly', 'Cheerful', 'Merry', 'Playful'
    ];
    
    const nouns = [
        'Scholar', 'Student', 'Learner', 'Thinker', 'Mind',
        'Brain', 'Genius', 'Sage', 'Expert', 'Master',
        'Phoenix', 'Eagle', 'Tiger', 'Lion', 'Dragon',
        'Wizard', 'Knight', 'Champion', 'Hero', 'Legend'
    ];
    
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 1000);
    
    return `${randomAdj}${randomNoun}${randomNum}`;
}

// Array utility functions
function getMostFrequent(arr) {
    const counts = {};
    let maxCount = 0;
    let mostFrequent = null;
    
    arr.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
        if (counts[item] > maxCount) {
            maxCount = counts[item];
            mostFrequent = item;
        }
    });
    
    return mostFrequent;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateChartColors,
        isDarkMode,
        getTextColor,
        getGridColor,
        getScatterPointColor,
        generateRandomUsername,
        getMostFrequent
    };
}