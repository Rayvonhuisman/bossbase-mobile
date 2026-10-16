import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/theme';

/** Gedeeld door HandtekeningVak.tsx (telefoon) en HandtekeningVak.web.tsx. */
export type HandtekeningProps = {
  /** De handtekening als PNG-data-URL na elke streek, of null na wissen. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  /** Tijdens het tekenen het omliggende scrollen uitzetten. */
  onTekenen?: (bezig: boolean) => void;
  titel?: string;
  plaatshouder?: string;
};

export const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    kop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titel: { fontSize: 13.5, fontWeight: '700', color: t.ink },
    wis: { fontSize: 13, color: t.muted, textDecorationLine: 'underline' },
    vak: {
      height: 164,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: '#d1d5db',
      borderRadius: 8,
      backgroundColor: '#fafafa',
      overflow: 'hidden',
    },
    web: { flex: 1, backgroundColor: '#fafafa' },
    leeg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    leegTekst: { color: '#9ca3af', fontSize: 13.5 },
  });
