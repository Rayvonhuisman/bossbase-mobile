import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Layers, Plus, Trash2 } from 'lucide-react-native';
import { WerkruimteVeld } from './boss/Werkruimte';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import {
  BTW_REGIMES,
  berekenTotalen,
  heeftVerlegdConflict,
  legeRegel,
  nieuweId,
  pasTypeToe,
  pctVanRegime,
  regelprijs,
  typeConfig,
  typeOpties,
  type BtwRegime,
  type EigenEenheid,
  type Groep,
  type Regel,
} from '@/lib/regels';
import { markeerHandmatig } from '@/lib/boss/offerteRegels';
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
  /**
   * Groepen (alleen offertes). Zonder `onGroepenChange` geen groepen: dan werkt
   * de editor als vanouds, met één lijst regels.
   */
  groepen?: Groep[];
  onGroepenChange?: (groepen: Groep[]) => void;
  /** Regels of groepen die Boss net toepaste: een paar seconden een groene rand. */
  flitsIds?: string[];
  /** Totalen onderaan tonen (de Boss-werkruimte toont ze in de voet). */
  metTotalen?: boolean;
};

// Waar een hoeveelheid of prijs van Boss vandaan komt, kort (dashboard `VoorstelRegel`).
const BRON_LABEL: Record<string, string> = {
  opdracht: 'je opdracht', antwoord: 'jouw antwoord', bestand: 'gecontroleerde maat', huidig: 'stond al zo',
  instellingen: 'Instellingen', materiaal: 'Materialen', eigen_eenheid: 'Eigen eenheden', berekening: 'berekend',
};
function herkomstTekst(r: Regel): string | null {
  const delen: string[] = [];
  const h = r.herkomst;
  if (h?.aantal?.soort) delen.push(`Hoev.: ${h.aantal.soort === 'offerte' && h.aantal.offerte ? h.aantal.offerte : (BRON_LABEL[h.aantal.soort] ?? 'geen bron')}`);
  if (h?.prijs?.soort) delen.push(`Prijs: ${h.prijs.soort === 'offerte' && h.prijs.offerte ? h.prijs.offerte : (BRON_LABEL[h.prijs.soort] ?? 'geen bron')}`);
  if (r.bossBron) delen.push(r.bossBron);
  if (r.bossTekst || h?.tekst_door_boss) delen.push('Tekst door Boss');
  return delen.length ? delen.join(' · ') : null;
}
/** Boss vond geen hoeveelheid of prijs en het veld is nog leeg. */
function mist(r: Regel, veld: 'aantal' | 'prijs'): boolean {
  if (String(r[veld] ?? '').trim() !== '') return false;
  return Boolean(r.herkomst?.ontbreekt?.includes(veld)) || (veld === 'prijs' && Boolean(r.bossPrijsOntbreekt));
}

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
 * Bij offertes kunnen regels in groepen staan (zoals het dashboard,
 * `OfferteRegels.jsx`): regels zonder groep bovenaan, daaronder elke groep met
 * een naam en de werkzaamheden die op de offerte komen. Past de gebruiker een
 * veld aan van een regel die Boss maakte, dan is dat veld vanaf dan van hem.
 *
 * De berekening staat in `lib/regels.ts` en is gedeeld met de servicelaag, zodat
 * wat hier op het scherm staat exact is wat er wordt weggeschreven.
 */
