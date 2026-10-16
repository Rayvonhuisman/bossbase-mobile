import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, DateField, FormField, NoticeBanner, SelectField, TimeField } from '@/components';
import { Paneel } from '@/components/Paneel';
import { PloegKeuze, type PloegLid } from '@/components/PloegKeuze';
import { AdresZoeker } from '@/components/AdresZoeker';
import { LedenKeuze } from '@/components/pipeline/LedenKeuze';
import { MentionInvoer, naarHtml, type Getagd } from '@/components/NotitieLog';
import { DagKaarten, WerkbonKalender } from '@/components/WerkbonDagenVelden';
import { VoertuigenPerDag } from '@/components/planning/VoertuigenPerDag';
import { Schakel } from '@/components/instellingen/Bouwstenen';
import { useAuth, useTheme } from '@/providers';
import {
  koppelWerkbonAanActiviteit,
  listWerkbonnenZonderActiviteit,
  type PlanWerkbon,
  type Voertuig,
} from '@/services/planningService';
import {
  meldPlanningWijziging,
  meldToewijzingen,
  syncWerkbonEvents,
  updateWorkOrder,
  zetWerkbonDagen,
  type Werkbon,
} from '@/services/workOrderService';
import { createActivity, meldActiviteitToewijzing, upsertActiviteitAgendaItem } from '@/services/activityService';
import { listCustomers } from '@/services/customerService';
import type { RoosterBlok } from '@/lib/planningRegels';
import {
  controleerPlanning,
  controleerVoertuigen,
  dagenUitPlanning,
  dagMeldingen,
  geplandeDatums,
  hhmm,
  korteDatum,
  metVoertuigen as voertuigenErbij,
  planningUitWerkbon,
  STANDAARD_TIJD,
  tijdVanDag,
  verzetTijd,
  voertuigPlanningUitWerkbon,
  wisselDag,
  type Planning,
  type VoertuigCtx,
  type WerkbonDag,
} from '@/lib/werkbonLogica';
import { minutenVanTijd, plusMinuten } from '@/lib/datum';
import type { Customer } from '@/types/domain';
import { spacing, type ThemeColors } from '@/theme';

/**
 * Plannen op de planning, zoals het dashboard (PlanningPage):
 *
 * - `BlokPaneel`: een blok aantikken. Tijd aanpassen doet `verzetTijd` — met
 *   een persoon (medewerkersweergave) alleen díé persoon op die dag, anders de
 *   dag. Daarna de dagen, zo nodig de standaardtijd, een melding "verzet" en de
 *   agenda. "Dagen, ploeg en voertuig aanpassen" opent hier het plannen
 *   (de DetailModal van het dashboard), niet meer het werkbonformulier.
 * - `InplannenPaneel`: een niet-ingeplande werkbon inplannen.
 * - Beide plannen met `WerkbonPlannen`: meerdere dagen met elk een eigen tijd,
 *   de dagploeg (wie werkt welke dag), de ploeg met verantwoordelijke, en met
 *   de module voertuigen de voertuigen per dag met wie erin zit. Meldingen
 *   (optioneel ook per mail), `planning_wijzigingen` en de agenda zoals het
 *   werkbonformulier.
 * - `ActiviteitInplannenPaneel`: iets los inplannen zonder werkbon
 *   (PlanActivityModal): een activiteit met agenda-item en melding.
 *
 * Wijzigen mag met het recht `planning` en de module planning; een ondertekende
 * werkbon zit op slot (database: bb_werkbon_dag_op_slot).
 */

const kern = (w: PlanWerkbon) => ({ id: w.id, nummer: w.nummer, titel: w.titel ?? 'Werkbon', klant: w.customer?.name ?? null });
const ploegVan = (w: PlanWerkbon) => (w.assigned_to_ids?.length ? w.assigned_to_ids : w.assigned_to ? [w.assigned_to] : []);
/** De planning levert de dagen als `dagen`, de werkbonregels lezen `werkbon_dagen` (zelfde vorm). */
const metDagen = (w: PlanWerkbon) => ({ ...w, werkbon_dagen: w.dagen as unknown as WerkbonDag[] });
const huidig = (w: PlanWerkbon) => ({ id: w.id, status: w.status, gestart_op: null }) as Pick<Werkbon, 'id' | 'gestart_op' | 'status'>;

