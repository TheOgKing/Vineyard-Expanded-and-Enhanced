function AmericanFlagPointer() {
    const base64Cursor = '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';
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
        * {
            cursor: url('data:image/png;base64,${base64Cursor}'), auto !important;
        }
    `;
    document.head.appendChild(style);
}

window.AmericanFlagPointer = AmericanFlagPointer;