import { StyleSheet, Text, View } from 'react-native';
import { lightTheme, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import type { WorkOrderStatus } from '@/types/domain';

/**
 * Statuskleuren van werkbonnen en projecten, gelijk aan het dashboard
 * (`statusColors.js`, domeinen werkbon en project):
 *   - gepland / "Gepland"             → blauw
 *   - in_progress / "In uitvoering"  → oranje
 *   - completed / "Afgerond"          → groen
 *   - cancelled / "Geannuleerd"       → grijs (gaat niet door)
 *   - concept / open / fallback       → grijs / amber
 *
 * Backend statuses arrive in Dutch (`in_uitvoering`, `afgerond`,
 * `geannuleerd`) OR English (`in_progress`, `completed`, `cancelled`)
 * depending on which migration / API path produced the row. We accept
 * both spellings and resolve them to a single canonical key.
 */

type CanonicalKey = 'gepland' | 'in_progress' | 'completed' | 'cancelled' | 'concept' | 'open';

const KEY_ALIASES: Record<string, CanonicalKey> = {
  // Canonical English (DB)
  gepland: 'gepland',
  in_progress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  concept: 'concept',
  draft: 'concept',
  open: 'open',

  // Dutch synonyms — surface text or alt DB values
  in_uitvoering: 'in_progress',
  'in uitvoering': 'in_progress',
  bezig: 'in_progress',
  afgerond: 'completed',
  voltooid: 'completed',
  geannuleerd: 'cancelled',
  geannuleerd_: 'cancelled',
};

const LABELS: Record<CanonicalKey, string> = {
  gepland: 'Gepland',
  in_progress: 'In uitvoering',
  completed: 'Afgerond',
  cancelled: 'Geannuleerd',
  concept: 'Concept',
  open: 'Open',
};

export type StatusTone = { bg: string; fg: string; dot: string };

/**
 * De statuskleuren uit het goedgekeurde ontwerp, afgeleid van de themetokens
 * in plaats van hardgecodeerd. Dat is het verschil dat telt: de badge kleurde
 * eerder in dark mode nog steeds lichtblauw op lichtgrijs, omdat hij zijn eigen
 * palet meedroeg. Nu volgt hij het thema.
 *
 * Eén betekenis per kleur, overal in de app hetzelfde:
 *   blauw = gepland · oranje = in uitvoering · groen = afgerond
 *   grijs = concept/geannuleerd · amber = open
 *
 * De punt is dezelfde kleur als de tekst: het ontwerp gebruikt geen derde
 * tint, en zo blijft een badge ook leesbaar als iemand alleen de punt ziet.
 */
function variantsFor(t: ThemeColors): Record<CanonicalKey, StatusTone> {
  return {
    gepland: { bg: t.statusSubmitBg, fg: t.statusSubmitFg, dot: t.statusSubmitFg },
    in_progress: { bg: t.statusBezigBg, fg: t.statusBezigFg, dot: t.statusBezigFg },
    completed: { bg: t.statusApproveBg, fg: t.statusApproveFg, dot: t.statusApproveFg },
    cancelled: { bg: t.statusDraftBg, fg: t.statusDraftFg, dot: t.statusDraftFg },
    concept: { bg: t.statusDraftBg, fg: t.statusDraftFg, dot: t.statusDraftFg },
    open: { bg: t.statusWarnBg, fg: t.statusWarnFg, dot: t.statusWarnFg },
  };
}

function defaultVariant(t: ThemeColors): StatusTone {
  return { bg: t.statusDraftBg, fg: t.statusDraftFg, dot: t.statusDraftFg };
}
const reportedUnknown = new Set<string>();

function normalize(raw: WorkOrderStatus | string | null | undefined): {
  key: CanonicalKey | null;
  raw: string;
} {
  const rawStr = String(raw ?? '').trim();
  if (!rawStr) return { key: null, raw: '' };
  const normalized = rawStr.toLowerCase().replace(/\s+/g, '_');
  const key = KEY_ALIASES[normalized] ?? KEY_ALIASES[rawStr.toLowerCase()];
  return { key: key ?? null, raw: rawStr };
}

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const { colors: t } = useTheme();
  const { key, raw } = normalize(status);
  const v = key ? variantsFor(t)[key] : defaultVariant(t);
  const label = key ? LABELS[key] : prettifyUnknown(raw);

  if (__DEV__ && !key && raw && !reportedUnknown.has(raw)) {
    reportedUnknown.add(raw);
    console.log('[StatusBadge] unknown status value:', JSON.stringify(raw));
  }

  return (
    <View style={[styles.base, { backgroundColor: v.bg }]}>
      <View style={[styles.dot, { backgroundColor: v.dot }]} />
      <Text style={[styles.text, { color: v.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * De canonieke sleutel achter een status, zonder component.
 *
 * Schermen die op status moeten rekenen — "hoeveel werkbonnen zijn vandaag
 * afgerond", "welke klus is nu bezig" — mogen die vraag niet met hun eigen
 * lijstje Nederlandse en Engelse synoniemen beantwoorden. Dan lopen twee
 * waarheden uiteen zodra de backend een nieuwe schrijfwijze gebruikt. Hier is
 * één lijst, en die zit al in `KEY_ALIASES`.
 */
export type StatusKey = CanonicalKey;

export function statusKey(
  status: WorkOrderStatus | string | null | undefined,
): CanonicalKey | null {
  return normalize(status).key;
}

export function statusLabel(status: WorkOrderStatus): string {
  const { key, raw } = normalize(status);
  return key ? LABELS[key] : prettifyUnknown(raw);
}

/**
 * De toon van een status buiten een component om.
 *
 * Geef `theme` mee als de aanroeper het thema kent (`useTheme().colors`);
 * zonder dat argument komt het lichte palet terug. Dat is geen luiheid maar een
 * bewuste terugval: een kaart die zijn eigen randkleur uit deze toon haalt moet
 * ook werken op een plek waar geen ThemeProvider in de boom zit.
 */
export function statusTone(status: WorkOrderStatus, theme?: ThemeColors): StatusTone {
  const t = theme ?? lightTheme;
  const { key } = normalize(status);
  return key ? variantsFor(t)[key] : defaultVariant(t);
}

function prettifyUnknown(raw: string): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
