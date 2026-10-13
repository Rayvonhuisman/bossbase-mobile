import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormField } from './FormField';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import { valideerRelatieVelden } from '@/lib/relatieValidatie';
import type { Leverancier } from '@/services/leverancierService';

/** De velden van het leveranciersformulier, als tekst zoals ze in de invoer staan. */
export type LeverancierConcept = {
  naam: string;
  contactpersoon: string;
  email: string;
  telefoon: string;
  mobiel: string;
  address: string;
  postcode: string;
  city: string;
  website: string;
  kvk_number: string;
  btw_number: string;
  iban: string;
  betaaltermijn_dagen: string;
};

export function leegLeverancierConcept(): LeverancierConcept {
  return {
    naam: '',
    contactpersoon: '',
    email: '',
    telefoon: '',
    mobiel: '',
    address: '',
    postcode: '',
    city: '',
    website: '',
    kvk_number: '',
    btw_number: '',
    iban: '',
    betaaltermijn_dagen: '',
  };
}

export function conceptVanLeverancier(l: Leverancier): LeverancierConcept {
  return {
    naam: l.naam ?? '',
    contactpersoon: l.contactpersoon ?? '',
    email: l.email ?? '',
    telefoon: l.telefoon ?? '',
    mobiel: l.mobiel ?? '',
    address: l.address ?? '',
    postcode: l.postcode ?? '',
    city: l.city ?? '',
    website: l.website ?? '',
    kvk_number: l.kvk_number ?? '',
    btw_number: l.btw_number ?? '',
    iban: l.iban ?? '',
    betaaltermijn_dagen: l.betaaltermijn_dagen != null ? String(l.betaaltermijn_dagen) : '',
  };
}

/** Is er iets dat opslaan tegenhoudt? (naam leeg of een ongeldig nummer) */
export function leverancierConceptGeldig(c: LeverancierConcept): boolean {
  return !!c.naam.trim() && Object.keys(valideerRelatieVelden(c)).length === 0;
}

type Props = {
  waarde: LeverancierConcept;
  onChange: (volgende: LeverancierConcept) => void;
};

/**
 * De velden van een leverancier, gelijk aan `NewLeverancierModal` en de
 * Gegevens-tab van het dashboard: naam, contact, adres, website, KvK, btw,
 * IBAN en betaaltermijn. KvK, btw (elfproef) en IBAN (mod-97) worden gecontroleerd
 * zodra je het veld verlaat, met dezelfde meldingen als het dashboard; de
 * service controleert ze bij opslaan nog een keer.
 */
export function LeverancierVelden({ waarde, onChange }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [verlaten, setVerlaten] = useState<Record<string, boolean>>({});
  const fouten = valideerRelatieVelden(waarde);

  const zet = (veld: keyof LeverancierConcept) => (v: string) => onChange({ ...waarde, [veld]: v });
  const blur = (veld: string) => () => setVerlaten((s) => ({ ...s, [veld]: true }));
  const fout = (veld: 'kvk_number' | 'btw_number' | 'iban') =>
    verlaten[veld] && fouten[veld] ? (
      <Text style={styles.fout} accessibilityLiveRegion="polite">
        {fouten[veld]}
      </Text>
    ) : null;

  return (
    <View style={{ gap: spacing.lg }}>
      <FormField
        label="Naam *"
        value={waarde.naam}
        onChangeText={zet('naam')}
        placeholder="Bijv. Bouwmaat Utrecht"
        autoCapitalize="words"
      />
      <FormField
        label="Contactpersoon"
        value={waarde.contactpersoon}
        onChangeText={zet('contactpersoon')}
        placeholder="Optioneel"
        autoCapitalize="words"
      />
      <FormField
        label="E-mail"
        value={waarde.email}
        onChangeText={zet('email')}
        placeholder="inkoop@leverancier.nl"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.rij}>
        <View style={{ flex: 1 }}>
          <FormField
            label="Telefoon"
            value={waarde.telefoon}
            onChangeText={zet('telefoon')}
            placeholder="030 123 45 67"
            keyboardType="phone-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormField
            label="Mobiel"
            value={waarde.mobiel}
            onChangeText={zet('mobiel')}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
          />
        </View>
      </View>
      <FormField
        label="Adres"
        value={waarde.address}
        onChangeText={zet('address')}
        placeholder="Straat en huisnummer"
      />
      <View style={styles.rij}>
        <View style={{ flex: 1 }}>
          <FormField
            label="Postcode"
            value={waarde.postcode}
            onChangeText={zet('postcode')}
            placeholder="1234 AB"
            autoCapitalize="characters"
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <FormField label="Stad" value={waarde.city} onChangeText={zet('city')} placeholder="Plaats" />
        </View>
      </View>
      <FormField
        label="Website"
        value={waarde.website}
        onChangeText={zet('website')}
        placeholder="www.leverancier.nl"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View>
        <FormField
          label="KvK-nummer"
          value={waarde.kvk_number}
          onChangeText={zet('kvk_number')}
          onBlur={blur('kvk_number')}
          placeholder="12345678"
          keyboardType="number-pad"
        />
        {fout('kvk_number')}
      </View>
      <View>
        <FormField
          label="Btw-nummer"
          value={waarde.btw_number}
          onChangeText={zet('btw_number')}
          onBlur={blur('btw_number')}
          placeholder="NL123456789B01"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {fout('btw_number')}
      </View>
      <View>
        <FormField
          label="IBAN"
          value={waarde.iban}
          onChangeText={zet('iban')}
          onBlur={blur('iban')}
          placeholder="NL00 BANK 0123 4567 89"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {fout('iban')}
      </View>
      <FormField
        label="Betaaltermijn (dagen)"
        value={waarde.betaaltermijn_dagen}
        onChangeText={zet('betaaltermijn_dagen')}
        placeholder="30"
        keyboardType="number-pad"
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    rij: { flexDirection: 'row', gap: spacing.md },
    fout: { marginTop: 6, fontSize: 12.5, fontWeight: '600', color: t.statusRejectFg },
  });
