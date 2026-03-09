function applyTheme() {
    try {
        const stored = localStorage.getItem('ensemble_currentState');
        const savedState = JSON.parse(stored || '{}');
        const theme = savedState.theme || 'auto';
        let effectiveTheme = theme;
        if (theme === 'auto') {
            effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        }
        document.documentElement.setAttribute('data-theme', effectiveTheme);
        document.documentElement.style.colorScheme = effectiveTheme;
    } catch (e) {
        console.error('Theme sync failed', e);
    }
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    try {
        const stored = localStorage.getItem('ensemble_currentState');
        const savedState = JSON.parse(stored || '{}');
        if (!savedState.theme || savedState.theme === 'auto') {
            applyTheme();
        }
    } catch {
        applyTheme();
    }
});
