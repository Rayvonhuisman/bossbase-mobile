/** Een gekozen bestand; de inhoud wordt pas bij het uploaden gelezen. */
export type KandidaatBestand = {
  naam: string;
  mime: string | null;
  grootte: number;
  lees: () => Promise<ArrayBuffer>;
};
