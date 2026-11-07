import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FormField, FormSheet, NoticeBanner, SelectField } from '@/components';
import { formatDateNL, formatEUR, formatEURCent } from '@/lib/format';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import {
  bouwKostenOverzicht,
  bouwNacalculatie,
  kostBedrag,
  materiaalNaam,
  type Begroting,
  type ProjectJobCost,
  type ProjectKost,
} from '@/lib/projectKostenLogica';
import { listLeveranciers } from '@/services/jobCostService';
import {
  createProjectKost,
  deleteProjectKost,
  getProjectBegroting,
  listProjectJobCosts,
  listProjectKosten,
  updateProjectKost,
} from '@/services/projectKostenService';
import type { ProjectUur } from '@/services/projectService';
import { Blok, KleineKnop, Rij, useStijl, Veld } from './bouwstenen';
import { NacalculatieTabel } from './NacalculatieTabel';
import { getalOfNul } from '@/lib/getalNl';

/**
 * De Nacalculatie-tab (`KostenTab` in het dashboard): wat deze klus kost
 * tegenover wat begroot was. Arbeid (uren × de kostprijs per uur die gold bij
 * het boeken), het materiaal van de werkbonnen (op inkoopprijs) en de inkopen
 * die hier worden ingevoerd; boekingen van de Kosten-pagina tellen niet mee
 * (dat is de boekhouding). Begroot komt uit de geaccepteerde offertes en hun
 * calculatie (`bb_project_begroting`).
 *
 * Rechten zoals het dashboard: de tab vraagt `kosten` + pakket
 * `kosten_nacalculatie`; opbrengst en resultaat `projectbedragen`. Arbeid en
 * materiaal staan op kostprijs en komen zonder `inkoopprijzen` niet uit de
 * database (RLS); een resultaat zonder die kosten zou te hoog uitvallen, dus
 * dan blijft de hele nacalculatie weg en staan alleen de inkopen er. Inkopen
 * bewerken `projecten_bewerken` (RLS: `kosten`).
 *
 * Excl. btw aan beide kanten: rekenen met een bedrag inclusief zou het
 * resultaat structureel te laag maken.
 */

type Concept = { id: string | null; naam: string; aantal: string; eenheid: string; prijs: string; leverancierId: string | null };

const getal = (v: string) => getalOfNul(v);
const alsVeld = (n: number) => String(n).replace('.', ',');

