import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import {
  alsMaten,
  maatVelden,
  MAAT_EENHEDEN,
  SOORTEN,
  toonSom,
  type BrancheVeld,
  type Eenheid,
  type MetingForm,
  type Soort,
} from '@/lib/metingen';

/**
 * De velden van één meting, zoals `MetingVelden` in het dashboard
 * (MetingenBlok.jsx): naam, soort, aantal, de maten die bij de soort horen,
 * eenheid, de berekening ernaast, de velden van de branche en een opmerking.
 *
 * Gebruikt in het formulier (toevoegen/wijzigen) en per regel in de
 * controlelijst van "Vertel het Boss". Maten als tekst met komma; een
 * cijfertoetsenbord. Onzekere velden (twijfel van Boss) krijgen een oranje rand.
 *
 * De koppeling met Materialen (prijs voor de offerte) zit alleen in het
 * dashboard; de app laat die staan en toont hier geen prijzen.
 */
const MAAT_LABEL: Record<string, string> = { breedte: 'Breedte', hoogte: 'Hoogte', diepte: 'Diepte' };

type Sleutel = keyof MetingForm;

export function MetingVelden({
  m,
  set,
  velden,
  twijfelVelden = [],
  disabled = false,
}: {
  m: MetingForm;
  set: <K extends Sleutel>(k: K, v: MetingForm[K]) => void;
  velden: BrancheVeld[];
  twijfelVelden?: string[];
  disabled?: boolean;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const twijfel = (k: string) => twijfelVelden.includes(k);
  const maten = maatVelden(m.soort) as ('breedte' | 'hoogte' | 'diepte')[];
  const som = toonSom(alsMaten(m));

  return (
    <View style={s.kolom}>
      <Invoer
        label="Naam"
        value={m.naam}
        onChangeText={(v) => set('naam', v)}
        placeholder="Raam woonkamer links"
        twijfel={twijfel('naam')}
        editable={!disabled}
        maxLength={120}
      />

      <View style={s.kolomKlein}>
        <Text style={s.label}>Soort</Text>
        <Keuzes
          opties={(SOORTEN as { value: Soort; label: string; eenheid: string }[]).map((x) => ({ id: x.value, label: `${x.label} (${x.eenheid})` }))}
          waarde={m.soort}
          onKies={(v) => set('soort', v as Soort)}
          twijfel={twijfel('soort')}
          disabled={disabled}
        />
      </View>

      <View style={s.rij}>
        <View style={s.aantal}>
          <Invoer
            label="Aantal"
            value={m.aantal}
            onChangeText={(v) => set('aantal', v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            twijfel={twijfel('aantal')}
            editable={!disabled}
          />
        </View>
        {maten.map((k) => (
          <View key={k} style={s.maat}>
            <Invoer
              label={m.soort === 'lengte' ? 'Lengte' : (MAAT_LABEL[k] ?? k)}
              value={m[k]}
              onChangeText={(v) => set(k, v.replace(/[^\d.,]/g, ''))}
              keyboardType="decimal-pad"
              twijfel={twijfel(k)}
              editable={!disabled}
            />
          </View>
        ))}
      </View>

      {maten.length > 0 ? (
        <View style={s.eenheidRij}>
          <Text style={s.label}>Eenheid</Text>
          <Keuzes
            opties={(MAAT_EENHEDEN as Eenheid[]).map((e) => ({ id: e, label: e }))}
            waarde={m.eenheid}
            onKies={(v) => set('eenheid', v as Eenheid)}
            twijfel={twijfel('eenheid')}
            disabled={disabled}
          />
        </View>
      ) : null}

      <Text style={[s.som, !som && { color: t.muted }]} accessibilityLiveRegion="polite">
        {som || (maten.length ? 'Vul de maten in' : '')}
      </Text>

      {velden.map((v) => (
        <View key={v.key} style={s.kolomKlein}>
          <Invoer
            label={v.label}
            value={m.extra?.[v.key] ?? ''}
            onChangeText={(x) => set('extra', { ...(m.extra || {}), [v.key]: x })}
            placeholder={v.placeholder || (v.opties ? 'Kies of typ' : '')}
            editable={!disabled}
            maxLength={120}
          />
          {v.opties ? (
            <Keuzes
              opties={v.opties.map((o) => ({ id: o, label: o }))}
              waarde={m.extra?.[v.key] ?? ''}
              onKies={(o) => set('extra', { ...(m.extra || {}), [v.key]: m.extra?.[v.key] === o ? '' : o })}
              disabled={disabled}
              klein
            />
          ) : null}
        </View>
      ))}

      <Invoer
        label="Opmerking"
        value={m.opmerking}
        onChangeText={(v) => set('opmerking', v)}
        placeholder="bijv. schuin kozijn, onder 2 mm kleiner"
        editable={!disabled}
        maxLength={300}
      />
    </View>
  );
}

function Invoer({
  label,
  twijfel,
  ...rest
}: ComponentProps<typeof TextInput> & { label: string; twijfel?: boolean }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.kolomKlein}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        placeholderTextColor={t.muted2}
        style={[s.invoer, twijfel && s.twijfel]}
      />
    </View>
  );
}

function Keuzes({
  opties,
  waarde,
  onKies,
  twijfel,
  disabled,
  klein,
}: {
  opties: { id: string; label: string }[];
  waarde: string;
  onKies: (id: string) => void;
  twijfel?: boolean;
  disabled?: boolean;
  klein?: boolean;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.keuzes} accessibilityRole="radiogroup">
      {opties.map((o) => {
        const aan = o.id === waarde;
        return (
          <Pressable
            key={o.id}
            onPress={() => onKies(o.id)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: aan, disabled }}
            aria-checked={aan}
            accessibilityLabel={o.label}
            style={({ pressed }) => [
              s.keuze,
              klein && s.keuzeKlein,
              aan && s.keuzeAan,
              twijfel && !aan && s.twijfel,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[s.keuzeTekst, klein && s.keuzeTekstKlein, aan && s.keuzeTekstAan]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kolom: { gap: spacing.md },
    kolomKlein: { gap: 6 },
    rij: { flexDirection: 'row', gap: spacing.sm },
    aantal: { width: 72 },
    maat: { flex: 1, minWidth: 0 },
    eenheidRij: { gap: 6 },
    label: { ...typography.label, color: t.muted2 },
    invoer: {
      minHeight: 48,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: spacing.sm,
      fontSize: 16,
      color: t.ink,
      backgroundColor: t.card,
    },
    twijfel: { borderColor: t.statusWarnStripe, borderWidth: 1.5, backgroundColor: t.statusWarnBg },
    som: { fontSize: 15, fontWeight: '700', color: t.ink },
    keuzes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    keuze: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keuzeKlein: { minHeight: 34, paddingHorizontal: 10 },
    keuzeAan: { backgroundColor: t.ink, borderColor: t.ink },
    keuzeTekst: { fontSize: 14, fontWeight: '600', color: t.ink2 },
    keuzeTekstKlein: { fontSize: 13 },
    keuzeTekstAan: { color: t.card },
  });
