/**
 * "Help met schrijven" in het verzendscherm van een offerte of factuur:
 * Boss schrijft een onderwerp en bericht, of past ze aan ("Maak korter").
 * Overgenomen uit het dashboard (`BossMailPaneel`), als paneel van onderen
 * zoals de Boss-hulp in de app.
 *
 * Boss doet een voorstel; pas na Invoegen staat het in de mail, en dat is
 * terug te draaien. Versturen gebeurt alleen met de gewone knop.
 */
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Undo2 } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { metOndertekenplek, nid } from '@/lib/boss/gesprek';
import { vraagBoss, type BossFunctie } from '@/services/bossDocumentService';
import { Paneel } from '../Paneel';
import { BossAvatar } from '../BossChat';
import type { MailConcept } from '../DocumentMailSheet';
import { BossGesprek, IkBubbel, Kaart, KaartKop, KaartTekst, KleineKnop, Knoppen, Waarschuwingen } from './BossGesprek';
import { useVoortgang } from './gedeeld';

type Voorstel = { soort: 'voorstel'; onderwerp: string; bericht: string; samenvatting?: string } | { soort: 'melding'; melding?: string };
type Item =
  | { id: string; t: 'ik'; tekst: string }
  | { id: string; t: 'melding'; tekst: string }
  | { id: string; t: 'fout'; tekst: string; opdracht: string }
  | { id: string; t: 'voorstel'; status: 'open' | 'ingevoegd' | 'vervangen'; onderwerp: string; bericht: string; samenvatting?: string; waarschuwingen: string[] }
  | { id: string; t: 'ingevoegd'; vorig: MailConcept; ongedaan?: boolean };
type ZonderId<T> = T extends unknown ? Omit<T, 'id'> : never;

const START = ['Schrijf een begeleidende mail', 'Maak persoonlijker', 'Maak korter', 'Maak zakelijker'];

