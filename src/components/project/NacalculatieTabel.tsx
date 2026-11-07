import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NoticeBanner } from '@/components';
import { formatEUR } from '@/lib/format';
import {
  nacalculatieMeldingen,
  nacalculatieVerschil,
  type Nacalculatie,
} from '@/lib/projectKostenLogica';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';

/**
 * Begroot tegenover werkelijk voor één project — `NacalculatieTabel.jsx` van
 * het dashboard. De getallen komen uit `bouwNacalculatie`
 * (projectKostenLogica): één berekening voor elke plek.
 *
 * Begroot = de geaccepteerde offertes met hun interne calculatie: de uren
 * (urenregels plus begrote uren per regel) × de kostprijs per uur van die
 * offerte, en de kostprijs van materiaal en inkoop per regel.
 * Werkelijk = de uren op de werkbonnen × de kostprijs per uur die gold bij het
 * boeken, het werkbonmateriaal op inkoopprijs en de inkopen.
 *
 * Verschil = werkelijk − begroot. Bij kosten is een plus slecht (duurder dan
 * gedacht), bij opbrengst en resultaat goed; de kleur volgt dat. Wat ontbreekt
 * staat eronder in gewone taal (`nacalculatieMeldingen`).
 */

const urenTekst = (n: number | null) =>
  `${Number(n || 0).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} u`;
const pctTekst = (n: number | null) =>
  n == null ? '' : `${n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`;

function useNcStijl() {
  const { colors: t } = useTheme();
  const styles = useMemo(() => maakStijl(t), [t]);
  return { t, styles };
}

// Het minteken vóór het euroteken ("−€ 279"), zoals bij Verschil.
const bedrag = (n: number) => (n < 0 ? `−${formatEUR(-n)}` : formatEUR(n));
const bedragOfLeeg = (n: number | null) => (n == null ? '—' : bedrag(n));

// Buiten de render, zoals de bouwstenen van de projectkaart.
function Verschil({
  begroot,
  werkelijk,
  kostenKant,
}: {
  begroot: number | null;
  werkelijk: number | null;
  kostenKant?: boolean;
}) {
  const { t, styles } = useNcStijl();
  const v = nacalculatieVerschil(begroot, werkelijk, Boolean(kostenKant));
  if (v.soort === 'leeg') return <Text style={[styles.getal, styles.leeg]}>—</Text>;
  if (v.soort === 'gelijk') return <Text style={[styles.getal, styles.leeg]}>gelijk</Text>;
  return (
    <Text style={[styles.getal, { color: v.soort === 'goed' ? t.green700 : t.statusRejectFg }]}>
      {v.teken}
      {formatEUR(v.bedrag)}
    </Text>
  );
}

function Regel({
  label,
  sub,
  begroot,
  werkelijk,
  kostenKant,
  som,
  begrootSub,
  werkelijkSub,
  werkelijkKleur,
  zonderVerschil,
}: {
  label: string;
  sub?: string;
  begroot: number | null;
  werkelijk: number;
  kostenKant?: boolean;
  /** Voorlopig bedrag: niet vergelijken met de begroting. */
  zonderVerschil?: boolean;
  som?: boolean;
  begrootSub?: string;
  werkelijkSub?: string;
  werkelijkKleur?: string;
}) {
  const { styles } = useNcStijl();
  return (
    <View style={[styles.rij, som && styles.som]}>
      <View style={styles.labelKolom}>
        <Text style={[styles.label, som && styles.vet]}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <View style={styles.getalKolom}>
        <Text style={[styles.getal, begroot == null && styles.leeg, som && styles.vet]}>{bedragOfLeeg(begroot)}</Text>
        {begrootSub ? <Text style={[styles.sub, styles.rechts]}>{begrootSub}</Text> : null}
      </View>
      <View style={styles.getalKolom}>
        <Text style={[styles.getal, som && styles.vet, werkelijkKleur ? { color: werkelijkKleur } : null]}>
          {bedrag(werkelijk)}
        </Text>
        {werkelijkSub ? <Text style={[styles.sub, styles.rechts]}>{werkelijkSub}</Text> : null}
      </View>
      <View style={styles.getalKolom}>
        <Verschil begroot={begroot} werkelijk={zonderVerschil ? null : werkelijk} kostenKant={kostenKant} />
      </View>
    </View>
  );
}

