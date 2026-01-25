const ModalUtils = {
    modalStack: [],
    previousFocusStack: [],
    _boundHandleKeydown: null,
    FOCUSABLE_SELECTOR: [
        'button:not([disabled]):not([hidden])',
        'input:not([disabled]):not([hidden])',
        'select:not([disabled]):not([hidden])',
        'textarea:not([disabled]):not([hidden])',
        'a[href]:not([disabled]):not([hidden])',
        '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])',
        '[contenteditable="true"]:not([disabled]):not([hidden])'
    ].join(', '),
    init() {
        this._boundHandleKeydown = this._handleKeydown.bind(this);
    },
    open(modalElement, options = {}) {
        if (!modalElement) return;
        this.previousFocusStack.push(document.activeElement);
        this.modalStack.push(modalElement);

        modalElement.style.display = 'block';
        modalElement.setAttribute('role', 'dialog');
        modalElement.setAttribute('aria-modal', 'true');

        document.body.style.overflow = 'hidden';
        const main = document.querySelector('main, #app, .app-container');
        if (main) main.setAttribute('aria-hidden', 'true');

        const focusTarget = options.focusFirst
            ? modalElement.querySelector(options.focusFirst)
            : modalElement.querySelector(this.FOCUSABLE_SELECTOR);
        if (focusTarget) {
            requestAnimationFrame(() => focusTarget.focus());
        }

        if (this.modalStack.length === 1) {
            document.addEventListener('keydown', this._boundHandleKeydown);
        }
    },
    close(modalElement) {
        if (!modalElement) return;
        const index = this.modalStack.indexOf(modalElement);
        if (index === -1) return;

        this.modalStack.splice(index, 1);
        const previousFocus = this.previousFocusStack.splice(index, 1)[0];

        modalElement.style.display = 'none';
        modalElement.removeAttribute('aria-modal');

        if (this.modalStack.length === 0) {
            document.body.style.overflow = '';
            const main = document.querySelector('main, #app, .app-container');
            if (main) main.removeAttribute('aria-hidden');
            document.removeEventListener('keydown', this._boundHandleKeydown);
        }

        if (previousFocus && previousFocus.focus) {
            previousFocus.focus();
        }
    },
    getActiveModal() {
        return this.modalStack[this.modalStack.length - 1] || null;
    },
    _handleKeydown(event) {
        const activeModal = this.getActiveModal();
        if (!activeModal) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.close(activeModal);
            return;
        }

        if (event.key === 'Tab') {
            const focusables = Array.from(
                activeModal.querySelectorAll(this.FOCUSABLE_SELECTOR)
            ).filter(el => el.offsetParent !== null);
            if (focusables.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }
};

ModalUtils.init();

if (typeof window !== 'undefined') {
    window.ModalUtils = ModalUtils;
}
