const DOMUtils = {
    escapeHtml(str) {
        if (str == null) return '';
        if (typeof str !== 'string') return String(str);
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    escapeAttr(str) {
        if (str == null) return '';
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },
    safeHtml(strings, ...values) {
        let result = strings[0];
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            const escaped = typeof value === 'string'
                ? this.escapeHtml(value)
                : (value == null ? '' : String(value));
            result += escaped + strings[i + 1];
        }
        return result;
    },
    createText(tag, text, attributes = {}) {
        const el = document.createElement(tag);
        el.textContent = text;
        Object.entries(attributes).forEach(([key, val]) => {
            el.setAttribute(key, val);
        });
        return el;
    }
};

if (typeof window !== 'undefined') {
    window.DOMUtils = DOMUtils;
}
