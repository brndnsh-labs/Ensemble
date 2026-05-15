import type { ComponentChildren, SelectOption, StyleObject } from '../ui-types.js';

interface SettingGroupProps {
    title?: string;
    children: ComponentChildren;
    style?: string | StyleObject;
    className?: string;
}

export function SettingGroup({ title, children, style = '', className = '' }: SettingGroupProps) {
    return (
        <div class={`setting-group ${className}`} style={style as any}>
            {title && <h3 class="setting-group-title">{title}</h3>}
            {children}
        </div>
    );
}

interface SettingRowProps {
    label: string;
    description?: string;
    children: ComponentChildren;
    valueDisplay?: string | ComponentChildren;
    id?: string;
}

export function SettingRow({ label, description, children, valueDisplay, id }: SettingRowProps) {
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

interface ToggleProps {
    id?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    ariaLabel?: string;
    label?: string;
}

export function Toggle({ id, checked, onChange, ariaLabel, label }: ToggleProps) {
    return (
        <label class="toggle-switch" htmlFor={id}>
            {label && <span class="sr-only">{label}</span>}
            <input
                type="checkbox"
                id={id}
                role="switch"
                aria-checked={checked}
                checked={checked}
                onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
                aria-label={ariaLabel || label || id}
            />
            <span class="toggle-slider" />
        </label>
    );
}

interface SliderProps {
    id?: string;
    min: number | string;
    max: number | string;
    step?: number | string;
    value: number | string;
    onInput: (value: string) => void;
    ariaLabel?: string;
    ariaValueText?: string;
    disabled?: boolean;
}

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
}: SliderProps) {
    return (
        <input
            type="range"
            id={id}
            min={min}
            max={max}
            step={step}
            value={value}
            onInput={(e) => onInput((e.target as HTMLInputElement).value)}
            aria-label={ariaLabel || id}
            aria-valuetext={ariaValueText}
            disabled={disabled}
        />
    );
}

interface SelectProps {
    id?: string;
    value: string | number;
    onChange: (value: string) => void;
    options: SelectOption[];
    ariaLabel?: string;
}

export function Select({ id, value, onChange, options, ariaLabel }: SelectProps) {
    return (
        <select
            id={id}
            value={value}
            onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
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

interface StepperProps {
    value: number;
    onDecrement: (e: MouseEvent) => void;
    onIncrement: (e: MouseEvent) => void;
    min: number;
    max: number;
    id?: string;
    decAriaLabel?: string;
    incAriaLabel?: string;
}

export function Stepper({
    value,
    onDecrement,
    onIncrement,
    min,
    max,
    id,
    decAriaLabel,
    incAriaLabel,
}: StepperProps) {
    return (
        <div class="stepper-control">
            <button
                id={id ? `${id}Dec` : undefined}
                class="stepper-btn"
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
                class="stepper-input"
                aria-label="Current Value"
            />
            <button
                id={id ? `${id}Inc` : undefined}
                class="stepper-btn"
                onClick={onIncrement}
                disabled={value >= max}
                aria-label={incAriaLabel || 'Increase'}
            >
                +
            </button>
        </div>
    );
}

interface ButtonGroupProps {
    options: SelectOption[];
    value: string | number;
    onChange: (value: string | number) => void;
    className?: string;
    style?: StyleObject;
}

export function ButtonGroup({
    options,
    value,
    onChange,
    className = '',
    style = {},
}: ButtonGroupProps) {
    return (
        <div class={`button-group ${className}`} style={style}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    class={`button-group-btn ${value === opt.value ? 'active' : ''}`}
                    aria-pressed={value === opt.value}
                    onClick={() => onChange(opt.value)}
                    style={opt.style}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
