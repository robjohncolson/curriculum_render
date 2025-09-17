// Data Management Module
// Note: These variables are declared in the main index.html to ensure proper initialization order
// This module provides functions to manage them

// Initialize class data structure
function initClassData() {
    if (!classData[currentUnit]) {
        classData[currentUnit] = {
            questions: {},
            lessons: {}
        };
    }
    
    currentQuestions.forEach(q => {
        if (!classData[currentUnit].questions[q.id]) {
            classData[currentUnit].questions[q.id] = {
                responses: [],
                attempts: {}
            };
        }
    });
}

// Save class data to localStorage
function saveClassData() {
    try {
        const dataToSave = JSON.stringify(classData);
        localStorage.setItem('apStatsClassData', dataToSave);
        console.log('Data saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

// Calculate user badges
function calculateBadges(username) {
    const badges = [];
    let totalAnswered = 0;
    let totalCorrect = 0;
    
    Object.values(classData).forEach(unitData => {
        Object.values(unitData.questions).forEach(questionData => {
            const userResponses = questionData.responses.filter(r => r.username === username);
            if (userResponses.length > 0) {
                totalAnswered++;
                if (userResponses.some(r => r.isCorrect)) {
                    totalCorrect++;
                }
            }
        });
    });
    
    // Award badges based on performance
    if (totalAnswered >= 5) badges.push('🎯 Active Learner');
    if (totalAnswered >= 10) badges.push('📚 Knowledge Seeker');
    if (totalAnswered >= 20) badges.push('🌟 Quiz Master');
    if (totalCorrect >= 5) badges.push('✨ Problem Solver');
    if (totalCorrect >= 10) badges.push('🏆 Statistics Pro');
    
    const accuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
    if (accuracy >= 80 && totalAnswered >= 5) badges.push('🎓 Accuracy Expert');
    if (accuracy === 100 && totalAnswered >= 3) badges.push('💯 Perfect Score');
    
    return badges;
}

// Check if question is answered
function isQuestionAnswered(questionId) {
    if (!classData[currentUnit]) return false;
    const questionData = classData[currentUnit].questions[questionId];
    if (!questionData) return false;
    return questionData.responses.some(r => r.username === currentUsername);
}

// Get attempt count for a question
function getAttemptCount(questionId) {
    if (!classData[currentUnit]) return 0;
    const questionData = classData[currentUnit].questions[questionId];
    if (!questionData || !questionData.attempts[currentUsername]) return 0;
    return questionData.attempts[currentUsername];
}

// Check if retry is allowed
function canRetry(questionId) {
    const maxAttempts = 3;
    const attempts = getAttemptCount(questionId);
    return attempts < maxAttempts && !isQuestionAnswered(questionId);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        currentUsername,
        classData,
        currentUnit,
        currentQuestions,
        questionOrder,
        currentQuestionIndex,
        chartInstances,
        initClassData,
        saveClassData,
        calculateBadges,
        isQuestionAnswered,
        getAttemptCount,
        canRetry
    };
}