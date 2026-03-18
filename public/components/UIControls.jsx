import { Fragment, h } from 'preact';

/**
 * SettingGroup wraps a set of related settings with a consistent title and spacing.
 */
/** @param {any} props */
export function SettingGroup({ title, children, style = '', className = '' }) {
    return (
        <div class={`setting-group ${className}`} style={style}>
            {title && <h3 class="setting-group-title">{title}</h3>}
            {children}
        </div>
    );
}

/**
 * SettingRow provides a standard layout for a single setting:
 * [ Label + Description ] [ Control Element ]
 */
/** @param {any} props */
export function SettingRow({ label, description, children, valueDisplay, id }) {
    return (
        <div class="setting-row">
            <div class="setting-info">
                <label class="setting-label" htmlFor={id}>
                    {label}
                </label>
                {description && <span class="setting-description">{description}</span>}
            </div>
            <div class="setting-control">
                {valueDisplay && <span class="setting-value-display">{valueDisplay}</span>}
                {children}
            </div>
        </div>
    );
}

/**
 * Reusable Toggle (Switch) component.
 */
/** @param {any} props */
export function Toggle({ id, checked, onChange, ariaLabel, label }) {
    return (
        <label class="toggle-switch" htmlFor={id}>
            {label && <span class="sr-only">{label}</span>}
            <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                aria-label={ariaLabel || label || id}
            />
            <span class="toggle-slider" />
        </label>
    );
}

/**
 * Reusable Slider component.
 */
/** @param {any} props */
export function Slider({ id, min, max, step, value, onInput, ariaLabel, ariaValueText, disabled }) {
    return (
        <input
            type="range"
            id={id}
            min={min}
            max={max}
            step={step}
            value={value}
            onInput={(e) => onInput(e.target.value)}
            aria-label={ariaLabel || id}
            aria-valuetext={ariaValueText}
            disabled={disabled}
        />
    );
}

/**
 * Reusable Select component.
 */
/** @param {any} props */
export function Select({ id, value, onChange, options, ariaLabel }) {
    return (
        <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={ariaLabel || id}
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

/**
 * Reusable Stepper component for numeric inputs.
 */
/** @param {any} props */
export function Stepper({
    value,
    onDecrement,
    onIncrement,
    min,
    max,
    id,
    decAriaLabel,
    incAriaLabel,
}) {
    return (
        <div
            class="stepper-control"
            style="display: flex; align-items: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;"
        >
            <button
                id={id ? `${id}Dec` : undefined}
                class="stepper-btn"
                style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;"
                onClick={onDecrement}
                disabled={value <= min}
                aria-label={decAriaLabel || 'Decrease'}
            >
                -
            </button>
            <input
                id={id ? `${id}Input` : undefined}
                type="number"
                value={value}
                readonly
                style="width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;"
                aria-label="Current Value"
            />
            <button
                id={id ? `${id}Inc` : undefined}
                class="stepper-btn"
                style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;"
                onClick={onIncrement}
                disabled={value >= max}
                aria-label={incAriaLabel || 'Increase'}
            >
                +
            </button>
        </div>
    );
}

/**
 * Reusable ButtonGroup for mutually exclusive options (chips).
 */
export function ButtonGroup({ options, value, onChange, className = '', style = {} }) {
    return (
        <div class={`flex-row ${className}`} style={{ gap: '0.25rem', ...style }}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    class={`chip-btn ${value === opt.value ? 'active' : ''}`}
                    onClick={() => onChange(opt.value)}
                    style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        background: value === opt.value ? 'var(--accent-color)' : 'var(--input-bg)',
                        color: value === opt.value ? 'white' : 'var(--text-color)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        ...opt.style,
                    }}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
