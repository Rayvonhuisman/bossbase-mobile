/**
 * Boss in de factuur: het gesprek in de werkruimte.
 *
 * Overgenomen uit het dashboard (`BossFactuurPaneel` in `BossAssistent.jsx`).
 * Boss maakt factuurregels uit een werkbon of offerte, of past ze aan. De
 * gegevens (werkbon, uren, materialen, offerte, instellingen) haalt de edge
 * function `boss-factuur` zelf op en controleert de prijzen. Er verandert pas
 * iets na "Wijzigingen toepassen", en dat is terug te draaien.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Lock, Undo2 } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import { berekenTotalen, veldNaarNummer, type Regel } from '@/lib/regels';
import {
  aantalZonderPrijs, factuurRegelsVoorBoss, isLegeFactuurRegel, pasFactuurVoorstelToe, voorstelTotaal, type FactuurVoorstelRegel,
} from '@/lib/boss/factuurRegels';
import { nid, wachtOpJou, zin } from '@/lib/boss/gesprek';
import { bewaarConceptDeel } from '@/lib/boss/werkruimteConcept';
import { vraagBoss, type BossBestand } from '@/services/bossDocumentService';
import { listWorkOrders, type Werkbon } from '@/services/workOrderService';
import type { OfferteRow } from '@/services/offerteService';
import {
  BossBubbel, BossGesprek, IkBubbel, Inklap, Kaart, KaartKop, KaartTekst, KiesLijst, KleineKnop, Knoppen, Opties,
  TotaalRegels, Uitleg, Waarschuwingen, WijzigRegel, type Label,
} from './BossGesprek';
import { bronVoorBoss, useVoortgang } from './gedeeld';
import { StartKnoppen } from './OfferteGesprek';
import { useWerkruimte } from './Werkruimte';

type Vraag = { sleutel?: string; tekst: string; toelichting?: string; opties?: { label: string; waarde: string }[]; vrije_invoer: 'geen' | 'tekst' | 'getal' | 'bedrag' };
type Resultaat =
  | { soort: 'vraag'; vraag: Vraag }
  | { soort: 'voorstel'; regels: FactuurVoorstelRegel[]; samenvatting?: string; onderbouwing?: string[] }
  | { soort: 'melding'; melding?: string };

type Item =
  | { id: string; t: 'ik'; tekst: string }
  | { id: string; t: 'melding'; tekst: string }
  | { id: string; t: 'fout'; tekst: string; titel?: string; opdracht?: string; antwoorden?: Record<string, string> }
  | { id: string; t: 'vraag'; vraag: Vraag; opdracht: string; antwoord?: { waarde: string; label: string } }
  | { id: string; t: 'kies'; soort: 'werkbon' | 'offerte'; gekozen?: string }
  | { id: string; t: 'voorstel'; status: 'open' | 'toegepast' | 'vervangen' | 'genegeerd'; voor: Regel[]; regels: FactuurVoorstelRegel[]; samenvatting?: string; onderbouwing?: string[]; waarschuwingen: string[]; details?: boolean }
  | { id: string; t: 'toegepast'; tekst: string; ongedaan?: boolean };
type ZonderId<T> = T extends unknown ? Omit<T, 'id'> : never;

export type FactuurGesprekBewaard = {
  items: Item[]; draft: string; werkbonIds: string[]; offerteId: string | null; bestand: BossBestand | null;
  zonderKlant: boolean; antwoorden: Record<string, string>;
};

type Props = {
  klantId: string | null;
  projectId: string | null;
  klanten: { id: string; name: string | null }[];
  offertes: OfferteRow[];
  regels: Regel[];
  setRegels: (r: Regel[]) => void;
  maakRegel: () => Regel;
  standaardPct: number;
  onToegepast: (ids: string[]) => void;
  bewaard: FactuurGesprekBewaard | null;
  bewaarSleutel: string | null;
  onStand: (s: { bezig: boolean; wacht: number }) => void;
};

const wbNaam = (w?: Werkbon) => (w ? w.nummer || w.titel || 'Werkbon' : '');
const datum = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('nl-NL') : '');

export function FactuurGesprek({
  klantId, projectId, klanten, offertes, regels, setRegels, maakRegel, standaardPct, onToegepast, bewaard, bewaarSleutel, onStand,
}: Props) {
  const { colors: t } = useTheme();
  const wr = useWerkruimte();
  const [items, setItems] = useState<Item[]>(() => bewaard?.items ?? []);
  const [draft, setDraft] = useState(() => bewaard?.draft ?? '');
  const [busy, setBusy] = useState(false);
  const [werkbonIds, setWerkbonIds] = useState<string[]>(() => bewaard?.werkbonIds ?? []);
  const [offerteId, setOfferteId] = useState<string | null>(() => bewaard?.offerteId ?? null);
  const [bestand, setBestand] = useState<BossBestand | null>(() => bewaard?.bestand ?? null);
  const [zonderKlant, setZonderKlant] = useState(() => bewaard?.zonderKlant ?? false);
  const [antwoorden, setAntwoorden] = useState<Record<string, string>>(() => bewaard?.antwoorden ?? {});
  const [werkbonnen, setWerkbonnen] = useState<Werkbon[]>([]);
  const [undo, setUndo] = useState<{ kaartId: string; voorstelId: string; regels: Regel[] } | null>(null);
  const [stappen, startStappen, stopStappen] = useVoortgang();
  const gestopt = useRef(false);

  useEffect(() => {
    bewaarConceptDeel(bewaarSleutel, 'gesprek', { items, draft, werkbonIds, offerteId, bestand, zonderKlant, antwoorden });
  }, [bewaarSleutel, items, draft, werkbonIds, offerteId, bestand, zonderKlant, antwoorden]);
  useEffect(() => { onStand({ bezig: busy, wacht: wachtOpJou(items) }); }, [busy, items]); // eslint-disable-line react-hooks/exhaustive-deps
  // Werkbonnen van deze klant (of alle, zonder klant), nieuwste eerst.
  useEffect(() => {
    let weg = false;
    void listWorkOrders(klantId ? { customerId: klantId } : {}).then(({ data }) => {
      if (!weg) setWerkbonnen([...data].sort((a, b) => String(b.gepland_op ?? b.created_at).localeCompare(String(a.gepland_op ?? a.created_at))));
    });
    return () => { weg = true; };
  }, [klantId]);

  const klant = klanten.find((c) => c.id === klantId);
  const offertesKlant = offertes.filter((o) => !klantId || o.customer_id === klantId);
  const push = (it: ZonderId<Item>) => setItems((l) => [...l, { id: nid(), ...it } as Item]);
  const upd = (id: string, patch: Partial<Item>) => setItems((l) => l.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)));

  const labels: Label[] = [];
  if (klant && !zonderKlant) labels.push({ sleutel: 'klant', soort: 'Klant', naam: klant.name || 'Klant', onWeg: () => setZonderKlant(true) });
  werkbonIds.forEach((id) => labels.push({ sleutel: `wb${id}`, soort: 'Werkbon', naam: wbNaam(werkbonnen.find((w) => w.id === id)) || '…', onWeg: () => setWerkbonIds((x) => x.filter((y) => y !== id)) }));
  if (offerteId) labels.push({ sleutel: 'offerte', soort: 'Offerte', naam: offertes.find((o) => o.id === offerteId)?.nummer || '…', onWeg: () => setOfferteId(null) });
  if (bestand) labels.push({ sleutel: 'bestand', soort: 'Bestand', naam: bestand.naam, onWeg: () => setBestand(null) });

  const vraag = async (opdracht: string, extraAntwoorden?: Record<string, string>) => {
    const ant = { ...antwoorden, ...(extraAntwoorden || {}) };
    gestopt.current = false;
    setBusy(true);
    startStappen([werkbonIds.length ? 'Werkbon bekijken' : offerteId ? 'Offerte bekijken' : 'Factuur lezen', 'Factuurregels voorbereiden', 'Bedragen controleren']);
    const voor = regels.map((r) => ({ ...r }));
    try {
      const { resultaat, waarschuwingen } = await vraagBoss<Resultaat>('boss-factuur', {
        taak: 'factuur', opdracht, antwoorden: ant, bestand,
        bronnen: { klant_id: zonderKlant ? null : klantId || null, project_id: projectId || null, werkbon_ids: werkbonIds, offerte_id: offerteId },
        factuur: { regels: factuurRegelsVoorBoss(regels) },
      });
      if (gestopt.current) return;
      if (resultaat.soort === 'vraag') push({ t: 'vraag', vraag: resultaat.vraag, opdracht });
      else if (resultaat.soort === 'voorstel') {
        setItems((l) => l.map((i) => (i.t === 'voorstel' && i.status === 'open' ? { ...i, status: 'vervangen' } : i)));
        push({ t: 'voorstel', status: 'open', voor, regels: resultaat.regels, samenvatting: resultaat.samenvatting, onderbouwing: resultaat.onderbouwing, waarschuwingen });
      } else push({ t: 'melding', tekst: resultaat.melding || 'Klaar.' });
    } catch (e) {
      if (!gestopt.current) {
        push({ t: 'fout', tekst: `${(e as Error).message} Er is niets aangepast. Je opdracht staat weer in het invoerveld.`, opdracht, antwoorden: ant });
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
    const res = pasFactuurVoorstelToe(regels, it.regels, { voor: it.voor, maakRegel, standaardPct });
    const kaartId = nid();
    setUndo({ kaartId, voorstelId: it.id, regels: regels.map((r) => ({ ...r })) });
    setRegels(res.regels);
    upd(it.id, { status: 'toegepast' });
    const tot = berekenTotalen(res.regels);
    const nieuwAantal = it.regels.filter((b) => !b.ref).length;
    const ontbreekt = aantalZonderPrijs(res.regels);
    push({
      t: 'toegepast',
      tekst: `${zin(it.samenvatting) || 'Voorstel toegepast.'}${nieuwAantal ? ` ${nieuwAantal} ${nieuwAantal === 1 ? 'regel' : 'regels'} toegevoegd.` : ''} Totaal nu ${formatEURCent(tot.incl)} incl. btw.${ontbreekt ? ` Nog ${ontbreekt} ${ontbreekt === 1 ? 'regel' : 'regels'} zonder prijs.` : ''}`,
    });
    // De ids van de nieuwe en gewijzigde regels, voor de groene rand.
    setTimeout(() => onToegepast(res.gewijzigd), 0);
    wr?.meldToegepast(`${res.gewijzigd.length} ${res.gewijzigd.length === 1 ? 'regel' : 'regels'} in de factuur`);
    void kaartId;
  };
  const ongedaan = (it: Extract<Item, { t: 'toegepast' }>) => {
    if (!undo) return;
    setRegels(undo.regels);
    upd(it.id, { ongedaan: true });
    upd(undo.voorstelId, { status: 'open', voor: undo.regels });
    setUndo(null);
  };

  const bron = async (soort: 'camera' | 'foto' | 'bestand') => {
    try {
      const b = await bronVoorBoss(soort);
      if (!b) return;
      setBestand(b);
      push({ t: 'melding', tekst: `${soort === 'bestand' ? b.naam : 'De foto'} is toegevoegd. Boss leest het bij je volgende opdracht. Prijzen uit een bestand krijgen een waarschuwing: controleer ze.` });
    } catch (e) {
      push({ t: 'fout', titel: 'Kan dit niet lezen', tekst: `${(e as Error).message} Er is niets aan de factuur veranderd.` });
    }
  };

  const heeftRegels = regels.some((r) => !isLegeFactuurRegel(r));
  const suggesties = heeftRegels
    ? ['Maak de omschrijvingen duidelijker voor de klant.', 'Voeg twee uur meerwerk toe.', 'Splits arbeid en materialen op.']
    : werkbonIds.length || offerteId ? ['Maak de factuurregels uit de gekozen bronnen.'] : [];
  const eersteKeer = !items.some((i) => i.t === 'ik');
  const laatsteToegepast = [...items].reverse().find((i) => i.t === 'toegepast')?.id;

  const intro = eersteKeer ? (
    <View style={{ gap: 10 }}>
      <BossBubbel tekst="Waar komt deze factuur vandaan? Je ziet altijd eerst een voorstel. Ik verzin geen tarieven of werk." />
      <StartKnoppen
        knoppen={[
          { titel: 'Werkbon', sub: 'Uren, materialen, meerwerk', onPress: () => push({ t: 'kies', soort: 'werkbon' }) },
          { titel: 'Offerte', sub: klantId ? 'Afgesproken bedragen' : 'Kies eerst een klant', onPress: () => push({ t: 'kies', soort: 'offerte' }), uit: !klantId },
          { titel: 'Zelf beschrijven', sub: 'In je eigen woorden', onPress: () => setDraft('Ik heb ') },
          { titel: 'Foto of bestand', sub: 'Pakbon, bon of foto', onPress: () => void bron('camera') },
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
      onStop={() => { gestopt.current = true; stopStappen(); setBusy(false); push({ t: 'melding', tekst: 'Gestopt. Er is niets aangepast.' }); }}
      draft={draft}
      setDraft={setDraft}
      onSend={verstuur}
      suggesties={suggesties}
      placeholder="Vraag Boss iets over deze factuur…"
      scrollSleutel={`${items.length}-${items[items.length - 1]?.id ?? ''}`}
      plusOpties={[
        { label: 'Werkbon', sub: 'Uren, materialen, meerwerk', icoon: 'werkbon', onPress: () => push({ t: 'kies', soort: 'werkbon' }) },
        ...(klantId ? [{ label: 'Offerte', sub: 'Afgesproken bedragen', icoon: 'offerte' as const, onPress: () => push({ t: 'kies', soort: 'offerte' }) }] : []),
        { label: 'Foto maken', sub: 'Pakbon of bon', icoon: 'camera', onPress: () => void bron('camera') },
        { label: 'Bestand', sub: 'Pdf, jpg of png, tot 4 MB', icoon: 'bestand', onPress: () => void bron('bestand') },
      ]}
    >
      {items.map((it) => (
        <View key={it.id}>
          {it.t === 'ik' ? <IkBubbel tekst={it.tekst} /> : null}
          {it.t === 'melding' ? <Kaart><KaartTekst>{it.tekst}</KaartTekst></Kaart> : null}
          {it.t === 'fout' ? (
            <Kaart soort="fout" rol="alert">
              <KaartKop titel={it.titel || 'Dit lukte niet'} icoon="fout" />
              <KaartTekst>{it.tekst}</KaartTekst>
              {it.opdracht ? <Knoppen><KleineKnop label="Opnieuw proberen" variant="secundair" disabled={busy} onPress={() => { upd(it.id, { t: 'melding', tekst: 'Opnieuw geprobeerd.' } as Partial<Item>); setDraft(''); void vraag(it.opdracht!, it.antwoorden); }} /></Knoppen> : null}
            </Kaart>
          ) : null}
          {it.t === 'vraag' ? (
            <VraagKaart it={it} onAntwoord={(a) => {
              upd(it.id, { antwoord: a } as Partial<Item>);
              const sleutel = it.vraag.sleutel || 'antwoord';
              setAntwoorden((x) => ({ ...x, [sleutel]: a.waarde }));
              void vraag(it.opdracht, { [sleutel]: a.waarde });
            }} />
          ) : null}
          {it.t === 'kies' ? (
            it.gekozen ? (
              <Kaart soort="oud"><KaartTekst>{it.soort === 'werkbon' ? 'Werkbon' : 'Offerte'} {it.gekozen} staat in de context. Vraag me de factuurregels te maken.</KaartTekst></Kaart>
            ) : (
              <Kaart soort="vraag">
                <KaartKop titel={`Welke ${it.soort} wil je gebruiken?`} icoon="vraag" />
                {(it.soort === 'werkbon' ? werkbonnen.length : offertesKlant.length) === 0 ? (
                  <KaartTekst>{it.soort === 'werkbon' ? 'Geen werkbonnen gevonden' : 'Geen offertes gevonden'}{klant ? ` voor ${klant.name}` : ''}.</KaartTekst>
                ) : (
                  <KiesLijst
                    items={it.soort === 'werkbon'
                      ? werkbonnen.slice(0, 12).map((w) => ({ id: w.id, titel: wbNaam(w), sub: [w.titel, datum(w.gepland_op)].filter(Boolean).join(' · ') }))
                      : offertesKlant.slice(0, 12).map((o) => ({ id: o.id, titel: o.nummer || 'Offerte', sub: [o.omschrijving, o.status].filter(Boolean).join(' · ') }))}
                    onKies={(id) => {
                      if (it.soort === 'werkbon') {
                        const w = werkbonnen.find((x) => x.id === id);
                        setWerkbonIds([id]);
                        upd(it.id, { gekozen: wbNaam(w) } as Partial<Item>);
                        setDraft(`Maak de factuurregels uit werkbon ${wbNaam(w)}. Gebruik de uren en materialen en neem het meerwerk mee.`);
                      } else {
                        const o = offertes.find((x) => x.id === id);
                        setOfferteId(id);
                        upd(it.id, { gekozen: o?.nummer || '' } as Partial<Item>);
                        setDraft(`Maak de factuurregels uit offerte ${o?.nummer || ''}.`);
                      }
                    }}
                  />
                )}
              </Kaart>
            )
          ) : null}
          {it.t === 'voorstel' ? (
            <VoorstelKaart
              it={it}
              standaardPct={standaardPct}
              onToepassen={() => pasToe(it)}
              onAanpassen={() => setDraft('Pas het voorstel aan: ')}
              onNegeren={() => upd(it.id, { status: 'genegeerd' } as Partial<Item>)}
              onDetails={() => upd(it.id, { details: true } as Partial<Item>)}
            />
          ) : null}
          {it.t === 'toegepast' ? (
            it.ongedaan ? (
              <Kaart><KaartTekst>Ongedaan gemaakt. De factuur staat weer zoals hij was; het voorstel kun je opnieuw toepassen.</KaartTekst></Kaart>
            ) : (
              <Kaart soort="klaar" rol="status">
                <KaartKop titel="Toegepast in de factuur" icoon="ok" />
                <KaartTekst>{it.tekst}</KaartTekst>
                <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><Lock size={12} color={t.muted} /><KaartTekst klein>Nog niets opgeslagen of verstuurd.</KaartTekst></View>
                <Knoppen>
                  {undo && laatsteToegepast === it.id ? <KleineKnop label="Ongedaan maken" variant="secundair" icoon={<Undo2 size={14} color={t.ink} />} onPress={() => ongedaan(it)} /> : null}
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

function VraagKaart({ it, onAntwoord }: { it: Extract<Item, { t: 'vraag' }>; onAntwoord: (a: { waarde: string; label: string }) => void }) {
  const { colors: t } = useTheme();
  const v = it.vraag;
  const [keuze, setKeuze] = useState(v.opties?.[0]?.waarde ?? (v.vrije_invoer !== 'geen' ? '__vrij' : ''));
  const [vrij, setVrij] = useState('');
  if (it.antwoord) return <Kaart soort="oud"><KaartKop titel={v.tekst} icoon="vraag" /><KaartTekst klein>Antwoord: {it.antwoord.label}</KaartTekst></Kaart>;
  const getal = v.vrije_invoer === 'bedrag' || v.vrije_invoer === 'getal';
  const vrijOk = getal ? veldNaarNummer(vrij) > 0 : vrij.trim().length > 1;
  const kan = keuze === '__vrij' ? vrijOk : Boolean(keuze);
  return (
    <Kaart soort="vraag">
      <KaartKop titel={v.tekst} icoon="vraag" />
      {v.toelichting ? <KaartTekst klein>{v.toelichting}</KaartTekst> : null}
      <Opties
        opties={[...(v.opties ?? []), ...(v.vrije_invoer !== 'geen' ? [{ waarde: '__vrij', label: v.vrije_invoer === 'bedrag' ? 'Ander bedrag' : v.vrije_invoer === 'getal' ? 'Ander aantal' : 'Zelf beschrijven' }] : [])]}
        gekozen={keuze}
        onKies={setKeuze}
      />
      {keuze === '__vrij' ? (
        <TextInput
          value={vrij}
          onChangeText={setVrij}
          placeholder={v.vrije_invoer === 'bedrag' ? 'Bijv. 55,00' : ''}
          placeholderTextColor={t.muted2}
          keyboardType={getal ? 'decimal-pad' : 'default'}
          accessibilityLabel={v.tekst}
          style={{ height: 42, borderRadius: 12, backgroundColor: t.bgAlt, paddingHorizontal: 12, fontSize: 15, color: t.ink }}
        />
      ) : null}
      <Knoppen>
        <KleineKnop label="Verder" disabled={!kan} onPress={() => {
          if (keuze === '__vrij') {
            const w = getal ? String(veldNaarNummer(vrij)) : vrij.trim();
            onAntwoord({ waarde: w, label: v.vrije_invoer === 'bedrag' ? formatEURCent(veldNaarNummer(vrij)) : vrij.trim() });
          } else onAntwoord({ waarde: keuze, label: v.opties?.find((o) => o.waarde === keuze)?.label || keuze });
        }} />
      </Knoppen>
    </Kaart>
  );
}

function VoorstelKaart({ it, standaardPct, onToepassen, onAanpassen, onNegeren, onDetails }: {
  it: Extract<Item, { t: 'voorstel' }>;
  standaardPct: number;
  onToepassen: () => void;
  onAanpassen: () => void;
  onNegeren: () => void;
  onDetails: () => void;
}) {
  const { colors: t } = useTheme();
  if (it.status === 'vervangen' || it.status === 'genegeerd') {
    return <Kaart soort="oud"><KaartKop titel={it.samenvatting || 'Voorstel'} badge={{ tekst: it.status === 'vervangen' ? 'Vervangen' : 'Niet gebruikt', toon: 'grijs' }} /></Kaart>;
  }
  if (it.status === 'toegepast' && !it.details) {
    return (
      <Kaart soort="oud">
        <KaartKop titel={it.samenvatting || 'Voorstel'} badge={{ tekst: 'Toegepast', toon: 'ok' }} />
        <Text onPress={onDetails} accessibilityRole="button" style={{ fontSize: 13, fontWeight: '700', color: t.green700 }}>Wijzigingen tonen</Text>
      </Kaart>
    );
  }
  const vm = new Map(it.voor.map((r) => [r.id, r]));
  const echtVoor = it.voor.filter((r) => !isLegeFactuurRegel(r));
  const tVoor = berekenTotalen(echtVoor);
  const tNa = voorstelTotaal(it.regels.map((b) => {
    const oud = b.ref ? vm.get(b.ref) : undefined;
    const pct = b.btw_regime ? ({ normaal: 21, verlaagd: 9, vrijgesteld: 0, verlegd: 0 } as Record<string, number>)[b.btw_regime] ?? standaardPct : b.btw_pct ?? oud?.btwPct ?? standaardPct;
    return { aantal: b.aantal, prijs: b.eenheidsprijs ?? 0, btwPct: pct };
  }));
  const nieuwRefs = new Set(it.regels.map((b) => b.ref).filter(Boolean));
  const weg = echtVoor.filter((o) => !nieuwRefs.has(o.id));
  type Rij = { b: FactuurVoorstelRegel; oud?: Regel } | { weg: Regel };
  const rijen: Rij[] = [
    ...it.regels
      .map((b) => ({ b, oud: b.ref ? vm.get(b.ref) : undefined }))
      .filter(({ b, oud }) => !oud || oud.omschrijving !== b.omschrijving || veldNaarNummer(oud.aantal) !== Number(b.aantal) || (oud.prijs === '' ? null : veldNaarNummer(oud.prijs)) !== (b.eenheidsprijs ?? null)),
    ...weg.map((o) => ({ weg: o })),
  ];
  const open = it.status === 'open';
  return (
    <Kaart soort="ai">
      <KaartKop titel={it.samenvatting || 'Voorstel voor de factuur'} badge={open ? { tekst: 'Ter controle', toon: 'ctrl' } : { tekst: 'Toegepast', toon: 'ok' }} />
      {open ? <KaartTekst klein>Pas na Wijzigingen toepassen verandert de factuur.</KaartTekst> : null}
      {rijen.length === 0 ? <KaartTekst>Er verandert niets aan de regels.</KaartTekst> : (
        <Inklap
          items={rijen}
          render={(r, i) => {
            if ('weg' in r) return <WijzigRegel key={i} teken="−" titel={r.weg.omschrijving} />;
            const { b, oud } = r;
            const prijs = b.eenheidsprijs == null ? 'prijs ontbreekt' : formatEURCent(b.eenheidsprijs);
            const extra = [b.bron && !['factuur', 'opdracht'].includes(b.bron) ? b.bron : null, b.tekst_door_boss ? 'tekst door Boss' : null].filter(Boolean).join(' · ');
            return (
              <WijzigRegel
                key={i}
                teken={oud ? '~' : '+'}
                titel={b.omschrijving}
                oudTitel={oud && oud.omschrijving !== b.omschrijving ? oud.omschrijving : undefined}
                sub={`${String(b.aantal).replace('.', ',')} ${b.eenheid || ''} × ${prijs}${extra ? ` · ${extra}` : ''}`}
                bedrag={b.eenheidsprijs == null ? '—' : formatEURCent(Math.round(b.aantal * b.eenheidsprijs * 100) / 100)}
              />
            );
          }}
        />
      )}
      <TotaalRegels
        excl={formatEURCent(tNa.excl)}
        incl={formatEURCent(tNa.incl)}
        voorExcl={tVoor.excl !== tNa.excl && tVoor.excl > 0 ? formatEURCent(tVoor.excl) : null}
        voorIncl={tVoor.incl !== tNa.incl && tVoor.incl > 0 ? formatEURCent(tVoor.incl) : null}
      />
      <Waarschuwingen lijst={it.waarschuwingen} />
      <Uitleg lijst={it.onderbouwing} />
      {open ? (
        <Knoppen>
          <KleineKnop label="Wijzigingen toepassen" onPress={onToepassen} />
          <KleineKnop label="Aanpassen" variant="secundair" onPress={onAanpassen} />
          <KleineKnop label="Negeren" variant="stil" onPress={onNegeren} />
        </Knoppen>
      ) : null}
    </Kaart>
  );
}
