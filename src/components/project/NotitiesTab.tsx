import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Button } from '@/components';
import type { Lid } from '@/components/pipeline/LedenKeuze';
import { useAuth } from '@/providers';
import { formatDateNL } from '@/lib/format';
import { lokaleDatum } from '@/lib/nlTijd';
import { alsTekst } from '@/lib/notitieTekst';
import { mentionMeldingen } from '@/lib/mentions';
import { MentionInvoer, naarHtml, type Getagd } from '@/components/NotitieLog';
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
  const [gekozen, setGekozen] = useState<Getagd[]>([]);
  const { save, saving, error } = useSave<ProjectNote>();

  const toevoegen = () => {
    const schoon = tekst.trim();
    // Alleen met een tag HTML (mention-span, zoals het dashboard); anders de
    // platte tekst, zoals de app projectnotities altijd opsloeg.
    const notitie = naarHtml(schoon, gekozen);
    const opslag = notitie.getagd ? notitie.html : schoon;
    save(() => addProjectNote(projectId, opslag), {
      onSuccess: async () => {
        setTekst('');
        setGekozen([]);
        // De getagde collega hoort het; mislukt de melding, dan blijft de notitie staan.
        if (notitie.getagd) {
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
      <MentionInvoer
        label="Nieuwe notitie"
        value={tekst}
        onChangeText={setTekst}
        gekozen={gekozen}
        onGekozen={setGekozen}
        leden={leden.filter((l) => l.full_name).map((l) => ({ id: l.id, full_name: l.full_name ?? '' }))}
        placeholder="Schrijf een notitie over dit project… Typ @ om iemand te taggen"
      />
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
