import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components';
import { NotitieLog, type LogLid } from '@/components/NotitieLog';
import { useAuth, useToast } from '@/providers';
import { useStijl } from '@/components/project/bouwstenen';
import { typography } from '@/theme';
import { mentionMeldingen } from '@/lib/mentions';
import { nieuweAfspraakNotitie, nieuwsteEerst, type AfspraakNotitie } from '@/lib/afspraakNotities';
import { getCompanyId } from '@/lib/sessionContext';
import { useSave } from '@/lib/useSave';
import { pushNotificaties } from '@/services/collegaMeldingService';
import { listCompanyProfiles } from '@/services/teamService';
import { createWorkOrder } from '@/services/workOrderService';
import { getAfspraakExtra, koppelWerkbonAanAfspraak, plaatsAfspraakNotitie } from '@/services/activityService';

type Lid = LogLid;

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

  const plaats = async (html: string, getagd: boolean): Promise<boolean> => {
    const notitie = nieuweAfspraakNotitie({
      id: nieuwId(),
      userId: user?.id ?? null,
      naam: profile?.full_name ?? null,
      tekst: html,
      nu: new Date(),
    });
    const res = await plaatsen.save(() => plaatsAfspraakNotitie(afspraakId, notitie));
    if (!res?.ok) return false;
    setNotities(res.data);
    if (getagd) {
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
    return true;
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

      {laadFout ? <Text style={styles.leeg}>{laadFout}</Text> : null}
      <NotitieLog
        label="Notitielog"
        items={nieuwsteEerst(notities).map((n) => ({ id: n.id, html: n.text, auteur: n.name, at: n.at }))}
        leden={leden}
        bezig={plaatsen.saving}
        fout={plaatsen.error}
        onPlaats={plaats}
      />
    </View>
  );
}
