import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { createNote, listNotes, type NoteRow } from '@/services/noteService';
import { listCustomers } from '@/services/customerService';
import type { Customer } from '@/types/domain';
import { useSave } from '@/lib/useSave';
import { formatDateNL } from '@/lib/format';
import { ds } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Notities — klantnotities op de klanttijdlijn (`klant_tijdlijn`), dezelfde
 * als in het dashboard.
 *
 * Toevoegen kan; wijzigen en verwijderen niet. De tijdlijn is een logboek en
 * de RLS-policies kennen alleen lezen en toevoegen (zie `noteService`). Een
 * knop "Bewerken" of "Verwijderen" zou dus altijd op een foutmelding uitlopen;
 * daarom tonen we die niet, ook niet aan een beheerder.
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
    setConcept({ body: '', customerId: null });
  };

  const opslaan = async () => {
    if (!concept) return;
    const res = await save(
      () => createNote({ body: concept.body, customer_id: concept.customerId ?? '' }),
      {
        onSuccess: async () => {
          setConcept(null);
          await herlaad();
        },
      },
    );
    return res;
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
                />
              ))}
            </AppListGroup>
            <Text style={[styles.voetnoot, { color: t.muted }]}>
              Een notitie blijft op de klanttijdlijn staan zoals hij is toegevoegd. Wijzigen of
              verwijderen kan niet.
            </Text>
          </>
        )}
      </AppScreen>

      <FormSheet
        visible={concept !== null}
        title="Nieuwe notitie"
        subtitle="Wordt direct zichtbaar op het dashboard"
        error={saveError}
        saving={saving}
        submitDisabled={!concept?.body.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
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

const styles = StyleSheet.create({
  voetnoot: { fontSize: 12.5, lineHeight: 18, marginTop: 12, paddingHorizontal: 4 },
});
