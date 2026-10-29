/**
 * Boss in de offerte: het gesprek in de werkruimte.
 *
 * Overgenomen uit het dashboard (`BossOffertePaneel` in `BossOfferte.jsx`):
 *   - context: klant, project, een bestaande offerte als voorbeeld, een foto of
 *     bestand en de maten die je daaruit hebt gecontroleerd;
 *   - Boss kan meerdere vragen tegelijk stellen en eerst de maten uit een foto
 *     ter controle voorleggen;
 *   - het voorstel heeft groepen, regels met herkomst, en aanvullingen die
 *     standaard uit staan.
 * Er verandert pas iets na "Toepassen", en dat is terug te draaien. Opslaan en
 * versturen gebeurt alleen met de knoppen onder het document.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check, Layers, Lock, Undo2 } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import { berekenTotalen, regelprijs, type Groep, type Regel } from '@/lib/regels';
import {
  isLegeRegel, pasVoorstelToe, regelsVoorBoss, type OfferteVoorstel, type VoorstelRegel,
} from '@/lib/boss/offerteRegels';
import { getalNl, klantUitOpdracht, nid, wachtOpJou, zin } from '@/lib/boss/gesprek';
import { bewaarConceptDeel } from '@/lib/boss/werkruimteConcept';
import { vraagBoss, type BossBestand } from '@/services/bossDocumentService';
import { listProjects, type ProjectRow } from '@/services/projectService';
import type { OfferteRow } from '@/services/offerteService';
import {
  BossBubbel, BossGesprek, IkBubbel, Inklap, Kaart, KaartKop, KaartTekst, KiesLijst, KleineKnop, Knoppen, Opties,
  TotaalRegels, Uitleg, Waarschuwingen, WijzigRegel, type Label,
} from './BossGesprek';
import { bronVoorBoss, useVoortgang } from './gedeeld';
import { useWerkruimte } from './Werkruimte';

type Stand = { regels: Regel[]; groepen: Groep[] };
type Vraag = { sleutel: string; tekst: string; toelichting?: string; opties?: { label: string; waarde: string }[]; vrije_invoer: 'geen' | 'tekst' | 'getal' | 'bedrag'; eenheid?: string };
type Maat = { naam: string; eenheid: string; waarde: number | null; soort: 'vermeld' | 'berekend' | 'ontbreekt'; formule?: string };
type Resultaat =
  | { soort: 'vragen'; vragen: Vraag[] }
  | { soort: 'maten'; maten: Maat[] }
  | ({ soort: 'voorstel' } & OfferteVoorstel)
  | { soort: 'melding'; melding?: string };

type Item =
  | { id: string; t: 'ik'; tekst: string }
  | { id: string; t: 'melding'; tekst: string; waarschuwingen?: string[] }
  | { id: string; t: 'fout'; tekst: string; titel?: string; opdracht?: string; herhaal?: Extra }
  | { id: string; t: 'vragen'; vragen: Vraag[]; opdracht: string; antwoord?: { sleutel: string; vraag: string; label: string }[] }
  | { id: string; t: 'maten'; maten: Maat[]; opdracht: string; waarschuwingen?: string[]; bevestigd?: { naam: string; eenheid: string; waarde: number }[] }
  | { id: string; t: 'kies'; soort: 'project' | 'offerte'; gekozen?: string }
  | { id: string; t: 'voorstel'; status: 'open' | 'toegepast' | 'vervangen' | 'genegeerd'; voor: Stand; resultaat: OfferteVoorstel; waarschuwingen: string[]; keuze: Record<number, boolean>; details?: boolean }
  | { id: string; t: 'toegepast'; tekst: string; overgeslagen: string[]; ongedaan?: boolean };

/** `Omit` per variant van de unie (gewone `Omit` maakt er één vorm van). */
type ZonderId<T> = T extends unknown ? Omit<T, 'id'> : never;

type Extra = { antwoorden?: Record<string, string>; maten?: { naam: string; eenheid: string; waarde: number }[] };

export type OfferteGesprekBewaard = {
  items: Item[]; draft: string; bestand: BossBestand | null; maten: Extra['maten']; antwoorden: Record<string, string>;
  projectId: string | null; voorbeeldId: string | null; zonderKlant: boolean;
};

type Props = {
  klantId: string | null;
  offerteId: string | null;
  klanten: { id: string; name: string | null; city?: string | null }[];
  /** Andere offertes, als voorbeeld voor uren en aantallen. */
  offertes: OfferteRow[];
  stand: Stand;
  setStand: (s: Stand) => void;
  maakRegel: () => Regel;
  standaardPct: number;
  onToegepast: (ids: string[]) => void;
  onKlant: (id: string) => void;
  bewaard: OfferteGesprekBewaard | null;
  bewaarSleutel: string | null;
  onStand: (s: { bezig: boolean; wacht: number }) => void;
};

const totaalVan = (regels: Regel[]) => berekenTotalen(regels.filter((r) => !isLegeRegel(r)));