function tijdFout(van: string, tot: string): string | null {
  if (!van || !tot) return 'Kies een begin- en eindtijd.';
  if (minutenVanTijd(tot) <= minutenVanTijd(van)) return 'De eindtijd moet na de begintijd liggen.';
  return null;
}

/** Wat het plannen van een werkbon nodig heeft naast de werkbon zelf. */
export type PlanBronnen = {
  team: PloegLid[];
  /** Alle voertuigen (ook inactief); leeg zonder de module. */
  voertuigen: Voertuig[];
  /** Module voertuigen (pakket of module), zoals plan.has('voertuigen'). */
  metVoertuigen: boolean;
};

export function BlokPaneel({
  blok,
  modus,
  naamVan,
  voertuigNaam,
  magPlannen,
  waaromNiet,
  bronnen,
  onSluit,
  onGewijzigd,
}: {
  blok: RoosterBlok<PlanWerkbon> | null;
  modus: 'totaal' | 'medewerker' | 'voertuig';
  naamVan: (id: string) => string;
  voertuigNaam: (id: string) => string;
  magPlannen: boolean;
  waaromNiet: string;
  bronnen: PlanBronnen;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const [plannen, setPlannen] = useState(false);
  const sluit = () => {
    setPlannen(false);
    onSluit();
  };
  return (
    <Paneel
      open={!!blok}
      titel={plannen ? 'Dagen, ploeg en voertuig' : blok?.werkbon.titel || blok?.werkbon.nummer || 'Werkbon'}
      subtitel={
        blok
          ? [plannen ? blok.werkbon.titel : null, blok.werkbon.nummer, blok.werkbon.customer?.name].filter(Boolean).join(' · ')
          : undefined
      }
      onSluit={sluit}
    >
      {blok && plannen ? (
        <WerkbonPlannen
          key={`${blok.sleutel}-plannen`}
          werkbon={blok.werkbon}
          bronnen={bronnen}
          standaardDatum={blok.datum}
          knopLabel="Opslaan"
          onSluit={sluit}
          onGewijzigd={onGewijzigd}
        />
      ) : blok ? (
        <BlokInhoud
          key={blok.sleutel}
          blok={blok}
          modus={modus}
          naamVan={naamVan}
          voertuigNaam={voertuigNaam}
          magPlannen={magPlannen}
          waaromNiet={waaromNiet}
          onPlannen={() => setPlannen(true)}
          onSluit={sluit}
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
  onPlannen,
  onSluit,
  onGewijzigd,
}: {
  blok: RoosterBlok<PlanWerkbon>;
  modus: 'totaal' | 'medewerker' | 'voertuig';
  naamVan: (id: string) => string;
  voertuigNaam: (id: string) => string;
  magPlannen: boolean;
  waaromNiet: string;
  onPlannen: () => void;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const w = blok.werkbon;
  const opSlot = !!w.ondertekend_op;
  // Totaal en Medewerkers tonen een blok per persoon: de tijd geldt dan voor díé persoon.
  const pid = modus !== 'voertuig' ? blok.resource : null;
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
        {modus !== 'voertuig' && blok.voertuigId ? <Feit label="Voertuig" waarde={voertuigNaam(blok.voertuigId)} /> : null}
        {modus === 'voertuig' && blok.resource ? <Feit label="Voertuig" waarde={voertuigNaam(blok.resource)} /> : null}
        {w.locatie ? <Feit label="Locatie" waarde={w.locatie} /> : null}
      </View>

      {opSlot ? (
        <NoticeBanner toon="info" message="Deze werkbon is ondertekend en zit op slot: de planning kan niet meer wijzigen." />
      ) : !magPlannen ? (
        <NoticeBanner toon="info" message={waaromNiet} />
      ) : modus === 'voertuig' ? (
        <Text style={styles.uitleg}>
          De tijd van een voertuig pas je aan onder “Dagen, ploeg en voertuig aanpassen”; de tijd van een persoon in
          Totaal of Medewerkers.
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
          <Button label="Dagen, ploeg en voertuig aanpassen" variant="secondary" onPress={onPlannen} />
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
  bronnen,
  standaardDatum,
  magPlannen,
  waaromNiet,
  onSluit,
  onGewijzigd,
}: {
  werkbon: PlanWerkbon | null;
  bronnen: PlanBronnen;
  standaardDatum: string;
  magPlannen: boolean;
  waaromNiet: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Paneel
      open={!!werkbon}
      titel={werkbon ? `Inplannen: ${werkbon.titel || werkbon.nummer || 'werkbon'}` : 'Inplannen'}
      subtitel={werkbon ? [werkbon.nummer, werkbon.customer?.name].filter(Boolean).join(' · ') : undefined}
      onSluit={onSluit}
    >
      {werkbon && !magPlannen ? (
        <View style={styles.inhoud}>
          <NoticeBanner toon="info" message={waaromNiet} />
          <Button
            label="Werkbon openen"
            variant="secondary"
            onPress={() => {
              onSluit();
              router.push(`/work-orders/${werkbon.id}`);
            }}
          />
        </View>
      ) : werkbon ? (
        <WerkbonPlannen
          key={werkbon.id}
          werkbon={werkbon}
          bronnen={bronnen}
          standaardDatum={standaardDatum}
          knopLabel="Inplannen"
          onSluit={onSluit}
          onGewijzigd={onGewijzigd}
        />
      ) : null}
    </Paneel>
  );
}

/**
 * De planning van een werkbon in de vorm van het formulier. Een werkbon zonder
 * dagen begint op `standaardDatum`; een dag zonder tijd krijgt de tijd van de
 * werkbon of 08:00–16:30.
 */
function beginPlanning(w: PlanWerkbon, standaardDatum: string): Planning {
  const wd = metDagen(w);
  const p: Planning = { ...planningUitWerkbon(wd), ...voertuigPlanningUitWerkbon(wd) };
  if (!p.dagen.length) p.dagen = [standaardDatum];
  const terug = {
    starttijd: hhmm(w.starttijd) || STANDAARD_TIJD.starttijd,
    eindtijd: hhmm(w.eindtijd) || STANDAARD_TIJD.eindtijd,
  };
  p.tijden = Object.fromEntries(
    p.dagen.map((d) => {
      const t = p.tijden[d];
      return [d, { starttijd: hhmm(t?.starttijd) || terug.starttijd, eindtijd: hhmm(t?.eindtijd) || terug.eindtijd }];
    }),
  );
  return p;
}

function WerkbonPlannen({
  werkbon: w,
  bronnen,
  standaardDatum,
  knopLabel,
  onSluit,
  onGewijzigd,
}: {
  werkbon: PlanWerkbon;
  bronnen: PlanBronnen;
  standaardDatum: string;
  knopLabel: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const { user } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const vorigePloeg = ploegVan(w);
  const [planning, setPlanningState] = useState<Planning>(() => beginPlanning(w, standaardDatum));
  const [uitvoerders, setUitvoerders] = useState<string[]>(vorigePloeg);
  const [verantwoordelijken, setVerantwoordelijken] = useState<string[]>(
    w.verantwoordelijke_ids?.length ? w.verantwoordelijke_ids : vorigePloeg.slice(0, 1),
  );
  const [voertuigIds, setVoertuigIds] = useState<string[]>(w.voertuig_ids ?? []);
  const [stuurMail, setStuurMail] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const origineelKoppeling = useMemo(() => voertuigPlanningUitWerkbon(metDagen(w)).koppeling, [w]);

  const setPlanning = (f: (p: Planning) => Planning) => setPlanningState(f);
  const naam = (id: string) => bronnen.team.find((m) => m.id === id)?.full_name ?? 'Medewerker';
  const datums = geplandeDatums(planning);
  const standaard = datums.length ? tijdVanDag(planning, datums[0]!) : { starttijd: '', eindtijd: '' };
  const metVoertuigen = bronnen.metVoertuigen;
  const kiesbareVoertuigen = bronnen.voertuigen.filter((v) => v.actief || voertuigIds.includes(v.id));
  const gekozenVoertuigen = voertuigIds
    .map((id) => bronnen.voertuigen.find((v) => v.id === id))
    .filter((v): v is Voertuig => !!v);
  const ctx: VoertuigCtx = { p: planning, standaard, ploegIds: uitvoerders, voertuigen: gekozenVoertuigen, naamVan: naam };

  const opslaan = async () => {
    setFout(null);
    if (uitvoerders.length && !verantwoordelijken.length) return setFout('Wijs minimaal één verantwoordelijke aan.');
    const planFout = controleerPlanning(planning, standaard);
    if (planFout) return setFout(planFout);
    if (metVoertuigen) {
      const vFout = controleerVoertuigen(ctx, origineelKoppeling);
      if (vFout) return setFout(vFout);
    }
    const basisDagen = dagenUitPlanning(planning, uitvoerders, standaard);
    const dagen = metVoertuigen ? voertuigenErbij(basisDagen, ctx) : basisDagen;
    setBezig(true);
    const r = await updateWorkOrder(huidig(w), {
      gepland_op: dagen[0]?.datum ?? null,
      starttijd: standaard.starttijd || null,
      eindtijd: standaard.eindtijd || null,
      assigned_to_ids: uitvoerders,
      verantwoordelijke_ids: verantwoordelijken,
      ...(metVoertuigen ? { voertuig_ids: gekozenVoertuigen.map((v) => v.id) } : {}),
    });
    if (r.error || !r.data) {
      setBezig(false);
      return setFout(r.error ?? 'Opslaan mislukt.');
    }
    const d = await zetWerkbonDagen(w.id, dagen);
    setBezig(false);
    if (d.error) {
      // De werkbon zelf staat er al; de dagen niet. Melden en open laten.
      onGewijzigd();
      return setFout(`Opgeslagen, maar de dagen niet: ${d.error}`);
    }

    // Meldingen en agenda: zoals het werkbonformulier en de DetailModal.
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
    const oud = { datum: w.gepland_op ?? null, start: hhmm(w.starttijd), eind: hhmm(w.eindtijd) };
    const nieuw = { datum: dagen[0]?.datum ?? null, start: standaard.starttijd, eind: standaard.eindtijd };
    const verschoven = oud.datum !== nieuw.datum || oud.start !== nieuw.start || oud.eind !== nieuw.eind;
    const blijvers = uitvoerders.filter((id) => vorigePloeg.includes(id));
    if (verschoven && blijvers.length && (oud.datum || nieuw.datum)) {
      void meldPlanningWijziging({
        companyId: w.company_id,
        userIds: blijvers,
        soort: oud.datum ? 'verzet' : 'ingepland',
        werkbon: kern(w),
        oud,
        nieuw,
        maker,
      });
    }
    const eraf = vorigePloeg.filter((id) => !uitvoerders.includes(id));
    if (eraf.length) {
      void meldPlanningWijziging({ companyId: w.company_id, userIds: eraf, soort: 'afgehaald', werkbon: kern(w), oud, maker });
    }
    for (const m of dagMeldingen({
      oudeDagen: metDagen(w).werkbon_dagen ?? [],
      nieuweDagen: dagen,
      oudePloeg: vorigePloeg,
      nieuwePloeg: uitvoerders,
      blijvers,
    })) {
      void meldPlanningWijziging({
        companyId: w.company_id,
        userIds: [m.uid],
        soort: m.soort,
        werkbon: kern(w),
        ...(m.soort === 'ingepland' ? { nieuw: m.dag } : { oud: m.dag }),
        maker,
      });
    }
    void syncWerkbonEvents(w.id, w.company_id);
    onGewijzigd();
    onSluit();
  };

  return (
    <ScrollView contentContainerStyle={styles.inhoud} keyboardShouldPersistTaps="handled">
      <View style={styles.blok}>
        <Text style={styles.kop}>Dagen en tijden</Text>
        <Text style={styles.uitleg}>Tik de dagen van de klus aan. Elke dag heeft een eigen begin- en eindtijd.</Text>
        <WerkbonKalender
          gekozen={datums}
          onTik={(iso) => setPlanning((p) => wisselDag(p, iso, STANDAARD_TIJD))}
          uit={bezig}
        />
        <DagKaarten
          planning={planning}
          onChange={setPlanning}
          uitvoerders={uitvoerders}
          naam={naam}
          bewerkbaar={!bezig}
          leegTekst="Geen dagen gekozen: de werkbon komt onder Niet ingepland."
        />
      </View>
      <View style={styles.blok}>
        <Text style={styles.kop}>Wie gaat er</Text>
        <Text style={styles.uitleg}>
          Vink aan wie op de klus staat; de ster maakt iemand verantwoordelijk. Met meer mensen tik je per dag aan wie er
          die dag werkt.
        </Text>
        <PloegKeuze
          team={bronnen.team}
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
      {metVoertuigen ? (
        <VoertuigenPerDag
          planning={planning}
          onChange={(p) => setPlanningState(p)}
          alle={kiesbareVoertuigen}
          ids={voertuigIds}
          onIds={setVoertuigIds}
          ploeg={uitvoerders.map((id) => ({ id, naam: naam(id) }))}
          standaard={standaard}
          werkbonId={w.id}
          disabled={bezig}
        />
      ) : null}
      {fout ? <NoticeBanner toon="fout" message={fout} /> : null}
      <Button label={knopLabel} onPress={opslaan} loading={bezig} disabled={bezig} />
    </ScrollView>
  );
}

// ── Activiteit inplannen (PlanActivityModal van het dashboard) ───────────────

/** De soorten zoals het planningvenster van het dashboard ze noemt. */
const PLAN_SOORTEN: [string, string][] = [
  ['call', 'Bellen'],
  ['visit', 'Bezoek'],
  ['task', 'Vergadering / Klus'],
  ['follow', 'Overig'],
];

const adresVan = (c: Customer | undefined) =>
  c ? [c.address, [c.postcode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

export function ActiviteitInplannenPaneel({
  open,
  team,
  standaardDatum,
  onSluit,
  onGewijzigd,
}: {
  open: boolean;
  team: PloegLid[];
  standaardDatum: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  return (
    <Paneel open={open} titel="Activiteit inplannen" subtitel="Los van een werkbon" onSluit={onSluit}>
      {open ? (
        <ActiviteitInplannenInhoud team={team} standaardDatum={standaardDatum} onSluit={onSluit} onGewijzigd={onGewijzigd} />
      ) : null}
    </Paneel>
  );
}

function ActiviteitInplannenInhoud({
  team,
  standaardDatum,
  onSluit,
  onGewijzigd,
}: {
  team: PloegLid[];
  standaardDatum: string;
  onSluit: () => void;
  onGewijzigd: () => void;
}) {
  const { user } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [titel, setTitel] = useState('');
  const [soort, setSoort] = useState('task');
  const [klantId, setKlantId] = useState<string | null>(null);
  const [datum, setDatum] = useState(standaardDatum);
  const [van, setVan] = useState('09:00');
  const [tot, setTot] = useState('09:15');
  const [totHandmatig, setTotHandmatig] = useState(false);
  const [wie, setWie] = useState<string[]>([]);
  const [stuurMail, setStuurMail] = useState(true);
  const [locatie, setLocatie] = useState('');
  const [notitie, setNotitie] = useState('');
  const [getagd, setGetagd] = useState<Getagd[]>([]);
  const [werkbonId, setWerkbonId] = useState<string | null>(null);
  const [klanten, setKlanten] = useState<Customer[]>([]);
  const [werkbonnen, setWerkbonnen] = useState<{ id: string; nummer: string | null; titel: string | null }[]>([]);
  const [voorstel, setVoorstel] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [waarschuwing, setWaarschuwing] = useState<string | null>(null);

  useEffect(() => {
    let actief = true;
    void listCustomers().then((r) => {
      if (actief) setKlanten(r.data);
    });
    return () => {
      actief = false;
    };
  }, []);

  useEffect(() => {
    if (!klantId) return undefined;
    let actief = true;
    void listWerkbonnenZonderActiviteit(klantId).then((r) => {
      if (actief) setWerkbonnen(r.data);
    });
    return () => {
      actief = false;
    };
  }, [klantId]);

  // Klant gekozen: het adres als locatie voorstellen (useKlantAdres). Leeg = meteen
  // invullen; staat er al iets anders, dan eerst vragen.
  const kiesKlant = (id: string | null) => {
    setKlantId(id);
    setWerkbonId(null);
    setWerkbonnen([]);
    const adres = adresVan(klanten.find((c) => c.id === id));
    if (!adres || adres === locatie) return setVoorstel(null);
    if (!locatie.trim()) {
      setLocatie(adres);
      setVoorstel(null);
    } else {
      setVoorstel(adres);
    }
  };

  const opslaan = async () => {
    setFout(null);
    if (!titel.trim()) return setFout('Titel is verplicht.');
    if (!datum) return setFout('Datum is verplicht.');
    if (!van) return setFout('Starttijd is verplicht.');
    setBezig(true);
    const notes = notitie.trim() ? naarHtml(notitie, getagd).html : null;
    const r = await createActivity({
      title: titel.trim(),
      type: soort,
      customer_id: klantId,
      date: datum,
      time: van,
      end_time: tot || null,
      assigned_to_ids: wie,
      location: locatie || null,
      notes,
    });
    if (!r.ok || !r.data) {
      setBezig(false);
      return setFout(r.ok ? 'Opslaan mislukt.' : r.melding);
    }
    const act = r.data;
    const waarschuwingen: string[] = [];
    // Eén agenda-item per activiteit; zonder eindtijd een kwartier, zoals het dashboard.
    const agenda = await upsertActiviteitAgendaItem({
      activiteitId: act.id,
      titel: titel.trim(),
      datum,
      tijd: van,
      eind: tot || plusMinuten(van, 15),
      customerId: klantId,
      locatie: locatie || null,
      omschrijving: notes,
    });
    if (agenda.error) waarschuwingen.push('De activiteit is ingepland, maar het agenda-item niet.');
    void meldActiviteitToewijzing({
      activiteitId: act.id,
      titel: titel.trim(),
      datum,
      toegewezen: wie,
      maker: user?.id ?? null,
      stuurMail,
      link: 'planning',
      tijd: van,
    });
    if (werkbonId) {
      const k = await koppelWerkbonAanActiviteit(werkbonId, act.id);
      if (k.error) {
        waarschuwingen.push(
          'De activiteit is ingepland, maar kon niet aan de werkbon worden gekoppeld. Koppel hem opnieuw vanuit de werkbon.',
        );
      }
    }
    setBezig(false);
    onGewijzigd();
    if (waarschuwingen.length) return setWaarschuwing(waarschuwingen.join(' '));
    onSluit();
  };

  if (waarschuwing) {
    return (
      <View style={styles.inhoud}>
        <NoticeBanner toon="waarschuwing" message={waarschuwing} />
        <Button label="Sluiten" variant="secondary" onPress={onSluit} />
      </View>
    );
  }

  const leden = team.map((m) => ({ id: m.id, full_name: m.full_name ?? 'Medewerker' }));

  return (
    <ScrollView contentContainerStyle={styles.inhoud} keyboardShouldPersistTaps="handled">
      <FormField
        label="Titel *"
        value={titel}
        onChangeText={setTitel}
        placeholder="Bijv. Klantbezoek of vergadering"
        autoFocus
      />
      <View style={styles.blok}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.chipRij}>
          {PLAN_SOORTEN.map(([id, label]) => {
            const aan = soort === id;
            return (
              <Pressable
                key={id}
                onPress={() => setSoort(id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: aan }}
                aria-checked={aan}
                style={[styles.chip, aan && styles.chipAan]}
              >
                <Text style={[styles.chipTekst, aan && { color: t.green700 }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <SelectField
        label="Klant"
        value={klantId}
        onChange={kiesKlant}
        searchable
        allowEmpty
        emptyLabel="— Geen klant —"
        placeholder="— Geen klant —"
        options={klanten.map((c) => ({
          id: c.id,
          label: c.name ?? '—',
          sub: [c.city, c.phone].filter(Boolean).join(' · ') || undefined,
        }))}
      />
      <DateField label="Datum *" value={datum} onChange={setDatum} />
      <View style={styles.rij}>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Starttijd *"
            value={van || null}
            onChange={(v) => {
              setVan(v);
              if (!totHandmatig) setTot(plusMinuten(v, 15));
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Eindtijd (optioneel)"
            value={tot || null}
            onChange={(v) => {
              setTotHandmatig(true);
              setTot(v);
            }}
          />
        </View>
      </View>
      <LedenKeuze label="Medewerkers (meerdere mogelijk)" leden={leden} waarde={wie} onChange={setWie} />
      {!wie.length ? <Text style={styles.uitleg}>Zonder keuze komt de activiteit op jouw naam.</Text> : null}
      <Schakel
        titel="Ook per e-mail laten weten"
        uitleg="Wie je toewijst, krijgt naast de melding in de app een mail."
        waarde={stuurMail}
        onWissel={setStuurMail}
      />
      <AdresZoeker
        label="Locatie"
        volledigAdres
        value={locatie}
        onChangeText={setLocatie}
        placeholder="Zoek straat + huisnummer + plaats"
        hint="Kies een adres uit de lijst, of typ zelf een omschrijving."
      />
      {voorstel ? (
        <View style={styles.voorstel}>
          <Text style={styles.uitleg}>Adres van de klant: {voorstel}</Text>
          <View style={styles.rij}>
            <Button
              label="Overnemen"
              variant="secondary"
              onPress={() => {
                setLocatie(voorstel);
                setVoorstel(null);
              }}
            />
            <Button label="Huidige houden" variant="ghost" onPress={() => setVoorstel(null)} />
          </View>
        </View>
      ) : null}
      <MentionInvoer
        label="Notities"
        value={notitie}
        onChangeText={setNotitie}
        gekozen={getagd}
        onGekozen={setGetagd}
        leden={leden}
        placeholder="Instructies, agendapunten… Typ @ om iemand te taggen"
      />
      <View style={[styles.blok, styles.scheiding]}>
        <Text style={styles.label}>Werkbon koppelen (optioneel)</Text>
        {werkbonnen.length ? (
          <SelectField
            label="Werkbon"
            value={werkbonId}
            onChange={setWerkbonId}
            allowEmpty
            emptyLabel="— Geen werkbon —"
            placeholder="— Geen werkbon —"
            options={werkbonnen.map((w) => ({ id: w.id, label: w.titel || w.nummer || 'Werkbon', sub: w.nummer ?? undefined }))}
          />
        ) : (
          <Text style={styles.uitleg}>
            {klantId ? 'Geen openstaande werkbonnen voor deze klant.' : 'Selecteer eerst een klant om werkbonnen te tonen.'}
          </Text>
        )}
      </View>
      {fout ? <NoticeBanner toon="fout" message={fout} /> : null}
      <Button label="Inplannen" onPress={opslaan} loading={bezig} disabled={bezig} />
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
    label: { fontSize: 12, fontWeight: '500', color: t.ink2 },
    rij: { flexDirection: 'row', gap: spacing.md },
    uitleg: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    knoppen: { gap: spacing.sm },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    voorstel: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: t.rMd,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    scheiding: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, paddingTop: spacing.md },
  });
