import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { FormField } from '@/components/FormField';
import { DateField } from '@/components/DateField';
import { SelectField } from '@/components/SelectField';
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

  const jaNee = (label: string, waarde: JaNee, onKies: (v: JaNee) => void, ja = 'Ja', nee = 'Nee') => (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      {chips(
        [
          { id: 'alles', label: 'Alles' },
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
    <DateField label={label} value={waarde || null} onChange={(v) => zet(k, v as never)} placeholder="Geen" />
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

  return (
    <View style={{ gap: spacing.sm }}>
      <Sectie titel="Klant" open s={s} t={t}>
        <FormField label="Stad / regio" value={f.stad} onChangeText={(v) => zet('stad', v)} placeholder="Bijv. Utrecht" />
        {datum('Aangemaakt van', f.aanmaakVan, 'aanmaakVan')}
        {datum('Aangemaakt tot', f.aanmaakTot, 'aanmaakTot')}
        {jaNee('KvK-nummer', f.heeftKvk, (v) => zet('heeftKvk', v), 'Heeft KvK', 'Geen KvK')}
        {koppelingen.length > 0
          ? jaNee(
              `${koppelingen.map((k) => (k === 'moneybird' ? 'Moneybird' : k === 'snelstart' ? 'SnelStart' : 'AFAS')).join(' / ')} sync`,
              f.heeftMoneybird,
              (v) => zet('heeftMoneybird', v),
              'Gesynchroniseerd',
              'Niet gesynchroniseerd',
            )
          : null}
        {vinkje('Nog nooit een project', f.geenProject, (v) => zet('geenProject', v))}
        <View style={{ gap: 4 }}>
          <Text style={s.label}>Laatste contact ouder dan</Text>
          {chips(
            CONTACT_DAGEN_OPTIES,
            (id) => f.laatsteContactDagen === id,
            (id) => zet('laatsteContactDagen', f.laatsteContactDagen === id ? '' : id),
          )}
        </View>
      </Sectie>

      <Sectie titel="Projecten" s={s} t={t}>
        <Text style={s.label}>Status</Text>
        {chips(PROJECT_STATUS_OPTIES, (id) => f.projectStatussen.includes(id), (id) => multi('projectStatussen', id))}
        {datum('Startdatum van', f.projectStartVan, 'projectStartVan')}
        {datum('Startdatum tot', f.projectStartTot, 'projectStartTot')}
        {datum('Deadline van', f.projectDeadlineVan, 'projectDeadlineVan')}
        {datum('Deadline tot', f.projectDeadlineTot, 'projectDeadlineTot')}
        {vinkje('Overschrijding uren', f.heeftOverrun, (v) => zet('heeftOverrun', v))}
        {vinkje('Heeft lopend project', f.heeftLopendProject, (v) => zet('heeftLopendProject', v))}
        <SelectField
          label="Medewerker"
          options={extra.medewerkers.map((m) => ({ id: m.id, label: m.naam }))}
          value={f.projectMedewerker || null}
          onChange={(v) => zet('projectMedewerker', v ?? '')}
          allowEmpty
          emptyLabel="Iedereen"
          placeholder="Iedereen"
        />
      </Sectie>

      <Sectie titel="Offertes" s={s} t={t}>
        <Text style={s.label}>Status</Text>
        {chips(OFFERTE_STATUS_OPTIES, (id) => f.offerteStatussen.includes(id), (id) => multi('offerteStatussen', id))}
        {vinkje('Verlopen', f.offerteVerlopen, (v) => zet('offerteVerlopen', v))}
        {jaNee('Digitaal ondertekend', f.offerteOndertekend, (v) => zet('offerteOndertekend', v))}
        <View style={s.rij}>
          <View style={{ flex: 1 }}>{getal('Bedrag min (€)', f.offerteBedragMin, 'offerteBedragMin')}</View>
          <View style={{ flex: 1 }}>{getal('Bedrag max (€)', f.offerteBedragMax, 'offerteBedragMax')}</View>
        </View>
      </Sectie>

      <Sectie titel="Facturen" s={s} t={t}>
        <Text style={s.label}>Status</Text>
        {chips(FACTUUR_STATUS_OPTIES, (id) => f.factuurStatussen.includes(id), (id) => multi('factuurStatussen', id))}
        {vinkje('Vervallen', f.factuurVervallen, (v) => zet('factuurVervallen', v))}
        {jaNee('Herinnering 1 verstuurd', f.herinnering1, (v) => zet('herinnering1', v))}
        {jaNee('Herinnering 2 verstuurd', f.herinnering2, (v) => zet('herinnering2', v))}
        {vinkje('Creditnota', f.isCreditnota, (v) => zet('isCreditnota', v))}
        {datum('Betaald van', f.betaaldVan, 'betaaldVan')}
        {datum('Betaald tot', f.betaaldTot, 'betaaldTot')}
      </Sectie>

      <Sectie titel="CRM Pipeline" s={s} t={t}>
        {extra.fasen.length > 0 ? (
          <>
            <Text style={s.label}>Fase</Text>
            {chips(
              extra.fasen.map((x) => ({ id: x.id, label: x.naam })),
              (id) => f.dealFasen.includes(id),
              (id) => multi('dealFasen', id),
            )}
          </>
        ) : null}
        {extra.verlorenRedenen.length > 0 ? (
          <>
            <Text style={s.label}>Verloren-reden</Text>
            {chips(
              extra.verlorenRedenen.map((r) => ({ id: r, label: r })),
              (id) => f.dealVerlorenRedenen.includes(id),
              (id) => multi('dealVerlorenRedenen', id),
            )}
          </>
        ) : null}
        <View style={s.rij}>
          <View style={{ flex: 1 }}>{getal('Dealwaarde min (€)', f.dealWaardeMin, 'dealWaardeMin')}</View>
          <View style={{ flex: 1 }}>{getal('Dealwaarde max (€)', f.dealWaardeMax, 'dealWaardeMax')}</View>
        </View>
        {vinkje('Open activiteiten', f.heeftOpenActiviteiten, (v) => zet('heeftOpenActiviteiten', v))}
        <Text style={s.label}>Activiteitstype</Text>
        {chips(ACTIVITEIT_TYPE_OPTIES, (id) => f.activiteitTypen.includes(id), (id) => multi('activiteitTypen', id))}
      </Sectie>

      <Sectie titel="Communicatie" s={s} t={t}>
        {jaNee('Heeft mail ontvangen', f.heeftMail, (v) => zet('heeftMail', v))}
        {getal('Laatste mail ouder dan (dagen)', f.mailOuderDanDagen, 'mailOuderDanDagen', 'Bijv. 30')}
        {extra.mailTypes.length > 0 ? (
          <SelectField
            label="Mailtype"
            options={extra.mailTypes}
            value={f.mailTemplateType || null}
            onChange={(v) => zet('mailTemplateType', v ?? '')}
            allowEmpty
            emptyLabel="Alle types"
            placeholder="Alle types"
          />
        ) : null}
      </Sectie>

      <Sectie titel="Uren" s={s} t={t}>
        {vinkje('Heeft factureerbare uren', f.heeftFactureerbareUren, (v) => zet('heeftFactureerbareUren', v))}
      </Sectie>

      <Sectie titel="Documenten" s={s} t={t}>
        {vinkje('Heeft offertes', f.heeftOffertes, (v) => zet('heeftOffertes', v))}
        {vinkje('Heeft facturen', f.heeftFacturen, (v) => zet('heeftFacturen', v))}
        {vinkje('Heeft getekende offerte', f.heeftGetekendOfferte, (v) => zet('heeftGetekendOfferte', v))}
        {vinkje('Heeft onbetaalde facturen', f.heeftOnbetaaldeFacturen, (v) => zet('heeftOnbetaaldeFacturen', v))}
        {vinkje('Heeft verlopen offertes', f.heeftVerlopenOffertes, (v) => zet('heeftVerlopenOffertes', v))}
        {datum('Periode van', f.documentenPeriodeVan, 'documentenPeriodeVan')}
        {datum('Periode tot', f.documentenPeriodeTot, 'documentenPeriodeTot')}
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
