/**
 * Components Module - Reusable UI Components
 * @module Components
 */

export const Components = (function() {
    /**
     * Question Header Component
     */
    function createQuestionHeader(questionNumber, isAnswered) {
        return `
            <div class="question-header">
                <span>Question ${questionNumber}</span>
                ${isAnswered ? '<span class="status-answered">✓ Answered</span>' : ''}
            </div>
        `;
    }

    /**
     * MCQ Choices Component
     */
    function createMCQChoices(questionId, choices, savedAnswer, isDisabled) {
        let html = '<div class="choices">';
        choices.forEach(choice => {
            const isSelected = savedAnswer?.value === choice.key || savedAnswer === choice.key;
            html += `
                <div class="choice ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}">
                    <label>
                        <input type="radio"
                               name="choice-${questionId}"
                               value="${choice.key}"
                               ${isSelected ? 'checked' : ''}
                               ${isDisabled ? 'disabled' : ''}>
                        <span class="choice-key">${choice.key}.</span>
                        <span>${choice.value}</span>
                    </label>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    /**
     * FRQ Textarea Component
     */
    function createFRQTextarea(questionId, savedAnswer, isDisabled, config) {
        return `
            <div class="answer-section">
                <textarea
                    id="frq-${questionId}"
                    class="frq-textarea"
                    placeholder="Enter your complete response here..."
                    ${isDisabled ? 'disabled' : ''}
                >${savedAnswer?.value || savedAnswer || ''}</textarea>
            </div>
        `;
    }

    /**
     * Reasoning Section Component
     */
    function createReasoningSection(questionId, savedReason, isAnswered) {
        return `
            <div class="reason-wrapper">
                <label class="reason-label">
                    Explain your reasoning:
                    ${!savedReason && isAnswered ? '<span class="status-warning"> (Add explanation to unlock answer changes)</span>' : ''}
                </label>
                <textarea
                    id="reason-${questionId}"
                    class="reason-textarea"
                    placeholder="Explain why you chose this answer..."
                >${savedReason}</textarea>
            </div>
        `;
    }

    /**
     * Submit Button Component
     */
    function createSubmitButton(questionId, questionType, isAnswered, canRetry, hasReason) {
        const buttonText = isAnswered ?
            (canRetry ? 'Update Answer' :
                (hasReason ? 'Max Attempts Reached' : 'Add Explanation First')) :
            'Submit Answer';

        return `
            <button
                id="submit-${questionId}"
                class="submit-button"
                data-action="submit-answer"
                data-param="${questionId}"
                data-question-type="${questionType}"
                ${!canRetry && isAnswered ? 'disabled' : ''}
            >
                ${buttonText}
            </button>
        `;
    }

    /**
     * Peer Data Panel Component
     */
    function createPeerDataPanel(questionId, isAnswered) {
        return `
            <div class="peer-data-panel ${isAnswered ? 'visible' : 'hidden'}" id="peer-panel-${questionId}">
                <div class="peer-panel-header">
                    <h3>Peer Consensus</h3>
                    ${isAnswered ? '' : '<p class="status-pending">Submit your answer to see peer data</p>'}
                </div>
                ${isAnswered ? `
                    <div class="dotplot-container" id="dotplot-section-${questionId}">
                        <canvas id="dotplot-${questionId}" style="width: 100%;"></canvas>
                    </div>
                    <div class="consensus-container" id="consensus-${questionId}"></div>
                    <div class="contributors-container" id="contributors-${questionId}"></div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Modal Component Factory
     */
    function createModal(options = {}) {
        const {
            id = 'modal',
            title = '',
            content = '',
            buttons = [],
            className = ''
        } = options;

        let buttonsHtml = '';
        if (buttons.length > 0) {
            buttonsHtml = '<div class="modal-buttons">';
            buttons.forEach(btn => {
                buttonsHtml += `
                    <button
                        class="${btn.className || 'modal-btn'}"
                        data-action="${btn.action || ''}"
                        data-param="${btn.param || ''}"
                    >
                        ${btn.text}
                    </button>
                `;
            });
            buttonsHtml += '</div>';
        }

        return `
            <div id="${id}" class="modal ${className}">
                <div class="modal-content">
                    ${title ? `<div class="modal-header"><h3>${title}</h3></div>` : ''}
                    <div class="modal-body">
                        ${content}
                    </div>
                    ${buttonsHtml}
                </div>
            </div>
        `;
    }

    /**
     * Button Factory
     */
    function createButton(options = {}) {
        const {
            id = '',
            text = 'Button',
            action = '',
            param = '',
            className = 'button',
            disabled = false,
            icon = ''
        } = options;

        return `
            <button
                ${id ? `id="${id}"` : ''}
                class="${className}"
                ${action ? `data-action="${action}"` : ''}
                ${param ? `data-param="${param}"` : ''}
                ${disabled ? 'disabled' : ''}
            >
                ${icon ? `<i class="${icon}"></i> ` : ''}
                ${text}
            </button>
        `;
    }

    // Public API
    return {
        createQuestionHeader,
        createMCQChoices,
        createFRQTextarea,
        createReasoningSection,
        createSubmitButton,
        createPeerDataPanel,
        createModal,
        createButton
    };
})();

// For backwards compatibility with global namespace
if (typeof window !== 'undefined') {
    window.Components = Components;
}