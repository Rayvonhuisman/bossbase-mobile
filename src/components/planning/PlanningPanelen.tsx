import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, DateField, NoticeBanner, TimeField } from '@/components';
import { Paneel } from '@/components/Paneel';
import { PloegKeuze, type PloegLid } from '@/components/PloegKeuze';
import { Schakel } from '@/components/instellingen/Bouwstenen';
import { useAuth, useTheme } from '@/providers';
import type { PlanWerkbon } from '@/services/planningService';
import {
  meldPlanningWijziging,
  meldToewijzingen,
  syncWerkbonEvents,
  updateWorkOrder,
  zetWerkbonDagen,
  type Werkbon,
} from '@/services/workOrderService';
import type { RoosterBlok } from '@/lib/planningRegels';
import { hhmm, korteDatum, STANDAARD_TIJD, verzetTijd } from '@/lib/werkbonLogica';
import { minutenVanTijd } from '@/lib/datum';
import { spacing, type ThemeColors } from '@/theme';

/**
 * Plannen op de planning, zoals het dashboard (PlanningPage):
 *
 * - `BlokPaneel`: een blok aantikken. Tijd aanpassen doet `verzetTijd` — met
 *   een persoon (medewerkersweergave) alleen díé persoon op die dag, anders de
 *   dag. Daarna de dagen, zo nodig de standaardtijd, een melding "verzet" en de
 *   agenda. Dagen, ploeg, verantwoordelijke en voertuig gaan via het
 *   werkbonformulier (de DetailModal van het dashboard).
 * - `InplannenPaneel`: een niet-ingeplande werkbon inplannen (QuickPlanModal):
 *   dag, tijd, ploeg en verantwoordelijke, meldingen (optioneel ook per mail)
 *   en de agenda.
 *
 * Wijzigen mag met het recht `planning` en de module planning; een ondertekende
 * werkbon zit op slot (database: bb_werkbon_dag_op_slot).
 */

const kern = (w: PlanWerkbon) => ({ id: w.id, nummer: w.nummer, titel: w.titel ?? 'Werkbon', klant: w.customer?.name ?? null });
const ploegVan = (w: PlanWerkbon) => (w.assigned_to_ids?.length ? w.assigned_to_ids : w.assigned_to ? [w.assigned_to] : []);
const huidig = (w: PlanWerkbon) => ({ id: w.id, status: w.status, gestart_op: null }) as Pick<Werkbon, 'id' | 'gestart_op' | 'status'>;

function tijdFout(van: string, tot: string): string | null {
  if (!van || !tot) return 'Kies een begin- en eindtijd.';
  if (minutenVanTijd(tot) <= minutenVanTijd(van)) return 'De eindtijd moet na de begintijd liggen.';
  return null;
}

