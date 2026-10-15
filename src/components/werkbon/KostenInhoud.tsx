import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { formatEUR } from '@/lib/format';
import { bouwKostenOverzicht, type Inkoop, type KostBron } from '@/lib/werkbonKosten';
import { createWerkbonInkoop, deleteInkoop, getWerkbonKostenBron, updateInkoop } from '@/services/werkbonKostenService';
import { useTheme } from '@/providers';
import { ds, spacing, type ThemeColors } from '@/theme';
import { InkoopInvoer, InkoopRegel, type InkoopPatch } from './Regels';

/**
 * Kosten op de werkbon (WerkbonKostenSection): bovenaan de kostprijs
 * (materiaal op inkoop + inkopen; zonder het recht inkoopprijzen alleen de
 * inkopen), eronder de inkopen met dezelfde invoerregel als op het project.
 * Boekingen op de Kosten-pagina die aan deze werkbon hangen tellen niet mee.
 *
 * `materiaalSleutel` laat hem opnieuw laden zodra het materiaal verandert: de
 * materiaalkosten zijn spiegelregels die de database bijwerkt.
 */
export function KostenInhoud({
  werkbon,
  uren,
  materiaalSleutel,
  magInkoop,
  kanBewerken,
  leveranciers,
}: {
  werkbon: { id: string; company_id: string };
  uren: { uren?: number | null; reis_km?: number | null }[];
  materiaalSleutel: string;
  magInkoop: boolean;
  kanBewerken: boolean;
  leveranciers: { id: string; naam: string }[];
}) {
  const { colors: th } = useTheme();
  const styles = useMemo(() => maakStijl(th), [th]);
  const [jobCosts, setJobCosts] = useState<KostBron[]>([]);
  const [inkopen, setInkopen] = useState<Inkoop[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let actief = true;
    getWerkbonKostenBron(werkbon.id).then((r) => {
      if (!actief) return;
      setJobCosts(r.jobCosts);
      setInkopen(r.inkopen);
      setFout(r.error);
      setLaden(false);
    });
    return () => {
      actief = false;
    };
  }, [werkbon.id, materiaalSleutel]);

  const o = useMemo(() => bouwKostenOverzicht({ jobCosts, inkopen, uren }), [jobCosts, inkopen, uren]);

  // Direct in beeld, de schrijfactie erachteraan; bij een fout terug.
  const wijzig = async (rij: Inkoop, patch: InkoopPatch) => {
    const nieuw = { ...rij };
    if ('naam' in patch) nieuw.naam = patch.naam ?? '';
    if ('eenheid' in patch) nieuw.eenheid = patch.eenheid ?? '';
    if ('aantal' in patch) nieuw.aantal = Number(patch.aantal) || 0;
    if ('prijs_per' in patch) nieuw.prijsPer = Number(patch.prijs_per) || 0;
    if ('leverancier_id' in patch) nieuw.leverancierId = patch.leverancier_id || null;
    nieuw.bedrag = Math.round(nieuw.aantal * nieuw.prijsPer * 100) / 100;
    setInkopen((l) => l.map((x) => (x.id === rij.id ? nieuw : x)));
    const { error } = await updateInkoop(rij.id, patch);
    if (error) {
      Dialog.alert('Bijwerken mislukt', error);
      setInkopen((l) => l.map((x) => (x.id === rij.id ? rij : x)));
    }
  };

  const verwijder = (rij: Inkoop) =>
    Dialog.alert('Inkoop verwijderen', `"${rij.naam}" verwijderen?`, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteInkoop(rij.id);
          if (error) return Dialog.alert('Verwijderen mislukt', error);
          setInkopen((l) => l.filter((x) => x.id !== rij.id));
          setOpenId(null);
        },
      },
    ]);

  const voegToe = async (f: Parameters<typeof createWerkbonInkoop>[1]) => {
    const { data, error } = await createWerkbonInkoop(werkbon, f);
    if (error || !data) {
      Dialog.alert('Toevoegen mislukt', error ?? 'Probeer het opnieuw.');
      return false;
    }
    setInkopen((l) => [...l, data]);
    return true;
  };

  const foutTekst = fout
    ? /schema cache|does not exist|project_kosten/i.test(fout)
      ? 'Inkopen zijn nog niet beschikbaar: de database-update hiervoor is nog niet uitgevoerd.'
      : 'Inkopen konden niet worden geladen.'
    : null;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.uitleg}>
        Kosten voor deze werkbon die niet bij het materiaal staan, zoals steigerhuur of een gehuurde hoogwerker. Bedragen
        exclusief btw.
      </Text>
      <View>
        <Text style={styles.kopLabel}>{magInkoop ? 'Kostprijs' : 'Inkopen'}</Text>
        <Text style={styles.kopWaarde}>{formatEUR(magInkoop ? o.totaal : o.inkopen.bedrag)}</Text>
        {magInkoop && (o.materiaal.bedrag > 0 || o.inkopen.bedrag > 0) ? (
          <Text style={styles.kopSub}>
            materiaal {formatEUR(o.materiaal.bedrag)} · inkopen {formatEUR(o.inkopen.bedrag)}
          </Text>
        ) : null}
        {o.boekingen.aantal > 0 ? (
          <Text style={[styles.kopSub, { marginTop: 6 }]}>
            {o.boekingen.aantal === 1 ? '1 boeking' : `${o.boekingen.aantal} boekingen`} op de Kosten-pagina{' '}
            {o.boekingen.aantal === 1 ? 'hangt' : 'hangen'} aan deze werkbon ({formatEUR(o.boekingen.bedrag)}). Die tellen niet
            mee: het materiaal zelf staat hierboven al.
          </Text>
        ) : null}
      </View>

      {laden ? (
        <ActivityIndicator color={ds.green700} />
      ) : (
        <>
          {!inkopen.length ? <Text style={styles.leeg}>{foutTekst || 'Nog geen kosten toegevoegd.'}</Text> : null}
          {inkopen.map((k) => (
            <InkoopRegel
              key={k.id}
              inkoop={k}
              open={openId === k.id}
              kanBewerken={kanBewerken}
              leveranciers={leveranciers}
              onOpen={() => setOpenId(k.id)}
              onSluit={() => setOpenId(null)}
              onWijzig={(p) => wijzig(k, p)}
              onDelete={() => verwijder(k)}
            />
          ))}
          {kanBewerken ? <InkoopInvoer leveranciers={leveranciers} onAdd={voegToe} /> : null}
          {inkopen.length ? (
            <View style={styles.totaal}>
              <Text style={styles.totaalLabel}>Totaal inkopen (excl. BTW)</Text>
              <Text style={styles.totaalWaarde}>{formatEUR(inkopen.reduce((s, k) => s + k.bedrag, 0))}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    uitleg: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    kopLabel: { fontSize: 11, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    kopWaarde: { fontSize: 16, fontWeight: '700', color: t.ink, marginTop: 4 },
    kopSub: { fontSize: 11.5, color: t.muted, marginTop: 2, lineHeight: 17 },
    leeg: { fontSize: 13, color: t.muted },
    totaal: {
      marginTop: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totaalLabel: { fontSize: 13, fontWeight: '700', color: t.ink2 },
    totaalWaarde: { fontSize: 15, fontWeight: '800', color: t.ink },
  });
