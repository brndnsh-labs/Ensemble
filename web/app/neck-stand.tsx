import type { ChartNotation } from '@core/songbook/types';
import type { BandChart } from '../lib/band-chart';
import type { NeckPreferences } from '../lib/session';
import { NeckView } from './neck-view';
import { useNeckVoicing } from './use-neck-view';

// The stand's Neck mode as one lazily loaded unit (#1877): the voicer (`lib/voicings`) and the
// fretboard are most of a megabyte of source that a musician who never opens the neck should not
// download. The shell loads this with `React.lazy` only when the neck shows; the per-device prefs
// stay in the shell (`useNeckPrefs`), so a stored choice is already in hand when it opens.

interface NeckStandProps {
    band: BandChart | null;
    stored: NeckPreferences;
    onPrefs: (patch: Partial<NeckPreferences>) => void;
    active: number | null;
    changeSoon: boolean;
    playing: boolean;
    onStrum: (midis: number[]) => void;
    notation: ChartNotation;
}

export default function NeckStand({ band, stored, onPrefs, ...view }: NeckStandProps) {
    const { prefs, voiced } = useNeckVoicing(band, stored);
    return <NeckView band={band} voiced={voiced} prefs={prefs} onPrefs={onPrefs} {...view} />;
}