export function BlokPaneel({
  blok,
  modus,
  naamVan,
  voertuigNaam,
  magPlannen,
  waaromNiet,
  onSluit,
  onGewijzigd,
}: {
  blok: RoosterBlok<PlanWerkbon> | null;
  modus: 'medewerker' | 'voertuig';
  naamVan: (id: string) => string;
  voertuigNaam: (id: string) => string;
  magPlannen: boolean;
  waaromNiet: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  return (
    <Paneel
      open={!!blok}
      titel={blok?.werkbon.titel || blok?.werkbon.nummer || 'Werkbon'}
      subtitel={blok ? [blok.werkbon.nummer, blok.werkbon.customer?.name].filter(Boolean).join(' · ') : undefined}
      onSluit={onSluit}
    >
      {blok ? (
        <BlokInhoud
          key={blok.sleutel}
          blok={blok}
          modus={modus}
          naamVan={naamVan}
          voertuigNaam={voertuigNaam}
          magPlannen={magPlannen}
          waaromNiet={waaromNiet}
          onSluit={onSluit}
          onGewijzigd={onGewijzigd}
        />
      ) : null}
    </Paneel>
  );
}

function BlokInhoud({
  blok,
  modus,
  naamVan,
  voertuigNaam,
  magPlannen,
  waaromNiet,
  onSluit,
  onGewijzigd,
}: {
  blok: RoosterBlok<PlanWerkbon>;
  modus: 'medewerker' | 'voertuig';
  naamVan: (id: string) => string;
  voertuigNaam: (id: string) => string;
  magPlannen: boolean;
  waaromNiet: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const w = blok.werkbon;
  const opSlot = !!w.ondertekend_op;
  const pid = modus === 'medewerker' ? blok.resource : null;
  const [van, setVan] = useState(blok.starttijd);
  const [tot, setTot] = useState(blok.eindtijd ?? '');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const wie =
    modus === 'voertuig'
      ? blok.inzittenden.map(naamVan).join(', ') || 'Niemand ingedeeld'
      : blok.resource
        ? naamVan(blok.resource)
        : 'Niet toegewezen';
  const gewijzigd = van !== blok.starttijd || tot !== (blok.eindtijd ?? '');

  const opslaan = async () => {
    const f = tijdFout(van, tot);
    if (f) return setFout(f);
    setFout(null);
    setBezig(true);
    try {
      const { dagen, standaard } = verzetTijd(w, blok.datum, pid, { starttijd: van, eindtijd: tot });
      const r = await zetWerkbonDagen(w.id, dagen);
      if (r.error) throw new Error(r.error);
      // Eerst de dagen, dan pas de standaardtijd (die verandert alleen als
      // dag 1 verschuift) — zoals het dashboard.
      if (standaard.starttijd !== hhmm(w.starttijd) || standaard.eindtijd !== hhmm(w.eindtijd)) {
        const u = await updateWorkOrder(huidig(w), {
          starttijd: standaard.starttijd || null,
          eindtijd: standaard.eindtijd || null,
        });
        if (u.error) throw new Error(u.error);
      }
      void meldPlanningWijziging({
        companyId: w.company_id,
        userIds: pid ? [pid] : ploegVan(w),
        soort: 'verzet',
        werkbon: kern(w),
        oud: { datum: blok.datum, start: blok.starttijd, eind: blok.eindtijd ?? '' },
        nieuw: { datum: blok.datum, start: van, eind: tot },
        maker: user?.id ?? null,
      });
      void syncWerkbonEvents(w.id, w.company_id);
      onGewijzigd();
      onSluit();
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Tijd aanpassen mislukt.');
    } finally {
      setBezig(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.inhoud} keyboardShouldPersistTaps="handled">
      <View style={styles.feiten}>
        <Feit label="Dag" waarde={`${korteDatum(blok.datum)}${blok.dagenTotaal > 1 ? ` · dag ${blok.dagNr} van ${blok.dagenTotaal}` : ''}`} />
        <Feit label="Tijd" waarde={`${blok.starttijd}${blok.eindtijd ? `–${blok.eindtijd}` : ''}`} />
        <Feit label={modus === 'voertuig' ? 'Inzittenden' : 'Wie'} waarde={wie} />
        {modus === 'medewerker' && blok.voertuigId ? <Feit label="Voertuig" waarde={voertuigNaam(blok.voertuigId)} /> : null}
        {modus === 'voertuig' && blok.resource ? <Feit label="Voertuig" waarde={voertuigNaam(blok.resource)} /> : null}
        {w.locatie ? <Feit label="Locatie" waarde={w.locatie} /> : null}
      </View>

      {opSlot ? (
        <NoticeBanner toon="info" message="Deze werkbon is ondertekend en zit op slot: de planning kan niet meer wijzigen." />
      ) : !magPlannen ? (
        <NoticeBanner toon="info" message={waaromNiet} />
      ) : modus === 'voertuig' ? (
        <Text style={styles.uitleg}>
          Tijden pas je aan in de weergave Medewerkers (per persoon) of via de werkbon.
        </Text>
      ) : (
        <View style={styles.blok}>
          <Text style={styles.kop}>
            {pid ? `Tijd van ${naamVan(pid)} op deze dag` : 'Tijd van deze dag'}
          </Text>
          <View style={styles.rij}>
            <View style={{ flex: 1 }}>
              <TimeField label="Van" value={van || null} onChange={setVan} />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField label="Tot" value={tot || null} onChange={setTot} />
            </View>
          </View>
          {pid ? (
            <Text style={styles.uitleg}>Alleen {naamVan(pid)} verschuift; de rest van de ploeg en de andere dagen blijven staan.</Text>
          ) : null}
          {fout ? <NoticeBanner toon="fout" message={fout} /> : null}
          <Button label="Tijd opslaan" onPress={opslaan} loading={bezig} disabled={!gewijzigd || bezig} />
        </View>
      )}

      <View style={styles.knoppen}>
        {magPlannen && !opSlot ? (
          <Button
            label="Dagen, ploeg en voertuig aanpassen"
            variant="secondary"
            onPress={() => {
              onSluit();
              router.push(`/work-orders/bewerk/${w.id}`);
            }}
          />
        ) : null}
        <Button
          label="Werkbon openen"
          variant="ghost"
          onPress={() => {
            onSluit();
            router.push(`/work-orders/${w.id}`);
          }}
        />
      </View>
    </ScrollView>
  );
}

export function InplannenPaneel({
  werkbon,
  team,
  standaardDatum,
  magPlannen,
  waaromNiet,
  onSluit,
  onGewijzigd,
}: {
  werkbon: PlanWerkbon | null;
  team: PloegLid[];
  standaardDatum: string;
  magPlannen: boolean;
  waaromNiet: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  return (
    <Paneel
      open={!!werkbon}
      titel={werkbon ? `Inplannen: ${werkbon.titel || werkbon.nummer || 'werkbon'}` : 'Inplannen'}
      subtitel={werkbon ? [werkbon.nummer, werkbon.customer?.name].filter(Boolean).join(' · ') : undefined}
      onSluit={onSluit}
    >
      {werkbon ? (
        <InplannenInhoud
          key={werkbon.id}
          werkbon={werkbon}
          team={team}
          standaardDatum={standaardDatum}
          magPlannen={magPlannen}
          waaromNiet={waaromNiet}
          onSluit={onSluit}
          onGewijzigd={onGewijzigd}
        />
      ) : null}
    </Paneel>
  );
}

function InplannenInhoud({
  werkbon: w,
  team,
  standaardDatum,
  magPlannen,
  waaromNiet,
  onSluit,
  onGewijzigd,
}: {
  werkbon: PlanWerkbon;
  team: PloegLid[];
  standaardDatum: string;
  magPlannen: boolean;
  waaromNiet: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const vorigePloeg = ploegVan(w);
  const [datum, setDatum] = useState(w.gepland_op ?? standaardDatum);
  const [van, setVan] = useState(hhmm(w.starttijd) || STANDAARD_TIJD.starttijd);
  const [tot, setTot] = useState(hhmm(w.eindtijd) || STANDAARD_TIJD.eindtijd);
  const [uitvoerders, setUitvoerders] = useState<string[]>(vorigePloeg);
  const [verantwoordelijken, setVerantwoordelijken] = useState<string[]>(
    w.verantwoordelijke_ids?.length ? w.verantwoordelijke_ids : vorigePloeg.slice(0, 1),
  );
  const [stuurMail, setStuurMail] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const opslaan = async () => {
    const f = !datum ? 'Kies een dag.' : tijdFout(van, tot);
    if (f) return setFout(f);
    if (uitvoerders.length && !verantwoordelijken.length) return setFout('Wijs minimaal één verantwoordelijke aan.');
    setFout(null);
    setBezig(true);
    const r = await updateWorkOrder(huidig(w), {
      gepland_op: datum,
      starttijd: van,
      eindtijd: tot,
      assigned_to_ids: uitvoerders,
      verantwoordelijke_ids: verantwoordelijken,
    });
    setBezig(false);
    if (r.error || !r.data) return setFout(r.error ?? 'Inplannen mislukt.');
    const maker = user?.id ?? null;
    void meldToewijzingen({
      werkbonId: w.id,
      titel: w.titel ?? 'Werkbon',
      uitvoerders,
      verantwoordelijken,
      vorigeUitvoerders: vorigePloeg,
      vorigeVerantwoordelijken: w.verantwoordelijke_ids ?? [],
      maker,
      stuurMail,
    });
    const blijvers = uitvoerders.filter((id) => vorigePloeg.includes(id));
    if (blijvers.length && (w.gepland_op !== datum || hhmm(w.starttijd) !== van)) {
      void meldPlanningWijziging({
        companyId: w.company_id,
        userIds: blijvers,
        soort: w.gepland_op ? 'verzet' : 'ingepland',
        werkbon: kern(w),
        oud: { datum: w.gepland_op ?? null, start: hhmm(w.starttijd), eind: hhmm(w.eindtijd) },
        nieuw: { datum, start: van, eind: tot },
        maker,
      });
    }
    void syncWerkbonEvents(w.id, w.company_id);
    onGewijzigd();
    onSluit();
  };

  if (!magPlannen) {
    return (
      <View style={styles.inhoud}>
        <NoticeBanner toon="info" message={waaromNiet} />
        <Button
          label="Werkbon openen"
          variant="secondary"
          onPress={() => {
            onSluit();
            router.push(`/work-orders/${w.id}`);
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.inhoud} keyboardShouldPersistTaps="handled">
      <DateField label="Dag" value={datum} onChange={setDatum} />
      <View style={styles.rij}>
        <View style={{ flex: 1 }}>
          <TimeField label="Van" value={van || null} onChange={setVan} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="Tot" value={tot || null} onChange={setTot} />
        </View>
      </View>
      <View style={styles.blok}>
        <Text style={styles.kop}>Wie gaat er</Text>
        <Text style={styles.uitleg}>Vink aan wie op de klus staat; de ster maakt iemand verantwoordelijk.</Text>
        <PloegKeuze
          team={team}
          uitvoerders={uitvoerders}
          verantwoordelijken={verantwoordelijken}
          onChange={(v) => {
            setUitvoerders(v.uitvoerders);
            setVerantwoordelijken(v.verantwoordelijken);
          }}
          eigenId={user?.id ?? null}
        />
      </View>
      <Schakel
        titel="Ook per e-mail laten weten"
        uitleg="Wie nieuw op de klus komt of verantwoordelijk wordt, krijgt naast de melding in de app een mail."
        waarde={stuurMail}
        onWissel={setStuurMail}
      />
      {fout ? <NoticeBanner toon="fout" message={fout} /> : null}
      <Button label="Inplannen" onPress={opslaan} loading={bezig} disabled={bezig} />
      <Text style={styles.uitleg}>Meerdere dagen, een dagploeg of voertuigen? Dat doe je in de werkbon zelf.</Text>
    </ScrollView>
  );
}

function Feit({ label, waarde }: { label: string; waarde: string }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.feit}>
      <Text style={styles.feitLabel}>{label}</Text>
      <Text style={styles.feitWaarde}>{waarde}</Text>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
    feiten: {
      backgroundColor: t.card,
      borderRadius: t.rMd,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    feit: { flexDirection: 'row', gap: spacing.md, paddingVertical: 6 },
    feitLabel: { width: 92, fontSize: 13, color: t.muted },
    feitWaarde: { flex: 1, fontSize: 14, fontWeight: '600', color: t.ink },
    blok: { gap: spacing.sm },
    kop: { fontSize: 14, fontWeight: '700', color: t.ink },
    rij: { flexDirection: 'row', gap: spacing.md },
    uitleg: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    knoppen: { gap: spacing.sm },
  });