export function NacalculatieTabel({
  nc,
  magBedragen,
  isAdmin,
}: {
  nc: Nacalculatie;
  /** Opbrengst en resultaat tonen (recht `projectbedragen`). */
  magBedragen: boolean;
  /** Verwijzing naar het instellen van de kostprijs per uur. */
  isAdmin: boolean;
}) {
  const { t, styles } = useNcStijl();
  const { arbeid, materiaal, kosten, opbrengst, resultaat } = nc;
  const meldingen = nacalculatieMeldingen(nc, { magBedragen, isAdmin, wat: 'project', fmt: formatEUR });

  return (
    <View style={{ gap: spacing.md }}>
      <View>
        <View style={[styles.rij, styles.kop]}>
          <Text style={[styles.kopTekst, styles.labelKolom]}>Excl. btw</Text>
          <Text style={[styles.kopTekst, styles.getalKolom, styles.rechts]}>Begroot</Text>
          <Text style={[styles.kopTekst, styles.getalKolom, styles.rechts]}>Werkelijk</Text>
          <Text style={[styles.kopTekst, styles.getalKolom, styles.rechts]}>Verschil</Text>
        </View>
        <Regel
          label="Arbeid"
          sub={`${arbeid.urenBegroot == null ? '' : `${urenTekst(arbeid.urenBegroot)} begroot · `}${urenTekst(
            arbeid.urenWerkelijk,
          )} geschreven`}
          begroot={arbeid.begroot}
          werkelijk={arbeid.werkelijk}
          kostenKant
        />
        <Regel
          label="Materiaal en inkopen"
          sub={
            materiaal.materiaal > 0 || materiaal.inkopen > 0
              ? `materiaal ${formatEUR(materiaal.materiaal)} · inkopen ${formatEUR(materiaal.inkopen)}`
              : undefined
          }
          begroot={materiaal.begroot}
          werkelijk={materiaal.werkelijk}
          kostenKant
        />
        <Regel label="Kosten" begroot={kosten.begroot} werkelijk={kosten.werkelijk} kostenKant som />
        {magBedragen ? (
          <>
            <Regel
              label="Opbrengst"
              sub="begroot: opdracht · werkelijk: gefactureerd"
              begroot={opbrengst.begroot}
              werkelijk={opbrengst.werkelijk}
              zonderVerschil={nc.voorlopig}
            />
            <Regel
              label="Resultaat"
              begroot={resultaat.begroot}
              werkelijk={resultaat.werkelijk}
              som
              begrootSub={pctTekst(resultaat.margeBegroot) || undefined}
              // Nog niet alles gefactureerd: een tussenstand, niet rood en niet vergeleken.
              werkelijkSub={nc.voorlopig ? 'voorlopig' : pctTekst(resultaat.margeWerkelijk) || undefined}
              werkelijkKleur={nc.voorlopig ? t.muted : resultaat.werkelijk < 0 ? t.statusRejectFg : undefined}
              zonderVerschil={nc.voorlopig}
            />
          </>
        ) : null}
      </View>
      {meldingen.map((m, i) => (
        <NoticeBanner key={i} toon={m.letOp ? 'waarschuwing' : 'info'} message={m.tekst} />
      ))}
    </View>
  );
}

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    rij: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    kop: { borderTopWidth: 0, paddingTop: 0 },
    som: { borderTopWidth: 1, borderTopColor: t.line },
    // Telefoonbreedte: de omschrijving krijgt de meeste ruimte, de drie
    // bedragen elk een gelijk deel.
    labelKolom: { flex: 1.35, minWidth: 0 },
    getalKolom: { flex: 1, minWidth: 0 },
    kopTekst: { fontSize: 10.5, fontWeight: '700', color: t.muted2, textTransform: 'uppercase', letterSpacing: 0.4 },
    label: { fontSize: 13.5, fontWeight: '600', color: t.ink },
    vet: { fontWeight: '800' },
    sub: { fontSize: 11, color: t.muted, marginTop: 2, lineHeight: 15 },
    getal: { fontSize: 13, fontWeight: '600', color: t.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
    leeg: { color: t.muted2 },
    rechts: { textAlign: 'right' },
  });
