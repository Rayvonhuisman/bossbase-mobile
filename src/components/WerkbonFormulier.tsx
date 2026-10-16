import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdresZoeker } from '@/components/AdresZoeker';
import { FormField } from '@/components/FormField';
import { FormFooter } from '@/components/FormFooter';
import { TimeField } from '@/components/DateField';
import { SelectField } from '@/components/SelectField';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Dialog } from '@/lib/dialog';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  createWorkOrder,
  listAlleVoertuigen,
  listCompanyProfiles,
  listProjectKeuzes,
  magPlanningWijzigen,
  meldPlanningWijziging,
  meldToewijzingen,
  syncWerkbonEvents,
  updateWorkOrder,
  zetWerkbonDagen,
  addWorkOrderNote,
  type VoertuigKeuze,
  type Werkbon,
  type WerkbonRechten,
} from '@/services/workOrderService';
import { listCustomers } from '@/services/customerService';
import { alsHtml, alsTekst } from '@/lib/notitieTekst';
import {
  controleerPlanning,
  dagenUitPlanning,
  geplandeDatums,
  hhmm,
  legePlanning,
  planningUitWerkbon,
  tijdVanDag,
  verplaatsNaar,
  dagMeldingen,
  wisselDag,
  WERKBON_STATUS_STIJL,
  WERKBON_STATUSSEN,
  normaliseerStatus,
  STANDAARD_TIJD,
  type Planning,
  type WerkbonStatusKey,
} from '@/lib/werkbonLogica';
import { ds, spacing, type ThemeColors } from '@/theme';
import { leesbreedte } from '@/lib/schermklasseRegels';
import type { Customer } from '@/types/domain';
import { PloegKeuze } from './PloegKeuze';
import { DagKaarten, WerkbonKalender } from './WerkbonDagenVelden';
import { Schakel } from './instellingen/Bouwstenen';

type Collega = { id: string; full_name: string | null; role: string | null };
type Project = { id: string; name: string | null; customer_id: string | null };

/**
 * Het werkbonformulier van het dashboard (`WerkbonModal`), voor nieuw én
 * bewerken. Velden in dezelfde volgorde: (status), titel, klant, project,
 * locatie, dagen + tijden (+ dagploeg), medewerkers + verantwoordelijke,
 * voertuigen, omschrijving, interne notitie.
 *
 * Opslaan volgt `WerkbonModal.submit`: werkbon opslaan → (planningsmodule)
 * RPC `bb_werkbon_dagen_zetten` → meldingen via `create-notification` →
 * agenda-items bijwerken. Taken en materialen komen daarna in het detail.
 */
