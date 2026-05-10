/** @type {'chart' | 'legacy' | null} */
let _cached = null;

/**
 * Reads URL param + localStorage once per page load to determine which UI shell to render.
 * @returns {'chart' | 'legacy'}
 */
export function getActiveSurface() {
    if (_cached !== null) {
        return _cached;
    }
    const param = new URLSearchParams(window.location.search).get('surface');
    if (param === 'chart' || param === 'legacy') {
        localStorage.setItem('uiSurface', param);
    }
    const stored = localStorage.getItem('uiSurface');
    _cached = stored === 'legacy' ? 'legacy' : 'chart';
    return _cached;
}