export function BossMailHulp({
  open, onSluit, functie, documentId, klantId, nummer, kanOndertekenen, concept, onWijzig,
}: {
  open: boolean;
  onSluit: () => void;
  functie: BossFunctie;
  documentId: string;
  klantId: string | null;
  nummer: string | null | undefined;
  /** Offerte met digitaal ondertekenen: dan hoort {{link}} in de mail. */
  kanOndertekenen: boolean;
  concept: MailConcept;
  onWijzig: (c: MailConcept) => void;
}) {
  const { colors: t } = useTheme();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [stappen, startStappen, stopStappen] = useVoortgang();
  const gestopt = useRef(false);
  const isOfferte = functie === 'boss-offerte';
  const push = (it: ZonderId<Item>) => setItems((l) => [...l, { id: nid(), ...it } as Item]);
  const upd = (id: string, patch: Partial<Item>) => setItems((l) => l.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)));
  const laatsteVoorstel = [...items].reverse().find((i): i is Extract<Item, { t: 'voorstel' }> => i.t === 'voorstel');

  const vraag = async (opdracht: string) => {
    gestopt.current = false;
    setBusy(true);
    startStappen([`${isOfferte ? 'Offerte' : 'Factuur'} ${nummer ?? ''} en klantgegevens lezen`.replace(/\s+/g, ' '), 'Tekst schrijven', 'Bedragen en datums controleren']);
    try {
      const mail = {
        onderwerp: concept.onderwerp,
        bericht: concept.tekst,
        vorig: laatsteVoorstel ? `${laatsteVoorstel.onderwerp}\n\n${laatsteVoorstel.bericht}` : null,
        selectie: null,
      };
      const { resultaat, waarschuwingen } = await vraagBoss<Voorstel>(functie, {
        taak: 'mail', opdracht, [isOfferte ? 'offerte_id' : 'factuur_id']: documentId, bronnen: { klant_id: klantId }, mail,
      });
      if (gestopt.current) return;
      if (resultaat.soort === 'voorstel') {
        setItems((l) => l.map((i) => (i.t === 'voorstel' && i.status === 'open' ? { ...i, status: 'vervangen' } : i)));
        push({ t: 'voorstel', status: 'open', onderwerp: resultaat.onderwerp, bericht: resultaat.bericht, samenvatting: resultaat.samenvatting, waarschuwingen });
      } else push({ t: 'melding', tekst: resultaat.melding || 'Klaar.' });
    } catch (e) {
      if (!gestopt.current) {
        push({ t: 'fout', tekst: `${(e as Error).message} Je mail is niet aangepast.`, opdracht });
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
  const voegIn = (it: Extract<Item, { t: 'voorstel' }>) => {
    push({ t: 'ingevoegd', vorig: { ...concept } });
    onWijzig({ ...concept, onderwerp: it.onderwerp || concept.onderwerp, tekst: isOfferte ? metOndertekenplek(it.bericht, kanOndertekenen) : it.bericht });
    upd(it.id, { status: 'ingevoegd' });
  };
  const laatsteIngevoegd = [...items].reverse().find((i) => i.t === 'ingevoegd')?.id;
  const eersteKeer = !items.some((i) => i.t === 'ik');

  return (
    <Paneel open={open} titel="Help met schrijven" subtitel="Boss · AI-assistent" kop={<BossAvatar />} onSluit={() => { if (!busy) onSluit(); }}>
      <BossGesprek
        labels={[]}
        intro={eersteKeer ? (
          <Kaart>
            <KaartTekst>Ik schrijf een onderwerp en bericht voor deze {isOfferte ? 'offerte' : 'factuur'}, met de gegevens die erin staan. Je ziet eerst een voorstel; versturen doe je zelf.</KaartTekst>
            <Knoppen><KleineKnop label="Schrijf een begeleidende mail" onPress={() => verstuur('Schrijf een begeleidende mail')} /></Knoppen>
          </Kaart>
        ) : null}
        busy={busy}
        voortgang={stappen}
        onStop={() => { gestopt.current = true; stopStappen(); setBusy(false); push({ t: 'melding', tekst: 'Gestopt. Je mail is niet aangepast.' }); }}
        draft={draft}
        setDraft={setDraft}
        onSend={verstuur}
        suggesties={eersteKeer ? [] : START.slice(1)}
        plusOpties={[]}
        placeholder="Wat moet er anders?"
        scrollSleutel={`${items.length}`}
      >
        {items.map((it) => (
          <View key={it.id}>
            {it.t === 'ik' ? <IkBubbel tekst={it.tekst} /> : null}
            {it.t === 'melding' ? <Kaart><KaartTekst>{it.tekst}</KaartTekst></Kaart> : null}
            {it.t === 'fout' ? (
              <Kaart soort="fout" rol="alert">
                <KaartKop titel="Dit lukte niet" icoon="fout" />
                <KaartTekst>{it.tekst}</KaartTekst>
                <Knoppen><KleineKnop label="Opnieuw proberen" variant="secundair" disabled={busy} onPress={() => { upd(it.id, { t: 'melding', tekst: 'Opnieuw geprobeerd.' } as Partial<Item>); setDraft(''); void vraag(it.opdracht); }} /></Knoppen>
              </Kaart>
            ) : null}
            {it.t === 'voorstel' ? (
              it.status === 'vervangen' ? (
                <Kaart soort="oud"><KaartKop titel={it.samenvatting || 'Voorstel'} badge={{ tekst: 'Vervangen', toon: 'grijs' }} /></Kaart>
              ) : (
                <Kaart soort="ai">
                  <KaartKop titel={it.samenvatting || 'Voorstel voor de mail'} badge={it.status === 'open' ? { tekst: 'Voorstel', toon: 'ctrl' } : { tekst: 'Ingevoegd', toon: 'ok' }} />
                  <View style={{ backgroundColor: t.bgAlt, borderRadius: 12, padding: 10, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: t.muted }}>ONDERWERP</Text>
                    <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.ink }}>{it.onderwerp}</Text>
                  </View>
                  <View style={{ backgroundColor: t.bgAlt, borderRadius: 12, padding: 10, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: t.muted }}>BERICHT</Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: t.ink }}>{it.bericht}</Text>
                  </View>
                  <Waarschuwingen lijst={it.waarschuwingen} />
                  {it.status === 'open' ? (
                    <Knoppen>
                      <KleineKnop label="Invoegen" onPress={() => voegIn(it)} />
                      <KleineKnop label="Korter" variant="secundair" disabled={busy} onPress={() => verstuur('Maak korter')} />
                      <KleineKnop label="Zakelijker" variant="secundair" disabled={busy} onPress={() => verstuur('Maak zakelijker')} />
                    </Knoppen>
                  ) : null}
                </Kaart>
              )
            ) : null}
            {it.t === 'ingevoegd' ? (
              it.ongedaan ? <Kaart><KaartTekst>Ongedaan gemaakt. Je eigen tekst staat er weer.</KaartTekst></Kaart> : (
                <Kaart soort="klaar" rol="status">
                  <KaartKop titel="Ingevoegd in de mail" icoon="ok" />
                  <KaartTekst klein>Nog niets verstuurd. Kijk de mail na en verstuur hem met de gewone knop.</KaartTekst>
                  <Knoppen>
                    {laatsteIngevoegd === it.id ? <KleineKnop label="Ongedaan maken" variant="secundair" icoon={<Undo2 size={14} color={t.ink} />} onPress={() => { onWijzig(it.vorig); upd(it.id, { ongedaan: true } as Partial<Item>); }} /> : null}
                    <KleineKnop label="Terug naar de mail" variant="stil" onPress={onSluit} />
                  </Knoppen>
                </Kaart>
              )
            ) : null}
          </View>
        ))}
      </BossGesprek>
    </Paneel>
  );
}
