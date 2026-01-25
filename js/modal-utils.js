// modal-utils.js - Keyboard navigation and modal management
// Part of AP Statistics Consensus Quiz
// Phase 1: Keyboard Navigation Implementation

/**
 * ModalUtils - Centralized modal management with keyboard support
 *
 * Features:
 * - Escape key closes active modal
 * - Focus trapping within modal (Tab/Shift+Tab cycles)
 * - Focus restoration on close
 * - Nested modal support via stack
 * - Background scroll lock
 * - aria-hidden on main content
 */
const ModalUtils = {
    // Stack for nested modals
    modalStack: [],
    previousFocusStack: [],

    // Bound handler (created once for reliable add/remove)
    _boundHandleKeydown: null,

    // Expanded selector for all focusable elements
    FOCUSABLE_SELECTOR: [
        'button:not([disabled]):not([hidden])',
        'input:not([disabled]):not([hidden])',
        'select:not([disabled]):not([hidden])',
        'textarea:not([disabled]):not([hidden])',
        'a[href]:not([disabled]):not([hidden])',
        '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])',
        '[contenteditable="true"]:not([disabled]):not([hidden])'
    ].join(', '),

    /**
     * Initialize the modal utility (call once on page load)
     */
    init() {
        this._boundHandleKeydown = this._handleKeydown.bind(this);
    },

    /**
     * Open a modal with keyboard support
     * @param {HTMLElement} modalElement - The modal container element
     * @param {Object} options - Optional settings
     * @param {string} options.focusFirst - Selector for element to focus first
     * @param {Function} options.onClose - Callback when modal is closed
     */
    open(modalElement, options = {}) {
        if (!modalElement) {
            console.warn('ModalUtils.open: modalElement is null');
            return;
        }

        // Store options on the element for later use
        modalElement._modalOptions = options;

        // Push current focus to stack
        this.previousFocusStack.push(document.activeElement);
        this.modalStack.push(modalElement);

        // Show modal
        modalElement.style.display = 'block';
        modalElement.setAttribute('role', 'dialog');
        modalElement.setAttribute('aria-modal', 'true');

        // Lock background scroll
        document.body.style.overflow = 'hidden';

        // Mark main content as inert (if main element exists)
        const main = document.querySelector('main, #app, .app-container, [data-app-root]');
        if (main && !main.contains(modalElement)) {
            main.setAttribute('aria-hidden', 'true');
        }

        // Focus first focusable element (or specified element)
        const focusTarget = options.focusFirst
            ? modalElement.querySelector(options.focusFirst)
            : modalElement.querySelector(this.FOCUSABLE_SELECTOR);

        if (focusTarget) {
            // Delay focus slightly for CSS transitions
            requestAnimationFrame(() => {
                focusTarget.focus();
            });
        }

        // Add keyboard listener (only once for first modal)
        if (this.modalStack.length === 1) {
            document.addEventListener('keydown', this._boundHandleKeydown);
        }
    },

    /**
     * Close a modal and restore focus
     * @param {HTMLElement} modalElement - The modal to close
     */
    close(modalElement) {
        if (!modalElement) return;

        const index = this.modalStack.indexOf(modalElement);
        if (index === -1) {
            // Modal not in stack, just hide it
            modalElement.style.display = 'none';
            return;
        }

        // Get options and callback
        const options = modalElement._modalOptions || {};

        // Remove from stack
        this.modalStack.splice(index, 1);
        const previousFocus = this.previousFocusStack.splice(index, 1)[0];

        // Hide modal
        modalElement.style.display = 'none';
        modalElement.removeAttribute('aria-modal');

        // Clean up stored options
        delete modalElement._modalOptions;

        // If no more modals, restore body scroll and main content
        if (this.modalStack.length === 0) {
            document.body.style.overflow = '';
            const main = document.querySelector('main, #app, .app-container, [data-app-root]');
            if (main) {
                main.removeAttribute('aria-hidden');
            }
            document.removeEventListener('keydown', this._boundHandleKeydown);
        }

        // Restore focus
        if (previousFocus && typeof previousFocus.focus === 'function') {
            // Check if element is still in DOM and visible
            if (document.body.contains(previousFocus)) {
                previousFocus.focus();
            }
        }

        // Call onClose callback if provided
        if (typeof options.onClose === 'function') {
            options.onClose();
        }
    },

    /**
     * Get the topmost (active) modal
     * @returns {HTMLElement|null}
     */
    getActiveModal() {
        return this.modalStack[this.modalStack.length - 1] || null;
    },

    /**
     * Check if any modal is currently open
     * @returns {boolean}
     */
    isAnyModalOpen() {
        return this.modalStack.length > 0;
    },

    /**
     * Close all open modals
     */
    closeAll() {
        // Close from top to bottom
        while (this.modalStack.length > 0) {
            this.close(this.modalStack[this.modalStack.length - 1]);
        }
    },

    /**
     * Handle keydown events for modal interaction
     * @private
     */
    _handleKeydown(e) {
        const activeModal = this.getActiveModal();
        if (!activeModal) return;

        // Escape closes topmost modal
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.close(activeModal);
            return;
        }

        // Focus trap: Tab cycles within modal
        if (e.key === 'Tab') {
            const focusables = Array.from(
                activeModal.querySelectorAll(this.FOCUSABLE_SELECTOR)
            ).filter(el => {
                // Filter to visible elements only
                return el.offsetParent !== null &&
                       !el.closest('[hidden]') &&
                       getComputedStyle(el).visibility !== 'hidden';
            });

            if (focusables.length === 0) {
                // No focusable elements, prevent Tab from escaping
                e.preventDefault();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;

            // Shift+Tab from first element goes to last
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            }
            // Tab from last element goes to first
            else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
            // If focus is outside modal, bring it back
            else if (!activeModal.contains(active)) {
                e.preventDefault();
                first.focus();
            }
        }
    },

    /**
     * Setup click-outside-to-close for overlay modals
     * Call this after creating a modal with an overlay background
     * @param {HTMLElement} overlayElement - The overlay/backdrop element
     * @param {HTMLElement} contentElement - The modal content (clicks here don't close)
     */
    setupOverlayClose(overlayElement, contentElement) {
        if (!overlayElement) return;

        overlayElement.addEventListener('click', (e) => {
            // Only close if click was on overlay itself, not content
            if (e.target === overlayElement ||
                (contentElement && !contentElement.contains(e.target))) {
                this.close(overlayElement);
            }
        });
    }
};

// Initialize on load
ModalUtils.init();

// Expose to window for inline script usage
if (typeof window !== 'undefined') {
    window.ModalUtils = ModalUtils;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModalUtils };
}
