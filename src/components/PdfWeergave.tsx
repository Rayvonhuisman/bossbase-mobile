import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Printer, Share2, X } from 'lucide-react-native';
import { haalDocumentPdf, PdfFout, type DocumentSoort } from '@/lib/pdf';
import { bytesNaarBase64 } from '@/lib/pdf/afbeelding';
import { deelPdf, kanPrintenViaDelen, printPdf } from '@/lib/pdfDelen';
import { Dialog } from '@/lib/dialog';
import { PdfFrame, type PdfBericht } from './PdfFrame';

export type PdfDocument = {
  soort: DocumentSoort;
  id: string;
  /** Kop in de knoppenlaag, bijv. "Offerte BB-149". */
  titel: string;
  /**
   * false = altijd opnieuw opbouwen (zoals de voorbeeldknop van het dashboard).
   * Werkbon: true = het ondertekende exemplaar, false = "Werkbon als PDF".
   */
  opgeslagenEerst?: boolean;
};

type Geladen = { base64: string; bestandsnaam: string };

/**
 * Een offerte, factuur of werkbon bekijken, precies zoals het dashboard hem maakt: de
 * PDF schermvullend op A4, scrollen door de pagina's, knijpen om te zoomen.
 *
 * Tik op het scherm: de knoppenlaag verschijnt of verdwijnt — kruisje om te
 * sluiten, delen (met "Druk af" op iPhone/iPad), en waar delen niet kan
 * printen een kleine printknop. Zo kun je hem ook rustig bekijken zonder
 * knoppen. Opent met de knoppen zichtbaar, zodat je ziet hoe je terugkomt.
 */
export function PdfWeergave({ document, onSluit }: { document: PdfDocument | null; onSluit: () => void }) {
  return (
    <Modal visible={!!document} animationType="slide" onRequestClose={onSluit} presentationStyle="fullScreen">
      {document ? <Inhoud key={`${document.soort}-${document.id}`} document={document} onSluit={onSluit} /> : null}
    </Modal>
  );
}

function Inhoud({ document, onSluit }: { document: PdfDocument; onSluit: () => void }) {
  const insets = useSafeAreaInsets();
  const [pdf, setPdf] = useState<Geladen | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [knoppen, setKnoppen] = useState(true);
  const [bezig, setBezig] = useState<'delen' | 'printen' | null>(null);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const r = await haalDocumentPdf({
          soort: document.soort,
          id: document.id,
          opgeslagenEerst: document.opgeslagenEerst,
        });
        if (r.bron === 'gemaakt') {
          if (actief) setPdf({ base64: r.base64, bestandsnaam: r.bestandsnaam });
          return;
        }
        // Het bewaarde bestand (wat de klant kreeg): binnenhalen, zodat bekijken,
        // delen en printen hetzelfde bestand gebruiken.
        const antwoord = await fetch(r.url);
        if (!antwoord.ok) throw new PdfFout('Het opgeslagen document kon niet worden geladen.');
        const bytes = new Uint8Array(await antwoord.arrayBuffer());
        if (actief) setPdf({ base64: bytesNaarBase64(bytes), bestandsnaam: r.bestandsnaam });
      } catch (e) {
        if (__DEV__) console.log('[PdfWeergave] PDF maken mislukt', e);
        if (actief) setFout(e instanceof PdfFout ? e.message : 'De PDF kon niet worden gemaakt. Probeer het opnieuw.');
      }
    })();
    return () => {
      actief = false;
    };
  }, [document.soort, document.id, document.opgeslagenEerst]);

  const bericht = (b: PdfBericht) => {
    if (b.type === 'tik') setKnoppen((k) => !k);
    if (b.type === 'fout') setFout('De PDF kon niet worden getoond.');
  };

  const actie = async (soort: 'delen' | 'printen') => {
    if (!pdf || bezig) return;
    setBezig(soort);
    try {
      if (soort === 'delen') await deelPdf(pdf.base64, pdf.bestandsnaam);
      else await printPdf(pdf.base64, pdf.bestandsnaam);
    } catch {
      Dialog.alert(soort === 'delen' ? 'Delen lukte niet' : 'Printen lukte niet', 'Probeer het opnieuw.');
    } finally {
      setBezig(null);
    }
  };

  return (
    <View style={styles.vlak}>
      {pdf ? (
        <PdfFrame base64={pdf.base64} onBericht={bericht} />
      ) : (
        <Pressable style={styles.midden} onPress={() => setKnoppen((k) => !k)} accessible={false}>
          {fout ? (
            <Text style={styles.melding}>{fout}</Text>
          ) : (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.melding}>PDF maken…</Text>
            </>
          )}
        </Pressable>
      )}

      {knoppen || fout ? (
        <View style={[styles.balk, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable onPress={onSluit} accessibilityRole="button" accessibilityLabel="Sluiten" hitSlop={8} style={styles.knop}>
            <X size={24} color="#fff" strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.titel} numberOfLines={1}>
            {document.titel}
          </Text>
          <View style={styles.rechts}>
            {!kanPrintenViaDelen ? (
              <Pressable
                onPress={() => actie('printen')}
                disabled={!pdf || !!bezig}
                accessibilityRole="button"
                accessibilityLabel="Printen"
                hitSlop={6}
                style={[styles.knop, !pdf && styles.uit]}
              >
                {bezig === 'printen' ? <ActivityIndicator color="#fff" /> : <Printer size={20} color="#fff" />}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => actie('delen')}
              disabled={!pdf || !!bezig}
              accessibilityRole="button"
              accessibilityLabel={kanPrintenViaDelen ? 'Delen of printen' : 'Delen'}
              hitSlop={6}
              style={[styles.deelKnop, !pdf && styles.uit]}
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
  melding: { color: '#ddd', fontSize: 15, textAlign: 'center' },
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
  rechts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
