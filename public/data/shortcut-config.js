/**
 * Global Keyboard Shortcut Configuration
 * Used by GlobalShortcuts.jsx for event handling and ManualModal.jsx for documentation.
 */
export const SHORTCUT_CONFIG = [
    {
        key: 'Space',
        action: 'Toggle Play',
        description: 'Start or stop the sequencer.',
        category: 'Transport',
    },
    {
        key: 'S',
        action: 'Trade Lead / Performance',
        description: 'Open the Soloist Performance modal or toggle Trade mode.',
        category: 'Performance',
    },
    {
        key: 'E',
        action: 'Arrangement Editor',
        description: 'Open the chord progression editor.',
        category: 'Arranger',
    },
    {
        key: '1-5',
        action: 'Switch Instrument Tabs',
        description: 'Quickly navigate between instrument panels (Drums, Bass, Soloist, etc.).',
        category: 'Navigation',
    },
    {
        key: '[ ]',
        action: 'Drum Measures',
        description: 'Switch between active drum measures (Step Sequencer).',
        category: 'Drums',
    },
    {
        key: 'Esc',
        action: 'Close / Back',
        description: 'Close any open modal or unmaximize the chord display.',
        category: 'Navigation',
    },
];