export function RegelEditor({
  regels, onChange, standaard, eenheden = [], disabled, groepen, onGroepenChange, flitsIds = [], metTotalen = true,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const totalen = berekenTotalen(regels);
  const verlegdConflict = heeftVerlegdConflict(regels);
  const metGroepen = Boolean(onGroepenChange);
  const lijstGroepen = groepen ?? [];
  const bekend = new Set(lijstGroepen.map((g) => g.id));
  const groepVan = (r: Regel) => (r.groepId && bekend.has(r.groepId) ? r.groepId : null);

  const zet = (sleutel: string, verandering: (r: Regel) => Regel) =>
    onChange(regels.map((r) => (r.sleutel === sleutel ? verandering(r) : r)));
  // Een veld van een regel van Boss aanpassen: vanaf nu is het van de gebruiker.
  const zetVeld = (sleutel: string, veld: 'omschrijving' | 'aantal' | 'prijs', waarde: string) =>
    zet(sleutel, (x) => ({
      ...markeerHandmatig(x, veld),
      [veld]: waarde,
      ...(veld === 'omschrijving' ? { bossTekst: false } : {}),
      ...(veld === 'prijs' ? { bossPrijsOntbreekt: false } : {}),
    }));

  // Verschuiven binnen de eigen groep: wissel met de vorige of volgende regel uit dezelfde groep.
  const verschuif = (sleutel: string, richting: -1 | 1) => {
    const i = regels.findIndex((r) => r.sleutel === sleutel);
    const groep = groepVan(regels[i]!);
    let j = i + richting;
    while (j >= 0 && j < regels.length && groepVan(regels[j]!) !== groep) j += richting;
    if (j < 0 || j >= regels.length) return;
    const kopie = [...regels];
    [kopie[i], kopie[j]] = [kopie[j]!, kopie[i]!];
    onChange(kopie);
  };
  const nieuweRegel = (groepId: string | null): Regel => ({
    ...legeRegel({ uurtarief: standaard.uurtarief, btwPct: standaard.btwPct }),
    ...(metGroepen ? { id: nieuweId(), groepId } : {}),
  });
  // Achter de laatste regel van de groep, anders achteraan.
  const voegToe = (groepId: string | null) => {
    let plek = -1;
    regels.forEach((r, k) => { if (groepVan(r) === groepId) plek = k; });
    const kopie = [...regels];
    kopie.splice(plek < 0 ? kopie.length : plek + 1, 0, nieuweRegel(groepId));
    onChange(kopie);
  };
  const zetGroep = (id: string, verandering: Partial<Groep>) =>
    onGroepenChange?.(lijstGroepen.map((g) => (g.id === id ? { ...g, ...verandering } : g)));
  // Een groep weghalen laat de regels staan: ze komen zonder groep bovenaan.
  const groepWeg = (id: string) => {
    onGroepenChange?.(lijstGroepen.filter((g) => g.id !== id));
    onChange(regels.map((r) => (r.groepId === id ? { ...r, groepId: null } : r)));
  };
  const groepErbij = () => {
    const g: Groep = { id: nieuweId(), naam: '', werkzaamheden: '' };
    onGroepenChange?.([...lijstGroepen, g]);
    onChange([...regels, nieuweRegel(g.id)]);
  };

  const kaart = (r: Regel, nr: number, eerste: boolean, laatste: boolean) => {
    const cfg = typeConfig(r.type, eenheden);
    const herkomst = herkomstTekst(r);
    const flits = Boolean(r.id && flitsIds.includes(r.id));
    return (
      <WerkruimteVeld key={r.sleutel} naam={`regel:${r.sleutel}`}>
      <View style={[styles.kaart, flits && styles.flits]}>
        <View style={styles.kaartKop}>
          <Text style={styles.kaartNr}>Regel {nr}</Text>
          <View style={styles.knoppen}>
            <IconKnop styles={styles} label="Naar boven" disabled={disabled || eerste} onPress={() => verschuif(r.sleutel, -1)}>
              <ChevronUp size={16} color={t.ink} strokeWidth={2} />
            </IconKnop>
            <IconKnop styles={styles} label="Naar beneden" disabled={disabled || laatste} onPress={() => verschuif(r.sleutel, 1)}>
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
          onChange={(id) => id && zet(r.sleutel, (x) => pasTypeToe(x, id, standaard, eenheden))}
          disabled={disabled}
        />

        <FormField
          label="Omschrijving"
          value={r.omschrijving}
          onChangeText={(v) => zetVeld(r.sleutel, 'omschrijving', v)}
          placeholder={cfg.omschrijvingFallback}
          editable={!disabled}
        />

        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label={r.eenheid || cfg.eenheid ? `Aantal (${r.eenheid || cfg.eenheid})` : 'Aantal'}
              value={r.aantal}
              onChangeText={(v) => zetVeld(r.sleutel, 'aantal', v)}
              placeholder={mist(r, 'aantal') ? 'Vul in' : '1'}
              keyboardType="decimal-pad"
              editable={!disabled}
              style={mist(r, 'aantal') ? styles.veldMist : undefined}
              accessibilityLabel={mist(r, 'aantal') ? 'Aantal ontbreekt, vul het in' : undefined}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Prijs per eenheid"
              value={r.prijs}
              onChangeText={(v) => zetVeld(r.sleutel, 'prijs', v)}
              placeholder={mist(r, 'prijs') ? 'Vul in' : '0,00'}
              keyboardType="decimal-pad"
              editable={!disabled}
              style={mist(r, 'prijs') ? styles.veldMist : undefined}
              accessibilityLabel={mist(r, 'prijs') ? 'Prijs ontbreekt, vul hem in' : undefined}
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

        {metGroepen && lijstGroepen.length > 0 ? (
          <SelectField
            label="Groep"
            value={groepVan(r) ?? ''}
            options={[{ id: '', label: 'Geen groep' }, ...lijstGroepen.map((g) => ({ id: g.id, label: g.naam || 'Naamloze groep' }))]}
            onChange={(id) => zet(r.sleutel, (x) => ({ ...x, groepId: id || null }))}
            disabled={disabled}
          />
        ) : null}

        {herkomst ? <Text style={styles.herkomst}>{herkomst}</Text> : null}

        <View style={styles.regelTotaal}>
          <Text style={styles.regelTotaalLabel}>Regelbedrag</Text>
          <Text style={styles.regelTotaalBedrag}>{formatEURCent(regelprijs(r))}</Text>
        </View>
      </View>
      </WerkruimteVeld>
    );
  };

  // Factuur: de groep uit de offerte staat op de regel. Net als het dashboard
  // een kop (naam en werkzaamheden) boven de eerste regel van elke groep.
  const factuurGroepKop = (r: Regel, vorige: Regel | undefined) =>
    !metGroepen && r.groep?.naam && vorige?.groep?.naam !== r.groep.naam ? (
      <View key={`kop-${r.sleutel}`} style={styles.factuurGroep} accessibilityRole="header">
        <Text style={styles.factuurGroepNaam}>{r.groep.naam}</Text>
        {r.groep.werkzaamheden ? <Text style={styles.factuurGroepWerk}>{r.groep.werkzaamheden}</Text> : null}
      </View>
    ) : null;

  const reeks = (lijst: Regel[], startNr: number) =>
    lijst.flatMap((r, i) => [factuurGroepKop(r, lijst[i - 1]), kaart(r, startNr + i, i === 0, i === lijst.length - 1)]);

  const voegToeKnop = (groepId: string | null, label = 'Regel toevoegen') => (
    <Pressable
      onPress={() => (metGroepen ? voegToe(groepId) : onChange([...regels, nieuweRegel(null)]))}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.voegToe, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      <Plus size={18} color={t.green700} strokeWidth={2.4} />
      <Text style={styles.voegToeTekst}>{label}</Text>
    </Pressable>
  );

  const los = regels.filter((r) => groepVan(r) === null);
  // Regels per groep en het nummer van hun eerste regel (doorlopend over de groepen).
  const perGroep = lijstGroepen.reduce<{ g: Groep; regels: Regel[]; eerste: number }[]>((acc, g) => {
    const vorige = acc[acc.length - 1];
    const eerste = vorige ? vorige.eerste + vorige.regels.length : los.length + 1;
    acc.push({ g, regels: regels.filter((r) => groepVan(r) === g.id), eerste });
    return acc;
  }, []);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.kop}>Regels</Text>

      {reeks(los, 1)}
      {!metGroepen || lijstGroepen.length === 0 || los.length > 0 ? voegToeKnop(null) : null}

      {perGroep.map(({ g, regels: inGroep, eerste }) => {
        const sub = berekenTotalen(inGroep).excl;
        return (
          <View key={g.id} style={[styles.groep, flitsIds.includes(g.id) && styles.flits]} accessibilityLabel={`Groep ${g.naam}`}>
            <View style={styles.groepKop}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Groep"
                  value={g.naam}
                  onChangeText={(v) => zetGroep(g.id, { naam: v })}
                  placeholder="Bijvoorbeeld Badkamer"
                  editable={!disabled}
                />
              </View>
              <IconKnop styles={styles} label={`Groep ${g.naam} weghalen`} disabled={disabled} onPress={() => groepWeg(g.id)}>
                <Trash2 size={16} color={t.statusRejectFg} strokeWidth={2} />
              </IconKnop>
            </View>
            <FormField
              label="Werkzaamheden · komt op de offerte"
              value={g.werkzaamheden}
              onChangeText={(v) => zetGroep(g.id, { werkzaamheden: v })}
              placeholder="Wat er in deze groep gebeurt"
              multiline
              editable={!disabled}
            />
            {reeks(inGroep, eerste)}
            {voegToeKnop(g.id, `Regel in ${g.naam || 'deze groep'}`)}
            <View style={styles.regelTotaal}>
              <Text style={styles.regelTotaalLabel}>Subtotaal {g.naam || 'groep'} excl. btw</Text>
              <Text style={styles.regelTotaalBedrag}>{formatEURCent(sub)}</Text>
            </View>
          </View>
        );
      })}

      {metGroepen ? (
        <Pressable
          onPress={groepErbij}
          disabled={disabled}
          accessibilityRole="button"
          style={({ pressed }) => [styles.groepKnop, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        >
          <Layers size={16} color={t.ink2} strokeWidth={2} />
          <Text style={styles.groepKnopTekst}>Groep toevoegen</Text>
        </Pressable>
      ) : null}

      {verlegdConflict ? (
        <NoticeBanner
          toon="waarschuwing"
          message={
            'Verlegde btw staat naast belaste regels. Dat weigert de boekhoudkoppeling, en ' +
            'fiscaal kan het niet samen op één document.'
          }
        />
      ) : null}

      {metTotalen ? (
        <View style={styles.totalen}>
          <Rij styles={styles} label="Subtotaal excl. btw" bedrag={totalen.excl} />
          {totalen.btwPerTarief
            .filter((b) => b.bedrag !== 0)
            .map((b) => (
              <Rij key={b.pct} styles={styles} label={`Btw ${b.pct}%`} bedrag={b.bedrag} />
            ))}
          <Rij styles={styles} label="Totaal incl. btw" bedrag={totalen.incl} groot />
        </View>
      ) : null}
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
        {formatEURCent(bedrag)}
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
    // Wat Boss net toepaste: groene rand, zoals de kaart met eigen rand in het dashboard.
    flits: { borderWidth: 1.5, borderColor: t.green, shadowColor: t.green, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
    veldMist: { backgroundColor: t.statusWarnBg, borderColor: t.statusWarnStripe },
    herkomst: { fontSize: 11.5, fontWeight: '600', color: t.green700 },
    groep: { backgroundColor: t.card, borderRadius: t.rLg, padding: spacing.md, gap: spacing.md, borderWidth: 1.5, borderColor: t.line },
    groepKop: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    factuurGroep: { paddingTop: spacing.sm, gap: 2 },
    factuurGroepNaam: { fontSize: 15, fontWeight: '700', color: t.ink },
    factuurGroepWerk: { fontSize: 13, color: t.muted },
    groepKnop: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42,
      borderRadius: t.rMd, backgroundColor: t.bgAlt,
    },
    groepKnopTekst: { fontSize: 14, fontWeight: '600', color: t.ink2 },
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