export function OfferteGesprek({
  klantId, offerteId, klanten, offertes, stand, setStand, maakRegel, standaardPct, onToegepast, onKlant, bewaard, bewaarSleutel, onStand,
}: Props) {
  const { colors: t } = useTheme();
  const wr = useWerkruimte();
  const [items, setItems] = useState<Item[]>(() => bewaard?.items ?? []);
  const [draft, setDraft] = useState(() => bewaard?.draft ?? '');
  const [busy, setBusy] = useState(false);
  const [bestand, setBestand] = useState<BossBestand | null>(() => bewaard?.bestand ?? null);
  const [maten, setMaten] = useState<Extra['maten']>(() => bewaard?.maten ?? []);
  const [antwoorden, setAntwoorden] = useState<Record<string, string>>(() => bewaard?.antwoorden ?? {});
  const [projectId, setProjectId] = useState<string | null>(() => bewaard?.projectId ?? null);
  const [voorbeeldId, setVoorbeeldId] = useState<string | null>(() => bewaard?.voorbeeldId ?? null);
  const [zonderKlant, setZonderKlant] = useState(() => bewaard?.zonderKlant ?? false);
  const [alleProjecten, setAlleProjecten] = useState<ProjectRow[]>([]);
  const [undo, setUndo] = useState<{ kaartId: string; voorstelId: string; stand: Stand } | null>(null);
  const [stappen, startStappen, stopStappen] = useVoortgang();
  const gestopt = useRef(false);

  // Het gesprek blijft bewaard als het scherm dicht gaat (lib/boss/werkruimteConcept).
  useEffect(() => {
    bewaarConceptDeel(bewaarSleutel, 'gesprek', { items, draft, bestand, maten, antwoorden, projectId, voorbeeldId, zonderKlant });
  }, [bewaarSleutel, items, draft, bestand, maten, antwoorden, projectId, voorbeeldId, zonderKlant]);
  useEffect(() => { onStand({ bezig: busy, wacht: wachtOpJou(items) }); }, [busy, items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let weg = false;
    void listProjects().then(({ data }) => { if (!weg) setAlleProjecten(data); });
    return () => { weg = true; };
  }, []);
  const projecten = klantId ? alleProjecten.filter((p) => p.customer_id === klantId) : [];

  const klant = klanten.find((c) => c.id === klantId);
  const project = projecten.find((p) => p.id === projectId);
  const voorbeeld = offertes.find((o) => o.id === voorbeeldId);
  const andereOffertes = offertes.filter((o) => o.id !== offerteId);

  const push = (it: ZonderId<Item>) => setItems((l) => [...l, { id: nid(), ...it } as Item]);
  const upd = (id: string, patch: Partial<Item> | ((i: Item) => Partial<Item>)) =>
    setItems((l) => l.map((i) => (i.id === id ? ({ ...i, ...(typeof patch === 'function' ? patch(i) : patch) } as Item) : i)));

  const labels: Label[] = [];
  if (klant && !zonderKlant) labels.push({ sleutel: 'klant', soort: 'Klant', naam: klant.name || 'Klant', onWeg: () => setZonderKlant(true) });
  if (projectId) labels.push({ sleutel: 'project', soort: 'Project', naam: project?.name || '…', onWeg: () => setProjectId(null) });
  if (voorbeeldId) labels.push({ sleutel: 'offerte', soort: 'Voorbeeld', naam: voorbeeld?.nummer || '…', onWeg: () => setVoorbeeldId(null) });
  if (bestand) labels.push({ sleutel: 'bestand', soort: 'Bestand', naam: bestand.naam, onWeg: () => { setBestand(null); setMaten([]); } });
  if (maten?.length) labels.push({ sleutel: 'maten', soort: 'Maten', naam: `${maten.length} gecontroleerd`, onWeg: () => setMaten([]) });

  const vraag = async (opdracht: string, extra: Extra = {}) => {
    const ant = { ...antwoorden, ...(extra.antwoorden || {}) };
    const mtn = extra.maten || maten || [];
    gestopt.current = false;
    setBusy(true);
    startStappen([
      bestand && !mtn.length ? `${bestand.naam} lezen: maten` : 'Opdracht lezen',
      voorbeeldId ? 'Voorbeeldofferte en prijzen bekijken' : 'Prijzen zoeken in Materialen en Instellingen',
      'Groepen en regels voorbereiden',
      'Bedragen en hoeveelheden controleren',
    ]);
    const voor: Stand = { regels: stand.regels.map((r) => ({ ...r })), groepen: stand.groepen.map((g) => ({ ...g })) };
    // Nog geen klant gekozen maar wel een genoemd: die zetten we op de offerte.
    let klantVoorBoss = zonderKlant ? null : klantId || null;
    if (!klantId) {
      const genoemd = klantUitOpdracht(opdracht, klanten);
      if (genoemd) { onKlant(genoemd.id); setZonderKlant(false); klantVoorBoss = genoemd.id; }
    }
    try {
      const { resultaat, waarschuwingen } = await vraagBoss<Resultaat>('boss-offerte', {
        taak: 'offerte', opdracht, antwoorden: ant, maten: mtn, bestand,
        bronnen: { klant_id: klantVoorBoss, project_id: projectId, voorbeeld_offerte_id: voorbeeldId },
        offerte: regelsVoorBoss(stand),
      });
      if (gestopt.current) return;
      if (resultaat.soort === 'vragen') push({ t: 'vragen', vragen: resultaat.vragen, opdracht });
      else if (resultaat.soort === 'maten') push({ t: 'maten', maten: resultaat.maten, opdracht, waarschuwingen });
      else if (resultaat.soort === 'voorstel') {
        setItems((l) => l.map((i) => (i.t === 'voorstel' && i.status === 'open' ? { ...i, status: 'vervangen' } : i)));
        push({ t: 'voorstel', status: 'open', voor, resultaat, waarschuwingen, keuze: {} });
      } else push({ t: 'melding', tekst: resultaat.melding || 'Klaar.', waarschuwingen });
    } catch (e) {
      if (!gestopt.current) {
        push({ t: 'fout', tekst: `${(e as Error).message} Er is niets aan de offerte veranderd. Je opdracht staat weer in het invoerveld.`, opdracht, herhaal: extra });
        setDraft(opdracht);
      }
    } finally {
      stopStappen();
      setBusy(false);
    }
  };

  const verstuur = (tekst?: string) => {
    const tk = String(tekst ?? draft).trim();
    if (!tk || busy) return;
    push({ t: 'ik', tekst: tk });
    setDraft('');
    void vraag(tk);
  };

  const pasToe = (it: Extract<Item, { t: 'voorstel' }>) => {
    const res = pasVoorstelToe(stand, it.resultaat, { voor: it.voor, keuze: it.keuze, maakRegel, standaardPct });
    const kaartId = nid();
    setUndo({ kaartId, voorstelId: it.id, stand: { regels: stand.regels.map((r) => ({ ...r })), groepen: stand.groepen.map((g) => ({ ...g })) } });
    setStand({ regels: res.regels, groepen: res.groepen });
    upd(it.id, { status: 'toegepast' });
    const tot = totaalVan(res.regels);
    const ontbreekt = res.regels.filter((r) => (r.herkomst?.ontbreekt || []).some((x) => (x === 'aantal' ? r.aantal === '' : r.prijs === ''))).length;
    setItems((l) => [...l, {
      id: kaartId, t: 'toegepast', overgeslagen: res.overgeslagen,
      tekst: `${zin(it.resultaat.samenvatting) || 'Voorstel toegepast.'} Totaal nu ${formatEURCent(tot.incl)} incl. btw.${ontbreekt ? ` Nog ${ontbreekt} ${ontbreekt === 1 ? 'regel' : 'regels'} in te vullen.` : ''}`,
    }]);
    onToegepast(res.gewijzigd);
    const n = res.gewijzigd.length;
    wr?.meldToegepast(`${n} ${n === 1 ? 'wijziging' : 'wijzigingen'} in de offerte`);
  };
  const ongedaan = (it: Extract<Item, { t: 'toegepast' }>) => {
    if (!undo || undo.kaartId !== it.id) return;
    setStand(undo.stand);
    upd(it.id, { ongedaan: true });
    upd(undo.voorstelId, { status: 'open', voor: undo.stand });
    setUndo(null);
  };

  const bron = async (soort: 'camera' | 'foto' | 'bestand') => {
    try {
      const b = await bronVoorBoss(soort);
      if (!b) return;
      setBestand(b);
      setMaten([]);
      push({ t: 'melding', tekst: `${soort === 'bestand' ? b.naam : 'De foto'} is toegevoegd. Bij je volgende opdracht lees ik eerst de maten; die controleer jij voordat ik ermee reken.` });
    } catch (e) {
      push({ t: 'fout', titel: 'Kan dit niet lezen', tekst: `${(e as Error).message} Er is niets aan de offerte veranderd.` });
    }
  };

  const heeftRegels = stand.regels.some((r) => !isLegeRegel(r));
  const suggesties = heeftRegels ? ['Controleer of er iets ontbreekt.', 'Maak de werkzaamheden per groep duidelijker voor de klant.'] : [];
  const eersteKeer = !items.some((i) => i.t === 'ik');

  const intro = eersteKeer ? (
    <View style={{ gap: 10 }}>
      <BossBubbel tekst="Beschrijf de klus in je eigen woorden. Ik vraag wat ik niet weet en verzin geen prijzen, maten of uren. Je ziet altijd eerst een voorstel." />
      <StartKnoppen
        knoppen={[
          { titel: 'Foto maken', sub: 'Van een tekening of plattegrond', onPress: () => void bron('camera') },
          { titel: 'Bestand', sub: 'Pdf of foto uit je bestanden', onPress: () => void bron('bestand') },
          { titel: 'Eerdere offerte', sub: 'Als voorbeeld voor uren', onPress: () => push({ t: 'kies', soort: 'offerte' }) },
          { titel: 'Project', sub: klantId ? 'Van deze klant' : 'Kies eerst een klant', onPress: () => push({ t: 'kies', soort: 'project' }), uit: !klantId },
        ]}
      />
    </View>
  ) : null;

  return (
    <BossGesprek
      labels={labels}
      intro={intro}
      busy={busy}
      voortgang={stappen}
      onStop={() => { gestopt.current = true; stopStappen(); setBusy(false); push({ t: 'melding', tekst: 'Gestopt. Er is niets aan de offerte veranderd.' }); }}
      draft={draft}
      setDraft={setDraft}
      onSend={verstuur}
      suggesties={suggesties}
      placeholder={heeftRegels ? 'Vraag Boss iets aan te passen…' : 'Beschrijf de opdracht…'}
      scrollSleutel={`${items.length}-${items[items.length - 1]?.id ?? ''}`}
      plusOpties={[
        { label: 'Foto maken', sub: 'Tekening, plattegrond of de situatie', icoon: 'camera', onPress: () => void bron('camera') },
        { label: 'Foto kiezen', sub: 'Uit je fotobibliotheek', icoon: 'foto', onPress: () => void bron('foto') },
        { label: 'Bestand', sub: 'Pdf, jpg of png, tot 4 MB', icoon: 'bestand', onPress: () => void bron('bestand') },
        { label: 'Eerdere offerte', sub: 'Als voorbeeld voor uren en aantallen', icoon: 'offerte', onPress: () => push({ t: 'kies', soort: 'offerte' }) },
        ...(klantId ? [{ label: 'Project', sub: 'Van deze klant', icoon: 'project' as const, onPress: () => push({ t: 'kies', soort: 'project' }) }] : []),
      ]}
    >
      {items.map((it) => (
        <View key={it.id}>
          {it.t === 'ik' ? <IkBubbel tekst={it.tekst} /> : null}
          {it.t === 'melding' ? (
            <Kaart><KaartTekst>{it.tekst}</KaartTekst><Waarschuwingen lijst={it.waarschuwingen} /></Kaart>
          ) : null}
          {it.t === 'fout' ? (
            <Kaart soort="fout" rol="alert">
              <KaartKop titel={it.titel || 'Dit lukte niet'} icoon="fout" />
              <KaartTekst>{it.tekst}</KaartTekst>
              {it.opdracht ? (
                <Knoppen><KleineKnop label="Opnieuw proberen" variant="secundair" disabled={busy} onPress={() => { upd(it.id, { t: 'melding', tekst: 'Opnieuw geprobeerd.' }); setDraft(''); void vraag(it.opdracht!, it.herhaal); }} /></Knoppen>
              ) : null}
            </Kaart>
          ) : null}
          {it.t === 'vragen' ? (
            <VragenKaart it={it} busy={busy} onAntwoord={(nieuw, lijst) => { upd(it.id, { antwoord: lijst }); setAntwoorden((a) => ({ ...a, ...nieuw })); void vraag(it.opdracht, { antwoorden: nieuw }); }} />
          ) : null}
          {it.t === 'maten' ? (
            <MatenKaart it={it} busy={busy} onBevestig={(bevestigd) => { upd(it.id, { bevestigd }); setMaten(bevestigd); void vraag(it.opdracht, { maten: bevestigd }); }} />
          ) : null}
          {it.t === 'kies' ? (
            it.gekozen ? (
              <Kaart soort="oud"><KaartTekst>{it.soort === 'project' ? 'Project' : 'Offerte'} {it.gekozen} staat in de context.</KaartTekst></Kaart>
            ) : (
              <Kaart soort="vraag">
                <KaartKop titel={it.soort === 'project' ? 'Welk project?' : 'Welke offerte als voorbeeld?'} icoon="vraag" />
                {it.soort === 'offerte' ? <KaartTekst klein>Ik gebruik er alleen uren, aantallen en prijzen uit, en laat zien waar ze vandaan komen.</KaartTekst> : null}
                {(it.soort === 'project' ? projecten.length : andereOffertes.length) === 0 ? (
                  <KaartTekst>{it.soort === 'project' ? 'Geen projecten gevonden voor deze klant.' : 'Geen offertes gevonden.'}</KaartTekst>
                ) : (
                  <KiesLijst
                    items={it.soort === 'project'
                      ? projecten.map((p) => ({ id: p.id, titel: p.name || 'Project', sub: p.status || undefined }))
                      : andereOffertes.slice(0, 15).map((o) => ({ id: o.id, titel: o.nummer || 'Offerte', sub: [o.omschrijving, o.customer?.name].filter(Boolean).join(' · ') }))}
                    onKies={(id) => {
                      if (it.soort === 'project') { setProjectId(id); upd(it.id, { gekozen: projecten.find((p) => p.id === id)?.name || '' }); }
                      else { setVoorbeeldId(id); upd(it.id, { gekozen: offertes.find((o) => o.id === id)?.nummer || '' }); }
                    }}
                  />
                )}
              </Kaart>
            )
          ) : null}
          {it.t === 'voorstel' ? (
            <VoorstelKaart
              it={it}
              onToepassen={() => pasToe(it)}
              onKeuze={(i, aan) => upd(it.id, (k) => ({ keuze: { ...(k as Extract<Item, { t: 'voorstel' }>).keuze, [i]: aan } }))}
              onAanpassen={() => setDraft('Pas het voorstel aan: ')}
              onNegeren={() => upd(it.id, { status: 'genegeerd' })}
              onDetails={() => upd(it.id, { details: true })}
              maakRegel={maakRegel}
              standaardPct={standaardPct}
            />
          ) : null}
          {it.t === 'toegepast' ? (
            it.ongedaan ? (
              <Kaart><KaartTekst>Teruggedraaid. De offerte staat weer zoals hij was; het voorstel kun je opnieuw toepassen.</KaartTekst></Kaart>
            ) : (
              <Kaart soort="klaar" rol="status">
                <KaartKop titel="Toegepast in de offerte" icoon="ok" />
                <KaartTekst>{it.tekst}</KaartTekst>
                {it.overgeslagen.length ? <Waarschuwingen lijst={it.overgeslagen} /> : null}
                <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                  <Lock size={12} color={t.muted} /><KaartTekst klein>Nog niets opgeslagen of verstuurd.</KaartTekst>
                </View>
                <Knoppen>
                  {undo?.kaartId === it.id ? <KleineKnop label="Terugdraaien" variant="secundair" icoon={<Undo2 size={14} color={t.ink} />} onPress={() => ongedaan(it)} /> : null}
                  {wr && !wr.naastElkaar ? <KleineKnop label="Bekijk document" variant="stil" onPress={wr.toonDocument} /> : null}
                </Knoppen>
              </Kaart>
            )
          ) : null}
        </View>
      ))}
    </BossGesprek>
  );
}

