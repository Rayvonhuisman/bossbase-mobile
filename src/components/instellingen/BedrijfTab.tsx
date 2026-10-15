import { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { AdresZoeker } from '@/components/AdresZoeker';
import { FormField } from '@/components/FormField';
import { SelectField } from '@/components/SelectField';
import { BRANCHES } from '@/lib/registratie';
import { useAuth, useTheme, useToast } from '@/providers';
import { useSave } from '@/lib/useSave';
import { gewijzigdeVelden, isLeeg } from '@/lib/gewijzigdeVelden';
import { normaliseerIban } from '@/lib/relatieValidatie';
import { spacing } from '@/theme';
import {
  updateCompany,
  uploadBedrijfslogo,
  type CompanyRow,
} from '@/services/settingsService';
import { Kaart, Uitleg, stijlVoorInstellingen } from './Bouwstenen';
import { kiesAfbeelding } from './kiesAfbeelding';

/** Een paar vaste kleuren om snel te kiezen; elke hexcode mag. */
const MERKKLEUREN = ['#1DDB62', '#15A34A', '#0D0D0D', '#3b82f6', '#f97316', '#ef4444', '#a855f7', '#eab308'];

type Form = {
  name: string;
  email: string;
  reply_to_email: string;
  phone: string;
  kvk: string;
  btw_number: string;
  website: string;
  address: string;
  postal_code: string;
  city: string;
  branding_color: string;
  iban: string;
  iban_tnv: string;
  branche: string;
};

/** De vaste lijst, plus een oude waarde die er niet (meer) in staat — zoals het dashboard. */
const brancheOpties = (huidig: string) =>
  [...BRANCHES, ...(huidig && !(BRANCHES as readonly string[]).includes(huidig) ? [huidig] : [])].map((b) => ({
    id: b,
    label: b,
  }));

const naarForm = (c: CompanyRow | null): Form => ({
  name: c?.name ?? '',
  email: c?.email ?? '',
  reply_to_email: c?.reply_to_email ?? '',
  phone: c?.phone ?? '',
  kvk: c?.kvk ?? '',
  btw_number: c?.btw_number ?? '',
  website: c?.website ?? '',
  address: c?.address ?? '',
  postal_code: c?.postal_code ?? '',
  city: c?.city ?? '',
  branding_color: c?.branding_color || '#1DDB62',
  iban: c?.iban ?? '',
  iban_tnv: c?.iban_tnv ?? '',
  branche: c?.branche ?? '',
});

/**
 * Bedrijfsprofiel — tabel `companies`, dezelfde velden en controles als het
 * dashboard (e-mail en antwoordadres als e-mail, KvK 8 cijfers). Logo naar
 * bucket `bedrijf-logos`. Wijzigen is beheerderswerk (policy op rol).
 */
export function BedrijfTab({
  bedrijf,
  magWijzigen,
  onGewijzigd,
}: {
  bedrijf: CompanyRow | null;
  magWijzigen: boolean;
  onGewijzigd: () => Promise<void>;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const { refreshProfile } = useAuth();
  // De waarden zoals geladen. Het scherm geeft na opslaan een nieuwe `key`,
  // dus dit is altijd de stand van de server bij het openen van de tab.
  const [geladen] = useState<Form>(() => naarForm(bedrijf));
  const [form, setForm] = useState<Form>(geladen);
  const { save, saving, error } = useSave<unknown>();
  const { toon } = useToast();
  const { save: saveLogo, saving: logoBezig } = useSave<unknown>();

  const zet = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const opslaan = () => {
    // Alleen wat de gebruiker echt veranderd heeft: een ongewijzigd leeg veld
    // mag niet van '' naar NULL, en een wijziging van een ander apparaat mag
    // niet overschreven worden met de oude waarde van dit scherm.
    const wijzigingen = gewijzigdeVelden(geladen, form, {
      normaliseer: (k, v) => (k === 'iban' ? normaliseerIban(v as string) : typeof v === 'string' ? v.trim() : v),
    });
    if (isLeeg(wijzigingen)) {
      toon('Er is niets gewijzigd.', 'info');
      return;
    }
    return save(() => updateCompany(wijzigingen), {
      onSuccess: async () => {
        await onGewijzigd();
        await refreshProfile();
      },
      succesMelding: 'Bedrijfsprofiel opgeslagen',
    });
  };

  const logoKiezen = async () => {
    const foto = await kiesAfbeelding();
    if (!foto) return;
    saveLogo(
      () => uploadBedrijfslogo({ bytes: foto.bytes, contentType: foto.contentType, extensie: foto.extensie }),
      {
        onSuccess: async () => {
          await onGewijzigd();
          await refreshProfile();
        },
        succesMelding: 'Logo opgeslagen',
      },
    );
  };

  const kleurGeldig = /^#[0-9a-fA-F]{6}$/.test(form.branding_color.trim());

  return (
    <>
      {!magWijzigen ? (
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
          <Uitleg>Je kunt het bedrijfsprofiel bekijken. Wijzigen kan alleen een beheerder.</Uitleg>
        </View>
      ) : null}

      <Kaart titel="Logo en merkkleur" sub="Komen op je offertes, facturen en e-mails">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 120,
              height: 64,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {bedrijf?.logo_url ? (
              <Image
                source={{ uri: bedrijf.logo_url }}
                style={{ width: 112, height: 56 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text style={[s.hint, { color: '#6b7280' }]}>Geen logo</Text>
            )}
          </View>
          {magWijzigen ? (
            <View style={{ flex: 1 }}>
              <Button
                label={bedrijf?.logo_url ? 'Logo vervangen' : 'Logo uploaden'}
                variant="secondary"
                loading={logoBezig}
                disabled={logoBezig}
                onPress={logoKiezen}
              />
            </View>
          ) : null}
        </View>
        <Text style={s.hint}>JPG of PNG, maximaal 5 MB.</Text>

        <Text style={s.label}>Merkkleur</Text>
        <View style={s.chipRij}>
          {MERKKLEUREN.map((k) => {
            const gekozen = form.branding_color.toLowerCase() === k.toLowerCase();
            return (
              <Pressable
                key={k}
                onPress={() => magWijzigen && setForm((f) => ({ ...f, branding_color: k }))}
                disabled={!magWijzigen}
                accessibilityRole="button"
                accessibilityLabel={`Merkkleur ${k}`}
                accessibilityState={{ selected: gekozen }}
                aria-pressed={gekozen}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: gekozen ? 2 : 1,
                  borderColor: gekozen ? t.ink : t.line,
                }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: k }} />
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Hexcode"
              value={form.branding_color}
              onChangeText={zet('branding_color')}
              placeholder="#1DDB62"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={magWijzigen}
            />
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              marginTop: 18,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: kleurGeldig ? form.branding_color : t.bgAlt,
            }}
          />
        </View>
      </Kaart>

      <Kaart titel="Bedrijfsgegevens">
        <FormField label="Bedrijfsnaam" value={form.name} onChangeText={zet('name')} editable={magWijzigen} />
        <FormField
          label="E-mailadres"
          value={form.email}
          onChangeText={zet('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={magWijzigen}
        />
        <FormField
          label="Antwoord e-mailadres"
          value={form.reply_to_email}
          onChangeText={zet('reply_to_email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={magWijzigen}
          hint="Antwoorden van klanten op je mails komen hier binnen. Leeg = het e-mailadres hierboven."
        />
        <FormField
          label="Telefoonnummer"
          value={form.phone}
          onChangeText={zet('phone')}
          keyboardType="phone-pad"
          editable={magWijzigen}
        />
        <View style={s.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="KvK-nummer"
              value={form.kvk}
              onChangeText={zet('kvk')}
              keyboardType="number-pad"
              placeholder="12345678"
              editable={magWijzigen}
            />
          </View>
          <View style={{ flex: 1.3 }}>
            <FormField
              label="BTW-nummer"
              value={form.btw_number}
              onChangeText={zet('btw_number')}
              autoCapitalize="characters"
              placeholder="NL123456789B01"
              editable={magWijzigen}
            />
          </View>
        </View>
        <FormField
          label="Website"
          value={form.website}
          onChangeText={zet('website')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={magWijzigen}
        />
        <SelectField
          label="Branche"
          value={form.branche || null}
          options={brancheOpties(form.branche)}
          onChange={(id) => setForm((f) => ({ ...f, branche: id ?? '' }))}
          allowEmpty
          emptyLabel="Kies je branche"
          placeholder="Kies je branche"
          disabled={!magWijzigen}
        />
        {magWijzigen ? (
          <AdresZoeker
            onSelect={(v) => setForm((f) => ({ ...f, address: v.address, postal_code: v.postcode, city: v.city }))}
          />
        ) : null}
        <FormField label="Adres" value={form.address} onChangeText={zet('address')} editable={magWijzigen} />
        <View style={s.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Postcode"
              value={form.postal_code}
              onChangeText={zet('postal_code')}
              autoCapitalize="characters"
              editable={magWijzigen}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <FormField label="Stad" value={form.city} onChangeText={zet('city')} editable={magWijzigen} />
          </View>
        </View>
        <FormField
          label="IBAN (komt op je facturen)"
          value={form.iban}
          onChangeText={zet('iban')}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="NL00 BANK 0123 4567 89"
          editable={magWijzigen}
        />
        <FormField
          label="Ten name van"
          value={form.iban_tnv}
          onChangeText={zet('iban_tnv')}
          placeholder={form.name || 'Naam rekeninghouder'}
          editable={magWijzigen}
        />
        {error ? <Uitleg toon="fout">{error}</Uitleg> : null}
        {magWijzigen ? (
          <Button label="Opslaan" loading={saving} disabled={saving || !form.name.trim()} onPress={opslaan} />
        ) : null}
      </Kaart>
    </>
  );
}
