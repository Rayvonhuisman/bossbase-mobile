import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, File as FileIcon, Share2, Trash2, X } from 'lucide-react-native';
import { BestandFout, haalBestand, isTeBekijken, type Bestand, type GeladenBestand } from '@/services/bestandenService';
import { bewaarBestand, deelBestand } from '@/lib/pdfDelen';
import { Dialog } from '@/lib/dialog';
import { PdfFrame, type PdfBericht } from './PdfFrame';

/**
 * Eén bestand uit het blok Bestanden bekijken: een PDF schermvullend (zoals
 * offertes en facturen, zie PdfWeergave), een foto zwart omlijst. Wat de app
 * niet kan tonen (Word, Excel, DWG …) krijgt alleen de knoppen.
 *
 * Bovenin: sluiten, delen en bewaren (downloaden), en bij een eigen bestand dat
 * je mag beheren de prullenbak. De ouder beslist over verwijderen.
 */
export function BestandWeergave({
  bestand,
  onSluit,
  onVerwijder,
}: {
  bestand: Bestand | null;
  onSluit: () => void;
  onVerwijder?: (b: Bestand) => void;
}) {
  return (
    <Modal visible={!!bestand} animationType="slide" onRequestClose={onSluit} presentationStyle="fullScreen">
      {bestand ? <Inhoud key={bestand.sleutel} bestand={bestand} onSluit={onSluit} onVerwijder={onVerwijder} /> : null}
    </Modal>
  );
}

function Inhoud({
  bestand,
  onSluit,
  onVerwijder,
}: {
  bestand: Bestand;
  onSluit: () => void;
  onVerwijder?: (b: Bestand) => void;
}) {
  const insets = useSafeAreaInsets();
  const [geladen, setGeladen] = useState<GeladenBestand | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [knoppen, setKnoppen] = useState(true);
  const [bezig, setBezig] = useState<'delen' | 'bewaren' | null>(null);
  const tonen = isTeBekijken(bestand);

  useEffect(() => {
    let actief = true;
    haalBestand(bestand)
      .then((b) => actief && setGeladen(b))
      .catch((e) => {
        if (__DEV__) console.log('[BestandWeergave] laden mislukt', e);
        if (actief) setFout(e instanceof BestandFout ? e.message : 'Dit bestand kon niet worden geladen. Probeer het opnieuw.');
      });
    return () => {
      actief = false;
    };
  }, [bestand]);

  const bericht = (b: PdfBericht) => {
    if (b.type === 'tik') setKnoppen((k) => !k);
    if (b.type === 'fout') setFout('De PDF kon niet worden getoond.');
  };

  const actie = async (soort: 'delen' | 'bewaren') => {
    if (!geladen || bezig) return;
    setBezig(soort);
    try {
      if (soort === 'delen') await deelBestand(geladen.base64, geladen.bestandsnaam, geladen.mime);
      else await bewaarBestand(geladen.base64, geladen.bestandsnaam, geladen.mime);
    } catch {
      Dialog.alert(soort === 'delen' ? 'Delen lukte niet' : 'Bewaren lukte niet', 'Probeer het opnieuw.');
    } finally {
      setBezig(null);
    }
  };

  const pdf = geladen && tonen && geladen.mime === 'application/pdf';
  const foto = geladen && tonen && !pdf;

  return (
    <View style={styles.vlak}>
      {pdf ? (
        <PdfFrame base64={geladen.base64} onBericht={bericht} />
      ) : (
        <Pressable style={styles.midden} onPress={() => setKnoppen((k) => !k)} accessible={false}>
          {fout ? (
            <Text style={styles.melding}>{fout}</Text>
          ) : !geladen ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.melding}>Laden…</Text>
            </>
          ) : foto ? (
            <Image
              source={{ uri: `data:${geladen.mime};base64,${geladen.base64}` }}
              style={styles.foto}
              resizeMode="contain"
              accessibilityLabel={bestand.naam}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.geenVoorbeeld}>
              <FileIcon size={44} color="#ddd" strokeWidth={1.5} />
              <Text style={styles.naam}>{geladen.bestandsnaam}</Text>
              <Text style={styles.melding}>Dit soort bestand kan de app niet tonen. Deel het of bewaar het op je toestel.</Text>
            </View>
          )}
        </Pressable>
      )}

      {knoppen || fout || (geladen && !tonen) ? (
        <View style={[styles.balk, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable onPress={onSluit} accessibilityRole="button" accessibilityLabel="Sluiten" hitSlop={8} style={styles.knop}>
            <X size={24} color="#fff" strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.titel} numberOfLines={1}>
            {bestand.naam}
          </Text>
          <View style={styles.rechts}>
            {onVerwijder && bestand.eigen && bestand.magBeheren ? (
              <Pressable
                onPress={() => onVerwijder(bestand)}
                accessibilityRole="button"
                accessibilityLabel="Bestand verwijderen"
                hitSlop={6}
                style={styles.knop}
              >
                <Trash2 size={20} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => actie('bewaren')}
              disabled={!geladen || !!bezig}
              accessibilityRole="button"
              accessibilityLabel="Downloaden"
              hitSlop={6}
              style={[styles.knop, !geladen && styles.uit]}
            >
              {bezig === 'bewaren' ? <ActivityIndicator color="#fff" /> : <Download size={20} color="#fff" />}
            </Pressable>
            <Pressable
              onPress={() => actie('delen')}
              disabled={!geladen || !!bezig}
              accessibilityRole="button"
              accessibilityLabel="Delen"
              hitSlop={6}
              style={[styles.deelKnop, !geladen && styles.uit]}
            >
              {bezig === 'delen' ? <ActivityIndicator color="#0D0D0D" /> : <Share2 size={18} color="#0D0D0D" />}
              <Text style={styles.deelTekst}>Delen</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  vlak: { flex: 1, backgroundColor: '#2b2b2b' },
  midden: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  melding: { color: '#ddd', fontSize: 15, textAlign: 'center', lineHeight: 21, maxWidth: 360 },
  foto: { width: '100%', height: '100%' },
  geenVoorbeeld: { alignItems: 'center', gap: 12 },
  naam: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  balk: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 14,
    paddingBottom: 8,
    backgroundColor: 'rgba(13,13,13,0.82)',
  },
  knop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titel: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  rechts: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deelKnop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1DDB62',
  },
  deelTekst: { color: '#0D0D0D', fontSize: 14, fontWeight: '800' },
  uit: { opacity: 0.4 },
});
