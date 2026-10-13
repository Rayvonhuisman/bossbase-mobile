import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { FormField } from './FormField';
import { DateField, TimeField } from './DateField';
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
import { alsHtml, alsTekst } from '@/lib/notitieTekst';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { spacing, typography, radius, type ThemeColors } from '@/theme';

export type ActivityConcept = {
  /** null = nieuw. */
  id: string | null;
  title: string;
  type: string;
  date: string;
  time: string;
  /** Platte tekst om te bewerken; het dashboard bewaart notities als HTML. */
  notes: string;
  /** De notitie zoals hij in de database stond (mogelijk HTML). */
  notesOrigineel?: string | null;
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
    notes: alsTekst(a.notes),
    notesOrigineel: a.notes,
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
  /** Toon het type-veld. */
  toonType?: boolean;
  /**
   * Mag deze gebruiker een bestaande activiteit wijzigen en verwijderen? Het
   * dashboard staat dat alleen admin en planner toe (`ActivityEditModal`);
   * afronden en heropenen mag iedereen. Standaard: ja.
   */
  magBewerken?: boolean;
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
  magBewerken = true,
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

  // Alleen-lezen bij een bestaande activiteit zonder bewerkrecht: dan is
  // alleen de schakelaar "Afgerond" te bedienen, net als in het dashboard.
  const alleenLezen = !!vorm?.id && !magBewerken;

  const opslaan = () => {
    if (!vorm) return;
    if (alleenLezen && vorm.id) {
      const id = vorm.id;
      save(() => updateActivity(id, { completed: vorm.completed }), {
        onSuccess: async () => {
          onClose();
          await onSaved();
        },
      });
      return;
    }
    const invoer = {
      title: vorm.title,
      type: vorm.type,
      date: vorm.date || null,
      time: vorm.time || null,
      // Ongewijzigd? Dan de notitie niet meesturen, zodat opmaak en @-tags uit
      // het dashboard intact blijven. Gewijzigd: als veilige HTML terug.
      notes:
        vorm.id && vorm.notes === alsTekst(vorm.notesOrigineel)
          ? undefined
          : vorm.notes.trim()
            ? alsHtml(vorm.notes)
            : '',
      customer_id: vorm.customerId,
      // Alleen meesturen als de keuze is veranderd: een activiteit kan in het
      // dashboard meerdere toegewezenen hebben, en die willen we niet wissen.
      assigned_to_ids:
        vorm.id && vorm.assigneeId === concept?.assigneeId
          ? undefined
          : vorm.assigneeId
            ? [vorm.assigneeId]
            : [],
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
      title={vorm?.id ? (alleenLezen ? 'Activiteit' : 'Activiteit bewerken') : 'Nieuwe activiteit'}
      error={error}
      saving={saving}
      submitDisabled={!vorm?.title.trim()}
      onSubmit={opslaan}
      onClose={onClose}
      destructive={
        vorm?.id && magBewerken && mag('activiteiten', 'verwijderen')
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
        editable={!alleenLezen}
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
                  disabled={alleenLezen}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief, disabled: alleenLezen }}
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
          <DateField
            label="Datum"
            value={vorm?.date || null}
            onChange={(v) => zetVeld('date', v)}
            disabled={alleenLezen}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Tijd"
            value={vorm?.time || null}
            onChange={(v) => zetVeld('time', v)}
            placeholder="09:00"
            hint="Leeg = 09:00"
            disabled={alleenLezen}
          />
        </View>
      </View>

      <SelectField
        label="Klant"
        value={vorm?.customerId ?? null}
        options={klanten}
        onChange={(id) => zetVeld('customerId', id)}
        disabled={alleenLezen}
        searchable
        allowEmpty
        emptyLabel="Geen klant"
        placeholder="Geen klant"
      />

      <SelectField
        label="Toegewezen aan"
        value={vorm?.assigneeId ?? null}
        options={medewerkers}
        onChange={(id) => zetVeld('assigneeId', id)}
        disabled={alleenLezen}
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
        editable={!alleenLezen}
      />

      {vorm?.id ? (
        <View style={styles.schakelRij}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schakelTitel}>Afgerond</Text>
            <Text style={styles.schakelUitleg}>
              Afgeronde activiteiten staan onder Afgerond in Activiteiten.
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
