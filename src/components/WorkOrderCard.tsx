import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera as CameraIcon,
  ChevronRight,
  Clock,
  Hourglass,
  MapPin,
  MoreHorizontal,
  Navigation as NavigationIcon,
  Phone,
  StickyNote,
  TriangleAlert,
} from 'lucide-react-native';
import { StatusBadge, statusTone } from './StatusBadge';
import { useTheme } from '@/providers';
import type { ThemeColors } from '@/theme';
import type { WorkOrderWithCustomer } from '@/types/domain';

/**
 * De kaartkleuren komen nu uit het thema in plaats van uit een eigen lijstje.
 * Daarmee volgt de werkbonkaart het goedgekeurde ontwerp én werkt dark mode;
 * eerder droeg deze kaart een eigen palet mee en bleef hij in donkere modus
 * gewoon wit.
 */
function paletVan(t: ThemeColors) {
  return {
    green: t.green,
    greenInk: t.greenInk,
    card: t.card,
    hair: t.line,
    hairStrong: t.lineStrong,
    ink: t.ink,
    textMute: t.muted,
    textFaint: t.muted2,
    attentionInk: t.statusWarnFg,
    attentionBg: t.statusWarnBg,
    cardAlt: t.bgAlt,
  };
}

type Props = {
  workOrder: WorkOrderWithCustomer;
  /** Derived attention items (e.g. "Notitie toegevoegd"). */
  attention?: string[];
  /** Right-side meta — daypart/time string (e.g. "Vandaag · 08:30 – 10:00"). */
  timeLabel?: string;
  onPress: () => void;
  onCall?: () => void;
  onNavigate?: () => void;
  onMore?: () => void;
};

export function WorkOrderCard({
  workOrder,
  attention = [],
  timeLabel,
  onPress,
  onCall,
  onNavigate,
  onMore,
}: Props) {
  const { colors: t } = useTheme();
  const C = useMemo(() => paletVan(t), [t]);
  const styles = useMemo(() => makeStyles(C, t), [C, t]);
  const tone = statusTone(workOrder.status, t);
  const city = extractCity(workOrder.locatie ?? workOrder.customer?.address ?? null);
  const assignee = workOrder.assigned_to ? 'Toegewezen' : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Status accent stripe */}
      <View style={[styles.stripe, { backgroundColor: tone.dot }]} />

      <View style={styles.body}>
        {/* Top row: client + status pill */}
        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <Text style={styles.client} numberOfLines={1}>
              {workOrder.customer?.name ?? workOrder.titel}
            </Text>
            {workOrder.titel && workOrder.customer?.name ? (
              <Text style={styles.desc} numberOfLines={1}>
                {workOrder.titel}
              </Text>
            ) : workOrder.omschrijving ? (
              <Text style={styles.desc} numberOfLines={1}>
                {workOrder.omschrijving}
              </Text>
            ) : null}
          </View>
          <StatusBadge status={workOrder.status} />
        </View>

        {/* Meta row: time + city */}
        {(timeLabel || city) ? (
          <View style={styles.metaRow}>
            {timeLabel ? (
              <View style={styles.metaItem}>
                <Clock size={13} color={C.textMute} strokeWidth={2} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {timeLabel}
                </Text>
              </View>
            ) : null}
            {timeLabel && city ? <View style={styles.metaDot} /> : null}
            {city ? (
              <View style={styles.metaItem}>
                <MapPin size={13} color={C.textMute} strokeWidth={2} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {city}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Attention strip */}
        {attention.length > 0 ? (
          <View style={styles.attention}>
            <TriangleAlert size={13} color={C.attentionInk} strokeWidth={2} />
            <Text style={styles.attentionText} numberOfLines={1}>
              {attention.join(' · ')}
            </Text>
          </View>
        ) : null}

        {/* Footer action row */}
        <View style={styles.footer}>
          {assignee ? (
            <Text style={styles.assignee} numberOfLines={1}>
              {assignee}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {onCall ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onCall();
              }}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <Phone size={16} color={C.ink} strokeWidth={2} />
            </Pressable>
          ) : null}
          {onNavigate ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <NavigationIcon size={16} color={C.ink} strokeWidth={2} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onMore?.();
            }}
            style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.openLabel}>Open</Text>
            <ChevronRight size={14} color={C.greenInk} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// Re-export a couple of attention icons so the screen can build a consistent
// attention chip without duplicating the icon map.
export const attentionIconFor = (label: string) => {
  if (/foto/i.test(label)) return CameraIcon;
  if (/uren/i.test(label)) return Hourglass;
  if (/notitie/i.test(label)) return StickyNote;
  if (/meer|more/i.test(label)) return MoreHorizontal;
  return TriangleAlert;
};

function extractCity(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? (parts[parts.length - 1] ?? null) : (parts[0] ?? null);
}

const makeStyles = (C: ReturnType<typeof paletVan>, t: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.hair,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardPressed: {
    backgroundColor: C.cardAlt,
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  client: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  desc: {
    fontSize: 12.5,
    color: C.textMute,
    marginTop: 1,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    color: C.textMute,
    fontWeight: '500',
    flexShrink: 1,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.hairStrong,
  },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: C.attentionBg,
    borderRadius: 10,
    marginTop: 11,
  },
  attentionText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.attentionInk,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  assignee: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: C.textMute,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.hair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: C.green,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.greenInk,
    letterSpacing: -0.1,
  },
});
