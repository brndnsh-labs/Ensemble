import { Fragment, h } from 'preact';

/**
 * @typedef {import('../ui-types.js').ComponentChildren} ComponentChildren
 * @typedef {import('../ui-types.js').StyleObject} StyleObject
 * @typedef {import('../ui-types.js').SelectOption} SelectOption
 */

/**
 * SettingGroup wraps a set of related settings with a consistent title and spacing.
 */
/**
 * @typedef {Object} SettingGroupProps
 * @property {string} [title]
 * @property {ComponentChildren} children
 * @property {string|StyleObject} [style]
 * @property {string} [className]
 */
/** @param {SettingGroupProps} props */
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
/**
 * @typedef {Object} SettingRowProps
 * @property {string} label
 * @property {string} [description]
 * @property {ComponentChildren} children
 * @property {string|ComponentChildren} [valueDisplay]
 * @property {string} [id]
 */
/** @param {SettingRowProps} props */
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
/**
 * @typedef {Object} ToggleProps
 * @property {string} [id]
 * @property {boolean} checked
 * @property {function(boolean): void} onChange
 * @property {string} [ariaLabel]
 * @property {string} [label]
 */
/** @param {ToggleProps} props */
export function Toggle({ id, checked, onChange, ariaLabel, label }) {
    return (
        <label class="toggle-switch" htmlFor={id}>
            {label && <span class="sr-only">{label}</span>}
            <input
                type="checkbox"
                id={id}
                role="switch"
                aria-checked={checked}
                checked={checked}
                onChange={(e) => onChange(/** @type {HTMLInputElement} */ (e.target).checked)}
                aria-label={ariaLabel || label || id}
            />
            <span class="toggle-slider" />
        </label>
    );
}

/**
 * Reusable Slider component.
 */
/**
 * @typedef {Object} SliderProps
 * @property {string} [id]
 * @property {number|string} min
 * @property {number|string} max
 * @property {number|string} [step]
 * @property {number|string} value
 * @property {function(string): void} onInput
 * @property {string} [ariaLabel]
 * @property {string} [ariaValueText]
 * @property {boolean} [disabled]
 */
/** @param {SliderProps} props */
export function Slider({
    id,
    min,
    max,
    step = '1',
    value,
    onInput,
    ariaLabel,
    ariaValueText,
    disabled,
}) {
    return (
        <input
            type="range"
            id={id}
            min={min}
            max={max}
            step={step}
            value={value}
            onInput={(e) => onInput(/** @type {HTMLInputElement} */ (e.target).value)}
            aria-label={ariaLabel || id}
            aria-valuetext={ariaValueText}
            disabled={disabled}
        />
    );
}

/**
 * Reusable Select component.
 */
/**
 * @typedef {Object} SelectProps
 * @property {string} [id]
 * @property {string|number} value
 * @property {function(string): void} onChange
 * @property {SelectOption[]} options
 * @property {string} [ariaLabel]
 */
/** @param {SelectProps} props */
export function Select({ id, value, onChange, options, ariaLabel }) {
    return (
        <select
            id={id}
            value={value}
            onChange={(e) => onChange(/** @type {HTMLSelectElement} */ (e.target).value)}
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
/**
 * @typedef {Object} StepperProps
 * @property {number} value
 * @property {function(MouseEvent): void} onDecrement
 * @property {function(MouseEvent): void} onIncrement
 * @property {number} min
 * @property {number} max
 * @property {string} [id]
 * @property {string} [decAriaLabel]
 * @property {string} [incAriaLabel]
 */
/** @param {StepperProps} props */
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
/**
 * @typedef {Object} ButtonGroupProps
 * @property {SelectOption[]} options
 * @property {string|number} value
 * @property {function(string|number): void} onChange
 * @property {string} [className]
 * @property {StyleObject} [style]
 */
/**
 * @param {ButtonGroupProps} props
 */
export function ButtonGroup({ options, value, onChange, className = '', style = {} }) {
    return (
        <div class={`flex-row ${className}`} style={{ gap: '0.25rem', ...style }}>
            {options.map((/** @type {any} */ opt) => (
                <button
                    key={opt.value}
                    class={`chip-btn ${value === opt.value ? 'active' : ''}`}
                    aria-pressed={value === opt.value}
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
