import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { formatEUR } from '@/lib/format';
import {
  BTW_REGIMES,
  berekenTotalen,
  heeftVerlegdConflict,
  legeRegel,
  pasTypeToe,
  pctVanRegime,
  regelprijs,
  typeConfig,
  typeOpties,
  type BtwRegime,
  type EigenEenheid,
  type Regel,
} from '@/lib/regels';
import { spacing, type ThemeColors } from '@/theme';
import { FormField } from './FormField';
import { SelectField } from './SelectField';
import { NoticeBanner } from './NoticeBanner';

type Props = {
  regels: Regel[];
  onChange: (regels: Regel[]) => void;
  /** Standaardtarieven uit de bedrijfsinstellingen, net als in het dashboard. */
  standaard: { uurtarief: number; reiskostenPerKm: number; btwPct: number };
  eenheden?: EigenEenheid[];
  disabled?: boolean;
};

/**
 * De regels van een offerte of factuur, met dezelfde opties als het dashboard:
 * type (Uren / Km / Overig / eigen eenheid), omschrijving, aantal, prijs per
 * eenheid en btw-regime. Toevoegen, wijzigen, volgorde verschuiven en
 * verwijderen — en onderaan de totalen, per btw-tarief uitgesplitst.
 *
 * De volgorde is niet cosmetisch: hij wordt als `volgorde` opgeslagen en bepaalt
 * hoe de regels op de PDF en in het dashboard staan. Slepen werkt slecht in een
 * formulier dat zelf al scrollt, dus verschuiven gaat met twee knoppen.
 *
 * De berekening staat in `lib/regels.ts` en is gedeeld met de servicelaag, zodat
 * wat hier op het scherm staat exact is wat er wordt weggeschreven.
 */
