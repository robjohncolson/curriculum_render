// frq_grader.js - Client-side FRQ grading integration
// Part of AP Statistics Consensus Quiz
// Integrates with Railway server's Groq-based grading endpoint

// ========================================
// CONFIGURATION
// ========================================

const FRQ_GRADER_CONFIG = {
  // Minimum answer length to attempt grading
  minAnswerLength: 20,
  // Maximum retries on failure
  maxRetries: 2,
  // Delay between retries (ms)
  retryDelay: 1000,
  // Available models (fetched from server)
  availableModels: [],
  // Selected model (null = use server default)
  selectedModel: null
};

// ========================================
// GRADING API
// ========================================

/**
 * Fetch available AI models from the server
 * @returns {Promise<Array>} Array of available models
 */
async function fetchAvailableModels() {
  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/grading-models`);
    const data = await response.json();

    if (data.models && Array.isArray(data.models)) {
      FRQ_GRADER_CONFIG.availableModels = data.models;
      // Set default if not already set
      if (!FRQ_GRADER_CONFIG.selectedModel && data.default) {
        FRQ_GRADER_CONFIG.selectedModel = data.default;
      }
      console.log('FRQ Grader: Available models:', data.models.map(m => m.name).join(', '));
      return data.models;
    }
  } catch (error) {
    console.warn('FRQ Grader: Could not fetch models:', error.message);
  }
  return [];
}

/**
 * Submit an FRQ answer for AI grading
 * @param {Object} params - Grading parameters
 * @param {string} params.questionId - The question ID (e.g., "U1-L10-Q04")
 * @param {string} params.questionText - The full question prompt
 * @param {string} params.studentAnswer - The student's answer text
 * @param {Array} params.rubric - The scoring rubric array from curriculum.js
 * @param {string} [params.modelAnswer] - Optional model answer for reference
 * @param {string} [params.username] - The student's username
 * @param {string} [params.preferredModel] - Optional model ID to use
 * @returns {Promise<Object>} The grading result
 */
async function gradeFRQAnswer(params) {
  const {
    questionId,
    questionText,
    studentAnswer,
    rubric,
    modelAnswer,
    username,
    preferredModel
  } = params;

  // Validation
  if (!studentAnswer || studentAnswer.trim().length < FRQ_GRADER_CONFIG.minAnswerLength) {
    throw new Error(`Answer must be at least ${FRQ_GRADER_CONFIG.minAnswerLength} characters to grade`);
  }

  if (!rubric || !Array.isArray(rubric) || rubric.length === 0) {
    throw new Error('Valid rubric is required for grading');
  }

  const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';

  let lastError;
  for (let attempt = 0; attempt <= FRQ_GRADER_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(`${serverUrl}/api/grade-frq`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          questionId,
          questionText,
          studentAnswer: studentAnswer.trim(),
          rubric,
          modelAnswer,
          username: username || window.currentUsername || localStorage.getItem('consensusUsername'),
          preferredModel: preferredModel || FRQ_GRADER_CONFIG.selectedModel
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Grading failed');
      }

      return data.grade;
    } catch (error) {
      lastError = error;
      console.warn(`Grading attempt ${attempt + 1} failed:`, error.message);

      if (attempt < FRQ_GRADER_CONFIG.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, FRQ_GRADER_CONFIG.retryDelay));
      }
    }
  }

  throw lastError;
}

/**
 * Get a student's previous FRQ grades
 * @param {string} username - The student's username
 * @param {string} [questionId] - Optional specific question ID
 * @returns {Promise<Array>} Array of grade records
 */
async function getFRQGrades(username, questionId) {
  const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';

  let url = `${serverUrl}/api/frq-grades/${encodeURIComponent(username)}`;
  if (questionId) {
    url += `?questionId=${encodeURIComponent(questionId)}`;
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch grades');
  }

  return data.grades || [];
}

/**
 * Get grading statistics for a question (teacher use)
 * @param {string} questionId - The question ID
 * @returns {Promise<Object>} Statistics object
 */
async function getFRQStats(questionId) {
  const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';

  const response = await fetch(`${serverUrl}/api/frq-stats/${encodeURIComponent(questionId)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch stats');
  }

  return data;
}

