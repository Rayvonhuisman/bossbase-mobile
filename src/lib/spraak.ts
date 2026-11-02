/**
 * Inspreken in de iOS- en Android-app.
 *
 * Spraakherkenning in de app zelf vraagt een native module en dus een nieuwe
 * build in de App Store en Play Store. Tot die er is, gebruikt de microfoonknop
 * het dicteren van het toetsenbord: hij zet de cursor in het invoerveld en
 * zegt waar de microfoon van het toetsenbord zit. Webversie: `spraak.web.ts`
 * (de spraakherkenning van de browser, zoals in het dashboard).
 */
export type SpraakStand = 'uit' | 'start' | 'luistert';
export type Spraak = {
  ondersteund: boolean;
  stand: SpraakStand;
  tussen: string;
  fout: string | null;
  start: () => void;
  stop: () => void;
  wisFout: () => void;
};

export function useSpraak(_opties: { setTekst: (f: (oud: string) => string) => void }): Spraak {
  return { ondersteund: false, stand: 'uit', tussen: '', fout: null, start: () => {}, stop: () => {}, wisFout: () => {} };
}

export const DICTEER_HINT = 'Tik op de microfoon van je toetsenbord om in te spreken.';
