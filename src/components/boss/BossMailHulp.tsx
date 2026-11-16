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
import { metOndertekenplek, nid, vervangSelectie, type MailSelectie } from '@/lib/boss/gesprek';
import { vraagBoss, type BossFunctie } from '@/services/bossDocumentService';
import { Paneel } from '../Paneel';
import { BossAvatar } from '../BossChat';
import type { MailConcept } from '../DocumentMailSheet';
import { BossGesprek, IkBubbel, Kaart, KaartKop, KaartTekst, KleineKnop, Knoppen, Waarschuwingen } from './BossGesprek';
import { useVoortgang } from './gedeeld';
import { tx, txm } from '@/i18n';

type Voorstel =
  | { soort: 'voorstel'; onderwerp: string; bericht: string; samenvatting?: string }
  | { soort: 'selectie'; tekst: string }
  | { soort: 'melding'; melding?: string };

export type { MailSelectie };
type Item =
  | { id: string; t: 'ik'; tekst: string }
  | { id: string; t: 'melding'; tekst: string }
  | { id: string; t: 'fout'; tekst: string; opdracht: string; sel?: MailSelectie; kaartId?: string }
  | { id: string; t: 'selectie'; sel: MailSelectie; voorstel?: string; waarschuwingen?: string[]; klaar?: boolean; vorig?: MailConcept; ongedaan?: boolean; weg?: boolean }
  | { id: string; t: 'voorstel'; status: 'open' | 'ingevoegd' | 'vervangen'; onderwerp: string; bericht: string; samenvatting?: string; waarschuwingen: string[] }
  | { id: string; t: 'ingevoegd'; vorig: MailConcept; ongedaan?: boolean };
type ZonderId<T> = T extends unknown ? Omit<T, 'id'> : never;

const START = [txm('Schrijf een begeleidende mail'), txm('Maak persoonlijker'), txm('Maak korter'), txm('Maak zakelijker')];
const MAAK = [txm('Duidelijker'), txm('Korter'), txm('Persoonlijker'), txm('Zakelijker')];

