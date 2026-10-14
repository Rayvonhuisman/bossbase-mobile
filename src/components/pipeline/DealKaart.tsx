import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { formatEUR } from '@/lib/format';
import { dealWaarde } from '@/lib/pipelineLogica';
import { radius, spacing, type ThemeColors } from '@/theme';
import type { DealRow } from '@/services/dealService';

/**
 * Een pipelinekaart, met dezelfde inhoud als `.pc` in het dashboard: oranje
 * stip zonder vervolgactiviteit, klantnaam, titel, e-mail, telefoon, waarde en
 * prioriteit (alleen Hoog of Laag). De ⋮-knop opent de kaartacties.
 */
export function DealKaart({
  deal,
  geenVervolg,
  onOpen,
  onMenu,
}: {
  deal: DealRow;
  geenVervolg: boolean;
  onOpen: () => void;
  onMenu?: () => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const waarde = dealWaarde(deal);
  const prio = deal.priority === 'high' ? 'Hoog' : deal.priority === 'low' ? 'Laag' : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${deal.customer?.name ?? 'Klant'}, ${deal.title ?? 'aanvraag'} openen`}
      style={({ pressed }) => [styles.kaart, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.kop}>
        {geenVervolg ? (
          <View
            style={styles.stip}
            accessibilityLabel="Geen vervolgactiviteit gepland"
          />
        ) : null}
        <Text style={styles.klant} numberOfLines={1}>
          {deal.customer?.name || 'Klant'}
        </Text>
        {onMenu ? (
          <Pressable
            onPress={onMenu}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Meer acties"
            style={({ pressed }) => [styles.menu, pressed && { opacity: 0.6 }]}
          >
            <MoreVertical size={18} color={t.muted} />
          </Pressable>
        ) : null}
      </View>
      {deal.title ? (
        <Text style={styles.sub} numberOfLines={1}>
          {deal.title}
        </Text>
      ) : null}
      {deal.customer?.email ? (
        <Text style={styles.meta} numberOfLines={1}>
          {deal.customer.email}
        </Text>
      ) : null}
      {deal.customer?.phone ? (
        <Text style={styles.meta} numberOfLines={1}>
          {deal.customer.phone}
        </Text>
      ) : null}
      {waarde > 0 || prio ? (
        <View style={styles.voet}>
          {waarde > 0 ? <Text style={styles.waarde}>{formatEUR(waarde)}</Text> : null}
          {prio ? (
            <View style={[styles.prio, prio === 'Hoog' ? styles.prioHoog : styles.prioLaag]}>
              <Text style={[styles.prioTekst, { color: prio === 'Hoog' ? t.statusRejectFg : t.statusDraftFg }]}>
                {prio}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kaart: {
      backgroundColor: t.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.line,
      paddingVertical: 10,
      paddingLeft: 12,
      paddingRight: 4,
      gap: 2,
      minHeight: 56,
    },
    kop: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
    stip: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#e8784a' },
    klant: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', color: t.ink },
    menu: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginVertical: -4 },
    sub: { fontSize: 13, color: t.muted, paddingRight: 8 },
    meta: { fontSize: 12, color: t.muted2, paddingRight: 8 },
    voet: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, flexWrap: 'wrap' },
    waarde: { fontSize: 13.5, fontWeight: '700', color: t.green700 },
    prio: { paddingHorizontal: 8, height: 20, borderRadius: 10, justifyContent: 'center' },
    prioHoog: { backgroundColor: t.statusRejectBg },
    prioLaag: { backgroundColor: t.statusDraftBg },
    prioTekst: { fontSize: 11.5, fontWeight: '700' },
  });
