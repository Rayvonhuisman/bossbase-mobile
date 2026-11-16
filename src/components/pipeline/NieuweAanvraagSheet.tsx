import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { SelectField, type SelectOption } from '@/components/SelectField';
import { usePermissions, useTheme, useToast } from '@/providers';
import { useSave } from '@/lib/useSave';
import { getCompanyId, getUserId } from '@/lib/sessionContext';
import { writeFout } from '@/lib/writeResult';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { createCustomer } from '@/services/customerService';
import { createDeal, DEAL_PRIORITEITEN, type DealRow } from '@/services/dealService';
import { stuurAanvraagOntvangen } from '@/services/autoMailService';
import { LedenKeuze, type Lid } from './LedenKeuze';
import { tx } from '@/i18n';

/**
 * "Nieuwe aanvraag" / "Lead toevoegen" — de `NewLeadModal` van het dashboard:
 * titel, klant (bestaand, of nieuw met naam, e-mail en telefoon), fase,
 * verwachte omzet, prioriteit, behandelaars (standaard jijzelf) en omschrijving.
 *
 * Bij een bestaande klant met e-mailadres gaat de "aanvraag ontvangen"-mail
 * mee (`triggerAutoEmail`), tenzij het bedrijf hem in Instellingen uitzette.
 */