export function BossMailHulp({
  open, onSluit, functie, documentId, klantId, nummer, kanOndertekenen, concept, onWijzig, selectie,
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
  /** Een nieuwe selectie uit het bericht komt als kaart binnen. */
  selectie?: MailSelectie | null;
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
  // Een nieuwe selectie uit het bericht wordt één keer een kaart (state bijwerken
  // tijdens het renderen, bij een nieuwe sleutel; geen effect).
  const [gezien, setGezien] = useState<string | null>(null);
  if (selectie && selectie.sleutel !== gezien) {
    setGezien(selectie.sleutel);
    setItems((l) => [...l, { id: nid(), t: 'selectie', sel: selectie }]);
  }
  const laatsteVoorstel = [...items].reverse().find((i): i is Extract<Item, { t: 'voorstel' }> => i.t === 'voorstel');

  const vraag = async (opdracht: string, metSel?: { sel: MailSelectie; kaartId: string }) => {
    gestopt.current = false;
    setBusy(true);
    startStappen([
      (isOfferte ? tx('Offerte {nummer} en klantgegevens lezen', { nummer: nummer ?? '' }) : tx('Factuur {nummer} en klantgegevens lezen', { nummer: nummer ?? '' })).replace(/\s+/g, ' '),
      tx('Tekst schrijven'),
      tx('Bedragen en datums controleren'),
    ]);
    try {
      const mail = {
        onderwerp: concept.onderwerp,
        bericht: concept.tekst,
        vorig: laatsteVoorstel && !metSel ? `${laatsteVoorstel.onderwerp}\n\n${laatsteVoorstel.bericht}` : null,
        selectie: metSel ? metSel.sel.tekst : null,
      };
      const { resultaat, waarschuwingen } = await vraagBoss<Voorstel>(functie, {
        taak: 'mail', opdracht, [isOfferte ? 'offerte_id' : 'factuur_id']: documentId, bronnen: { klant_id: klantId }, mail,
      });
      if (gestopt.current) return;
      if (resultaat.soort === 'voorstel') {
        setItems((l) => l.map((i) => (i.t === 'voorstel' && i.status === 'open' ? { ...i, status: 'vervangen' } : i)));
        push({ t: 'voorstel', status: 'open', onderwerp: resultaat.onderwerp, bericht: resultaat.bericht, samenvatting: resultaat.samenvatting, waarschuwingen });
      } else if (resultaat.soort === 'selectie' && metSel) {
        upd(metSel.kaartId, { voorstel: resultaat.tekst, waarschuwingen } as Partial<Item>);
      } else push({ t: 'melding', tekst: resultaat.soort === 'melding' ? resultaat.melding || tx('Klaar.') : tx('Klaar.') });
    } catch (e) {
      if (!gestopt.current) {
        push({ t: 'fout', tekst: tx('{fout} Je mail is niet aangepast.', { fout: (e as Error).message }), opdracht, sel: metSel?.sel, kaartId: metSel?.kaartId });
        if (!metSel) setDraft(opdracht);
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
    <Paneel open={open} titel={tx('Help met schrijven')} subtitel={tx('Boss · AI-assistent · beta')} kop={<BossAvatar />} onSluit={() => { if (!busy) onSluit(); }}>
      <BossGesprek
        labels={[]}
        intro={eersteKeer ? (
          <Kaart>
            <KaartTekst>{isOfferte
              ? tx('Ik schrijf een onderwerp en bericht voor deze offerte, met de gegevens die erin staan. Je ziet eerst een voorstel; versturen doe je zelf.')
              : tx('Ik schrijf een onderwerp en bericht voor deze factuur, met de gegevens die erin staan. Je ziet eerst een voorstel; versturen doe je zelf.')}</KaartTekst>
            <Knoppen><KleineKnop label={tx('Schrijf een begeleidende mail')} onPress={() => verstuur(tx('Schrijf een begeleidende mail'))} /></Knoppen>
          </Kaart>
        ) : null}
        busy={busy}
        voortgang={stappen}
        onStop={() => { gestopt.current = true; stopStappen(); setBusy(false); push({ t: 'melding', tekst: tx('Gestopt. Je mail is niet aangepast.') }); }}
        draft={draft}
        setDraft={setDraft}
        onSend={verstuur}
        suggesties={eersteKeer ? [] : START.slice(1).map((s) => tx(s))}
        plusOpties={[]}
        placeholder={tx('Wat moet er anders?')}
        scrollSleutel={`${items.length}`}
      >
        {items.map((it) => (
          <View key={it.id}>
            {it.t === 'ik' ? <IkBubbel tekst={it.tekst} /> : null}
            {it.t === 'melding' ? <Kaart><KaartTekst>{it.tekst}</KaartTekst></Kaart> : null}
            {it.t === 'fout' ? (
              <Kaart soort="fout" rol="alert">
                <KaartKop titel={tx('Dit lukte niet')} icoon="fout" />
                <KaartTekst>{it.tekst}</KaartTekst>
                <Knoppen><KleineKnop label={tx('Opnieuw proberen')} variant="secundair" disabled={busy} onPress={() => { upd(it.id, { t: 'melding', tekst: tx('Opnieuw geprobeerd.') } as Partial<Item>); setDraft(''); void vraag(it.opdracht, it.sel && it.kaartId ? { sel: it.sel, kaartId: it.kaartId } : undefined); }} /></Knoppen>
              </Kaart>
            ) : null}
            {it.t === 'voorstel' ? (
              it.status === 'vervangen' ? (
                <Kaart soort="oud"><KaartKop titel={it.samenvatting || tx('Voorstel')} badge={{ tekst: tx('Vervangen'), toon: 'grijs' }} /></Kaart>
              ) : (
                <Kaart soort="ai">
                  <KaartKop titel={it.samenvatting || tx('Voorstel voor de mail')} badge={it.status === 'open' ? { tekst: tx('Voorstel'), toon: 'ctrl' } : { tekst: tx('Ingevoegd'), toon: 'ok' }} />
                  <View style={{ backgroundColor: t.bgAlt, borderRadius: 12, padding: 10, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: t.muted }}>{tx('ONDERWERP')}</Text>
                    <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.ink }}>{it.onderwerp}</Text>
                  </View>
                  <View style={{ backgroundColor: t.bgAlt, borderRadius: 12, padding: 10, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: t.muted }}>{tx('BERICHT')}</Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: t.ink }}>{it.bericht}</Text>
                  </View>
                  <Waarschuwingen lijst={it.waarschuwingen} />
                  {it.status === 'open' ? (
                    <Knoppen>
                      <KleineKnop label={tx('Invoegen')} onPress={() => voegIn(it)} />
                      <KleineKnop label={tx('Korter')} variant="secundair" disabled={busy} onPress={() => verstuur(tx('Maak korter'))} />
                      <KleineKnop label={tx('Zakelijker')} variant="secundair" disabled={busy} onPress={() => verstuur(tx('Maak zakelijker'))} />
                    </Knoppen>
                  ) : null}
                </Kaart>
              )
            ) : null}
            {it.t === 'selectie' && !it.weg ? (
              it.klaar ? (
                it.ongedaan ? <Kaart><KaartTekst>{tx('Ongedaan gemaakt. Je eigen tekst staat er weer.')}</KaartTekst></Kaart> : (
                  <Kaart soort="klaar" rol="status">
                    <KaartKop titel={tx('Selectie vervangen')} icoon="ok" />
                    <Knoppen>
                      <KleineKnop label={tx('Ongedaan maken')} variant="secundair" icoon={<Undo2 size={14} color={t.ink} />} onPress={() => { if (it.vorig) onWijzig(it.vorig); upd(it.id, { ongedaan: true } as Partial<Item>); }} />
                      <KleineKnop label={tx('Terug naar de mail')} variant="stil" onPress={onSluit} />
                    </Knoppen>
                  </Kaart>
                )
              ) : (
                <Kaart soort="ai">
                  <KaartKop titel={tx('Geselecteerde tekst')} badge={{ tekst: tx('Alleen deze tekst'), toon: 'grijs' }} />
                  <View style={{ borderLeftWidth: 3, borderLeftColor: t.lineStrong, paddingLeft: 10 }}>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: t.ink2 }}>{it.sel.tekst}</Text>
                  </View>
                  <Knoppen>
                    {MAAK.map((m) => (
                      <KleineKnop key={m} label={tx(m)} variant="secundair" disabled={busy} onPress={() => void vraag(`Maak deze tekst ${m.toLowerCase()}.`, { sel: it.sel, kaartId: it.id })} />
                    ))}
                  </Knoppen>
                  {it.voorstel ? (
                    <>
                      <View style={{ backgroundColor: t.green50, borderRadius: 12, padding: 10, gap: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.66, color: t.muted }}>{tx('VOORSTEL')}</Text>
                        <Text style={{ fontSize: 14, lineHeight: 20, color: t.ink }}>{it.voorstel}</Text>
                      </View>
                      <Waarschuwingen lijst={it.waarschuwingen ?? []} />
                      <Knoppen>
                        <KleineKnop
                          label={tx('Vervang selectie')}
                          onPress={() => {
                            const nieuw = vervangSelectie(concept.tekst, it.sel, it.voorstel!);
                            if (nieuw === null) {
                              push({ t: 'melding', tekst: tx('De geselecteerde tekst staat niet meer in het bericht. Selecteer hem opnieuw.') });
                              return;
                            }
                            onWijzig({ ...concept, tekst: nieuw });
                            upd(it.id, { klaar: true, vorig: { ...concept } } as Partial<Item>);
                          }}
                        />
                        <KleineKnop label={tx('Laat staan')} variant="stil" onPress={() => { upd(it.id, { weg: true } as Partial<Item>); push({ t: 'melding', tekst: tx('Selectie niet aangepast.') }); }} />
                      </Knoppen>
                    </>
                  ) : null}
                </Kaart>
              )
            ) : null}
            {it.t === 'ingevoegd' ? (
              it.ongedaan ? <Kaart><KaartTekst>{tx('Ongedaan gemaakt. Je eigen tekst staat er weer.')}</KaartTekst></Kaart> : (
                <Kaart soort="klaar" rol="status">
                  <KaartKop titel={tx('Ingevoegd in de mail')} icoon="ok" />
                  <KaartTekst klein>{tx('Nog niets verstuurd. Kijk de mail na en verstuur hem met de gewone knop.')}</KaartTekst>
                  <Knoppen>
                    {laatsteIngevoegd === it.id ? <KleineKnop label={tx('Ongedaan maken')} variant="secundair" icoon={<Undo2 size={14} color={t.ink} />} onPress={() => { onWijzig(it.vorig); upd(it.id, { ongedaan: true } as Partial<Item>); }} /> : null}
                    <KleineKnop label={tx('Terug naar de mail')} variant="stil" onPress={onSluit} />
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
