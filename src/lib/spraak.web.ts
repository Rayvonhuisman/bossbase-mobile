/**
 * Inspreken in de webapp: de spraakherkenning van de browser (Chrome, Edge,
 * Safari), net als Boss in het dashboard (`hooks/useSpraak.js`). Wat je zegt
 * komt in het invoerveld; versturen blijft de gewone knop, zodat je de tekst
 * eerst kunt nakijken. Werkt de browser niet mee, dan zegt de knop dat.
 */
import { useEffect, useRef, useState } from 'react';
import { locale, tx, txm } from '@/i18n';
import type { Spraak, SpraakStand } from './spraak';

export type { Spraak, SpraakStand } from './spraak';
export const DICTEER_HINT = txm('Tik op de microfoon van je toetsenbord om in te spreken.');

type Herkenning = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

const Klasse = (): (new () => Herkenning) | null => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Herkenning; webkitSpeechRecognition?: new () => Herkenning };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const FOUT: Record<string, string> = {
  'not-allowed': txm('De browser mag de microfoon niet gebruiken. Sta de microfoon toe in de instellingen van je browser.'),
  'service-not-allowed': txm('De browser mag de microfoon niet gebruiken. Sta de microfoon toe in de instellingen van je browser.'),
  'no-speech': txm('Ik hoorde niets. Probeer het nog eens, iets dichter bij de microfoon.'),
  'audio-capture': txm('Er is geen microfoon gevonden.'),
  network: txm('Spraakherkenning is niet bereikbaar. Controleer je internet of typ je opdracht.'),
};

export function useSpraak({ setTekst }: { setTekst: (f: (oud: string) => string) => void }): Spraak {
  const [stand, setStand] = useState<SpraakStand>('uit');
  const [tussen, setTussen] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const herkenning = useRef<Herkenning | null>(null);
  const basis = useRef('');
  const ondersteund = Boolean(Klasse());

  useEffect(() => () => herkenning.current?.abort(), []);

  const start = () => {
    const K = Klasse();
    if (!K) {
      setFout(tx('Inspreken werkt niet in deze browser. Gebruik Chrome, Edge of Safari, of de microfoon van je toetsenbord.'));
      return;
    }
    setFout(null);
    setTussen('');
    const h = new K();
    h.lang = locale();
    h.continuous = true;
    h.interimResults = true;
    setTekst((oud) => {
      basis.current = oud.trim() ? `${oud.trim()} ` : '';
      return oud;
    });
    let definitief = '';
    h.onstart = () => setStand('luistert');
    h.onresult = (e) => {
      let tijdelijk = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) definitief += r[0].transcript;
        else tijdelijk += r[0].transcript;
      }
      setTussen(tijdelijk);
      setTekst(() => `${basis.current}${definitief}${tijdelijk}`.replace(/\s+/g, ' ').trimStart());
    };
    h.onerror = (e) => {
      if (e.error !== 'aborted') setFout(tx(FOUT[e.error] ?? 'Inspreken lukte niet. Probeer het nog eens of typ je opdracht.'));
    };
    h.onend = () => {
      setStand('uit');
      setTussen('');
      setTekst(() => `${basis.current}${definitief}`.replace(/\s+/g, ' ').trimStart());
      herkenning.current = null;
    };
    herkenning.current = h;
    setStand('start');
    try {
      h.start();
    } catch {
      setStand('uit');
      setFout(tx('Inspreken lukte niet. Probeer het nog eens of typ je opdracht.'));
    }
  };

  return {
    ondersteund,
    stand,
    tussen,
    fout,
    start,
    stop: () => herkenning.current?.stop(),
    wisFout: () => setFout(null),
  };
}
