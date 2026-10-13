import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarCheck,
  Check,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/providers';
import { activiteitTypeLabel, type ActivityRow } from '@/services/activityService';
import type { ActiviteitStatus } from '@/lib/activiteitStatus';
import { lokaleDatum, lokaleTijd } from '@/lib/nlTijd';
import { ds, type ThemeColors } from '@/theme';

/**
 * Eén activiteit in een lijst — de rij van `ActivitiesPageV2` in het dashboard:
 * accentbalk links (rood te laat, blauw vandaag, groen afgerond), type-icoon,
 * titel, klant, datum + tijd, verantwoordelijke en een statuslabel, met een
 * vinkknop om af te ronden of te heropenen. Gebruikt op Activiteiten en op de
 * homepage.
 */

const TYPE_ICON: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  visit: MapPin,
  task: ListChecks,
  follow: RotateCcw,
  meeting: Users,
  note: ListChecks,
};

const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "di 3 mei · 09:00" in Nederlandse tijd; leeg zonder datum. */
export function activiteitMoment(dueAt: string | null): string {
  if (!dueAt) return '';
  const dag = lokaleDatum(dueAt);
  if (!dag) return '';
  const [y, m, d] = dag.split('-').map(Number);
  const wd = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${DAG_KORT[wd]} ${d} ${MAAND_KORT[(m ?? 1) - 1]} · ${lokaleTijd(dueAt)}`;
}

export const STATUS_LABEL: Record<ActiviteitStatus, string> = {
  overdue: 'Te laat',
  today: 'Vandaag',
  open: 'Open',
  completed: 'Gereed',
};

export function statusKleuren(
  t: ThemeColors,
  status: ActiviteitStatus,
): { bg: string; fg: string; balk: string } {
  switch (status) {
    case 'overdue':
      return { bg: t.statusRejectBg, fg: t.statusRejectFg, balk: t.statusRejectFg };
    case 'today':
      return { bg: t.statusSubmitBg, fg: t.statusSubmitFg, balk: t.statusSubmitFg };
    case 'completed':
      return { bg: t.statusApproveBg, fg: t.statusApproveFg, balk: t.statusApproveFg };
    default:
      return { bg: t.statusDraftBg, fg: t.statusDraftFg, balk: 'transparent' };
  }
}

function typeKleuren(t: ThemeColors, type: string | null): { bg: string; fg: string } {
  switch (type) {
    case 'call':
      return { bg: t.statusSubmitBg, fg: t.statusSubmitFg };
    case 'email':
    case 'visit':
      return { bg: t.statusApproveBg, fg: t.statusApproveFg };
    case 'follow':
      return { bg: t.statusWarnBg, fg: t.statusWarnFg };
    default:
      return { bg: t.statusInfoBg, fg: t.statusInfoFg };
  }
}

type Props = {
  activiteit: ActivityRow;
  status: ActiviteitStatus;
  /** Naam van de verantwoordelijke; leeg = niet tonen. */
  medewerker?: string;
  /** Klantnaam tonen? Op een klantkaart is dat dubbel. */
  toonKlant?: boolean;
  first?: boolean;
  onPress?: () => void;
  /** Afronden/heropenen. Zonder deze prop geen vinkknop. */
  onVink?: () => void;
  vinkBezig?: boolean;
};

export function ActiviteitRij({
  activiteit: a,
  status,
  medewerker,
  toonKlant = true,
  first,
  onPress,
  onVink,
  vinkBezig,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const sk = statusKleuren(t, status);
  const tk = typeKleuren(t, a.type);
  const Icon = (a.type && TYPE_ICON[a.type]) || CalendarCheck;
  const klaar = status === 'completed';
  const teLaat = status === 'overdue';

  const meta = [
    activiteitTypeLabel(a.type),
    toonKlant ? a.customer?.name : null,
    activiteitMoment(a.due_at),
    medewerker,
  ]
    .filter(Boolean)
    .join(' · ');

  const inhoud = (
    <View style={[styles.rij, !first && styles.rand]}>
      <View style={[styles.balk, { backgroundColor: sk.balk }, klaar && { opacity: 0.5 }]} />
      <View style={[styles.icoon, { backgroundColor: tk.bg }]}>
        <Icon size={17} color={tk.fg} strokeWidth={2} />
      </View>
      <View style={[styles.midden, klaar && { opacity: 0.62 }]}>
        <Text
          style={[
            styles.titel,
            teLaat && { color: t.statusRejectFg },
            klaar && styles.doorgestreept,
          ]}
          numberOfLines={2}
        >
          {a.title || 'Activiteit'}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {meta}
        </Text>
        <View style={[styles.badge, { backgroundColor: sk.bg }]}>
          <View style={[styles.badgeStip, { backgroundColor: sk.fg }]} />
          <Text style={[styles.badgeTekst, { color: sk.fg }]}>{STATUS_LABEL[status]}</Text>
        </View>
      </View>
      {onVink ? (
        <Pressable
          onPress={onVink}
          disabled={vinkBezig}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: klaar, disabled: !!vinkBezig }}
          accessibilityLabel={klaar ? `${a.title ?? 'Activiteit'} heropenen` : `${a.title ?? 'Activiteit'} markeren als gereed`}
          style={({ pressed }) => [styles.vinkVlak, (pressed || vinkBezig) && { opacity: 0.6 }]}
        >
          <View style={[styles.vink, klaar && styles.vinkAan]}>
            {klaar ? <Check size={15} color={ds.greenInk} strokeWidth={3} /> : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );

  if (!onPress) return inhoud;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a.title ?? 'Activiteit'}, ${STATUS_LABEL[status]}`}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}
    >
      {inhoud}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 14,
      paddingRight: 6,
      paddingVertical: 12,
      minHeight: 64,
    },
    rand: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    balk: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
    icoon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    midden: { flex: 1, minWidth: 0, gap: 3 },
    titel: { fontSize: 15, fontWeight: '600', color: t.ink },
    doorgestreept: { textDecorationLine: 'line-through' },
    meta: { fontSize: 12.5, color: t.muted },
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      height: 20,
      borderRadius: 10,
      marginTop: 2,
    },
    badgeStip: { width: 6, height: 6, borderRadius: 3 },
    badgeTekst: { fontSize: 11.5, fontWeight: '700' },
    vinkVlak: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    vink: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.6,
      borderColor: t.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vinkAan: { backgroundColor: ds.green, borderColor: ds.green },
  });
