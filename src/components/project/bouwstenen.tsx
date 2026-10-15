import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Pencil, Plus } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';

/**
 * Bouwstenen van de projectkaart, gedeeld door het overzicht en de tabs
 * (`ProjectDetailScherm` en de losse tab-bestanden in deze map).
 */

// ── Bouwstenen (buiten de render, anders verliest een invoerveld zijn focus) ──

export function useStijl() {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return { t, styles };
}

/**
 * Een kaart met kop. `onTitel` maakt de titel een link (naar de bijbehorende
 * tab), zoals de titels met een pijltje op de projectkaart van het dashboard.
 */
export function Blok({
  titel,
  actie,
  onTitel,
  children,
}: {
  titel: string;
  actie?: ReactNode;
  onTitel?: () => void;
  children: ReactNode;
}) {
  const { t, styles } = useStijl();
  return (
    <View style={styles.blok}>
      <View style={styles.blokKop}>
        {onTitel ? (
          <Pressable
            onPress={onTitel}
            accessibilityRole="link"
            accessibilityLabel={`${titel} openen`}
            hitSlop={8}
            style={({ pressed }) => [styles.rijMidden, { gap: 2 }, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.blokTitel}>{titel}</Text>
            <ChevronRight size={16} color={t.muted} />
          </Pressable>
        ) : (
          <Text style={styles.blokTitel}>{titel}</Text>
        )}
        {actie}
      </View>
      {children}
    </View>
  );
}

/** Een veld in een `raster` (rij die omslaat). Niet in een kolom zetten: zie `rasterVeld`. */
export function Veld({ label, children }: { label: string; children: ReactNode }) {
  const { styles } = useStijl();
  return (
    <View style={styles.rasterVeld}>
      {label ? <Text style={styles.veldLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

export function KleineKnop({ label, onPress, icon }: { label: string; onPress: () => void; icon?: 'plus' | 'pen' }) {
  const { t, styles } = useStijl();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.kleineKnop, pressed && { opacity: 0.7 }]}
    >
      {icon === 'plus' ? <Plus size={16} color={t.ink2} /> : <Pencil size={14} color={t.ink2} />}
      <Text style={styles.kleineKnopTekst}>{label}</Text>
    </Pressable>
  );
}

export function ActieTegel({
  icon,
  label,
  uit,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  uit?: boolean;
  onPress: () => void;
}) {
  const { styles } = useStijl();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!uit }}
      style={({ pressed }) => [styles.actieTegel, uit && styles.uit, pressed && { opacity: 0.8 }]}
    >
      {icon}
      <Text style={styles.actieTegelTekst}>{label}</Text>
    </Pressable>
  );
}

export function Rij({
  titel,
  sub,
  rechts,
  onPress,
}: {
  titel: string;
  sub?: string;
  rechts?: ReactNode;
  onPress?: () => void;
}) {
  const { t, styles } = useStijl();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.rij, pressed && onPress ? { opacity: 0.7 } : null]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rijTitel} numberOfLines={1}>
          {titel}
        </Text>
        {sub ? (
          <Text style={styles.rijSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {rechts}
      {onPress ? <ChevronRight size={16} color={t.muted2} /> : null}
    </Pressable>
  );
}

export const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { paddingHorizontal: 16, gap: spacing.md },
    blok: {
      backgroundColor: t.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      padding: spacing.lg,
      gap: spacing.md,
    },
    blokKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    blokTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    // `veld` staat in kolommen; `rasterVeld` in de rij die omslaat. Eén stijl
    // voor beide gaf elk veld in een kolom 140px hoogte (flexBasis) en daarmee
    // een groot leeg vlak onder "Behandeld door" en "Prioriteit".
    veldKolom: { gap: 6 },
    rasterVeld: { gap: 2, flexBasis: 140, flexGrow: 1 },
    statusRij: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    behandelaarKnop: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2 },
    stilLink: { minHeight: 32, justifyContent: 'center' },
    stilLinkTekst: { fontSize: 13, fontWeight: '600', color: t.muted },
    prioRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
    prioChips: { flexDirection: 'row', gap: 6 },
    prioChip: {
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    prioChipTekst: { fontSize: 12.5, fontWeight: '600', color: t.ink2 },
    // Groene rand links; de opvulling ernaast 4 minder, zodat de tekst gelijk loopt met de andere kaarten.
    aanvraagBlok: { borderLeftWidth: 4, borderLeftColor: t.green, paddingLeft: spacing.lg - 4 + StyleSheet.hairlineWidth },
    aanvraagEyebrow: { fontSize: 18, fontWeight: '800', color: t.ink, letterSpacing: -0.2 },
    aanvraagVak: { gap: 6, padding: spacing.md, borderRadius: radius.md, backgroundColor: t.green50 },
    aanvraagTekst: { fontSize: 17, lineHeight: 25, fontWeight: '600', color: t.ink },
    websiteVak: {
      gap: 6,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.bgAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    websiteRij: { flexDirection: 'row', gap: spacing.md },
    websiteLabel: { width: 118, fontSize: 13, color: t.muted },
    websiteWaarde: { flex: 1, fontSize: 13, fontWeight: '600', color: t.ink },
    websiteLink: { color: t.green700, textDecorationLine: 'underline' },
    actieRij: { flexDirection: 'row', gap: 10 },
    actieTegel: {
      flex: 1,
      minHeight: 56,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    actieTegelTekst: { fontSize: 12.5, fontWeight: '700', color: t.green700 },
    uit: { opacity: 0.45 },
    veldLabel: { ...typography.eyebrow, color: t.muted2 },
    waarde: { fontSize: 14, fontWeight: '600', color: t.ink },
    klein: { fontSize: 12.5, color: t.muted },
    tekst: { fontSize: 14, lineHeight: 21, color: t.ink },
    leeg: { fontSize: 13, color: t.muted },
    link: { fontSize: 12.5, color: t.green700, textDecorationLine: 'underline', marginTop: 2 },
    raster: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    rijMidden: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    toewijsKnop: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
    kleineKnop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: t.bgAlt,
    },
    kleineKnopTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    rijTitel: { fontSize: 14, fontWeight: '600', color: t.ink },
    rijSub: { fontSize: 12.5, color: t.muted, marginTop: 1 },
    bedrag: { fontSize: 13.5, fontWeight: '700', color: t.ink2 },
    fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
    foto: { width: 92, height: 70, borderRadius: 8, backgroundColor: t.bgAlt },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstAan: { color: t.green700 },
    voet: { alignItems: 'flex-end' },
    formRij: { flexDirection: 'row', gap: spacing.md },
    notitie: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    notitieMeta: { fontSize: 12, color: t.muted, marginBottom: 2 },
    notitieWeg: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    // Samenvatting bovenaan een tab (begroot/geregistreerd/resterend, …).
    tegelWaarde: { fontSize: 16, fontWeight: '700', color: t.ink },
    fotoVak: { position: 'relative' },
    fotoWeg: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
    fotoToevoegen: {
      width: 92,
      height: 70,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.line,
      backgroundColor: t.bgAlt,
    },
    voortgang: { width: 36, height: 3, borderRadius: 3, backgroundColor: t.line, overflow: 'hidden' },
    voortgangBalk: { height: '100%', backgroundColor: t.green },
  });
