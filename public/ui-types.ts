/**
 * Shared type definitions for the Preact UI layer.
 */

import type { ComponentChild, ComponentChildren as PreactComponentChildren } from 'preact';

export type ComponentChildren = ComponentChild | PreactComponentChildren;

export type StyleObject = Record<string, string | number>;

export interface SelectOption {
    value: string | number;
    label: string;
    style?: StyleObject;
}
