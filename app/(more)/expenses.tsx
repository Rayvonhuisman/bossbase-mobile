import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Lock, Plus, Wallet } from 'lucide-react-native';
import {
  AppFilterChips,
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
  SelectField,
  type SelectOption,
  DateField,
  NoticeBanner,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  createJobCost,
  createLeverancier,
  deleteJobCost,
  getBijlageUrl,
  isVergrendeld,
  listJobCosts,
  listKostenCategorieen,
  listLeveranciers,
  listWerkbonInkopen,
  updateJobCost,
  type JobCostRow,
  type KostenCategorie,
} from '@/services/jobCostService';
import { listCustomers } from '@/services/customerService';
import { listProjects } from '@/services/projectService';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { vandaagIso } from '@/lib/nlTijd';
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { useSchermklasse } from '@/lib/schermklasse';
import {
  bouwKostenPagina,
  calcBtw,
  categorieMeta,
  kostenBron,
  legeKostenTekst,
  PERIODE_TYPES,
  periodeRange,
  rijUitJobCost,
  rijUitWerkbonInkoop,
  type KostenRij,
  type KostenWeergave,
  type PeriodeType,
  type WerkbonInkoopBron,
} from '@/lib/kostenLogica';
import { DocumentStatusBadge, TegelRaster } from '@/components/DocumentOnderdelen';

/**
 * Kosten — dezelfde `job_costs`-tabel als het dashboard.
 *
 * Opbouw gelijk aan de Kosten-pagina van het dashboard: twee weergaven die
 * nooit bij elkaar worden opgeteld ("Geboekte kosten" en "Kosten op
 * werkbonnen" = werkbonmateriaal + inkopen op werkbonnen), de tegels (totaal,
 * Materiaal, Arbeid als > 0, Reis, Overig — tellen op tot het totaal), het
 * signaal "N kostenposten hebben nog geen leverancier", de periodekeuze
 * (week/maand/kwartaal/jaar met bladeren, server-side op datum) en de filters
 * klant en categorie. De berekeningen staan in `lib/kostenLogica.ts`.
 *
 * Twee dingen die de database afdwingt en die je hier terugziet:
 *
 * - `job_costs_leverancier_verplicht`: een kostenpost met een positief bedrag
 *   moet een leverancier hebben (tenzij hij aan een werkbon of een import
 *   hangt). Het leveranciersveld is daarom verplicht en niet optioneel.
 * - `plan_feature_kosten`: een losse kostenpost vraagt de feature
 *   Kosten & nacalculatie.
 *
 * Geïmporteerde kosten en spiegelregels van werkbonmateriaal staan op slot: hun
 * bron ligt elders en een wijziging hier zou bij de volgende sync verdwijnen.
 */

export default function ExpensesScreen() {
  return (
    <PermissionGate permission="kosten" feature="kosten_nacalculatie" label="Kosten">
      <ExpensesScreenInhoud />
    </PermissionGate>
  );
}

type Concept = {
  id: string | null;
  /** Inhoud ligt vast (import of werkbonmateriaal); verwijderen mag wel. */
  opSlot: boolean;
  description: string;
  bedrag: string;
  category: string;
  datum: string;
  leverancierId: string | null;
  customerId: string | null;
  projectId: string | null;
  btwPct: string;
  btwInclusief: boolean;
};

// Onthouden zolang de app open is, zoals het dashboard het in localStorage zet.
let bewaardeWeergave: KostenWeergave = 'kosten';
let bewaardPeriodeType: PeriodeType = 'maand';

function ExpensesScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();
  const { klasse } = useSchermklasse();
  const breed = klasse === 'tablet';

  const [kosten, setKosten] = useState<JobCostRow[]>([]);
  const [inkopen, setInkopen] = useState<WerkbonInkoopBron[]>([]);
  const [periodeLaden, setPeriodeLaden] = useState(false);
  const [periodeFout, setPeriodeFout] = useState<string | null>(null);
  const [leveranciers, setLeveranciers] = useState<SelectOption[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [projecten, setProjecten] = useState<SelectOption[]>([]);
  const [categorieen, setCategorieen] = useState<KostenCategorie[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [nieuweLeverancier, setNieuweLeverancier] = useState('');
  const [bijlageUrl, setBijlageUrl] = useState<string | null>(null);

  const [weergave, setWeergaveState] = useState<KostenWeergave>(bewaardeWeergave);
  const [periodeType, setPeriodeTypeState] = useState<PeriodeType>(bewaardPeriodeType);
  const [periodeOffset, setPeriodeOffset] = useState(0);
  const [filterKlant, setFilterKlant] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const kiesWeergave = (w: KostenWeergave) => {
    bewaardeWeergave = w;
    setWeergaveState(w);
  };
  const kiesPeriodeType = (p: PeriodeType) => {
    bewaardPeriodeType = p;
    setPeriodeTypeState(p);
    setPeriodeOffset(0);
  };

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveLev, saving: levBezig, error: levFout } = useSave<{ id: string; naam: string }>();

  const magMaken = mag('kosten', 'maken');
  const magWijzigen = mag('kosten', 'wijzigen');
  const magVerwijderen = mag('kosten', 'verwijderen');

  const periode = useMemo(
    () => periodeRange(periodeType, periodeOffset),
    [periodeType, periodeOffset],
  );
  const { start: periodeStart, eind: periodeEind, label: periodeLabel } = periode;

  /**
   * De kosten van één periode, server-side op datum (zoals het dashboard). Een
   * volgnummer houdt een trage oude periode tegen die na een snelle klik op
   * "volgende" binnenkomt.
   */
  const verzoek = useRef(0);
  const laadPeriode = useCallback(async () => {
    const nr = ++verzoek.current;
    setPeriodeLaden(true);
    const bereik = { vanDatum: periodeStart, totDatum: periodeEind };
    const [kostRes, inkoopRes] = await Promise.all([
      listJobCosts(bereik),
      listWerkbonInkopen(bereik),
    ]);
    if (nr !== verzoek.current) return;
    setPeriodeLaden(false);
    const fout = kostRes.error ?? inkoopRes.error;
    setPeriodeFout(fout);
    if (!fout) {
      setKosten(kostRes.data);
      setInkopen(inkoopRes.data);
    }
  }, [periodeStart, periodeEind]);

  const load = useCallback(async () => {
    setError(null);
    const [, levRes, klantRes, projRes, catRes] = await Promise.all([
      laadPeriode(),
      listLeveranciers(),
      listCustomers(),
      listProjects(),
      listKostenCategorieen(),
    ]);
    if (!levRes.error) setLeveranciers(levRes.data.map((l) => ({ id: l.id, label: l.naam })));
    if (!klantRes.error) {
      setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant' })));
    }
    if (!projRes.error) {
      setProjecten(projRes.data.map((p) => ({ id: p.id, label: p.name ?? 'Project' })));
    }
    setCategorieen(catRes);
  }, [laadPeriode]);

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  // Andere periode gekozen: alleen de kosten opnieuw ophalen. De eerste keer
  // doet `useLaden` dat al.
  const periodeGezien = useRef(false);
  useEffect(() => {
    if (!periodeGezien.current) {
      periodeGezien.current = true;
      return;
    }
    void laadPeriode();
  }, [laadPeriode]);

  const klantNamen = useMemo(() => new Map(klanten.map((k) => [k.id, k.label])), [klanten]);
  const leverancierNamen = useMemo(
    () => new Map(leveranciers.map((l) => [l.id, l.label])),
    [leveranciers],
  );
  const kostenRijen = useMemo(() => kosten.map(rijUitJobCost), [kosten]);
  const inkoopRijen = useMemo(() => inkopen.map(rijUitWerkbonInkoop), [inkopen]);
  const pagina = useMemo(
    () =>
      bouwKostenPagina({
        kosten: kostenRijen,
        inkopen: inkoopRijen,
        weergave,
        filterKlant,
        filterCat,
      }),
    [kostenRijen, inkoopRijen, weergave, filterKlant, filterCat],
  );

  const klantVan = (r: KostenRij): string => {
    if (r.klantId) return klantNamen.get(r.klantId) ?? r.klantNaam ?? 'Klant';
    return r.klantType === 'algemeen' ? 'Algemeen' : 'Geen klant';
  };
  const leverancierVan = (r: KostenRij): string => {
    if (r.leverancierId) return leverancierNamen.get(r.leverancierId) ?? r.leverancierNaam ?? 'Leverancier';
    if (r.werkbonMateriaalId || r.werkbonInkoop) return 'via werkbon';
    return 'Leverancier ontbreekt';
  };
  const subtitleVoor = (r: KostenRij): string => {
    const bron = kostenBron(r.externeRef);
    return [
      klantVan(r),
      leverancierVan(r),
      r.datum ? formatDateNL(r.datum) : '',
      bron === 'snelstart' ? 'SnelStart' : bron === 'moneybird' ? 'Moneybird' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const categorieOpties: SelectOption[] = pagina.categorieen.map((c) => ({
    id: c,
    label: categorieMeta(c).label,
  }));

  const openNieuw = () => {
    setSaveError(null);
    setBijlageUrl(null);
    setConcept({
      id: null,
      opSlot: false,
      description: '',
      bedrag: '',
      category: categorieen[0]?.naam ?? 'Materiaal',
      datum: vandaagIso(),
      leverancierId: null,
      customerId: null,
      projectId: null,
      btwPct: '21',
      btwInclusief: false,
    });
  };

  const openBewerk = (k: JobCostRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    // De tijdelijke link meteen ophalen, zodat "Bijlage bekijken" synchroon
    // vanuit de klik een venster kan openen (pop-upblokkering in Safari).
    setBijlageUrl(null);
    if (k.bijlage_url) void getBijlageUrl(k.bijlage_url).then(setBijlageUrl);
    setConcept({
      // Een geïmporteerde kost of een spiegelregel van werkbonmateriaal is
      // inhoudelijk niet te wijzigen — de bron ligt elders — maar verwijderen
      // kan wel, mét de prullenbakstap die de import tegenhoudt.
      opSlot: isVergrendeld(k),
      id: k.id,
      description: k.description ?? '',
      bedrag: k.amount != null ? String(k.amount) : '',
      category: k.category ?? 'Overig',
      datum: k.cost_date ?? vandaagIso(),
      leverancierId: k.leverancier_id,
      customerId: k.customer_id,
      projectId: k.project_id,
      btwPct: k.btw_percentage != null ? String(k.btw_percentage) : '21',
      // `amount` is altijd exclusief btw opgeslagen (dashboardregel), dus een
      // bestaande post opent in de stand "excl.".
      btwInclusief: false,
    });
  };

  const opslaan = () => {
    if (!concept) return;
    const invoer = {
      description: concept.description,
      amount: Number(concept.bedrag.replace(',', '.') || 0),
      category: concept.category,
      cost_date: concept.datum || null,
      leverancier_id: concept.leverancierId,
      customer_id: concept.customerId,
      project_id: concept.projectId,
      btw_percentage: Number(concept.btwPct.replace(',', '.') || 21),
      btw_inclusief: concept.btwInclusief,
      klant_type: (concept.customerId ? 'klant' : 'algemeen') as 'klant' | 'algemeen',
    };
    save(() => (concept.id ? updateJobCost(concept.id, invoer) : createJobCost(invoer)), {
      onSuccess: async () => {
        setConcept(null);
        await herlaad();
      },
    });
  };

  // De databaseconstraint eist een leverancier bij elke nieuwe kostenpost. Heeft
  // het bedrijf er nog geen, dan zou het formulier een verplicht veld tonen met
  // een lege lijst; daarom kan hij hier ter plekke worden aangemaakt.
  const leverancierToevoegen = () => {
    saveLev(() => createLeverancier(nieuweLeverancier), {
      onSuccess: async (nieuw) => {
        setNieuweLeverancier('');
        setLeveranciers((lijst) =>
          [...lijst, { id: nieuw.id, label: nieuw.naam }].sort((a, b) =>
            a.label.localeCompare(b.label, 'nl'),
          ),
        );
        setConcept((c) => (c ? { ...c, leverancierId: nieuw.id } : c));
      },
    });
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    const opSlot = concept.opSlot;
    bevestigVerwijderen(
      'Kostenpost',
      () => {
        save(() => deleteJobCost(id), {
          onSuccess: async (_data, extra) => {
            setConcept(null);
            if (typeof extra?.waarschuwing === 'string') Dialog.alert('Let op', extra.waarschuwing);
            await herlaad();
          },
        });
      },
      opSlot
        ? 'Komt deze kost uit je boekhouding, dan gaat hij ook op de negeerlijst zodat de volgende synchronisatie hem niet terughaalt. Hoort hij bij werkbonmateriaal, dan verdwijnt dat materiaal mee.'
        : 'Dit kan niet ongedaan worden gemaakt.',
    );
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Kosten laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Kosten" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const kostPerId = new Map(kosten.map((k) => [k.id, k]));
  const toontMateriaal = weergave === 'materiaal';
  const btwOverzicht = concept
    ? calcBtw(
        Number(concept.bedrag.replace(',', '.') || 0),
        Number(concept.btwPct.replace(',', '.') || 0),
        concept.btwInclusief ? 'incl' : 'excl',
      )
    : null;
  const conceptCategorie = categorieen.find((c) => c.naam === concept?.category);
  const categorieKeuzes = [
    ...categorieen.map((c) => c.naam),
    ...(concept?.category && !categorieen.some((c) => c.naam === concept.category)
      ? [concept.category]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Kosten"
            subtitle={periodeLabel}
            meta={formatEUR(pagina.totaal)}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Kosten toevoegen" onPress={openNieuw} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Welke weergave: boekingen of wat op werkbonnen staat. */}
        <View style={{ paddingTop: 12 }}>
          <AppFilterChips<KostenWeergave>
            chips={[
              { id: 'kosten', label: 'Geboekte kosten' },
              { id: 'materiaal', label: 'Kosten op werkbonnen' },
            ]}
            active={weergave}
            onChange={kiesWeergave}
          />
        </View>

        {/* Periode */}
        <View style={{ paddingTop: 10 }}>
          <AppFilterChips<PeriodeType>
            chips={PERIODE_TYPES.map((p) => ({ id: p.id, label: p.label }))}
            active={periodeType}
            onChange={kiesPeriodeType}
          />
        </View>
        <View style={styles.periodeRij}>
          <Pressable
            onPress={() => setPeriodeOffset((o) => o - 1)}
            accessibilityRole="button"
            accessibilityLabel="Vorige periode"
            style={styles.periodeKnop}
          >
            <ChevronLeft size={20} color={t.ink} />
          </Pressable>
          <Text style={styles.periodeLabel} numberOfLines={1}>
            {periodeLabel}
          </Text>
          <Pressable
            onPress={() => setPeriodeOffset((o) => o + 1)}
            accessibilityRole="button"
            accessibilityLabel="Volgende periode"
            style={styles.periodeKnop}
          >
            <ChevronRight size={20} color={t.ink} />
          </Pressable>
          {periodeOffset !== 0 ? (
            <Pressable
              onPress={() => setPeriodeOffset(0)}
              accessibilityRole="button"
              accessibilityLabel="Terug naar nu"
              style={[styles.periodeKnop, styles.nuKnop]}
            >
              <Text style={styles.nuTekst}>Nu</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Klant en categorie */}
        <View style={[styles.filterRij, breed && { flexDirection: 'row' }]}>
          <View style={breed ? { flex: 1 } : undefined}>
            <SelectField
              label="Klant"
              value={filterKlant}
              options={klanten}
              onChange={setFilterKlant}
              allowEmpty
              emptyLabel="Alle klanten"
              placeholder="Alle klanten"
              searchable
            />
          </View>
          <View style={breed ? { flex: 1 } : undefined}>
            <SelectField
              label="Categorie"
              value={filterCat}
              options={categorieOpties}
              onChange={setFilterCat}
              allowEmpty
              emptyLabel="Alle categorieën"
              placeholder="Alle categorieën"
            />
          </View>
        </View>

        <TegelRaster
          breed={breed}
          tegels={pagina.tegels.map((tg) => ({
            id: tg.id,
            label: tg.label,
            waarde: formatEUR(tg.bedrag),
            uitleg: tg.uitleg,
          }))}
        />

        <View style={styles.meldingen}>
          {periodeFout ? (
            <NoticeBanner toon="fout" message={periodeFout} onPress={() => void laadPeriode()} />
          ) : null}
          {toontMateriaal ? (
            <NoticeBanner
              toon="info"
              title="Dit zijn geen boekingen"
              message={
                'Materiaal en inkopen die op werkbonnen staan. Ze tellen niet mee in je kosten en ' +
                'je btw — in je boekhouding is de factuur van je leverancier de kostenpost. Ze ' +
                'tellen wél mee in de brutowinst van een project.'
              }
            />
          ) : pagina.zonderLeverancier > 0 ? (
            <NoticeBanner
              toon="waarschuwing"
              title={`${pagina.zonderLeverancier} ${
                pagina.zonderLeverancier === 1 ? 'kostenpost heeft' : 'kostenposten hebben'
              } nog geen leverancier`}
              message="Zonder leverancier kunnen ze niet naar de boekhouding. Open zo’n regel en kies alsnog een leverancier."
            />
          ) : null}
        </View>

        {pagina.regels.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} color={ds.green} strokeWidth={1.6} />}
            title={periodeLaden ? 'Kosten laden...' : toontMateriaal ? 'Geen kosten op werkbonnen' : 'Geen kosten'}
            message={
              periodeLaden
                ? 'Even geduld.'
                : legeKostenTekst(weergave, periodeLabel, Boolean(filterKlant || filterCat)) +
                  (magMaken || toontMateriaal
                    ? ''
                    : ` ${waaromNiet('kosten', 'maken') ?? ''}`)
            }
          />
        ) : (
          <>
            <AppSection
              title={toontMateriaal ? 'Kosten op werkbonnen' : 'Kostenregels'}
              count={pagina.regels.length}
              variant="eyebrow"
            />
            <AppListGroup>
              {pagina.regels.map((r, i) => {
                const bron = kostPerId.get(r.id);
                const opSlot = bron ? isVergrendeld(bron) : true;
                const cat = categorieMeta(r.cat);
                return (
                  <AppListItem
                    key={`${r.werkbonInkoop ? 'i' : 'k'}-${r.id}`}
                    first={i === 0}
                    icon={opSlot ? Lock : Wallet}
                    title={r.omschrijving || cat.label}
                    subtitle={subtitleVoor(r)}
                    onPress={
                      !r.werkbonInkoop && bron && magWijzigen ? () => openBewerk(bron) : undefined
                    }
                    trailing={
                      <View style={styles.trailing}>
                        <Text style={styles.bedrag}>{formatEUR(r.bedrag)}</Text>
                        {r.btwPct != null ? (
                          <Text style={styles.incl}>
                            {formatEUR(calcBtw(r.bedrag, r.btwPct, 'excl').incl)} incl. · {r.btwPct}%
                          </Text>
                        ) : null}
                        <DocumentStatusBadge toon={cat.toon} label={cat.label} />
                      </View>
                    }
                  />
                );
              })}
            </AppListGroup>
            <Text style={styles.voetnoot}>
              Bedragen zijn exclusief btw. Kosten met een slotje komen uit je boekhouding of van
              werkbonmateriaal; die pas je aan bij de bron. Inkopen op een werkbon wijzig je op de
              werkbon.
            </Text>
          </>
        )}
      </AppScreen>

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Kostenpost bewerken' : 'Nieuwe kostenpost'}
        error={saveError}
        saving={saving}
        submitDisabled={
          concept?.opSlot || !concept?.description.trim() || !concept?.bedrag.trim()
        }
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Kostenpost verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        {concept?.opSlot ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze kostenpost komt uit je boekhouding of hoort bij werkbonmateriaal. De inhoud pas
              je aan bij de bron; verwijderen kan hier wel.
            </Text>
          </View>
        ) : null}

        <FormField
          label="Omschrijving"
          value={concept?.description ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, description: v } : c))}
          placeholder="Bijv. Dakpannen 200 stuks"
          autoFocus={!concept?.id}
        />

        <FormField
          label={concept?.btwInclusief ? 'Bedrag incl. btw' : 'Bedrag excl. btw'}
          value={concept?.bedrag ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, bedrag: v } : c))}
          placeholder="0,00"
          keyboardType="decimal-pad"
          editable={!concept?.opSlot}
        />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Btw</Text>
          <View style={styles.chipRij}>
            {[
              { id: '21', label: '21%' },
              { id: '9', label: '9%' },
              { id: '0', label: 'Geen btw (0%)' },
            ].map((o) => {
              const actief = Number(concept?.btwPct.replace(',', '.')) === Number(o.id);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setConcept((c) => (c ? { ...c, btwPct: o.id } : c))}
                  disabled={concept?.opSlot}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {btwOverzicht ? (
            <Text style={styles.schakelUitleg}>
              Excl. {formatEUR(btwOverzicht.excl)} · btw {formatEUR(btwOverzicht.btw)} · incl.{' '}
              {formatEUR(btwOverzicht.incl)}. Opgeslagen wordt het bedrag excl. btw, net als in
              het dashboard.
            </Text>
          ) : null}
        </View>

        <View style={styles.schakelRij}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schakelTitel}>Bedrag is inclusief btw</Text>
            <Text style={styles.schakelUitleg}>
              Staat dit uit, dan is het ingevulde bedrag exclusief btw.
            </Text>
          </View>
          <Switch
            value={concept?.btwInclusief ?? false}
            onValueChange={(v) => setConcept((c) => (c ? { ...c, btwInclusief: v } : c))}
            disabled={saving}
          />
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Categorie</Text>
          <View style={styles.chipRij}>
            {categorieKeuzes.map((cat) => {
              const actief = concept?.category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setConcept((c) => (c ? { ...c, category: cat } : c))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>{cat}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {conceptCategorie?.bonVerplicht && !concept?.id ? (
          <NoticeBanner
            toon="info"
            message="Voor deze categorie vraagt het dashboard een bon. Een bon toevoegen kan (nog) alleen in het dashboard."
          />
        ) : null}

        {concept?.id && bijlageUrl ? (
          <Button
            label="Bijlage bekijken"
            variant="secondary"
            onPress={() => void Linking.openURL(bijlageUrl)}
          />
        ) : null}

        <SelectField
          label="Leverancier"
          value={concept?.leverancierId ?? null}
          options={leveranciers}
          onChange={(id) => setConcept((c) => (c ? { ...c, leverancierId: id } : c))}
          placeholder={leveranciers.length === 0 ? 'Nog geen leveranciers' : 'Kies een leverancier'}
          disabled={leveranciers.length === 0}
          hint="Verplicht: zonder leverancier weigert de administratie de kostenpost."
        />

        <View style={styles.levBlok}>
          <FormField
            label="Nieuwe leverancier"
            value={nieuweLeverancier}
            onChangeText={setNieuweLeverancier}
            placeholder="Naam van de leverancier"
            hint={
              leveranciers.length === 0
                ? 'Je hebt nog geen leveranciers. Voeg er hier één toe.'
                : 'Staat je leverancier er niet bij? Voeg hem hier toe.'
            }
          />
          {levFout ? <Text style={styles.levFout}>{levFout}</Text> : null}
          <Button
            label={levBezig ? 'Toevoegen…' : 'Leverancier toevoegen'}
            variant="secondary"
            loading={levBezig}
            disabled={!nieuweLeverancier.trim() || levBezig || saving}
            onPress={leverancierToevoegen}
          />
        </View>

        <DateField
          label="Kostendatum"
          value={concept?.datum || null}
          onChange={(v) => setConcept((c) => (c ? { ...c, datum: v } : c))}
          placeholder="Kies"
        />

        <SelectField
          label="Klant"
          value={concept?.customerId ?? null}
          options={klanten}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id } : c))}
          allowEmpty
          emptyLabel="Algemene kosten"
          placeholder="Algemene kosten"
        />

        <SelectField
          label="Project"
          value={concept?.projectId ?? null}
          options={projecten}
          onChange={(id) => setConcept((c) => (c ? { ...c, projectId: id } : c))}
          allowEmpty
          emptyLabel="Geen project"
          placeholder="Geen project"
          hint="Bepaalt onder welk project de nacalculatie deze kost meetelt."
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    trailing: { alignItems: 'flex-end', gap: 3 },
    incl: { fontSize: 11.5, color: t.muted },
    periodeRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    periodeKnop: {
      minWidth: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    nuKnop: { paddingHorizontal: 14 },
    nuTekst: { fontSize: 13, fontWeight: '700', color: t.ink },
    periodeLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: t.ink },
    filterRij: { gap: spacing.md, paddingHorizontal: 16, paddingTop: 12 },
    meldingen: { gap: spacing.sm, paddingHorizontal: 16, paddingTop: 12 },
    label: { ...typography.label, color: t.ink2 },
    rij: { flexDirection: 'row', gap: spacing.md },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipActief: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
    schakelRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    schakelTitel: { fontSize: 14.5, fontWeight: '700', color: t.ink },
    schakelUitleg: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    slotBanner: { padding: spacing.md, borderRadius: radius.md, backgroundColor: t.statusDraftBg },
    slotTekst: { fontSize: 13, lineHeight: 19, color: t.statusDraftFg, fontWeight: '600' },
    levBlok: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.bgAlt,
    },
    levFout: { fontSize: 12.5, fontWeight: '600', color: t.statusRejectFg },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
