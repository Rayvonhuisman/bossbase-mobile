/**
 * De wachtrij achter de webdialogen (zie `dialog.web.ts` en `DialogHost.web.tsx`).
 *
 * Op iOS en Android tekent het besturingssysteem de dialoog; op web moet de app
 * dat zelf doen, en kan een dialoog vanuit élke plek worden aangevraagd — een
 * service, een hook, een knop. Een kleine store buiten React houdt de
 * aanvragen vast; één host in de root-layout tekent ze.
 *
 * Een wachtrij en geen enkele slot, omdat dialogen elkaar opvolgen: "Foto
 * toevoegen" → "Welke fase?" opent de tweede vanuit een knop van de eerste.
 */

export type DialogKnop = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  /** Mag async zijn; wat hij teruggeeft wordt genegeerd, net als bij `Alert`. */
  onPress?: (value?: string) => unknown;
};

export type DialogOpties = {
  /** `false`: Escape of een tik naast de dialoog sluit hem niet. */
  cancelable?: boolean;
  /** Aangeroepen als de dialoog zonder knopkeuze wordt gesloten. */
  onDismiss?: () => void;
};

export type DialogVerzoek = {
  id: number;
  titel: string;
  bericht?: string;
  knoppen: DialogKnop[];
  opties?: DialogOpties;
};

let volgendId = 1;
let rij: DialogVerzoek[] = [];
const luisteraars = new Set<() => void>();

function meld() {
  luisteraars.forEach((l) => l());
}

export function voegDialoogToe(verzoek: Omit<DialogVerzoek, 'id'>): void {
  rij = [...rij, { ...verzoek, id: volgendId++ }];
  meld();
}

export function verwijderDialoog(id: number): void {
  rij = rij.filter((d) => d.id !== id);
  meld();
}

export function abonneerOpDialogen(luisteraar: () => void): () => void {
  luisteraars.add(luisteraar);
  return () => {
    luisteraars.delete(luisteraar);
  };
}

/** De dialoog die nu aan de beurt is, of `null`. */
export function huidigeDialoog(): DialogVerzoek | null {
  return rij[0] ?? null;
}
