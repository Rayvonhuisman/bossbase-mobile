import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { FormField } from './FormField';
import { DateField, TimeField } from './DateField';
import { FormSheet } from './FormSheet';
import { SelectField, type SelectOption } from './SelectField';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { LedenKeuze } from './pipeline/LedenKeuze';
import {
  ACTIVITEIT_TYPES,
  activiteitTypeLabel,
  createActivity,
  deleteActivity,
  meldActiviteitToewijzing,
  updateActivity,
  type ActivityRow,
} from '@/services/activityService';
import { splitsLokaal, vandaagIso } from '@/lib/nlTijd';
import { plusMinuten } from '@/lib/datum';
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
  /** Project/aanvraag (`deal_id`). */
  dealId: string | null;
  /** Alle toegewezenen; leeg = op jouw naam (bij nieuw). */
  assigneeIds: string[];
  /** HH:mm; standaard het begin + 15 minuten, zoals het dashboard. */
  endTime: string;
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
    dealId: a.deal_id,
    assigneeIds: a.assigned_to_ids?.length ? a.assigned_to_ids : a.assigned_to ? [a.assigned_to] : [],
    endTime: a.end_time ? String(a.end_time).slice(0, 5) : '',
    completed: a.completed,
  };
}

export function leegConcept(type = 'task'): ActivityConcept {
  return {
    id: null,
    title: '',
    type,
    date: vandaagIso(),
    // Zoals het dashboard: 09:00, eind een kwartier later.
    time: '09:00',
    notes: '',
    customerId: null,
    dealId: null,
    assigneeIds: [],
    endTime: '09:15',
    completed: false,
  };
}

type Props = {
  concept: ActivityConcept | null;
  klanten: SelectOption[];
  medewerkers: SelectOption[];
  /** Projecten om aan te koppelen; gefilterd op de gekozen klant. */
  projecten?: (SelectOption & { customerId?: string | null })[];
  /** Toon het type-veld. */
  toonType?: boolean;
  /**
   * Mag deze gebruiker een bestaande activiteit wijzigen en verwijderen? Het
   * dashboard staat dat alleen admin of het recht planning toe (`ActivityEditModal`);
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
  projecten = [],
  toonType = true,
  magBewerken = true,
  onClose,
  onSaved,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { mag } = usePermissions();
  const { user } = useAuth();
  const [stuurMail, setStuurMail] = useState(true);
  // Eindtijd zelf gekozen? Dan schuift hij niet meer mee met het begin.
  const [eindHandmatig, setEindHandmatig] = useState(false);
  const { save, saving, error, setError } = useSave<unknown>();

  const [vorm, setVorm] = useState<ActivityConcept | null>(concept);

  useEffect(() => {
    // Het formulier volgt het concept dat het scherm doorgeeft; dat spiegelen
    // in state is de enige manier om de velden bewerkbaar te houden.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVorm(concept);
    setError(null);
    setEindHandmatig(!!concept?.id);
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
      deal_id: vorm.dealId,
      // Nieuw zonder keuze: de service zet hem op jouw naam (zoals het dashboard).
      assigned_to_ids: vorm.id || vorm.assigneeIds.length ? vorm.assigneeIds : undefined,
      end_time: vorm.endTime || null,
      completed: vorm.completed,
    };
    const vorige = concept?.id ? concept.assigneeIds : [];
    save(() => (vorm.id ? updateActivity(vorm.id, invoer) : createActivity(invoer)), {
      onSuccess: async (resultaat) => {
        const rij = resultaat as ActivityRow | null;
        if (rij?.id) {
          void meldActiviteitToewijzing({
            activiteitId: rij.id,
            titel: vorm.title.trim(),
            datum: vorm.date || null,
            toegewezen: vorm.assigneeIds,
            vorige,
            maker: user?.id ?? null,
            stuurMail,
          });
        }
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
                  aria-pressed={actief}
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
            label="Van"
            value={vorm?.time || null}
            onChange={(v) =>
              setVorm((c) => (c ? { ...c, time: v, endTime: eindHandmatig ? c.endTime : plusMinuten(v, 15) } : c))
            }
            placeholder="09:00"
            disabled={alleenLezen}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Tot"
            value={vorm?.endTime || null}
            onChange={(v) => {
              setEindHandmatig(true);
              zetVeld('endTime', v);
            }}
            placeholder="09:15"
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

      {projecten.length ? (
        <SelectField
          label="Project"
          value={vorm?.dealId ?? null}
          options={projecten.filter((p) => !vorm?.customerId || !p.customerId || p.customerId === vorm.customerId)}
          onChange={(id) => zetVeld('dealId', id)}
          disabled={alleenLezen}
          searchable
          allowEmpty
          emptyLabel="Geen project"
          placeholder="Geen project"
        />
      ) : null}

      <LedenKeuze
        label="Toegewezen aan"
        leden={medewerkers.map((m) => ({ id: m.id, full_name: m.label }))}
        waarde={vorm?.assigneeIds ?? []}
        onChange={(ids) => zetVeld('assigneeIds', ids)}
        disabled={alleenLezen}
      />
      {!vorm?.id && !vorm?.assigneeIds.length ? (
        <Text style={styles.schakelUitleg}>Zonder keuze komt de activiteit op jouw naam.</Text>
      ) : null}
      {!alleenLezen && (vorm?.assigneeIds ?? []).some((id) => id !== user?.id && !(concept?.assigneeIds ?? []).includes(id)) ? (
        <View style={styles.schakelRij}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schakelTitel}>Ook per e-mail laten weten</Text>
            <Text style={styles.schakelUitleg}>Nieuwe toegewezenen krijgen naast de melding in de app een mail.</Text>
          </View>
          <Switch value={stuurMail} onValueChange={setStuurMail} />
        </View>
      ) : null}

      <FormField
        label="Notities"
        value={vorm?.notes ?? ''}
        onChangeText={(v) => zetVeld('notes', v)}
        placeholder="Optioneel"
        multiline
        editable={!alleenLezen}
      />

      {vorm ? (
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