// ── Startknoppen ─────────────────────────────────────────────────────────────
export function StartKnoppen({ knoppen }: { knoppen: { titel: string; sub: string; onPress: () => void; uit?: boolean }[] }) {
  const { colors: t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {knoppen.map((k) => (
        <Pressable
          key={k.titel}
          onPress={k.onPress}
          disabled={k.uit}
          accessibilityRole="button"
          style={({ pressed }) => [{ flexBasis: '47%', flexGrow: 1, backgroundColor: t.card, borderRadius: 16, padding: 12, gap: 3 }, k.uit && { opacity: 0.5 }, pressed && { backgroundColor: t.green50 }]}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.ink }}>{k.titel}</Text>
          <Text style={{ fontSize: 12.5, color: t.muted }}>{k.sub}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Vragen: alles wat ontbreekt in één kaart ─────────────────────────────────
function VragenKaart({ it, busy, onAntwoord }: {
  it: Extract<Item, { t: 'vragen' }>;
  busy: boolean;
  onAntwoord: (antwoorden: Record<string, string>, lijst: { sleutel: string; vraag: string; label: string }[]) => void;
}) {
  const { colors: t } = useTheme();
  const [w, setW] = useState<Record<string, { keuze: string; vrij: string }>>(() =>
    Object.fromEntries(it.vragen.map((v) => [v.sleutel, { keuze: v.opties?.[0]?.waarde ?? (v.vrije_invoer !== 'geen' ? '__vrij' : '__onbekend'), vrij: '' }])),
  );
  if (it.antwoord) {
    return (
      <Kaart soort="oud">
        <KaartKop titel={it.vragen.length === 1 ? it.vragen[0]!.tekst : `${it.vragen.length} vragen beantwoord`} icoon="vraag" />
        {it.antwoord.map((a) => <KaartTekst key={a.sleutel} klein>{a.vraag}: {a.label}</KaartTekst>)}
      </Kaart>
    );
  }
  const zet = (s: string, patch: Partial<{ keuze: string; vrij: string }>) => setW((x) => ({ ...x, [s]: { ...x[s]!, ...patch } }));
  const verder = () => {
    const antwoorden: Record<string, string> = {};
    const lijst: { sleutel: string; vraag: string; label: string }[] = [];
    for (const v of it.vragen) {
      const a = w[v.sleutel]!;
      let waarde: string;
      let label: string;
      if (a.keuze === '__vrij') { waarde = a.vrij.trim(); label = waarde ? `${waarde}${v.eenheid ? ` ${v.eenheid}` : ''}` : 'onbekend'; }
      else if (a.keuze === '__onbekend') { waarde = 'onbekend'; label = 'weet ik niet, vul ik zelf in'; }
      else { waarde = a.keuze; label = v.opties?.find((o) => o.waarde === a.keuze)?.label || a.keuze; }
      antwoorden[v.sleutel] = waarde || 'onbekend';
      lijst.push({ sleutel: v.sleutel, vraag: v.tekst, label });
    }
    onAntwoord(antwoorden, lijst);
  };
  return (
    <Kaart soort="vraag">
      <KaartKop titel={it.vragen.length === 1 ? 'Nog één ding voor ik kan rekenen' : `Nog ${it.vragen.length} dingen voor ik kan rekenen`} icoon="vraag" />
      <KaartTekst klein>Weet je iets niet, kies dan ‘Weet ik niet’. Die regel komt zonder hoeveelheid of prijs in de offerte en verschijnt bij Nog nodig.</KaartTekst>
      {it.vragen.map((v) => (
        <View key={v.sleutel} style={{ gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.ink }}>{v.tekst}</Text>
          {v.toelichting ? <KaartTekst klein>{v.toelichting}</KaartTekst> : null}
          <Opties
            opties={[
              ...(v.opties ?? []),
              ...(v.vrije_invoer !== 'geen' ? [{ waarde: '__vrij', label: v.vrije_invoer === 'bedrag' ? 'Bedrag' : v.vrije_invoer === 'getal' ? (v.opties?.length ? 'Ander aantal' : 'Aantal') : 'Zelf beschrijven' }] : []),
              { waarde: '__onbekend', label: 'Weet ik niet' },
            ]}
            gekozen={w[v.sleutel]!.keuze}
            onKies={(k) => zet(v.sleutel, { keuze: k })}
          />
          {w[v.sleutel]!.keuze === '__vrij' ? (
            <TextInput
              value={w[v.sleutel]!.vrij}
              onChangeText={(x) => zet(v.sleutel, { vrij: x })}
              placeholder={v.vrije_invoer === 'bedrag' ? 'Bijv. 54,00' : v.vrije_invoer === 'getal' ? `Bijv. 2,50${v.eenheid ? ` ${v.eenheid}` : ''}` : ''}
              placeholderTextColor={t.muted2}
              keyboardType={v.vrije_invoer === 'tekst' ? 'default' : 'decimal-pad'}
              accessibilityLabel={v.tekst}
              style={{ height: 42, borderRadius: 12, backgroundColor: t.bgAlt, paddingHorizontal: 12, fontSize: 15, color: t.ink }}
            />
          ) : null}
        </View>
      ))}
      <Knoppen><KleineKnop label="Verder" disabled={busy} onPress={verder} /></Knoppen>
    </Kaart>
  );
}

// ── Maten uit een foto of bestand: eerst controleren ────────────────────────
function MatenKaart({ it, busy, onBevestig }: {
  it: Extract<Item, { t: 'maten' }>;
  busy: boolean;
  onBevestig: (bevestigd: { naam: string; eenheid: string; waarde: number }[]) => void;
}) {
  const { colors: t } = useTheme();
  const [rijen, setRijen] = useState(() => it.maten.map((m) => ({ ...m, invoer: m.waarde == null ? '' : String(m.waarde).replace('.', ',') })));
  if (it.bevestigd) {
    return (
      <Kaart soort="oud">
        <KaartKop titel="Maten gecontroleerd" icoon="ok" />
        <KaartTekst klein>{it.bevestigd.map((m) => `${m.naam} ${getalNl(m.waarde)} ${m.eenheid}`).join(' · ')}</KaartTekst>
      </Kaart>
    );
  }
  const soortLabel = { vermeld: 'Staat op het bestand', berekend: 'Berekend', ontbreekt: 'Niet te lezen' } as const;
  return (
    <Kaart soort="vraag">
      <KaartKop titel="Kloppen deze maten?" icoon="vraag" />
      <KaartTekst klein>Pas aan wat niet klopt en vul aan wat ontbreekt. Ik reken alleen met maten die je hier bevestigt.</KaartTekst>
      {rijen.map((m, i) => (
        <View key={`${m.naam}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.ink }}>{m.naam}</Text>
            <Text style={{ fontSize: 12, color: m.soort === 'ontbreekt' ? t.statusWarnFg : t.muted }}>{soortLabel[m.soort]}{m.formule ? `: ${m.formule}` : ''}</Text>
          </View>
          <TextInput
            value={m.invoer}
            onChangeText={(x) => setRijen((r) => r.map((y, j) => (j === i ? { ...y, invoer: x } : y)))}
            placeholder="?"
            placeholderTextColor={t.muted2}
            keyboardType="decimal-pad"
            accessibilityLabel={`${m.naam} in ${m.eenheid}`}
            style={{ width: 84, height: 40, borderRadius: 12, backgroundColor: t.bgAlt, paddingHorizontal: 10, fontSize: 15, color: t.ink, textAlign: 'right' }}
          />
          <Text style={{ width: 28, fontSize: 13, color: t.muted }}>{m.eenheid}</Text>
        </View>
      ))}
      <Knoppen>
        <KleineKnop
          label="Maten kloppen, ga verder"
          icoon={<Check size={14} color="#0D0D0D" strokeWidth={2.6} />}
          disabled={busy}
          onPress={() => onBevestig(
            rijen
              .map((m) => ({ naam: m.naam, eenheid: m.eenheid, waarde: m.invoer.trim() === '' ? NaN : Number(m.invoer.replace(/\./g, '').replace(',', '.')) }))
              .filter((m) => Number.isFinite(m.waarde)),
          )}
        />
      </Knoppen>
    </Kaart>
  );
}

// ── Het voorstel ─────────────────────────────────────────────────────────────
const BRON: Record<string, string> = {
  opdracht: 'je opdracht', antwoord: 'jouw antwoord', bestand: 'gecontroleerde maat', huidig: 'stond al zo',
  instellingen: 'Instellingen', materiaal: 'Materialen', eigen_eenheid: 'Eigen eenheden',
};
const bronTekst = (x?: unknown) => {
  const b = x as { soort?: string; formule?: string; offerte?: string } | null | undefined;
  if (!b?.soort) return null;
  if (b.soort === 'berekening' && b.formule) return b.formule;
  if (b.soort === 'offerte') return b.offerte || 'voorbeeldofferte';
  return BRON[b.soort] ?? 'geen bron';
};
const bedragVan = (b: VoorstelRegel) => (b.aantal == null || b.eenheidsprijs == null ? '—' : formatEURCent(Math.round(b.aantal * b.eenheidsprijs * 100) / 100));

function VoorstelKaart({ it, onToepassen, onKeuze, onAanpassen, onNegeren, onDetails, maakRegel, standaardPct }: {
  it: Extract<Item, { t: 'voorstel' }>;
  onToepassen: () => void;
  onKeuze: (i: number, aan: boolean) => void;
  onAanpassen: () => void;
  onNegeren: () => void;
  onDetails: () => void;
  maakRegel: () => Regel;
  standaardPct: number;
}) {
  const { colors: t } = useTheme();
  const r = it.resultaat;
  const voorRegels = new Map(it.voor.regels.map((x) => [x.id, x]));
  const groepNaam = (id?: string | null) => r.groepen.find((g) => (g.ref || g.sleutel) === id)?.naam || it.voor.groepen.find((g) => g.id === id)?.naam || null;
  const opgegeven = r.regels.map((b, i) => ({ b, i })).filter((x) => !x.b.aanvulling);
  const aanvullingen = r.regels.map((b, i) => ({ b, i })).filter((x) => x.b.aanvulling);
  const na = useMemo(() => pasVoorstelToe(it.voor, r, { voor: it.voor, keuze: it.keuze, maakRegel, standaardPct }), [it, r, maakRegel, standaardPct]);
  const tVoor = totaalVan(it.voor.regels);
  const tNa = totaalVan(na.regels);
  const n = opgegeven.length + aanvullingen.filter((x) => it.keuze[x.i]).length + (r.verwijderen?.length || 0);

  if (it.status === 'vervangen' || it.status === 'genegeerd') {
    return <Kaart soort="oud"><KaartKop titel={r.samenvatting || 'Voorstel'} badge={{ tekst: it.status === 'vervangen' ? 'Vervangen' : 'Niet gebruikt', toon: 'grijs' }} /></Kaart>;
  }
  const open = it.status === 'open';
  // Toegepast: het resultaat staat in het document; hier alleen de kop.
  if (!open && !it.details) {
    return (
      <Kaart soort="oud">
        <KaartKop titel={r.samenvatting || 'Voorstel'} badge={{ tekst: 'Toegepast', toon: 'ok' }} />
        <Pressable onPress={onDetails} accessibilityRole="button" hitSlop={6}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.green700 }}>{n} {n === 1 ? 'wijziging' : 'wijzigingen'} tonen</Text>
        </Pressable>
      </Kaart>
    );
  }
  // Per groep, met de nieuwe groepen als kop.
  const perGroep = new Map<string, { b: VoorstelRegel; i: number }[]>();
  for (const x of opgegeven) {
    const k = x.b.groep || '';
    if (!perGroep.has(k)) perGroep.set(k, []);
    perGroep.get(k)!.push(x);
  }
  const regelsInVolgorde = [...perGroep.entries()].flatMap(([k, lijst]) => [{ kop: k } as const, ...lijst.map((x) => ({ x }))]);

  return (
    <Kaart soort="ai">
      <KaartKop titel={r.samenvatting || 'Voorstel voor de offerte'} badge={open ? { tekst: 'Ter controle', toon: 'ctrl' } : { tekst: 'Toegepast', toon: 'ok' }} />
      {open ? <KaartTekst klein>Pas na Toepassen verandert de offerte.</KaartTekst> : null}
      {r.groepen.filter((g) => g.ref).map((g) => (
        <WijzigRegel key={g.ref!} teken="~" titel={`Groep ${g.naam}`} sub={g.werkzaamheden || undefined} />
      ))}
      <Inklap
        items={regelsInVolgorde}
        render={(rij, idx) => {
          if ('kop' in rij) {
            const naam = groepNaam(rij.kop);
            if (!naam) return <View key={`k${idx}`} />;
            const nieuw = r.groepen.some((g) => g.sleutel === rij.kop && !g.ref);
            const werk = r.groepen.find((g) => g.sleutel === rij.kop)?.werkzaamheden;
            return (
              <View key={`k${idx}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                <Layers size={14} color={t.ink2} />
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.ink }}>{naam}</Text>
                {nieuw ? <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.green700 }}>nieuwe groep</Text> : null}
                {werk ? <Text style={{ flex: 1, fontSize: 12, color: t.muted }} numberOfLines={1}>· {werk}</Text> : null}
              </View>
            );
          }
          const { b } = rij.x;
          const oud = b.ref ? voorRegels.get(b.ref) : undefined;
          const prijs = b.eenheidsprijs == null ? 'prijs ontbreekt' : formatEURCent(b.eenheidsprijs);
          const aantal = b.aantal == null ? 'hoeveelheid ontbreekt' : `${getalNl(b.aantal)} ${b.eenheid || ''}`.trim();
          const bronnen = [bronTekst(b.herkomst?.aantal) && `Hoev.: ${bronTekst(b.herkomst?.aantal)}`, bronTekst(b.herkomst?.prijs) && `Prijs: ${bronTekst(b.herkomst?.prijs)}`].filter(Boolean).join(' · ');
          return (
            <WijzigRegel
              key={`r${idx}`}
              teken={oud ? '~' : '+'}
              titel={b.omschrijving}
              oudTitel={oud && oud.omschrijving !== b.omschrijving ? oud.omschrijving : undefined}
              sub={`${aantal} × ${prijs}${bronnen ? ` · ${bronnen}` : ''}`}
              bedrag={bedragVan(b)}
            />
          );
        }}
      />
      {r.verwijderen?.map((ref) => (
        <WijzigRegel key={ref} teken="−" titel={voorRegels.get(ref)?.omschrijving || 'Regel'} />
      ))}
      {aanvullingen.length ? (
        <View style={{ gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#F5C26B', borderRadius: 12, padding: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.statusWarnFg }}>Voorgestelde aanvullingen</Text>
          <KaartTekst klein>Deze staan niet in je opdracht. Ze gaan alleen mee als je ze aanvinkt.</KaartTekst>
          {aanvullingen.map(({ b, i }) => (
            <Pressable
              key={i}
              disabled={!open}
              onPress={() => onKeuze(i, !it.keuze[i])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(it.keuze[i]), disabled: !open }}
              aria-checked={Boolean(it.keuze[i])}
              style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: it.keuze[i] ? t.green : t.lineStrong, backgroundColor: it.keuze[i] ? t.green : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                {it.keuze[i] ? <Check size={13} color="#0D0D0D" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.ink }}>{b.omschrijving}</Text>
                <Text style={{ fontSize: 12, color: t.muted }}>{b.aanvulling!.reden}{groepNaam(b.groep) ? ` · ${groepNaam(b.groep)}` : ''}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: it.keuze[i] ? t.ink : t.muted2, textDecorationLine: it.keuze[i] ? 'none' : 'line-through' }}>{bedragVan(b)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {r.dubbel?.length || r.beschermd?.length ? (
        <View style={{ gap: 4 }}>
          {r.dubbel?.map((d, i) => <KaartTekst key={`d${i}`} klein>✓ {d.tekst}</KaartTekst>)}
          {r.beschermd?.map((d, i) => <KaartTekst key={`b${i}`} klein>🔒 {d.tekst}</KaartTekst>)}
        </View>
      ) : null}
      <TotaalRegels
        excl={formatEURCent(tNa.excl)}
        incl={formatEURCent(tNa.incl)}
        voorExcl={tVoor.excl !== tNa.excl && tVoor.excl > 0 ? formatEURCent(tVoor.excl) : null}
        voorIncl={tVoor.incl !== tNa.incl && tVoor.incl > 0 ? formatEURCent(tVoor.incl) : null}
      />
      <Waarschuwingen lijst={it.waarschuwingen} />
      <Uitleg lijst={r.onderbouwing} />
      {open ? (
        <Knoppen>
          <KleineKnop label={`Toepassen${n ? ` (${n})` : ''}`} icoon={<Check size={14} color="#0D0D0D" strokeWidth={2.6} />} onPress={onToepassen} />
          <KleineKnop label="Aanpassen" variant="secundair" onPress={onAanpassen} />
          <KleineKnop label="Negeren" variant="stil" onPress={onNegeren} />
        </Knoppen>
      ) : null}
    </Kaart>
  );
}

/** Voor de factuur: hetzelfde bedrag als in de kaart, één regel. */
export const regelBedragTekst = (r: Regel) => formatEURCent(regelprijs(r));
