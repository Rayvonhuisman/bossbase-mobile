import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, StickyNote } from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  SelectField,
  type SelectOption,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
  type NoteRow,
} from '@/services/noteService';
import { listCustomers } from '@/services/customerService';
import type { Customer } from '@/types/domain';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { formatDateNL } from '@/lib/format';
import { ds } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Notities — dezelfde `notes`-tabel als het dashboard.
 *
 * Rechten: de RLS-policies op `notes` vragen alleen dat de rij bij je eigen
 * bedrijf hoort; er is geen apart notitierecht. Aanmaken valt wél onder de
 * read-onlygate (`readonly_notes`), bewerken en verwijderen niet — dat is geen
 * versoepeling van onze kant maar precies wat de policies doen, en het spoort
 * met de belofte in het dashboard dat een verlopen account zijn administratie
 * kan blijven bijhouden.
 */

function titleFor(n: NoteRow): string {
  const body = n.body.trim();
  if (!body) return 'Notitie';
  const firstLine = body.split('\n')[0] ?? body;
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

function subtitleFor(n: NoteRow): string {
  // Klant · datum · schrijver. De schrijver komt uit de profielrelatie op
  // `klant_tijdlijn.created_by`; staat die er niet, dan noemen we hem ook niet.
  const parts: string[] = [];
  if (n.customer?.name) parts.push(n.customer.name);
  parts.push(formatDateNL(n.created_at));
  if (n.auteurNaam) parts.push(n.auteurNaam);
  return parts.join(' · ');
}

type Concept = {
  /** null = nieuwe notitie. */
  id: string | null;
  body: string;
  customerId: string | null;
};

export default function NotesScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<NoteRow[]>([]);
  const [klanten, setKlanten] = useState<Customer[]>([]);  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();

  const magMaken = mag('notities', 'maken');
  const magWijzigen = mag('notities', 'wijzigen');
  const magVerwijderen = mag('notities', 'verwijderen');

  const load = useCallback(async () => {
    setError(null);
    const [notesRes, klantRes] = await Promise.all([listNotes(), listCustomers()]);
    if (notesRes.error) setError(notesRes.error);
    else setItems(notesRes.data);
    // De klantenlijst is alleen voor het keuzeveld; mislukt hij, dan blijft de
    // notitie gewoon te maken — zonder klant eraan.
    if (!klantRes.error) setKlanten(klantRes.data);
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  const klantOpties = useMemo<SelectOption[]>(
    () => klanten.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })),
    [klanten],
  );

  const openNieuw = () => {
    setSaveError(null);
    setConcept({ id: null, body: '', customerId: null });
  };

  const openBewerk = (n: NoteRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    setConcept({ id: n.id, body: n.body, customerId: n.customer_id });
  };

  const opslaan = async () => {
    if (!concept) return;
    const res = await save(
      () =>
        concept.id
          ? updateNote(concept.id, {
              body: concept.body,
              ...(concept.customerId ? { customer_id: concept.customerId } : {}),
            })
          : createNote({ body: concept.body, customer_id: concept.customerId ?? '' }),
      {
        onSuccess: async () => {
          setConcept(null);
          await herlaad();
        },
      },
    );
    return res;
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    bevestigVerwijderen('Notitie', () => {
      save(() => deleteNote(id), {
        onSuccess: async () => {
          setConcept(null);
          await herlaad();
        },
      });
    });
  };

  // Niets tonen zolang de rechten onderweg zijn: een plusknop die verschijnt en
  // weer verdwijnt heeft zijn bestaan al verraden.
  if (loading || !rechtenGeladen) return <LoadingScreen label="Notities laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Notities" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Notities"
            subtitle={`${items.length} ${items.length === 1 ? 'notitie' : 'notities'}`}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe notitie" onPress={openNieuw} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<StickyNote size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen notities"
            message={
              magMaken
                ? 'Leg met de plusknop je eerste notitie vast.'
                : (waaromNiet('notities', 'maken') ??
                  'Er zijn nog geen notities vastgelegd.')
            }
          />
        ) : (
          <>
            <AppSection title="Alle notities" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((n, i) => (
                <AppListItem
                  key={n.id}
                  first={i === 0}
                  icon={StickyNote}
                  title={titleFor(n)}
                  subtitle={subtitleFor(n)}
                  onPress={magWijzigen ? () => openBewerk(n) : undefined}
                />
              ))}
            </AppListGroup>
          </>
        )}
      </AppScreen>

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Notitie bewerken' : 'Nieuwe notitie'}
        subtitle={concept?.id ? undefined : 'Wordt direct zichtbaar op het dashboard'}
        error={saveError}
        saving={saving}
        submitDisabled={!concept?.body.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Notitie verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        <FormField
          label="Notitie"
          value={concept?.body ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, body: v } : c))}
          placeholder="Wat moet er bewaard blijven?"
          multiline
          autoFocus
        />
        {/* Verplicht: een klantnotitie is een regel op de klanttijdlijn, en
            `klant_tijdlijn.customer_id` is NOT NULL. Zonder klant is er geen
            plek om hem te bewaren. */}
        <SelectField
          label="Klant *"
          value={concept?.customerId ?? null}
          options={klantOpties}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id } : c))}
          placeholder="Kies een klant"
          hint="De notitie komt op de kaart van deze klant te staan."
        />
      </FormSheet>
    </View>
  );
}
