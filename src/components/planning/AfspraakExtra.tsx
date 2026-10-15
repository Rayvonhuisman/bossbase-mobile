import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, FormField } from '@/components';
import { useAuth, useToast } from '@/providers';
import { useStijl } from '@/components/project/bouwstenen';
import { typography } from '@/theme';
import { formatDateNL, formatPlanningTime } from '@/lib/format';
import { lokaleDatum } from '@/lib/nlTijd';
import { alsHtml, alsTekst } from '@/lib/notitieTekst';
import { mentionMeldingen, mentionZoekterm, tekstMetVermeldingen } from '@/lib/mentions';
import { nieuweAfspraakNotitie, nieuwsteEerst, type AfspraakNotitie } from '@/lib/afspraakNotities';
import { getCompanyId } from '@/lib/sessionContext';
import { useSave } from '@/lib/useSave';
import { pushNotificaties } from '@/services/collegaMeldingService';
import { listCompanyProfiles } from '@/services/teamService';
import { createWorkOrder } from '@/services/workOrderService';
import { getAfspraakExtra, koppelWerkbonAanAfspraak, plaatsAfspraakNotitie } from '@/services/activityService';

type Lid = { id: string; full_name: string };

const nieuwId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}`;

/**
 * Onderaan een bestaande afspraak, zoals `CalendarEventDetailDrawer` in het
 * dashboard: de gekoppelde werkbon (of er een maken uit de afspraak), en het
 * notitielog met @-vermeldingen.
 *
 * Werkbon maken mag wie de afspraak mag bewerken (de database vraagt daarnaast
 * het recht werkbonnen bewerken of planning). Het log staat in
 * `calendar_events.comments`.
 */
export function AfspraakExtra({
  afspraakId,
  magBewerken,
  vorm,
  onNaarWerkbon,
}: {
  afspraakId: string;
  magBewerken: boolean;
  /** De velden zoals ze nu in het formulier staan: daaruit komt de werkbon. */
  vorm: {
    title: string;
    date: string;
    time: string;
    end: string;
    location: string;
    customerId: string | null;
    dealId: string | null;
  };
  onNaarWerkbon: (id: string) => void;
}) {
  const { styles, t } = useStijl();
  const { user, profile } = useAuth();
  const { toon } = useToast();
  const router = useRouter();
  const [werkbonId, setWerkbonId] = useState<string | null>(null);
  const [notities, setNotities] = useState<AfspraakNotitie[]>([]);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [leden, setLeden] = useState<Lid[]>([]);
  const [tekst, setTekst] = useState('');
  const [cursor, setCursor] = useState(0);
  const [gekozen, setGekozen] = useState<{ id: string; naam: string }[]>([]);
  const [maken, setMaken] = useState(false);
  const plaatsen = useSave<AfspraakNotitie[]>();

  useEffect(() => {
    let actief = true;
    void Promise.all([getAfspraakExtra(afspraakId), listCompanyProfiles()]).then(([extra, team]) => {
      if (!actief) return;
      setWerkbonId(extra.werkbonId);
      setNotities(extra.notities);
      setLaadFout(extra.error);
      if (!team.error) setLeden(team.data.filter((l) => l.actief).map((l) => ({ id: l.id, full_name: l.full_name })));
    });
    return () => {
      actief = false;
    };
  }, [afspraakId]);

  const werkbonMaken = async () => {
    const companyId = getCompanyId();
    if (!companyId || maken) return;
    setMaken(true);
    try {
      const wb = await createWorkOrder({
        company_id: companyId,
        titel: vorm.title.trim() || 'Werkbon',
        customer_id: vorm.customerId,
        deal_id: vorm.dealId,
        gepland_op: vorm.date || null,
        starttijd: vorm.time || null,
        eindtijd: vorm.end || null,
        locatie: vorm.location || null,
      });
      if (wb.error || !wb.data) {
        toon(wb.error ?? 'Werkbon aanmaken mislukt.', 'fout');
        return;
      }
      const k = await koppelWerkbonAanAfspraak(afspraakId, wb.data.id);
      if (!k.ok) toon(k.melding, 'waarschuwing');
      else toon('Werkbon aangemaakt', 'succes');
      setWerkbonId(wb.data.id);
    } finally {
      setMaken(false);
    }
  };

  // "@" vóór de cursor: de keuzelijst met namen (NoteEditor.detectMention).
  const zoek = mentionZoekterm(tekst, cursor);
  const keuzes =
    zoek === null
      ? []
      : leden.filter((l) => l.full_name.toLowerCase().includes(zoek.term.trim().toLowerCase())).slice(0, 6);

  const kies = (l: Lid) => {
    if (!zoek) return;
    const invoeg = `@${l.full_name} `;
    setTekst((v) => `${v.slice(0, zoek.start)}${invoeg}${v.slice(cursor)}`);
    setCursor(zoek.start + invoeg.length);
    setGekozen((g) => (g.some((x) => x.id === l.id) ? g : [...g, { id: l.id, naam: l.full_name }]));
  };

  const plaats = () => {
    const schoon = tekst.trim();
    if (!schoon) return;
    const metTag = gekozen.filter((g) => schoon.includes(`@${g.naam}`));
    const html = metTag.length ? tekstMetVermeldingen(schoon, metTag) : alsHtml(schoon);
    const notitie = nieuweAfspraakNotitie({
      id: nieuwId(),
      userId: user?.id ?? null,
      naam: profile?.full_name ?? null,
      tekst: html,
      nu: new Date(),
    });
    plaatsen.save(() => plaatsAfspraakNotitie(afspraakId, notitie), {
      onSuccess: (lijst) => {
        setNotities(lijst);
        setTekst('');
        setGekozen([]);
        setCursor(0);
        if (metTag.length) {
          void pushNotificaties(
            mentionMeldingen({
              text: html,
              relatedType: 'calendar_event',
              relatedId: afspraakId,
              link: 'calendar',
              creatorName: profile?.full_name ?? null,
              contextName: vorm.title,
            }),
          );
        }
      },
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ ...typography.label, color: t.muted2 }}>Werkbon</Text>
        {werkbonId ? (
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => {
              onNaarWerkbon(werkbonId);
              router.push(`/work-orders/${werkbonId}`);
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.green700 }}>Werkbon openen ›</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.leeg}>Geen werkbon gekoppeld</Text>
            {magBewerken ? (
              <View style={{ alignItems: 'flex-start' }}>
                <Button label="Werkbon aanmaken" variant="secondary" onPress={werkbonMaken} loading={maken} />
              </View>
            ) : null}
          </>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <FormField
          label="Notitielog"
          value={tekst}
          onChangeText={setTekst}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
          placeholder="Schrijf een notitie… Typ @ om iemand te taggen"
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
        {plaatsen.error ? <Text style={[styles.klein, { color: t.statusRejectFg }]}>{plaatsen.error}</Text> : null}
        <View style={{ alignItems: 'flex-end' }}>
          <Button
            label="Plaatsen"
            variant="secondary"
            onPress={plaats}
            loading={plaatsen.saving}
            disabled={!tekst.trim() || plaatsen.saving}
          />
        </View>
        {laadFout ? <Text style={styles.leeg}>{laadFout}</Text> : null}
        {!laadFout && notities.length === 0 ? <Text style={styles.leeg}>Nog geen notities.</Text> : null}
        {nieuwsteEerst(notities).map((n) => (
          <View key={n.id} style={styles.notitie}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.notitieMeta}>
                {n.name} · {formatDateNL(lokaleDatum(n.at))} {formatPlanningTime(n.at)}
              </Text>
              <Text style={styles.tekst}>{alsTekst(n.text)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
