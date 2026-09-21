import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { FormField } from './FormField';
import { FormSheet } from './FormSheet';
import { SelectField, type SelectOption } from './SelectField';
import { usePermissions, useTheme } from '@/providers';
import {
  ACTIVITEIT_TYPES,
  activiteitTypeLabel,
  createActivity,
  deleteActivity,
  updateActivity,
  type ActivityRow,
} from '@/services/activityService';
import { splitsLokaal, vandaagIso } from '@/lib/nlTijd';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { spacing, typography, radius, type ThemeColors } from '@/theme';

export type ActivityConcept = {
  /** null = nieuw. */
  id: string | null;
  title: string;
  type: string;
  date: string;
  time: string;
  notes: string;
  customerId: string | null;
  assigneeId: string | null;
  completed: boolean;
};

/** Een bestaande rij naar een bewerkbaar concept. */
export function conceptVanActiviteit(a: ActivityRow): ActivityConcept {
  const { date, time } = splitsLokaal(a.due_at);
  return {
    id: a.id,
    title: a.title ?? '',
    type: a.type ?? 'task',
    date,
    time,
    notes: a.notes ?? '',
    customerId: a.customer_id,
    assigneeId: a.assigned_to,
    completed: a.completed,
  };
}

export function leegConcept(type = 'task'): ActivityConcept {
  return {
    id: null,
    title: '',
    type,
    date: vandaagIso(),
    time: '',
    notes: '',
    customerId: null,
    assigneeId: null,
    completed: false,
  };
}

type Props = {
  concept: ActivityConcept | null;
  klanten: SelectOption[];
  medewerkers: SelectOption[];
  /** Toon het type-veld. Op het Taken-scherm ligt het type vast op 'task'. */
  toonType?: boolean;
  onClose: () => void;
  /** Na een geslaagde opslag of verwijdering. */
  onSaved: () => void | Promise<void>;
};

/**
 * Het formulier voor een activiteit of taak — gedeeld door beide schermen, zodat
 * "een taak" op het Taken-scherm exact dezelfde rij oplevert als op het
 * Activiteiten-scherm.
 *
 * De rechten op `activities` zijn bedrijfsbreed: wie de lijst mag zien mag ook
 * schrijven. Alleen aanmaken valt onder de read-onlygate.
 */
export function ActivityFormSheet({
  concept,
  klanten,
  medewerkers,
  toonType = true,
  onClose,
  onSaved,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { mag } = usePermissions();
  const { save, saving, error, setError } = useSave<unknown>();

  const [vorm, setVorm] = useState<ActivityConcept | null>(concept);

  useEffect(() => {
    // Het formulier volgt het concept dat het scherm doorgeeft; dat spiegelen
    // in state is de enige manier om de velden bewerkbaar te houden.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVorm(concept);
    setError(null);
  }, [concept, setError]);

  const zetVeld = <K extends keyof ActivityConcept>(sleutel: K, waarde: ActivityConcept[K]) =>
    setVorm((v) => (v ? { ...v, [sleutel]: waarde } : v));

  const opslaan = () => {
    if (!vorm) return;
    const invoer = {
      title: vorm.title,
      type: vorm.type,
      date: vorm.date || null,
      time: vorm.time || null,
      notes: vorm.notes,
      customer_id: vorm.customerId,
      assigned_to_ids: vorm.assigneeId ? [vorm.assigneeId] : [],
      completed: vorm.completed,
    };
    save(() => (vorm.id ? updateActivity(vorm.id, invoer) : createActivity(invoer)), {
      onSuccess: async () => {
        onClose();
        await onSaved();
      },
    });
  };

  const verwijderen = () => {
    if (!vorm?.id) return;
    const id = vorm.id;
    bevestigVerwijderen('Activiteit', () => {
      save(() => deleteActivity(id), {
        onSuccess: async () => {
          onClose();
          await onSaved();
        },
      });
    });
  };

  return (
    <FormSheet
      visible={vorm !== null}
      title={vorm?.id ? 'Activiteit bewerken' : 'Nieuwe activiteit'}
      error={error}
      saving={saving}
      submitDisabled={!vorm?.title.trim()}
      onSubmit={opslaan}
      onClose={onClose}
      destructive={
        vorm?.id && mag('activiteiten', 'verwijderen')
          ? { label: 'Activiteit verwijderen', onPress: verwijderen }
          : undefined
      }
    >
      <FormField
        label="Titel"
        value={vorm?.title ?? ''}
        onChangeText={(v) => zetVeld('title', v)}
        placeholder="Bijv. Klant bellen over offerte"
        autoFocus={!vorm?.id}
      />

      {toonType ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Soort</Text>
          <View style={styles.chipRij}>
            {ACTIVITEIT_TYPES.map((soort) => {
              const actief = vorm?.type === soort;
              return (
                <Pressable
                  key={soort}
                  onPress={() => zetVeld('type', soort)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>
                    {activiteitTypeLabel(soort)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.rij}>
        <View style={{ flex: 1.4 }}>
          <FormField
            label="Datum"
            value={vorm?.date ?? ''}
            onChangeText={(v) => zetVeld('date', v)}
            placeholder="JJJJ-MM-DD"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormField
            label="Tijd"
            value={vorm?.time ?? ''}
            onChangeText={(v) => zetVeld('time', v)}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
            hint="Leeg = 09:00"
          />
        </View>
      </View>

      <SelectField
        label="Klant"
        value={vorm?.customerId ?? null}
        options={klanten}
        onChange={(id) => zetVeld('customerId', id)}
        allowEmpty
        emptyLabel="Geen klant"
        placeholder="Geen klant"
      />

      <SelectField
        label="Toegewezen aan"
        value={vorm?.assigneeId ?? null}
        options={medewerkers}
        onChange={(id) => zetVeld('assigneeId', id)}
        allowEmpty
        emptyLabel="Aan mij toewijzen"
        placeholder="Aan mij toewijzen"
        hint="Zonder keuze komt de activiteit op jouw naam."
      />

      <FormField
        label="Notities"
        value={vorm?.notes ?? ''}
        onChangeText={(v) => zetVeld('notes', v)}
        placeholder="Optioneel"
        multiline
      />

      {vorm?.id ? (
        <View style={styles.schakelRij}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schakelTitel}>Afgerond</Text>
            <Text style={styles.schakelUitleg}>
              Afgeronde activiteiten verdwijnen uit de takenlijst.
            </Text>
          </View>
          <Switch
            value={vorm.completed}
            onValueChange={(v) => zetVeld('completed', v)}
            disabled={saving}
          />
        </View>
      ) : null}
    </FormSheet>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { ...typography.label, color: t.ink2 },
    rij: { flexDirection: 'row', gap: spacing.md },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipActief: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
    schakelRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    schakelTitel: { fontSize: 14.5, fontWeight: '700', color: t.ink },
    schakelUitleg: { fontSize: 12.5, color: t.muted, marginTop: 2 },
  });