// ========================================
// UI HELPERS
// ========================================

/**
 * Create a grade display element from a grade result
 * @param {Object} grade - The grade result from the API
 * @returns {HTMLElement} The grade display element
 */
function createGradeDisplay(grade) {
  const container = document.createElement('div');
  container.className = 'frq-grade-result';

  // Score header
  const scorePercent = Math.round((grade.totalPoints / grade.maxPoints) * 100);
  const scoreClass = scorePercent >= 80 ? 'excellent' :
                     scorePercent >= 60 ? 'good' :
                     scorePercent >= 40 ? 'fair' : 'needs-work';

  // Format model name for display
  const modelDisplay = grade.model || 'AI';

  container.innerHTML = `
    <div class="frq-grade-header ${scoreClass}">
      <div class="frq-score">
        <span class="frq-score-value">${grade.totalPoints}</span>
        <span class="frq-score-max">/ ${grade.maxPoints}</span>
      </div>
      <div class="frq-score-percent">${scorePercent}%</div>
    </div>

    <div class="frq-grade-parts">
      ${(grade.parts || []).map(part => `
        <div class="frq-grade-part ${(part.score || 'i').toLowerCase()}">
          <div class="frq-part-header">
            <span class="frq-part-label">Part ${(part.part || '?').toUpperCase()}</span>
            <span class="frq-part-score score-${(part.score || 'i').toLowerCase()}">${part.score || '?'}</span>
            <span class="frq-part-points">${part.points || 0}/${part.maxPoints || 0}</span>
          </div>
          <div class="frq-part-feedback">${escapeHtml(part.feedback || part.justification || '')}</div>
        </div>
      `).join('')}
    </div>

    ${grade.overallFeedback ? `
    <div class="frq-grade-summary">
      <div class="frq-overall-feedback">${escapeHtml(grade.overallFeedback)}</div>

      ${grade.strengths && grade.strengths.length > 0 ? `
        <div class="frq-strengths">
          <strong>Strengths:</strong>
          <ul>${grade.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${grade.improvements && grade.improvements.length > 0 ? `
        <div class="frq-improvements">
          <strong>To Improve:</strong>
          <ul>${grade.improvements.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
      ` : ''}
    </div>
    ` : ''}

    <div class="frq-grade-meta">
      <span class="frq-grade-model">${modelDisplay}</span>
      <span class="frq-grade-time">${new Date(grade.gradedAt).toLocaleTimeString()}</span>
    </div>
  `;

  return container;
}

/**
 * Show a grading loading state
 * @param {HTMLElement} container - The container to show loading in
 */
function showGradingLoading(container) {
  container.innerHTML = `
    <div class="frq-grading-loading">
      <div class="frq-loading-spinner"></div>
      <p>Grading your response...</p>
      <p class="frq-loading-hint">This usually takes 5-10 seconds</p>
    </div>
  `;
}

/**
 * Show a grading error
 * @param {HTMLElement} container - The container to show error in
 * @param {string} message - The error message
 * @param {Function} [retryFn] - Optional retry function
 */
function showGradingError(container, message, retryFn) {
  container.innerHTML = `
    <div class="frq-grading-error">
      <p>❌ ${escapeHtml(message)}</p>
      ${retryFn ? '<button class="frq-retry-btn" onclick="this.retryFn()">Try Again</button>' : ''}
    </div>
  `;

  if (retryFn) {
    const btn = container.querySelector('.frq-retry-btn');
    if (btn) btn.retryFn = retryFn;
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// INTEGRATION WITH QUIZ SYSTEM
// ========================================

/**
 * Add a "Get AI Feedback" button to an FRQ question
 * @param {string} questionId - The question ID
 * @param {Object} questionData - The question data from curriculum.js
 */
async function addAIGradingButton(questionId, questionData) {
  // Only add to FRQ questions with rubrics
  // Check both question.scoring and question.solution.scoring (curriculum uses the latter)
  const scoring = questionData.scoring || questionData.solution?.scoring;
  if (!scoring || !scoring.rubric) {
    return;
  }

  const questionContainer = document.querySelector(`[data-question-id="${questionId}"]`);
  if (!questionContainer) return;

  // Look for answer-section containing frq-textarea, or frq-container, or reasoning-container
  const textareaContainer = questionContainer.querySelector('.answer-section') ||
                           questionContainer.querySelector('.frq-container') ||
                           questionContainer.querySelector('.reasoning-container');
  if (!textareaContainer) return;

  // Check if controls already exist
  if (textareaContainer.querySelector('.ai-grading-controls')) return;

  // Fetch available models if not already loaded
  if (FRQ_GRADER_CONFIG.availableModels.length === 0) {
    await fetchAvailableModels();
  }

  // Create container for button and model selector
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'ai-grading-controls';

  // Create model selector dropdown
  const modelSelect = document.createElement('select');
  modelSelect.className = 'ai-model-select';
  modelSelect.id = `ai-model-select-${questionId}`;
  modelSelect.title = 'Select AI model for grading';

  // Add options
  if (FRQ_GRADER_CONFIG.availableModels.length > 0) {
    FRQ_GRADER_CONFIG.availableModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      if (model.id === FRQ_GRADER_CONFIG.selectedModel) {
        option.selected = true;
      }
      modelSelect.appendChild(option);
    });
  } else {
    // Fallback if models couldn't be fetched
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Default Model';
    modelSelect.appendChild(option);
  }

  // Save selection when changed
  modelSelect.onchange = () => {
    FRQ_GRADER_CONFIG.selectedModel = modelSelect.value;
    console.log('FRQ Grader: Model changed to', modelSelect.value);
  };

  // Create the grade button
  const gradeBtn = document.createElement('button');
  gradeBtn.className = 'ai-grade-btn action-button';
  gradeBtn.innerHTML = '🤖 Grade';
  gradeBtn.onclick = () => handleAIGrading(questionId, questionData, textareaContainer);

  // Add elements to container
  controlsContainer.appendChild(modelSelect);
  controlsContainer.appendChild(gradeBtn);

  // Add after the textarea
  const textarea = textareaContainer.querySelector('textarea');
  if (textarea) {
    textarea.parentNode.insertBefore(controlsContainer, textarea.nextSibling);
  } else {
    textareaContainer.appendChild(controlsContainer);
  }
}

/**
 * Get student's chart data for a question (if any)
 * Uses global classData and currentUsername variables (managed by data_manager.js)
 * @param {string} questionId - The question ID
 * @returns {Object|null} Chart data in SIF format, or null if none
 */
function getStudentChartData(questionId) {
  try {
    // Use global classData (managed by data_manager.js, stored in IndexedDB)
    const data = window.classData;
    const username = window.currentUsername || localStorage.getItem('consensusUsername');

    if (!username || !data?.users?.[username]) {
      console.log('FRQ Grader: No user data found for', username);
      return null;
    }

    const userData = data.users[username];

    // Check charts object first (primary storage for chart wizard data)
    let chartData = userData.charts?.[questionId];

    // If not in charts, check answers (might be stored there too)
    if (!chartData) {
      const answerData = userData.answers?.[questionId];
      // Answer could be {value: <sif>, timestamp} or just the value
      const answerValue = answerData?.value || answerData;

      // Check if answerValue is a chart SIF object
      if (answerValue && typeof answerValue === 'object' && (answerValue.chartType || answerValue.type)) {
        chartData = answerValue;
      }
    }

    // Validate it's actually chart data (has chartType or type property)
    if (chartData && typeof chartData === 'object') {
      // SIF format uses 'type' property, some older formats use 'chartType'
      if (chartData.chartType || chartData.type) {
        console.log('FRQ Grader: Found chart data for', questionId, '- type:', chartData.chartType || chartData.type);
        return chartData;
      }
    }

    // If stored as JSON string, try to parse
    if (chartData && typeof chartData === 'string') {
      try {
        const parsed = JSON.parse(chartData);
        if (parsed.chartType || parsed.type) {
          console.log('FRQ Grader: Parsed chart data from string for', questionId);
          return parsed;
        }
      } catch (e) { /* not JSON */ }
    }

    console.log('FRQ Grader: No chart data found for', questionId);
    return null;
  } catch (e) {
    console.error('Error getting chart data:', e);
    return null;
  }
}

/**
 * Format chart data for AI grading context
 * Handles SIF format from chart_wizard.js
 * @param {Object} chartData - Chart SIF data
 * @returns {string} Human-readable description of the chart
 */
function formatChartForAI(chartData) {
  if (!chartData) return '';

  // SIF uses 'type', legacy uses 'chartType'
  const chartType = chartData.type || chartData.chartType || 'unknown';

  let desc = `\n\nSTUDENT'S CHART SUBMISSION:\n`;
  desc += `Chart Type: ${chartType}\n`;

  // Handle various title/label formats
  if (chartData.title) desc += `Title: ${chartData.title}\n`;

  // SIF format uses options.xLabel/yLabel or direct xLabel/yLabel
  const xLabel = chartData.xLabel || chartData.options?.xLabel || chartData.axes?.x?.label;
  const yLabel = chartData.yLabel || chartData.options?.yLabel || chartData.axes?.y?.label;
  if (xLabel) desc += `X-Axis Label: ${xLabel}\n`;
  if (yLabel) desc += `Y-Axis Label: ${yLabel}\n`;

  // Track total data points for completeness summary
  let totalDataPoints = 0;
  let nonZeroDataPoints = 0;

  // HISTOGRAM: SIF format uses binning.bins array of {label, value}
  if (chartType === 'histogram' && chartData.binning?.bins) {
    const bins = chartData.binning.bins;
    desc += `\nHistogram Bins:\n`;
    bins.forEach((bin, i) => {
      desc += `  Bin ${i + 1}: "${bin.label || 'unlabeled'}" = ${bin.value}\n`;
    });
    const nonZeroBins = bins.filter(b => b.value !== 0 && b.value !== null && b.value !== undefined && b.value !== '');
    desc += `\n  -> ${bins.length} total bins defined\n`;
    desc += `  -> ${nonZeroBins.length} bins with non-zero frequency values\n`;
    totalDataPoints = bins.length;
    nonZeroDataPoints = nonZeroBins.length;
  }

  // BAR CHART: SIF uses categories + series with values array
  if (chartType === 'bar') {
    if (chartData.categories && Array.isArray(chartData.categories)) {
      desc += `Categories: [${chartData.categories.join(', ')}]\n`;
      desc += `  -> ${chartData.categories.length} categories defined\n`;
    }
    if (chartData.series && Array.isArray(chartData.series)) {
      chartData.series.forEach((s, i) => {
        if (s.values && Array.isArray(s.values)) {
          // Bar chart series values can be objects {label, value} or plain numbers
          const values = s.values.map(v => {
            if (v && typeof v === 'object') return v.value || 0;
            return v || 0;
          });
          const seriesNonZero = values.filter(v => v !== 0 && v !== null && v !== undefined).length;
          desc += `Series "${s.name || 'Series ' + (i + 1)}":\n`;
          desc += `  Values: [${values.join(', ')}]\n`;
          desc += `  -> ${values.length} total bars, ${seriesNonZero} with non-zero values\n`;
          totalDataPoints += values.length;
          nonZeroDataPoints += seriesNonZero;
        }
      });
    }
  }

  // Generic fallback for values/data arrays
  if (chartData.values && Array.isArray(chartData.values) && chartType !== 'bar') {
    desc += `Data Values: [${chartData.values.join(', ')}]\n`;
    desc += `  -> ${chartData.values.length} values provided\n`;
    totalDataPoints += chartData.values.length;
    nonZeroDataPoints += chartData.values.filter(v => v !== 0 && v !== null && v !== undefined).length;
  }
  if (chartData.data && Array.isArray(chartData.data)) {
    desc += `Data: [${chartData.data.join(', ')}]\n`;
    desc += `  -> ${chartData.data.length} data points provided\n`;
    totalDataPoints += chartData.data.length;
    nonZeroDataPoints += chartData.data.filter(v => v !== 0 && v !== null && v !== undefined).length;
  }

  // Series data for non-bar charts
  if (chartData.series && Array.isArray(chartData.series) && chartType !== 'bar' && chartType !== 'histogram') {
    chartData.series.forEach((s, i) => {
      if (s.values && Array.isArray(s.values)) {
        const seriesNonZero = s.values.filter(v => v !== 0 && v !== null && v !== undefined).length;
        desc += `Series ${s.name || i + 1} Values: [${s.values.join(', ')}]\n`;
        desc += `  -> ${s.values.length} total values, ${seriesNonZero} non-zero\n`;
        totalDataPoints += s.values.length;
        nonZeroDataPoints += seriesNonZero;
      }
    });
  }

  // SCATTER PLOT: SIF uses points array of {x, y}
  if (chartType === 'scatter' && chartData.points && Array.isArray(chartData.points)) {
    desc += `\nScatter Points:\n`;
    chartData.points.forEach((pt, i) => {
      desc += `  Point ${i + 1}: (${pt.x}, ${pt.y})${pt.label ? ' - ' + pt.label : ''}\n`;
    });
    desc += `  -> ${chartData.points.length} points plotted\n`;
    totalDataPoints = chartData.points.length;
    nonZeroDataPoints = chartData.points.length; // All points count
  }

  // BOXPLOT: SIF uses fiveNumSummary or min/q1/median/q3/max
  if (chartType === 'boxplot') {
    const fns = chartData.fiveNumSummary || chartData;
    if (fns.min !== undefined || fns.q1 !== undefined) {
      desc += `Five Number Summary:\n`;
      desc += `  Min: ${fns.min ?? 'not set'}\n`;
      desc += `  Q1: ${fns.q1 ?? 'not set'}\n`;
      desc += `  Median: ${fns.median ?? 'not set'}\n`;
      desc += `  Q3: ${fns.q3 ?? 'not set'}\n`;
      desc += `  Max: ${fns.max ?? 'not set'}\n`;
      totalDataPoints = 5;
      nonZeroDataPoints = [fns.min, fns.q1, fns.median, fns.q3, fns.max].filter(v => v !== null && v !== undefined).length;
    }
  }

  // NORMAL CURVE: SIF uses mean and sd
  if (chartType === 'normal') {
    if (chartData.mean !== undefined) desc += `Mean: ${chartData.mean}\n`;
    if (chartData.sd !== undefined) desc += `Standard Deviation: ${chartData.sd}\n`;
    if (chartData.shade) {
      desc += `Shaded Region: ${chartData.shade.lower ?? '-∞'} to ${chartData.shade.upper ?? '∞'}\n`;
    }
    // Normal curve is complete if mean and sd are set
    totalDataPoints = 2;
    nonZeroDataPoints = (chartData.mean !== undefined ? 1 : 0) + (chartData.sd !== undefined ? 1 : 0);
  }

  // DOTPLOT: SIF uses values array
  if (chartType === 'dotplot' && chartData.values && Array.isArray(chartData.values)) {
    desc += `Dot Plot Values: [${chartData.values.join(', ')}]\n`;
    desc += `  -> ${chartData.values.length} data points\n`;
    totalDataPoints = chartData.values.length;
    nonZeroDataPoints = chartData.values.length;
  }

  // Add completeness summary for AI to evaluate
  if (totalDataPoints > 0) {
    desc += `\nCHART COMPLETENESS SUMMARY:\n`;
    desc += `- Total data positions in chart: ${totalDataPoints}\n`;
    desc += `- Positions with actual values: ${nonZeroDataPoints}\n`;
    const completenessPercent = Math.round((nonZeroDataPoints / totalDataPoints) * 100);
    desc += `- Chart completeness: ${completenessPercent}%\n`;
    if (completenessPercent < 50) {
      desc += `- WARNING: Chart appears significantly incomplete!\n`;
    }
  } else {
    desc += `\nWARNING: No data values found in chart - only labels/structure defined.\n`;
  }

  console.log('FRQ Grader: Formatted chart for AI:', desc);
  return desc;
}

/**
 * Handle the AI grading button click
 * @param {string} questionId - The question ID
 * @param {Object} questionData - The question data
 * @param {HTMLElement} container - The container element
 */
async function handleAIGrading(questionId, questionData, container) {
  // Get the student's text answer
  const textarea = container.querySelector('textarea');
  const studentTextAnswer = textarea ? textarea.value.trim() : '';

  // Get student's chart data (if any)
  const studentChartData = getStudentChartData(questionId);
  const chartDescription = formatChartForAI(studentChartData);

  // Combine text and chart into full student answer
  let studentAnswer = studentTextAnswer;
  if (chartDescription) {
    studentAnswer += chartDescription;
  }

  // Check minimum length (text or chart must exist)
  const hasChart = !!studentChartData;
  const hasText = studentTextAnswer.length >= FRQ_GRADER_CONFIG.minAnswerLength;

  if (!hasChart && !hasText) {
    if (window.showToast) {
      showToast(`Please write at least ${FRQ_GRADER_CONFIG.minAnswerLength} characters or create a chart before requesting feedback`, 'warning');
    }
    return;
  }

  // Create or get the grade results container
  let resultsContainer = container.querySelector('.frq-grade-results');
  if (!resultsContainer) {
    resultsContainer = document.createElement('div');
    resultsContainer.className = 'frq-grade-results';
    container.appendChild(resultsContainer);
  }

  // Show loading
  showGradingLoading(resultsContainer);

  try {
    // Get scoring from either location (curriculum uses solution.scoring)
    const scoring = questionData.scoring || questionData.solution?.scoring;

    // Build comprehensive model answer from solution parts
    let modelAnswer = questionData.reasoning || '';
    if (questionData.solution?.parts) {
      const solutionParts = questionData.solution.parts.map(part => {
        let partText = `Part (${part.partId}):`;
        if (part.description) partText += `\nQuestion: ${part.description}`;
        if (part.response) partText += `\nAnswer: ${part.response}`;
        if (part.calculations?.length) {
          partText += `\nCalculations:\n${part.calculations.map(c => `  - ${c}`).join('\n')}`;
        }
        // Include expected chart info if present
        if (part.attachments?.chartType) {
          partText += `\nExpected Chart: ${part.attachments.chartType}`;
          if (part.attachments.series) {
            partText += `\nExpected Data: ${JSON.stringify(part.attachments.series)}`;
          }
        }
        return partText;
      }).join('\n\n');
      modelAnswer = solutionParts + (modelAnswer ? `\n\nAdditional Context: ${modelAnswer}` : '');
    }

    const grade = await gradeFRQAnswer({
      questionId,
      questionText: questionData.prompt,
      studentAnswer,
      rubric: scoring.rubric,
      modelAnswer,
      hasChart // Let server know if chart was included
    });

    // Display the grade
    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(createGradeDisplay(grade));

    if (window.showToast) {
      const scorePercent = Math.round((grade.totalPoints / grade.maxPoints) * 100);
      showToast(`Scored ${grade.totalPoints}/${grade.maxPoints} (${scorePercent}%)`, 'success');
    }

  } catch (error) {
    console.error('Grading error:', error);
    showGradingError(
      resultsContainer,
      error.message || 'Failed to grade response',
      () => handleAIGrading(questionId, questionData, container)
    );
  }
}

// ========================================
// EXPORTS
// ========================================

window.FRQGrader = {
  grade: gradeFRQAnswer,
  getGrades: getFRQGrades,
  getStats: getFRQStats,
  createDisplay: createGradeDisplay,
  addButton: addAIGradingButton
};

// Also export individual functions for convenience
window.gradeFRQAnswer = gradeFRQAnswer;
window.getFRQGrades = getFRQGrades;
window.getFRQStats = getFRQStats;

console.log('📝 FRQ Grader loaded');
