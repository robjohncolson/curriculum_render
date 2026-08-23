// Pure formatting/indexing helpers for persisted quiz appeal history.
(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function creditForResult(result) {
    if (result && Number.isFinite(Number(result.reviewCredit))) return Number(result.reviewCredit);
    if (result && result.exceptionGranted === true) return 1;
    if (result && result.score === 'E') return 1;
    if (result && result.score === 'P') return 2 / 3;
    if (result && result.score === 'I') return 1 / 3;
    return 0;
  }

  function creditLabel(credit) {
    var value = Number(credit) || 0;
    if (Math.abs(value - 1) < 0.001) return '3/3';
    if (Math.abs(value - (2 / 3)) < 0.001) return '2/3';
    if (Math.abs(value - (1 / 3)) < 0.001) return '1/3';
    if (Math.abs(value) < 0.001) return '0/3';
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function reviewDate(value) {
    var date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return 'date unavailable';
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      }).format(date);
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  function formatReview(review) {
    var verdict = ['E', 'P', 'I'].includes(String(review && review.verdict || '').toUpperCase())
      ? String(review.verdict).toUpperCase()
      : 'I';
    var appeal = escapeHtml(review && review.appeal_text);
    var feedback = escapeHtml(review && review.feedback);
    return '<article class="quiz-review" style="margin:12px 0;padding:10px 12px;border-left:4px solid #6c5ce7;background:rgba(108,92,231,.08);border-radius:4px;">' +
      '<div class="quiz-review-line" style="font-weight:700;">↻ Reviewed ' + escapeHtml(reviewDate(review && review.created_at)) +
      ' — earned ' + creditLabel(review && review.credit) + ' credit (' + verdict + ')</div>' +
      '<details class="quiz-review-details" style="margin-top:7px;">' +
      '<summary style="cursor:pointer;font-weight:600;">Your explanation</summary>' +
      '<p style="white-space:pre-wrap;margin:8px 0;">' + (appeal || 'No explanation stored.') + '</p>' +
      '<p style="white-space:pre-wrap;margin:8px 0 0;"><strong>AI feedback:</strong> ' + (feedback || 'No feedback stored.') + '</p>' +
      '</details></article>';
  }

  function indexRows(rows) {
    var indexed = Object.create(null);
    var seen = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || !row.question_id) return;
      var questionId = String(row.question_id);
      var dedupeKey = questionId + '\u0000' + String(row.appeal_text || '');
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;
      if (!indexed[questionId]) indexed[questionId] = [];
      indexed[questionId].push(row);
    });
    Object.keys(indexed).forEach(function (questionId) {
      indexed[questionId].sort(function (a, b) {
        return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
      });
    });
    return indexed;
  }

  function formatQuestionReviews(questionId, indexed) {
    return ((indexed && indexed[questionId]) || []).map(formatReview).join('');
  }

  function formatSummary(questions, answers, indexed) {
    var list = Array.isArray(questions) ? questions : [];
    var reviewed = list.filter(function (question) {
      return (((indexed && indexed[question.id]) || []).some(function (row) {
        return Number(row.credit) > 0;
      }));
    }).length;
    if (!reviewed) return list.length + ' questions';

    var correct = list.filter(function (question) {
      var saved = answers && answers[question.id];
      var value = saved && typeof saved === 'object' && Object.prototype.hasOwnProperty.call(saved, 'value')
        ? saved.value
        : saved;
      var expected = question.answerKey != null ? question.answerKey
        : question.correct_answer != null ? question.correct_answer
        : question.answer;
      if (value == null || expected == null || typeof value === 'object') return false;
      return String(value).trim().toLowerCase() === String(expected).trim().toLowerCase();
    }).length;
    return correct + '/' + list.length + ' correct · ' + reviewed + ' reviewed for credit';
  }

  global.QuizReviewUI = {
    creditForResult: creditForResult,
    creditLabel: creditLabel,
    escapeHtml: escapeHtml,
    formatQuestionReviews: formatQuestionReviews,
    formatReview: formatReview,
    formatSummary: formatSummary,
    indexRows: indexRows
  };
})(typeof window !== 'undefined' ? window : globalThis);
