import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import {
  aftrekVelden,
  alsMaten,
  berekenAftrek,
  maatVelden,
  MAAT_EENHEDEN,
  SOORTEN,
  toonSom,
  toonWaarde,
  type AftrekpostForm,
  type BrancheVeld,
  type Eenheid,
  type MetingForm,
  type Soort,
} from '@/lib/metingen';
import { tx, txm } from '@/i18n';

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
const MAAT_LABEL: Record<string, string> = { breedte: txm('Breedte'), hoogte: txm('Hoogte'), diepte: txm('Diepte') };
// De labels van SOORTEN komen uit de vendored dashboardcode; hier gemarkeerd voor vertaling.
const SOORT_LABEL: Record<string, string> = {
  oppervlak: txm('Oppervlak'),
  lengte: txm('Lengte'),
  omtrek: txm('Omtrek'),
  stuks: txm('Stuks'),
  inhoud: txm('Inhoud'),
};

type Sleutel = keyof MetingForm;

export function MetingVelden({
  m,
  set,
  velden,
  twijfelVelden = [],
  disabled = false,
  metAftrek = false,
}: {
  m: MetingForm;
  set: <K extends Sleutel>(k: K, v: MetingForm[K]) => void;
  velden: BrancheVeld[];
  twijfelVelden?: string[];
  disabled?: boolean;
  /** Aftrekposten tonen (het gewone formulier; niet in de controlelijst van Boss). */
  metAftrek?: boolean;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const twijfel = (k: string) => twijfelVelden.includes(k);
  const maten = maatVelden(m.soort) as ('breedte' | 'hoogte' | 'diepte')[];
  const som = toonSom(alsMaten(m));

  return (
    <View style={s.kolom}>
      <Invoer
        label={tx('Naam')}
        value={m.naam}
        onChangeText={(v) => set('naam', v)}
        placeholder={tx('Raam woonkamer links')}
        twijfel={twijfel('naam')}
        editable={!disabled}
        maxLength={120}
      />

      <View style={s.kolomKlein}>
        <Text style={s.label}>{tx('Soort')}</Text>
        <Keuzes
          opties={(SOORTEN as { value: Soort; label: string; eenheid: string }[]).map((x) => ({
            id: x.value,
            label: `${tx(SOORT_LABEL[x.value] ?? x.label)} (${x.eenheid === 'stuk' ? tx('stuk') : x.eenheid})`,
          }))}
          waarde={m.soort}
          onKies={(v) => set('soort', v as Soort)}
          twijfel={twijfel('soort')}
          disabled={disabled}
        />
      </View>

      <View style={s.rij}>
        <View style={s.aantal}>
          <Invoer
            label={tx('Aantal')}
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
              label={m.soort === 'lengte' ? tx('Lengte') : MAAT_LABEL[k] ? tx(MAAT_LABEL[k]) : k}
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
          <Text style={s.label}>{tx('Eenheid')}</Text>
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
        {som || (maten.length ? tx('Vul de maten in') : '')}
      </Text>

      {metAftrek && m.soort !== 'stuks' ? <AftrekPosten m={m} set={set} disabled={disabled} /> : null}

      {velden.map((v) => (
        <View key={v.key} style={s.kolomKlein}>
          <Invoer
            label={v.label}
            value={m.extra?.[v.key] ?? ''}
            onChangeText={(x) => set('extra', { ...(m.extra || {}), [v.key]: x })}
            placeholder={v.placeholder || (v.opties ? tx('Kies of typ') : '')}
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
        label={tx('Opmerking')}
        value={m.opmerking}
        onChangeText={(v) => set('opmerking', v)}
        placeholder={tx('bijv. schuin kozijn, onder 2 mm kleiner')}

        editable={!disabled}
        maxLength={300}
      />
    </View>
  );
}

const LEGE_POST: AftrekpostForm = { naam: '', breedte: '', hoogte: '', diepte: '', aantal: '1' };

/**
 * Aftrekposten, zoals in het dashboard (MetingenBlok.jsx): wat van de meting af
 * gaat, zoals het raam en de deur van een wand. In de eenheid van de meting; de
 * database trekt het af (bb_meting_waarde).
 */
function AftrekPosten({
  m,
  set,
  disabled,
}: {
  m: MetingForm;
  set: <K extends Sleutel>(k: K, v: MetingForm[K]) => void;
  disabled?: boolean;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const posten = m.aftrekposten ?? [];
  const velden = aftrekVelden(m.soort) as ('breedte' | 'hoogte' | 'diepte')[];
  const zet = (i: number, k: keyof AftrekpostForm, v: string) =>
    set('aftrekposten', posten.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const totaal = berekenAftrek(alsMaten(m));
  const eenheid = (SOORTEN as { value: Soort; eenheid: string }[]).find((x) => x.value === m.soort)?.eenheid ?? '';
  return (
    <View style={s.aftrek}>
      {posten.length > 0 ? (
        <Text style={s.label}>
          {tx('Aftrekposten (in {eenheid})', { eenheid: m.eenheid })}
          {totaal > 0 ? ` · ${tx('samen {w}', { w: toonWaarde(Math.round(totaal * 100) / 100, eenheid) })}` : ''}
        </Text>
      ) : null}
      {posten.map((p, i) => (
        <View key={i} style={s.kolomKlein}>
          <View style={s.rij}>
            <View style={s.maat}>
              <Invoer
                label={tx('Naam')}
                value={p.naam}
                onChangeText={(v) => zet(i, 'naam', v)}
                placeholder={m.soort === 'oppervlak' ? tx('Bijv. raamkozijn') : tx('Bijv. geen onderdorpel')}
                editable={!disabled}
                maxLength={120}
              />
            </View>
            <Pressable
              onPress={() => set('aftrekposten', posten.filter((_, j) => j !== i))}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={tx('Aftrekpost verwijderen')}
              style={({ pressed }) => [s.weg, pressed && { opacity: 0.6 }]}
            >
              <Text style={s.wegTekst}>×</Text>
            </Pressable>
          </View>
          <View style={s.rij}>
            <View style={s.aantal}>
              <Invoer
                label={tx('Aantal')}
                value={p.aantal}
                onChangeText={(v) => zet(i, 'aantal', v.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                editable={!disabled}
              />
            </View>
            {velden.map((k) => (
              <View key={k} style={s.maat}>
                <Invoer
                  label={velden.length === 1 ? tx('Lengte') : MAAT_LABEL[k] ? tx(MAAT_LABEL[k]) : k}
                  value={p[k]}
                  onChangeText={(v) => zet(i, k, v.replace(/[^\d.,]/g, ''))}
                  keyboardType="decimal-pad"
                  editable={!disabled}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      <Pressable
        onPress={() => set('aftrekposten', [...posten, { ...LEGE_POST }])}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [s.keuze, s.keuzeKlein, { alignSelf: 'flex-start' }, pressed && { opacity: 0.7 }]}
      >
        <Text style={[s.keuzeTekst, s.keuzeTekstKlein]}>+ {tx('Aftrekpost')}</Text>
      </Pressable>
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
    aftrek: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: t.bg },
    weg: { width: 40, alignSelf: 'flex-end', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    wegTekst: { fontSize: 22, color: t.muted },
  });