export function RegelEditor({ regels, onChange, standaard, eenheden = [], disabled }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const totalen = berekenTotalen(regels);
  const verlegdConflict = heeftVerlegdConflict(regels);

  const zet = (sleutel: string, verandering: (r: Regel) => Regel) =>
    onChange(regels.map((r) => (r.sleutel === sleutel ? verandering(r) : r)));

  const verschuif = (index: number, richting: -1 | 1) => {
    const doel = index + richting;
    if (doel < 0 || doel >= regels.length) return;
    const kopie = [...regels];
    const [eruit] = kopie.splice(index, 1);
    kopie.splice(doel, 0, eruit!);
    onChange(kopie);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.kop}>Regels</Text>

      {regels.map((r, i) => {
        const cfg = typeConfig(r.type, eenheden);
        return (
          <View key={r.sleutel} style={styles.kaart}>
            <View style={styles.kaartKop}>
              <Text style={styles.kaartNr}>Regel {i + 1}</Text>
              <View style={styles.knoppen}>
                <IconKnop
                  styles={styles}
                  label="Naar boven"
                  disabled={disabled || i === 0}
                  onPress={() => verschuif(i, -1)}
                >
                  <ChevronUp size={16} color={t.ink} strokeWidth={2} />
                </IconKnop>
                <IconKnop
                  styles={styles}
                  label="Naar beneden"
                  disabled={disabled || i === regels.length - 1}
                  onPress={() => verschuif(i, 1)}
                >
                  <ChevronDown size={16} color={t.ink} strokeWidth={2} />
                </IconKnop>
                <IconKnop
                  styles={styles}
                  label="Regel verwijderen"
                  disabled={disabled || regels.length === 1}
                  onPress={() => onChange(regels.filter((x) => x.sleutel !== r.sleutel))}
                >
                  <Trash2 size={16} color={t.statusRejectFg} strokeWidth={2} />
                </IconKnop>
              </View>
            </View>

            <SelectField
              label="Soort"
              value={r.type}
              options={typeOpties(eenheden, r.type)}
              onChange={(id) =>
                id && zet(r.sleutel, (x) => pasTypeToe(x, id, standaard, eenheden))
              }
              disabled={disabled}
            />

            <FormField
              label="Omschrijving"
              value={r.omschrijving}
              onChangeText={(v) => zet(r.sleutel, (x) => ({ ...x, omschrijving: v }))}
              placeholder={cfg.omschrijvingFallback}
              editable={!disabled}
            />

            <View style={styles.rij}>
              <View style={{ flex: 1 }}>
                <FormField
                  label={cfg.eenheid ? `Aantal (${cfg.eenheid})` : 'Aantal'}
                  value={r.aantal}
                  onChangeText={(v) => zet(r.sleutel, (x) => ({ ...x, aantal: v }))}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  editable={!disabled}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Prijs per eenheid"
                  value={r.prijs}
                  onChangeText={(v) => zet(r.sleutel, (x) => ({ ...x, prijs: v }))}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  editable={!disabled}
                />
              </View>
            </View>

            <SelectField
              label="Btw"
              value={r.btwRegime}
              options={BTW_REGIMES.map((b) => ({ id: b.value, label: b.label, sub: b.kort }))}
              onChange={(id) =>
                id &&
                zet(r.sleutel, (x) => ({
                  ...x,
                  btwRegime: id as BtwRegime,
                  btwPct: pctVanRegime(id as BtwRegime, x.btwPct),
                }))
              }
              disabled={disabled}
            />

            <View style={styles.regelTotaal}>
              <Text style={styles.regelTotaalLabel}>Regelbedrag</Text>
              <Text style={styles.regelTotaalBedrag}>{formatEUR(regelprijs(r))}</Text>
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={() =>
          onChange([
            ...regels,
            legeRegel({ uurtarief: standaard.uurtarief, btwPct: standaard.btwPct }),
          ])
        }
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [styles.voegToe, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
      >
        <Plus size={18} color={t.green700} strokeWidth={2.4} />
        <Text style={styles.voegToeTekst}>Regel toevoegen</Text>
      </Pressable>

      {verlegdConflict ? (
        <NoticeBanner
          toon="waarschuwing"
          message={
            'Verlegde btw staat naast belaste regels. Dat weigert de boekhoudkoppeling, en ' +
            'fiscaal kan het niet samen op één document.'
          }
        />
      ) : null}

      <View style={styles.totalen}>
        <Rij styles={styles} label="Subtotaal excl. btw" bedrag={totalen.excl} />
        {totalen.btwPerTarief
          .filter((b) => b.bedrag !== 0)
          .map((b) => (
            <Rij key={b.pct} styles={styles} label={`Btw ${b.pct}%`} bedrag={b.bedrag} />
          ))}
        <Rij styles={styles} label="Totaal incl. btw" bedrag={totalen.incl} groot />
      </View>
    </View>
  );
}

function Rij({
  styles,
  label,
  bedrag,
  groot,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  bedrag: number;
  groot?: boolean;
}) {
  return (
    <View style={styles.totaalRij}>
      <Text style={[styles.totaalLabel, groot && styles.totaalLabelGroot]}>{label}</Text>
      <Text style={[styles.totaalBedrag, groot && styles.totaalBedragGroot]}>
        {formatEUR(bedrag)}
      </Text>
    </View>
  );
}

function IconKnop({
  styles,
  label,
  onPress,
  disabled,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconKnop, disabled && { opacity: 0.3 }, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kop: { fontSize: 12.5, fontWeight: '600', color: t.muted2 },
    kaart: {
      backgroundColor: t.bgAlt,
      borderRadius: t.rMd,
      padding: spacing.md,
      gap: spacing.md,
    },
    kaartKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kaartNr: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: t.muted2 },
    knoppen: { flexDirection: 'row', gap: 4 },
    iconKnop: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
    },
    rij: { flexDirection: 'row', gap: spacing.md },
    regelTotaal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingTop: 2,
    },
    regelTotaalLabel: { fontSize: 12.5, color: t.muted },
    regelTotaalBedrag: { fontSize: 14, fontWeight: '700', color: t.ink },
    voegToe: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: t.rMd,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: t.green700,
    },
    voegToeTekst: { fontSize: 14, fontWeight: '700', color: t.green700 },
    totalen: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.rMd,
      padding: spacing.md,
      gap: 6,
    },
    totaalRij: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    totaalLabel: { fontSize: 13, color: t.muted },
    totaalLabelGroot: { fontSize: 14, fontWeight: '700', color: t.ink },
    totaalBedrag: { fontSize: 13, fontWeight: '600', color: t.ink },
    totaalBedragGroot: { fontSize: 17, fontWeight: '700', color: t.green700 },
  });