export function KostenTab({
  projectId,
  omzetExclBtw,
  uren,
  magBedragen,
  magInkoop,
  magBewerken,
  isAdmin,
}: {
  projectId: string;
  omzetExclBtw: number;
  uren: ProjectUur[];
  magBedragen: boolean;
  magInkoop: boolean;
  magBewerken: boolean;
  isAdmin: boolean;
}) {
  const { t, styles } = useStijl();
  const [kosten, setKosten] = useState<ProjectJobCost[]>([]);
  const [inkopen, setInkopen] = useState<ProjectKost[]>([]);
  const [leveranciers, setLeveranciers] = useState<{ id: string; naam: string }[]>([]);
  const [laden, setLaden] = useState(true);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [begroting, setBegroting] = useState<Begroting | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const { save, saving, error, setError } = useSave<unknown>();

  const laad = useCallback(async () => {
    const [jc, pk, lv, b] = await Promise.all([
      listProjectJobCosts(projectId),
      listProjectKosten(projectId),
      listLeveranciers(),
      magInkoop ? getProjectBegroting(projectId) : Promise.resolve(null),
    ]);
    setKosten(jc.data);
    setInkopen(pk.data);
    setLeveranciers(lv.data);
    setBegroting(b);
    setLaadFout(jc.error ?? pk.error);
    setLaden(false);
  }, [projectId, magInkoop]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void laad();
  }, [laad]);

  // Werkelijk uit bouwKostenOverzicht, opgebouwd uit de losse stukken en niet
  // uit een tweede fetch, zodat een net toegevoegde inkoop meteen meetelt.
  const overzicht = useMemo(
    () =>
      bouwKostenOverzicht({
        jobCosts: kosten,
        projectKosten: inkopen,
        urenRegels: uren,
      }),
    [kosten, inkopen, uren],
  );
  const nc = useMemo(
    () => bouwNacalculatie({ overzicht, begroting, gefactureerdExcl: omzetExclBtw }),
    [overzicht, begroting, omzetExclBtw],
  );
  const leverancierNaam = (id: string | null) => leveranciers.find((l) => l.id === id)?.naam ?? null;

  const opslaan = () => {
    if (!concept) return;
    const invoer = {
      naam: concept.naam,
      aantal: getal(concept.aantal),
      eenheid: concept.eenheid,
      prijs_per: getal(concept.prijs),
      leverancier_id: concept.leverancierId,
    };
    save(() => (concept.id ? updateProjectKost(concept.id, invoer) : createProjectKost(projectId, invoer)), {
      onSuccess: (rij) => {
        const nieuw = rij as ProjectKost;
        setInkopen((l) => (concept.id ? l.map((x) => (x.id === nieuw.id ? nieuw : x)) : [...l, nieuw]));
        setConcept(null);
      },
    });
  };

  const verwijder = () => {
    if (!concept?.id) return;
    const id = concept.id;
    bevestigVerwijderen(`"${concept.naam}"`, () => {
      save(() => deleteProjectKost(id), {
        onSuccess: () => {
          setInkopen((l) => l.filter((x) => x.id !== id));
          setConcept(null);
        },
      });
    });
  };

  const openNieuw = () => {
    setError(null);
    setConcept({ id: null, naam: '', aantal: '1', eenheid: '', prijs: '', leverancierId: null });
  };
  const openBewerk = (k: ProjectKost) => {
    setError(null);
    setConcept({
      id: k.id,
      naam: k.naam,
      aantal: alsVeld(k.aantal),
      eenheid: k.eenheid,
      prijs: alsVeld(k.prijs_per),
      leverancierId: k.leverancier_id,
    });
  };

  const materiaal = overzicht.materiaal.regels;
  const boekingen = overzicht.boekingen.regels;

  return (
    <>
      <Blok titel="Nacalculatie">
        {laden ? (
          <Text style={styles.leeg}>Laden…</Text>
        ) : magInkoop ? (
          <NacalculatieTabel nc={nc} magBedragen={magBedragen} isAdmin={isAdmin} />
        ) : (
          <>
            <View style={styles.raster}>
              <Veld label="Inkopen">
                <Text style={styles.tegelWaarde}>{formatEUR(overzicht.inkopen.bedrag)}</Text>
              </Veld>
            </View>
            <Text style={styles.klein}>
              Geen nacalculatie zichtbaar: de arbeid en het materiaal tellen mee tegen hun kostprijs, en die is voor
              jou afgeschermd (recht ‘Inkoop- en kostprijzen zien’). Daarom zie je hier alleen de inkopen.
            </Text>
          </>
        )}
        {/* Geen stil verkeerd getal: als de inkoopprijs ontbreekt is de
            verkoopprijs gebruikt, en dan is het resultaat een ondergrens. */}
        {magInkoop && overzicht.materiaal.zonderInkoopprijs > 0 ? (
          <NoticeBanner
            message={`${
              overzicht.materiaal.zonderInkoopprijs === 1
                ? '1 materiaalregel heeft geen inkoopprijs'
                : `${overzicht.materiaal.zonderInkoopprijs} materiaalregels hebben geen inkoopprijs`
            } (${formatEUR(overzicht.materiaal.geschatBedrag)}). Daarvoor is de verkoopprijs gerekend, dus het werkelijke resultaat ligt hoger. Vul de inkoopprijs in op de werkbon.`}
          />
        ) : null}
      </Blok>

      <Blok
        titel="Inkopen"
        actie={magBewerken && !laden ? <KleineKnop label="Toevoegen" icon="plus" onPress={openNieuw} /> : undefined}
      >
        <Text style={styles.klein}>
          Kosten die bij deze klus horen maar niet op een werkbon staan, zoals steigerhuur of een gehuurde hoogwerker.
          Bedragen exclusief btw.
        </Text>
        {laden ? (
          <Text style={styles.leeg}>Laden…</Text>
        ) : laadFout && !inkopen.length ? (
          <Text style={[styles.leeg, { color: t.statusRejectFg }]}>{laadFout}</Text>
        ) : inkopen.length === 0 ? (
          <Text style={styles.leeg}>Nog geen kosten toegevoegd.</Text>
        ) : (
          <>
            {inkopen.map((k) => (
              <Rij
                key={k.id}
                titel={k.naam || '(geen omschrijving)'}
                sub={[
                  `${alsVeld(k.aantal)}${k.eenheid ? ` ${k.eenheid}` : ''} × ${formatEURCent(k.prijs_per)}`,
                  leverancierNaam(k.leverancier_id),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={<Text style={styles.bedrag}>{formatEURCent(k.bedrag)}</Text>}
                onPress={magBewerken ? () => openBewerk(k) : undefined}
              />
            ))}
            <View style={[styles.rij, { justifyContent: 'flex-end' }]}>
              <Text style={styles.klein}>Totaal inkopen (excl. btw)</Text>
              <Text style={styles.bedrag}>{formatEURCent(overzicht.inkopen.bedrag)}</Text>
            </View>
          </>
        )}
      </Blok>

      {magInkoop ? (
        <Blok titel={`Materiaal (${materiaal.length})`}>
          <Text style={styles.klein}>Aantallen en prijzen wijzig je op de werkbon.</Text>
          {laden ? (
            <Text style={styles.leeg}>Laden…</Text>
          ) : materiaal.length === 0 ? (
            <Text style={styles.leeg}>Nog geen materiaal op de werkbonnen van dit project.</Text>
          ) : (
            materiaal.map((c) => (
              <Rij
                key={c.id}
                titel={materiaalNaam(c.description) || '(geen omschrijving)'}
                sub={[
                  c.cost_date ? formatDateNL(c.cost_date) : null,
                  c.inkoopprijsPer == null ? 'op verkoopprijs' : 'inkoop, excl. btw',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={<Text style={styles.bedrag}>{formatEURCent(c.amount)}</Text>}
              />
            ))
          )}
        </Blok>
      ) : null}

      {!laden && boekingen.length > 0 ? (
        <NoticeBanner
          toon="info"
          message={`${boekingen.length === 1 ? '1 boeking' : `${boekingen.length} boekingen`} op de Kosten-pagina ${
            boekingen.length === 1 ? 'hangt' : 'hangen'
          } aan dit project (${formatEURCent(overzicht.boekingen.bedrag)}). Dat is de boekhouding en telt niet mee in de nacalculatie: het materiaal zelf staat hierboven al via de werkbon. Hoort een kost echt bij deze klus en staat hij nergens op een werkbon, zet hem dan bij de inkopen.`}
        />
      ) : null}

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Inkoop bewerken' : 'Inkoop toevoegen'}
        subtitle="Kostprijs exclusief btw"
        error={error}
        saving={saving}
        submitDisabled={!concept?.naam.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={concept?.id ? { label: 'Verwijderen', onPress: verwijder } : undefined}
      >
        {concept ? (
          <>
            <FormField
              label="Omschrijving"
              value={concept.naam}
              onChangeText={(v) => setConcept({ ...concept, naam: v })}
              placeholder="Bijv. Steigerhuur"
              autoFocus={!concept.id}
            />
            <View style={styles.formRij}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Aantal"
                  value={concept.aantal}
                  onChangeText={(v) => setConcept({ ...concept, aantal: v })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Eenheid"
                  value={concept.eenheid}
                  onChangeText={(v) => setConcept({ ...concept, eenheid: v })}
                  placeholder="stuk"
                />
              </View>
            </View>
            <FormField
              label="Kostprijs per eenheid"
              value={concept.prijs}
              onChangeText={(v) => setConcept({ ...concept, prijs: v })}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            <SelectField
              label="Leverancier"
              value={concept.leverancierId}
              options={leveranciers.map((l) => ({ id: l.id, label: l.naam }))}
              onChange={(id) => setConcept({ ...concept, leverancierId: id })}
              allowEmpty
              emptyLabel="— Geen leverancier —"
              placeholder="— Geen leverancier —"
              searchable
            />
            <Text style={styles.klein}>
              Subtotaal {formatEURCent(kostBedrag(getal(concept.aantal), getal(concept.prijs)))}
            </Text>
          </>
        ) : null}
      </FormSheet>
    </>
  );
}
