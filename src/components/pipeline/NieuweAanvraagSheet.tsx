import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { SelectField, type SelectOption } from '@/components/SelectField';
import { usePermissions, useTheme } from '@/providers';
import { useSave } from '@/lib/useSave';
import { getCompanyId, getUserId } from '@/lib/sessionContext';
import { writeFout } from '@/lib/writeResult';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { createCustomer } from '@/services/customerService';
import { createDeal, DEAL_PRIORITEITEN, type DealRow } from '@/services/dealService';
import { LedenKeuze, type Lid } from './LedenKeuze';

/**
 * "Nieuwe aanvraag" / "Lead toevoegen" — de `NewLeadModal` van het dashboard:
 * titel, klant (bestaand of nieuw, alleen naam), fase, verwachte omzet,
 * prioriteit, behandelaars (standaard jijzelf) en omschrijving.
 *
 * Bewust niet: de automatische "aanvraag ontvangen"-mail naar de klant. De app
 * verstuurt geen mails; dat blijft het dashboard.
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
        if (!titel.trim()) return writeFout('validatie', 'Titel is verplicht');
        if (!faseId) return writeFout('validatie', 'Kies een fase');
        let customerId = klantId;
        if (klantModus === 'nieuw') {
          if (!nieuweKlant.trim()) return writeFout('validatie', 'Naam klant is verplicht');
          const companyId = getCompanyId();
          if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
          const k = await createCustomer({ company_id: companyId, name: nieuweKlant });
          if (k.error || !k.data) return writeFout('onbekend', k.error ?? 'Klant aanmaken mislukt.');
          customerId = k.data.id;
        } else if (!customerId) {
          return writeFout('validatie', 'Kies een klant of maak een nieuwe aan');
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
          onSaved(deal);
          onClose();
        },
        succesMelding: 'Nieuwe aanvraag toegevoegd',
      },
    );
  };

  return (
    <FormSheet
      visible={open}
      title="Nieuwe aanvraag"
      error={error}
      saving={saving}
      submitLabel="Aanvraag toevoegen"
      submitDisabled={!titel.trim()}
      onSubmit={opslaan}
      onClose={onClose}
    >
      <FormField
        label="Titel"
        value={titel}
        onChangeText={setTitel}
        placeholder="Bijv. Badkamer renovatie"
        autoFocus
      />

      <View style={{ gap: spacing.xs }}>
        <Text style={styles.label}>Klant</Text>
        <View style={styles.rij} accessibilityRole="tablist">
          {(
            [
              ['bestaand', 'Bestaande klant'],
              ...(magKlantMaken ? [['nieuw', 'Nieuwe klant']] : []),
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
          label="Bestaande klant"
          value={klantId}
          options={klanten}
          onChange={setKlantId}
          placeholder="Kies een klant of maak een nieuwe aan"
          searchable
        />
      ) : (
        <FormField label="Naam klant" value={nieuweKlant} onChangeText={setNieuweKlant} placeholder="Naam" />
      )}

      <SelectField
        label="Pipeline fase"
        value={faseId}
        options={fasen}
        onChange={setFaseId}
        placeholder="Kies een fase"
      />
      <FormField
        label="Verwachte omzet"
        value={omzet}
        onChangeText={setOmzet}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.label}>Prioriteit</Text>
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
        label="Wie behandelt deze aanvraag?"
        leden={leden}
        waarde={behandelaars}
        onChange={setBehandelaars}
      />
      <FormField
        label="Omschrijving"
        value={omschrijving}
        onChangeText={setOmschrijving}
        placeholder="Wat wil de klant?"
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