export function NieuweAanvraagSheet({
  open,
  startFaseId,
  fasen,
  klanten,
  leden,
  onClose,
  onSaved,
}: {
  open: boolean;
  startFaseId: string | null;
  fasen: SelectOption[];
  klanten: SelectOption[];
  leden: Lid[];
  onClose: () => void;
  onSaved: (deal: DealRow) => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { mag } = usePermissions();
  const { save, saving, error, setError } = useSave<DealRow>();

  const [titel, setTitel] = useState('');
  const [klantModus, setKlantModus] = useState<'bestaand' | 'nieuw'>('bestaand');
  const [klantId, setKlantId] = useState<string | null>(null);
  const [nieuweKlant, setNieuweKlant] = useState('');
  const [nieuwEmail, setNieuwEmail] = useState('');
  const [nieuwTelefoon, setNieuwTelefoon] = useState('');
  const { toon } = useToast();
  const [faseId, setFaseId] = useState<string | null>(null);
  const [omzet, setOmzet] = useState('');
  const [prio, setPrio] = useState('med');
  const [behandelaars, setBehandelaars] = useState<string[]>([]);
  const [omschrijving, setOmschrijving] = useState('');

  useEffect(() => {
    if (!open) return;
    // Elke keer dat het formulier opent: schoon, met de gekozen kolom als fase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitel('');
    setKlantModus('bestaand');
    setKlantId(null);
    setNieuweKlant('');
    setNieuwEmail('');
    setNieuwTelefoon('');
    setFaseId(startFaseId ?? fasen[0]?.id ?? null);
    setOmzet('');
    setPrio('med');
    const eigen = getUserId();
    setBehandelaars(eigen && leden.some((l) => l.id === eigen) ? [eigen] : []);
    setOmschrijving('');
    setError(null);
  }, [open, startFaseId, fasen, leden, setError]);

  const magKlantMaken = mag('klanten', 'maken');

  const opslaan = () => {
    save(
      async () => {
        if (!titel.trim()) return writeFout('validatie', tx('Titel is verplicht'));
        if (!faseId) return writeFout('validatie', tx('Kies een fase'));
        let customerId = klantId;
        if (klantModus === 'nieuw') {
          if (!nieuweKlant.trim()) return writeFout('validatie', tx('Naam klant is verplicht'));
          // Zoals het dashboard: e-mail mag leeg, maar dan wel een geldig adres.
          if (nieuwEmail.trim() && !/^\S+@\S+\.\S+$/.test(nieuwEmail.trim()))
            return writeFout('validatie', tx('Ongeldig e-mailadres'));
          const companyId = getCompanyId();
          if (!companyId) return writeFout('onbekend', tx('Je bedrijfsgegevens zijn nog niet geladen.'));
          // E-mail en telefoon meteen mee: zonder adres kun je later geen
          // offerte of factuur naar deze klant mailen.
          const k = await createCustomer({
            company_id: companyId,
            name: nieuweKlant,
            email: nieuwEmail,
            phone: nieuwTelefoon,
          });
          if (k.error || !k.data) return writeFout('onbekend', k.error ?? tx('Klant aanmaken mislukt.'));
          customerId = k.data.id;
        } else if (!customerId) {
          return writeFout('validatie', tx('Kies een klant of maak een nieuwe aan'));
        }
        const bedrag = omzet.trim() ? Number(omzet.replace(',', '.')) : 0;
        return createDeal({
          title: titel,
          customer_id: customerId,
          stage_id: faseId,
          expected_revenue: bedrag,
          priority: prio,
          assigned_to_ids: behandelaars,
          description: omschrijving,
        });
      },
      {
        onSuccess: (deal) => {
          if (klantModus === 'bestaand' && klantId) {
            void stuurAanvraagOntvangen({ dealId: deal.id, customerId: klantId }).then(({ resultaat, aan }) => {
              if (resultaat === false) toon(tx('De bevestigingsmail aan {aan} is niet verstuurd.', { aan }), 'fout');
            });
          }
          onSaved(deal);
          onClose();
        },
        succesMelding: tx('Nieuwe aanvraag toegevoegd'),
      },
    );
  };

  return (
    <FormSheet
      visible={open}
      title={tx('Nieuwe aanvraag')}
      error={error}
      saving={saving}
      submitLabel={tx('Aanvraag toevoegen')}
      submitDisabled={!titel.trim()}
      onSubmit={opslaan}
      onClose={onClose}
    >
      <FormField
        label={tx('Titel')}
        value={titel}
        onChangeText={setTitel}
        placeholder={tx('Bijv. Badkamer renovatie')}
        autoFocus
      />

      <View style={{ gap: spacing.xs }}>
        <Text style={styles.label}>{tx('Klant')}</Text>
        <View style={styles.rij} accessibilityRole="tablist">
          {(
            [
              ['bestaand', tx('Bestaande klant')],
              ...(magKlantMaken ? [['nieuw', tx('Nieuwe klant')]] : []),
            ] as [typeof klantModus, string][]
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setKlantModus(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: klantModus === id }}
              aria-selected={klantModus === id}
              style={[styles.chip, klantModus === id && styles.chipAan]}
            >
              <Text style={[styles.chipTekst, klantModus === id && styles.chipTekstAan]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {klantModus === 'bestaand' ? (
        <SelectField
          label={tx('Bestaande klant')}
          value={klantId}
          options={klanten}
          onChange={setKlantId}
          placeholder={tx('Kies een klant of maak een nieuwe aan')}
          searchable
        />
      ) : (
        <>
          <FormField label={tx('Naam klant')} value={nieuweKlant} onChangeText={setNieuweKlant} placeholder={tx('Naam')} />
          <FormField
            label={tx('E-mailadres')}
            value={nieuwEmail}
            onChangeText={setNieuwEmail}
            placeholder={tx('Voor offertes en facturen')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          <FormField
            label={tx('Telefoon')}
            value={nieuwTelefoon}
            onChangeText={setNieuwTelefoon}
            placeholder={tx('Telefoonnummer')}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
        </>
      )}

      <SelectField
        label={tx('Pipeline fase')}
        value={faseId}
        options={fasen}
        onChange={setFaseId}
        placeholder={tx('Kies een fase')}
      />
      <FormField
        label={tx('Verwachte omzet')}
        value={omzet}
        onChangeText={setOmzet}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.label}>{tx('Prioriteit')}</Text>
        <View style={styles.rij}>
          {DEAL_PRIORITEITEN.map((p) => {
            const aan = prio === p.id;
            return (
              <Pressable
                key={String(p.id)}
                onPress={() => setPrio(String(p.id))}
                accessibilityRole="radio"
                accessibilityState={{ selected: aan }}
                aria-checked={aan}
                style={[styles.chip, aan && styles.chipAan]}
              >
                <Text style={[styles.chipTekst, aan && styles.chipTekstAan]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <LedenKeuze
        label={tx('Wie behandelt deze aanvraag?')}
        leden={leden}
        waarde={behandelaars}
        onChange={setBehandelaars}
      />
      <FormField
        label={tx('Omschrijving')}
        value={omschrijving}
        onChangeText={setOmschrijving}
        placeholder={tx('Wat wil de klant?')}
        multiline
      />
    </FormSheet>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { ...typography.label, color: t.ink2 },
    rij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  });
