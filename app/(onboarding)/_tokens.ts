import { ds } from '@/theme';

/**
 * Onboarding-tokens.
 *
 * Deze map bestond apart omdat de eerste-ervaring uit een ouder designpakket
 * kwam, met een eigen groen (#1DDB62) en een eigen off-white. Dat betekende in
 * de praktijk: wie de app installeerde zag eerst één merk en daarna een ander.
 *
 * De sleutels blijven staan — elk onboardingscherm gebruikt ze — maar de
 * waarden komen nu uit het goedgekeurde ontwerp. Eén merk dus, vanaf het eerste
 * scherm.
 *
 * Bewust het LICHTE palet: de onboarding draait vóór er een voorkeur bekend is
 * en heeft geen donkere variant in het ontwerp.
 */
export const onb = {
  bg: ds.bg,
  surface: ds.card,
  ink: ds.ink,
  muted: ds.muted,
  faint: ds.muted2,
  hair: ds.line,
  field: ds.bgAlt,
  green: ds.green,
  greenDk: ds.green700,
  greenSoft: ds.green50,
} as const;
