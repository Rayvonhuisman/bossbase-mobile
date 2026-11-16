import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { FormField } from '@/components/FormField';
import { DateField } from '@/components/DateField';
import { SelectField } from '@/components/SelectField';
import { tx } from '@/i18n';
import { useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import {
  ACTIVITEIT_TYPE_OPTIES,
  CONTACT_DAGEN_OPTIES,
  FACTUUR_STATUS_OPTIES,
  OFFERTE_STATUS_OPTIES,
  PROJECT_STATUS_OPTIES,
  type DbFilters,
  type JaNee,
} from '@/lib/databaseFilters';
import type { DatabaseExtra } from '@/services/databaseService';

type Zet = <K extends keyof DbFilters>(k: K, v: DbFilters[K]) => void;

/**
 * De filterzijbalk van het dashboard (secties Klant, Projecten, Offertes,
 * Facturen, CRM Pipeline, Communicatie, Uren, Documenten), als uitklapbare
 * secties in een paneel. Elk filter is gelijk aan het dashboard.
 */
export function FilterPaneel({
  filters,
  zet,
  extra,
}: {
  filters: DbFilters;
  zet: Zet;
  extra: DatabaseExtra;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => maakStijl(t), [t]);
  const f = filters;

  const multi = (sleutel: 'projectStatussen' | 'offerteStatussen' | 'factuurStatussen' | 'dealFasen' | 'dealVerlorenRedenen' | 'activiteitTypen', id: string) => {
    const huidig = f[sleutel];
    zet(sleutel, huidig.includes(id) ? huidig.filter((x) => x !== id) : [...huidig, id]);
  };

  const chips = (
    opties: { id: string; label: string }[],
    gekozen: (id: string) => boolean,
    kies: (id: string) => void,
  ) => (
    <View style={s.chipRij}>
      {opties.map((o) => {
        const aan = gekozen(o.id);
        return (
          <Pressable
            key={o.id}
            onPress={() => kies(o.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: aan }}
            aria-checked={aan}
            style={[s.chip, aan && s.chipAan]}
          >
            <Text style={[s.chipTekst, aan && s.chipTekstAan]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const jaNee = (label: string, waarde: JaNee, onKies: (v: JaNee) => void, ja = tx('Ja'), nee = tx('Nee')) => (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      {chips(
        [
          { id: 'alles', label: tx('Alles') },
          { id: 'ja', label: ja },
          { id: 'nee', label: nee },
        ],
        (id) => waarde === id,
        (id) => onKies(id as JaNee),
      )}
    </View>
  );

  const vinkje = (label: string, aan: boolean, onWissel: (v: boolean) => void) => (
    <Pressable
      onPress={() => onWissel(!aan)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: aan }}
      aria-checked={aan}
      style={s.vinkRij}
    >
      <View style={[s.vak, aan && s.vakAan]}>{aan ? <Text style={s.vink}>✓</Text> : null}</View>
      <Text style={s.vinkTekst}>{label}</Text>
    </Pressable>
  );

  const datum = (label: string, waarde: string, k: keyof DbFilters) => (
    <DateField label={label} value={waarde || null} onChange={(v) => zet(k, v as never)} placeholder={tx('Geen')} />
  );

  const getal = (label: string, waarde: string, k: keyof DbFilters, placeholder?: string) => (
    <FormField
      label={label}
      value={waarde}
      onChangeText={(v) => zet(k, v as never)}
      keyboardType="decimal-pad"
      placeholder={placeholder}
    />
  );

  const koppelingen = [...extra.boekhouding];
  // Vaste keuzelijsten uit lib/databaseFilters: alleen het label vertalen, de id blijft.
  const vertaal = (opties: { id: string; label: string }[]) => opties.map((o) => ({ ...o, label: tx(o.label) }));

  return (
    <View style={{ gap: spacing.sm }}>
      <Sectie titel={tx('Klant')} open s={s} t={t}>
        <FormField label={tx('Stad / regio')} value={f.stad} onChangeText={(v) => zet('stad', v)} placeholder={tx('Bijv. Utrecht')} />
        {datum(tx('Aangemaakt van'), f.aanmaakVan, 'aanmaakVan')}
        {datum(tx('Aangemaakt tot'), f.aanmaakTot, 'aanmaakTot')}
        {jaNee(tx('KvK-nummer'), f.heeftKvk, (v) => zet('heeftKvk', v), tx('Heeft KvK'), tx('Geen KvK'))}
        {koppelingen.length > 0
          ? jaNee(
              tx('{koppeling} sync', { koppeling: koppelingen.map((k) => (k === 'moneybird' ? 'Moneybird' : k === 'snelstart' ? 'SnelStart' : 'AFAS')).join(' / ') }),
              f.heeftMoneybird,
              (v) => zet('heeftMoneybird', v),
              tx('Gesynchroniseerd'),
              tx('Niet gesynchroniseerd'),
            )
          : null}
        {vinkje(tx('Nog nooit een project'), f.geenProject, (v) => zet('geenProject', v))}
        <View style={{ gap: 4 }}>
          <Text style={s.label}>{tx('Laatste contact ouder dan')}</Text>
          {chips(
            vertaal(CONTACT_DAGEN_OPTIES),
            (id) => f.laatsteContactDagen === id,
            (id) => zet('laatsteContactDagen', f.laatsteContactDagen === id ? '' : id),
          )}
        </View>
      </Sectie>

      <Sectie titel={tx('Projecten')} s={s} t={t}>
        <Text style={s.label}>{tx('Status')}</Text>
        {chips(vertaal(PROJECT_STATUS_OPTIES), (id) => f.projectStatussen.includes(id), (id) => multi('projectStatussen', id))}
        {datum(tx('Startdatum van'), f.projectStartVan, 'projectStartVan')}
        {datum(tx('Startdatum tot'), f.projectStartTot, 'projectStartTot')}
        {datum(tx('Deadline van'), f.projectDeadlineVan, 'projectDeadlineVan')}
        {datum(tx('Deadline tot'), f.projectDeadlineTot, 'projectDeadlineTot')}
        {vinkje(tx('Overschrijding uren'), f.heeftOverrun, (v) => zet('heeftOverrun', v))}
        {vinkje(tx('Heeft lopend project'), f.heeftLopendProject, (v) => zet('heeftLopendProject', v))}
        <SelectField
          label={tx('Medewerker')}
          options={extra.medewerkers.map((m) => ({ id: m.id, label: m.naam }))}
          value={f.projectMedewerker || null}
          onChange={(v) => zet('projectMedewerker', v ?? '')}
          allowEmpty
          emptyLabel={tx('Iedereen')}
          placeholder={tx('Iedereen')}
        />
      </Sectie>

      <Sectie titel={tx('Offertes')} s={s} t={t}>
        <Text style={s.label}>{tx('Status')}</Text>
        {chips(vertaal(OFFERTE_STATUS_OPTIES), (id) => f.offerteStatussen.includes(id), (id) => multi('offerteStatussen', id))}
        {vinkje(tx('Verlopen'), f.offerteVerlopen, (v) => zet('offerteVerlopen', v))}
        {jaNee(tx('Digitaal ondertekend'), f.offerteOndertekend, (v) => zet('offerteOndertekend', v))}
        <View style={s.rij}>
          <View style={{ flex: 1 }}>{getal(tx('Bedrag min (€)'), f.offerteBedragMin, 'offerteBedragMin')}</View>
          <View style={{ flex: 1 }}>{getal(tx('Bedrag max (€)'), f.offerteBedragMax, 'offerteBedragMax')}</View>
        </View>
      </Sectie>

      <Sectie titel={tx('Facturen')} s={s} t={t}>
        <Text style={s.label}>{tx('Status')}</Text>
        {chips(vertaal(FACTUUR_STATUS_OPTIES), (id) => f.factuurStatussen.includes(id), (id) => multi('factuurStatussen', id))}
        {vinkje(tx('Vervallen'), f.factuurVervallen, (v) => zet('factuurVervallen', v))}
        {jaNee(tx('Herinnering 1 verstuurd'), f.herinnering1, (v) => zet('herinnering1', v))}
        {jaNee(tx('Herinnering 2 verstuurd'), f.herinnering2, (v) => zet('herinnering2', v))}
        {vinkje(tx('Creditnota'), f.isCreditnota, (v) => zet('isCreditnota', v))}
        {datum(tx('Betaald van'), f.betaaldVan, 'betaaldVan')}
        {datum(tx('Betaald tot'), f.betaaldTot, 'betaaldTot')}
      </Sectie>

      <Sectie titel={tx('CRM Pipeline')} s={s} t={t}>
        {extra.fasen.length > 0 ? (
          <>
            <Text style={s.label}>{tx('Fase')}</Text>
            {chips(
              extra.fasen.map((x) => ({ id: x.id, label: x.naam })),
              (id) => f.dealFasen.includes(id),
              (id) => multi('dealFasen', id),
            )}
          </>
        ) : null}
        {extra.verlorenRedenen.length > 0 ? (
          <>
            <Text style={s.label}>{tx('Verloren-reden')}</Text>
            {chips(
              extra.verlorenRedenen.map((r) => ({ id: r, label: r })),
              (id) => f.dealVerlorenRedenen.includes(id),
              (id) => multi('dealVerlorenRedenen', id),
            )}
          </>
        ) : null}
        <View style={s.rij}>
          <View style={{ flex: 1 }}>{getal(tx('Waarde min (€)'), f.dealWaardeMin, 'dealWaardeMin')}</View>
          <View style={{ flex: 1 }}>{getal(tx('Waarde max (€)'), f.dealWaardeMax, 'dealWaardeMax')}</View>
        </View>
        {vinkje(tx('Open activiteiten'), f.heeftOpenActiviteiten, (v) => zet('heeftOpenActiviteiten', v))}
        <Text style={s.label}>{tx('Activiteitstype')}</Text>
        {chips(vertaal(ACTIVITEIT_TYPE_OPTIES), (id) => f.activiteitTypen.includes(id), (id) => multi('activiteitTypen', id))}
      </Sectie>

      <Sectie titel={tx('Communicatie')} s={s} t={t}>
        {jaNee(tx('Heeft mail ontvangen'), f.heeftMail, (v) => zet('heeftMail', v))}
        {getal(tx('Laatste mail ouder dan (dagen)'), f.mailOuderDanDagen, 'mailOuderDanDagen', tx('Bijv. 30'))}
        {extra.mailTypes.length > 0 ? (
          <SelectField
            label={tx('Mailtype')}
            options={extra.mailTypes}
            value={f.mailTemplateType || null}
            onChange={(v) => zet('mailTemplateType', v ?? '')}
            allowEmpty
            emptyLabel={tx('Alle types')}
            placeholder={tx('Alle types')}
          />
        ) : null}
      </Sectie>

      <Sectie titel={tx('Uren')} s={s} t={t}>
        {vinkje(tx('Heeft factureerbare uren'), f.heeftFactureerbareUren, (v) => zet('heeftFactureerbareUren', v))}
      </Sectie>

      <Sectie titel={tx('Documenten')} s={s} t={t}>
        {vinkje(tx('Heeft offertes'), f.heeftOffertes, (v) => zet('heeftOffertes', v))}
        {vinkje(tx('Heeft facturen'), f.heeftFacturen, (v) => zet('heeftFacturen', v))}
        {vinkje(tx('Heeft getekende offerte'), f.heeftGetekendOfferte, (v) => zet('heeftGetekendOfferte', v))}
        {vinkje(tx('Heeft onbetaalde facturen'), f.heeftOnbetaaldeFacturen, (v) => zet('heeftOnbetaaldeFacturen', v))}
        {vinkje(tx('Heeft verlopen offertes'), f.heeftVerlopenOffertes, (v) => zet('heeftVerlopenOffertes', v))}
        {datum(tx('Periode van'), f.documentenPeriodeVan, 'documentenPeriodeVan')}
        {datum(tx('Periode tot'), f.documentenPeriodeTot, 'documentenPeriodeTot')}
      </Sectie>
    </View>
  );
}

function Sectie({
  titel,
  open: standaardOpen,
  children,
  s,
  t,
}: {
  titel: string;
  open?: boolean;
  children: ReactNode;
  s: ReturnType<typeof maakStijl>;
  t: ThemeColors;
}) {
  const [open, setOpen] = useState(Boolean(standaardOpen));
  const Icoon = open ? ChevronDown : ChevronRight;
  return (
    <View style={s.sectie}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        style={s.sectieKop}
      >
        <Text style={s.sectieTitel}>{titel}</Text>
        <Icoon size={18} color={t.muted} />
      </Pressable>
      {open ? <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>{children}</View> : null}
    </View>
  );
}

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    sectie: {
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      paddingHorizontal: spacing.md,
      backgroundColor: t.card,
    },
    sectieKop: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectieTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    label: { ...typography.label, color: t.muted2 },
    rij: { flexDirection: 'row', gap: spacing.md },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
    },
    chipAan: { backgroundColor: t.green, borderColor: t.green },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    chipTekstAan: { color: t.greenInk },
    vinkRij: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
    vak: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vakAan: { backgroundColor: t.green, borderColor: t.green },
    vink: { fontSize: 13, fontWeight: '800', color: t.greenInk },
    vinkTekst: { fontSize: 14, color: t.ink },
  });
