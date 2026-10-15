import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Button, FormField } from '@/components';
import type { Lid } from '@/components/pipeline/LedenKeuze';
import { useAuth } from '@/providers';
import { formatDateNL } from '@/lib/format';
import { lokaleDatum } from '@/lib/nlTijd';
import { alsTekst } from '@/lib/notitieTekst';
import { mentionMeldingen, mentionZoekterm, tekstMetVermeldingen } from '@/lib/mentions';
import { useSave } from '@/lib/useSave';
import { pushNotificaties } from '@/services/collegaMeldingService';
import { addProjectNote, type ProjectNote } from '@/services/projectService';
import { Blok, useStijl } from './bouwstenen';

/**
 * De Notities-tab (`NotesTab` + `NotitieLog` in het dashboard). Typ @ om een
 * collega te taggen: die krijgt een melding (en mail), net als in het
 * dashboard (`createMentionNotifications`). Een notitie met een tag wordt
 * opgeslagen in het formaat van het dashboard (mention-span), zonder tag als
 * platte tekst.
 */
export function NotitiesTab({
  projectId,
  projectNaam,
  notities,
  leden,
  magMaken,
  magVerwijderen,
  onToegevoegd,
  onVerwijder,
}: {
  projectId: string;
  projectNaam: string;
  notities: ProjectNote[];
  leden: Lid[];
  magMaken: boolean;
  magVerwijderen: (n: ProjectNote) => boolean;
  onToegevoegd: () => Promise<void>;
  onVerwijder: (n: ProjectNote) => void;
}) {
  const { t, styles } = useStijl();
  const { profile } = useAuth();
  const [tekst, setTekst] = useState('');
  const [gekozen, setGekozen] = useState<{ id: string; naam: string }[]>([]);
  const [cursor, setCursor] = useState(0);
  const { save, saving, error } = useSave<ProjectNote>();

  // "@" vóór de cursor: de keuzelijst met namen (NoteEditor.detectMention).
  const zoek = mentionZoekterm(tekst, cursor);
  const keuzes =
    zoek === null
      ? []
      : leden
          .filter((l) => l.full_name && l.full_name.toLowerCase().includes(zoek.term.trim().toLowerCase()))
          .slice(0, 6);

  const kies = (l: Lid) => {
    if (!zoek) return;
    const naam = l.full_name ?? '';
    const invoeg = `@${naam} `;
    setTekst((v) => `${v.slice(0, zoek.start)}${invoeg}${v.slice(cursor)}`);
    setCursor(zoek.start + invoeg.length);
    setGekozen((g) => (g.some((x) => x.id === l.id) ? g : [...g, { id: l.id, naam }]));
  };

  const toevoegen = () => {
    const schoon = tekst.trim();
    // Alleen met een tag HTML (mention-span, zoals het dashboard); anders de
    // platte tekst, zoals de app projectnotities altijd opsloeg.
    const metTag = gekozen.filter((g) => g.naam && schoon.includes(`@${g.naam}`));
    const opslag = metTag.length ? tekstMetVermeldingen(schoon, metTag) : schoon;
    save(() => addProjectNote(projectId, opslag), {
      onSuccess: async () => {
        setTekst('');
        setGekozen([]);
        setCursor(0);
        // De getagde collega hoort het; mislukt de melding, dan blijft de notitie staan.
        if (metTag.length) {
          void pushNotificaties(
            mentionMeldingen({
              text: opslag,
              relatedType: 'project',
              relatedId: projectId,
              link: 'projecten',
              creatorName: profile?.full_name ?? null,
              contextName: projectNaam || 'een project',
            }),
          );
        }
        await onToegevoegd();
      },
    });
  };

  return (
    <Blok titel="Notities">
      <FormField
        label="Nieuwe notitie"
        value={tekst}
        onChangeText={setTekst}
        onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
        placeholder="Schrijf een notitie over dit project… Typ @ om iemand te taggen"
        multiline
      />
      {keuzes.length ? (
        <View style={styles.chipRij} accessibilityLabel="Collega taggen">
          {keuzes.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => kies(l)}
              accessibilityRole="button"
              accessibilityLabel={`${l.full_name} taggen`}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.chipTekst}>@{l.full_name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Text style={[styles.klein, { color: t.statusRejectFg }]}>{error}</Text> : null}
      <View style={{ alignItems: 'flex-end' }}>
        <Button
          label="Notitie toevoegen"
          onPress={toevoegen}
          loading={saving}
          disabled={!tekst.trim() || saving || !magMaken}
        />
      </View>
      {notities.length === 0 ? (
        <Text style={styles.leeg}>Nog geen notities. Voeg de eerste notitie toe.</Text>
      ) : (
        notities.map((n) => (
          <View key={n.id} style={styles.notitie}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.notitieMeta}>
                {n.auteur?.full_name || 'Onbekend'} · {formatDateNL(lokaleDatum(n.created_at))}
              </Text>
              <Text style={styles.tekst}>{alsTekst(n.note)}</Text>
            </View>
            {magVerwijderen(n) ? (
              <Pressable
                onPress={() => onVerwijder(n)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Notitie verwijderen"
                style={styles.notitieWeg}
              >
                <Trash2 size={16} color={t.statusRejectFg} />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </Blok>
  );
}