export function WerkbonFormulier({
  werkbon,
  klantVooraf,
  projectVooraf,
  onKlaar,
}: {
  /** Meegegeven = bewerken. */
  werkbon?: Werkbon | null;
  /** Nieuw vanaf een klantkaart (`?customerId=`): klant en adres vooraf invullen. */
  klantVooraf?: string | null;
  /** Nieuw vanaf de projectkaart (`?projectId=`): dit project vooraf gekozen. */
  projectVooraf?: string | null;
  onKlaar: (id: string) => void;
}) {
  const bewerken = !!werkbon;
  const { user, companyId, role } = useAuth();
  const { can, hasFeature, readonly } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const rechten: WerkbonRechten = useMemo(
    () => ({ userId: user?.id ?? null, role, can, gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'), readonly }),
    [user?.id, role, can, hasFeature, readonly],
  );
  const meerdaags = hasFeature('planning');
  const metVoertuigen = meerdaags && hasFeature('voertuigen');
  // Bij bewerken blokkeert de database datum/tijd zonder planningrecht en na
  // ondertekening; nieuw mag altijd (de bon bestaat nog niet).
  const planningBewerkbaar = !bewerken || (magPlanningWijzigen(rechten) && !werkbon?.ondertekend_op);

  const [laden, setLaden] = useState(true);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [klanten, setKlanten] = useState<Customer[]>([]);
  const [team, setTeam] = useState<Collega[]>([]);
  const [projecten, setProjecten] = useState<Project[]>([]);
  const [voertuigen, setVoertuigen] = useState<VoertuigKeuze[] | null>(null);

  const [status, setStatus] = useState<WerkbonStatusKey>(normaliseerStatus(werkbon?.status));
  const [titel, setTitel] = useState(werkbon?.titel ?? '');
  const [klantId, setKlantId] = useState<string | null>(werkbon ? (werkbon.customer_id ?? null) : (klantVooraf ?? null));
  const [projectId, setProjectId] = useState<string | null>(
    werkbon ? (werkbon.project_id ?? null) : (projectVooraf ?? null),
  );
  const [locatie, setLocatie] = useState(werkbon?.locatie ?? '');
  const [planning, setPlanning] = useState<Planning>(() =>
    werkbon ? planningUitWerkbon(werkbon) : legePlanning(''),
  );
  // Zonder planningsmodule: één tijd voor de klus.
  const [enkelStart, setEnkelStart] = useState(hhmm(werkbon?.starttijd) || '');
  const [enkelEind, setEnkelEind] = useState(hhmm(werkbon?.eindtijd) || '');
  // Zoals WerkbonPageV2: een nieuwe bon staat op naam van de maker (uitvoerder
  // én verantwoordelijke); een oude bon zonder verantwoordelijken valt terug op
  // de oude enkele toewijzing.
  const [uitvoerders, setUitvoerders] = useState<string[]>(
    werkbon?.assigned_to_ids?.length
      ? werkbon.assigned_to_ids
      : werkbon?.assigned_to
        ? [werkbon.assigned_to]
        : !werkbon && user?.id
          ? [user.id]
          : [],
  );
  const [verantwoordelijken, setVerantwoordelijken] = useState<string[]>(
    werkbon?.verantwoordelijke_ids ??
      (werkbon?.assigned_to ? [werkbon.assigned_to] : !werkbon && user?.id ? [user.id] : []),
  );
  // Zoals "Stuur e-mail" in het dashboard: standaard aan.
  const [stuurMail, setStuurMail] = useState(true);
  const [voertuigIds, setVoertuigIds] = useState<string[]>(werkbon?.voertuig_ids ?? []);
  const beginOmschrijving = alsTekst(werkbon?.omschrijving);
  const [omschrijving, setOmschrijving] = useState(beginOmschrijving);
  const beginNotes = alsTekst(werkbon?.notes);
  const [notitie, setNotitie] = useState(bewerken ? beginNotes : '');

  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const laadBronnen = useCallback(async () => {
    setLaden(true);
    const [k, tm, pr, vt] = await Promise.all([
      listCustomers(),
      listCompanyProfiles(),
      listProjectKeuzes(),
      metVoertuigen ? listAlleVoertuigen() : Promise.resolve(null),
    ]);
    setKlanten(k.data);
    // Vanaf een klantkaart: het adres van die klant als locatie voorstellen.
    if (!werkbon && klantVooraf) {
      const kv = k.data.find((c) => c.id === klantVooraf);
      if (kv) {
        const adres = [kv.address, [kv.postcode, kv.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        if (adres) setLocatie((huidig) => huidig || adres);
      }
    }
    setTeam(tm.data);
    setProjecten(pr.data);
    // Alleen een geladen lijst mag de voertuigen meesturen; anders zou opslaan
    // ze wissen.
    setVoertuigen(vt && !vt.error ? vt.data : null);
    const fouten = [k.error, tm.error, pr.error].filter(Boolean);
    setLaadFout(fouten.length ? 'Niet alle keuzelijsten konden worden geladen.' : null);
    setLaden(false);
  }, [metVoertuigen, werkbon, klantVooraf]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadBronnen();
  }, [laadBronnen]);

  // ── Klant → locatie voorstellen ─────────────────────────────────────────
  const kiesKlant = (id: string | null) => {
    setKlantId(id);
    if (projectId && id) {
      const p = projecten.find((x) => x.id === projectId);
      if (p?.customer_id && p.customer_id !== id) setProjectId(null);
    }
    const k = klanten.find((c) => c.id === id);
    if (!k) return;
    const adres = [k.address, [k.postcode, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (!adres || adres === locatie) return;
    if (!locatie.trim() && !bewerken) {
      setLocatie(adres);
      return;
    }
    Dialog.alert(`Adres van ${k.name ?? 'de klant'} overnemen?`, adres, [
      { text: 'Huidige houden', style: 'cancel' },
      { text: 'Overnemen', onPress: () => setLocatie(adres) },
    ]);
  };

  const kiesProject = (id: string | null) => {
    setProjectId(id);
    const p = projecten.find((x) => x.id === id);
    if (p?.customer_id && !klantId) kiesKlant(p.customer_id);
  };

  // ── Ploeg ─────────────────────────────────────────────────────────────────
  const naam = (id: string) => team.find((c) => c.id === id)?.full_name ?? 'Onbekend';

  // ── Planning ──────────────────────────────────────────────────────────────
  const datums = geplandeDatums(planning);
  const standaard = meerdaags
    ? datums.length
      ? tijdVanDag(planning, datums[0]!)
      : { starttijd: '', eindtijd: '' }
    : { starttijd: enkelStart, eindtijd: enkelEind };

  const tikDag = (iso: string) => {
    if (!planningBewerkbaar) return;
    if (meerdaags) setPlanning((p) => wisselDag(p, iso, STANDAARD_TIJD));
    else setPlanning((p) => (geplandeDatums(p)[0] === iso && geplandeDatums(p).length === 1 ? legePlanning('') : verplaatsNaar(p, iso)));
  };

  // ── Opslaan ───────────────────────────────────────────────────────────────
  const opslaanBon = async () => {
    setFout(null);
    if (!titel.trim()) return setFout('Titel is verplicht');
    if (uitvoerders.length && !verantwoordelijken.length) return setFout('Wijs minimaal één verantwoordelijke aan.');
    const planFout = controleerPlanning(planning, standaard);
    if (planningBewerkbaar && planFout) return setFout(planFout);
    if (!companyId) return setFout('Je sessie is nog niet geladen. Probeer het zo opnieuw.');

    const dagen = meerdaags ? dagenUitPlanning(planning, uitvoerders, standaard) : [];
    const planVelden = planningBewerkbaar
      ? {
          gepland_op: meerdaags ? (dagen[0]?.datum ?? null) : (datums[0] ?? null),
          starttijd: standaard.starttijd || null,
          eindtijd: standaard.eindtijd || null,
        }
      : {};
    const omschrijvingVeld =
      omschrijving.trim() === beginOmschrijving.trim()
        ? undefined
        : omschrijving.trim()
          ? alsHtml(omschrijving)
          : null;

    setOpslaan(true);
    const basis = {
      titel,
      customer_id: klantId,
      project_id: projectId,
      locatie,
      assigned_to_ids: uitvoerders,
      verantwoordelijke_ids: verantwoordelijken,
      ...(voertuigen && metVoertuigen ? { voertuig_ids: voertuigIds } : {}),
      ...planVelden,
    };

    let opgeslagen: Werkbon | null = null;
    if (bewerken && werkbon) {
      const res = await updateWorkOrder(werkbon, {
        ...basis,
        ...(omschrijvingVeld !== undefined ? { omschrijving: omschrijvingVeld } : {}),
        ...(beginNotes && notitie.trim() !== beginNotes.trim() ? { notes: notitie.trim() ? alsHtml(notitie) : null } : {}),
        status,
      });
      if (res.error || !res.data) {
        setOpslaan(false);
        return setFout(res.error ?? 'Opslaan mislukt');
      }
      opgeslagen = res.data;
    } else {
      const res = await createWorkOrder({
        company_id: companyId,
        ...basis,
        omschrijving: omschrijvingVeld ?? null,
      });
      if (res.error || !res.data) {
        setOpslaan(false);
        return setFout(res.error ?? 'De werkbon kon niet worden aangemaakt.');
      }
      opgeslagen = res.data;
      // De notitie uit het aanmaakformulier wordt de eerste interne logregel.
      if (notitie.trim() && user?.id) {
        const n = await addWorkOrderNote({
          werkbon_id: opgeslagen.id,
          company_id: opgeslagen.company_id,
          created_by: user.id,
          note: alsHtml(notitie),
          voor_klant: false,
        });
        if (n.error) Dialog.alert('Werkbon opgeslagen', `Maar de notitie niet: ${n.error}`);
      }
    }

    // Dagen pas ná het opslaan (een nieuwe bon heeft dan pas een id). Mislukt
    // dit, dan staat de bon er al: melden en gewoon doorgaan, geen dubbele.
    if (meerdaags && planningBewerkbaar) {
      const d = await zetWerkbonDagen(opgeslagen.id, dagen);
      if (d.error) Dialog.alert('Werkbon opgeslagen', `Maar de dagen niet: ${d.error}`);
      else if (d.data) opgeslagen = d.data;
    }

    // Meldingen en agenda: fire-and-forget, net als het dashboard.
    const maker = user?.id ?? null;
    const vorigeU = werkbon
      ? werkbon.assigned_to_ids?.length
        ? werkbon.assigned_to_ids
        : werkbon.assigned_to
          ? [werkbon.assigned_to]
          : []
      : [];
    void meldToewijzingen({
      werkbonId: opgeslagen.id,
      titel: titel.trim(),
      uitvoerders,
      verantwoordelijken,
      vorigeUitvoerders: vorigeU,
      vorigeVerantwoordelijken: werkbon?.verantwoordelijke_ids ?? [],
      maker,
      stuurMail,
    });
    if (werkbon) {
      const oud = { datum: werkbon.gepland_op ?? null, start: hhmm(werkbon.starttijd), eind: hhmm(werkbon.eindtijd) };
      const nieuw = { datum: opgeslagen.gepland_op ?? null, start: hhmm(opgeslagen.starttijd), eind: hhmm(opgeslagen.eindtijd) };
      const verschoven = oud.datum !== nieuw.datum || oud.start !== nieuw.start || oud.eind !== nieuw.eind;
      const kern = { id: werkbon.id, nummer: werkbon.nummer ?? null, titel: titel.trim(), klant: werkbon.customer?.name ?? null };
      const blijvers = uitvoerders.filter((id) => vorigeU.includes(id));
      if (verschoven && blijvers.length && (oud.datum || nieuw.datum)) {
        void meldPlanningWijziging({
          companyId: werkbon.company_id, userIds: blijvers, soort: oud.datum ? 'verzet' : 'ingepland',
          werkbon: kern, oud, nieuw, maker,
        });
      }
      const eraf = vorigeU.filter((id) => !uitvoerders.includes(id));
      if (eraf.length) {
        void meldPlanningWijziging({ companyId: werkbon.company_id, userIds: eraf, soort: 'afgehaald', werkbon: kern, oud, maker });
      }
      // Per dag: wie op de bon blijft, kan een dag erbij krijgen of kwijtraken
      // (meerdaagse klus) — zoals de planning in het dashboard.
      if (meerdaags && planningBewerkbaar) {
        for (const m of dagMeldingen({
          oudeDagen: werkbon.werkbon_dagen ?? [],
          nieuweDagen: dagen,
          oudePloeg: vorigeU,
          nieuwePloeg: uitvoerders,
          blijvers,
        })) {
          void meldPlanningWijziging({
            companyId: werkbon.company_id,
            userIds: [m.uid],
            soort: m.soort,
            werkbon: kern,
            ...(m.soort === 'ingepland' ? { nieuw: m.dag } : { oud: m.dag }),
            maker,
          });
        }
      }
    }
    void syncWerkbonEvents(opgeslagen.id, opgeslagen.company_id);

    setOpslaan(false);
    onKlaar(opgeslagen.id);
  };

  if (laden) return <LoadingScreen label="Gegevens laden..." />;

  const projectOpties = projecten
    .filter((p) => !p.customer_id || !klantId || p.customer_id === klantId)
    .map((p) => ({ id: p.id, label: p.name ?? 'Project' }));
  const zichtbareVoertuigen = (voertuigen ?? []).filter((v) => v.actief || voertuigIds.includes(v.id));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {laadFout ? <Text style={styles.warn}>{laadFout}</Text> : null}

        {bewerken ? (
          <View style={styles.blok}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRij}>
              {WERKBON_STATUSSEN.map((s) => {
                const st = WERKBON_STATUS_STIJL[s];
                const aan = status === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: aan }}
                    aria-checked={aan}
                    style={[styles.chip, aan && { backgroundColor: st.bg, borderColor: st.kleur }]}
                  >
                    <View style={[styles.dot, { backgroundColor: st.dot }]} />
                    <Text style={[styles.chipTekst, aan && { color: st.kleur }]}>{st.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <FormField
          label="Titel *"
          value={titel}
          onChangeText={setTitel}
          placeholder="Bv. Lekkage badkamer leiding repareren"
        />

        <SelectField
          label="Klant"
          value={klantId}
          onChange={kiesKlant}
          allowEmpty
          emptyLabel="— Geen klant —"
          placeholder="— Geen klant —"
          options={klanten.map((c) => ({
            id: c.id,
            label: c.name ?? '—',
            sub: [c.city, c.phone].filter(Boolean).join(' · ') || undefined,
          }))}
        />

        <SelectField
          label="Project (optioneel)"
          value={projectId}
          onChange={kiesProject}
          allowEmpty
          emptyLabel="— Geen project —"
          placeholder="— Geen project —"
          options={projectOpties}
        />

        <AdresZoeker
          label="Locatie"
          volledigAdres
          value={locatie}
          onChangeText={setLocatie}
          placeholder="Zoek straat + huisnummer + plaats"
          hint="Kies een adres uit de lijst, of typ zelf een omschrijving (bijv. bouwkavel)."
        />

        {/* Dagen en tijden */}
        <View style={styles.blok}>
          <Text style={styles.label}>{meerdaags ? 'Dagen en tijden' : 'Dag en tijd'}</Text>
          {!planningBewerkbaar ? (
            <Text style={styles.hint}>
              {werkbon?.ondertekend_op
                ? 'De werkbon is ondertekend: datum en tijden staan op slot.'
                : 'Datum en tijd aanpassen vraagt het planningrecht.'}
            </Text>
          ) : (
            <Text style={styles.hint}>
              {meerdaags
                ? 'Tik de dagen van de klus aan. Elke dag heeft een eigen begin- en eindtijd.'
                : datums.length > 1
                  ? 'Startdag: de hele klus schuift mee.'
                  : 'Tik op de dag van de klus.'}
            </Text>
          )}
          <WerkbonKalender gekozen={datums} onTik={tikDag} uit={!planningBewerkbaar} />
          {meerdaags ? (
            <DagKaarten
              planning={planning}
              onChange={setPlanning}
              uitvoerders={uitvoerders}
              naam={naam}
              bewerkbaar={planningBewerkbaar}
            />
          ) : datums.length ? (
            <View style={styles.tijdRij}>
              <View style={{ flex: 1 }}>
                <TimeField label="Begin" value={enkelStart || null} onChange={setEnkelStart} disabled={!planningBewerkbaar} />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Eind" value={enkelEind || null} onChange={setEnkelEind} disabled={!planningBewerkbaar} />
              </View>
            </View>
          ) : null}
        </View>

        {/* Medewerkers + verantwoordelijke */}
        {team.length ? (
          <View style={styles.blok}>
            <Text style={styles.label}>Medewerkers</Text>
            <Text style={styles.hint}>
              Vink aan wie op de klus staat. De ster maakt iemand verantwoordelijk: die mag de bon bewerken en is
              het aanspreekpunt.
            </Text>
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
            <Schakel
              titel="Ook per e-mail laten weten"
              uitleg="Wie nieuw op de klus komt of verantwoordelijk wordt, krijgt naast de melding in de app een mail — zoals vanuit het dashboard."
              waarde={stuurMail}
              onWissel={setStuurMail}
            />
          </View>
        ) : null}

        {/* Voertuigen (modules planning + voertuigen) */}
        {metVoertuigen && voertuigen ? (
          <View style={styles.blok}>
            <Text style={styles.label}>Voertuigen op deze klus</Text>
            {zichtbareVoertuigen.length === 0 ? (
              <Text style={styles.hint}>Nog geen voertuigen. Voeg ze toe bij Instellingen → Voertuigen.</Text>
            ) : (
              <>
                <Text style={styles.hint}>
                  Meerdere mogelijk. Wie per dag in welk voertuig zit, plan je in de Planning: tik op een blok en kies Dagen, ploeg en voertuig aanpassen.
                </Text>
                <View style={styles.chipRij}>
                  {zichtbareVoertuigen.map((v) => {
                    const aan = voertuigIds.includes(v.id);
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() =>
                          setVoertuigIds((p) => (aan ? p.filter((x) => x !== v.id) : [...p, v.id]))
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: aan }}
                        aria-checked={aan}
                        style={[styles.chip, aan ? styles.chipAan : null]}
                      >
                        <View style={[styles.dot, { backgroundColor: v.kleur ?? ds.green }]} />
                        <Text style={[styles.chipTekst, aan && { color: t.green700 }]}>
                          {v.naam}
                          {v.zitplaatsen ? ` · ${v.zitplaatsen} plek${v.zitplaatsen === 1 ? '' : 'ken'}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        ) : null}

        <FormField
          label="Omschrijving"
          value={omschrijving}
          onChangeText={setOmschrijving}
          placeholder="Wat moet er gebeuren op locatie?"
          multiline
        />

        {!bewerken ? (
          <FormField
            label="Interne notitie"
            value={notitie}
            onChangeText={setNotitie}
            placeholder="Komt als eerste interne notitie in het log"
            multiline
          />
        ) : beginNotes ? (
          <FormField
            label="Interne notitie (oud veld)"
            value={notitie}
            onChangeText={setNotitie}
            multiline
          />
        ) : null}
      </ScrollView>
      <FormFooter
        label={bewerken ? 'Werkbon opslaan' : 'Werkbon aanmaken'}
        onPress={opslaanBon}
        loading={opslaan}
        error={fout}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    content: { ...leesbreedte, padding: spacing.lg, paddingBottom: 64, gap: spacing.lg },
    blok: { gap: spacing.sm },
    label: { fontSize: 12, fontWeight: '500', color: t.ink2 },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    warn: { fontSize: 13, lineHeight: 19, color: t.statusRejectFg },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    chipAan: { backgroundColor: t.green50, borderColor: ds.green },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    tijdRij: { flexDirection: 'row', gap: spacing.md },
  });
