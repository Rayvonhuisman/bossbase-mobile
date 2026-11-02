import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { PenLine, Sparkles } from 'lucide-react-native';
import { bossStatus, type BossFunctie } from '@/services/bossDocumentService';
import { BossMailHulp, type MailSelectie } from './boss/BossMailHulp';
import { FormField } from './FormField';
import { FormSheet } from './FormSheet';
import { NoticeBanner } from './NoticeBanner';
import { useTheme } from '@/providers';
import { spacing } from '@/theme';

export type MailConcept = { aan: string; onderwerp: string; tekst: string };

/** Boss als schrijfhulp: alleen bij een offerte of factuur die al bestaat. */
export type MailBoss = { functie: BossFunctie; documentId: string; klantId: string | null; kanOndertekenen?: boolean };

/**
 * Het mailvenster van offertes en facturen (`SendOfferteMailModal` /
 * `SendFactuurMailModal` in het dashboard): Aan, Onderwerp en Bericht,
 * vooringevuld uit het sjabloon. De logica (sjabloon, bijlage, betaallink,
 * status) zit in het scherm; dit is alleen het formulier.
 */
export function DocumentMailSheet({
  visible,
  titel,
  nummer,
  laden,
  concept,
  onWijzig,
  melding,
  kop,
  vereistOnderwerp,
  saving,
  error,
  onVerstuur,
  onSluit,
  boss,
}: {
  visible: boolean;
  titel: string;
  nummer: string | null | undefined;
  laden: boolean;
  concept: MailConcept;
  onWijzig: (c: MailConcept) => void;
  /** Bijvoorbeeld de ondertekenlink; staat boven de velden. */
  melding?: string | null;
  /** Extra veld boven Aan, bijvoorbeeld de sjabloonkeuze op de klantkaart. */
  kop?: ReactNode;
  /** Versturen pas met een onderwerp (de losse klantmail; documenten hebben er altijd een). */
  vereistOnderwerp?: boolean;
  saving: boolean;
  error: string | null;
  onVerstuur: () => void;
  onSluit: () => void;
  boss?: MailBoss | null;
}) {
  const { colors: t } = useTheme();
  const [bossAan, setBossAan] = useState(false);
  const [hulpOpen, setHulpOpen] = useState(false);
  // Geselecteerde tekst in het bericht: alleen dat stuk laat je Boss herschrijven.
  const [selectie, setSelectie] = useState<{ start: number; end: number } | null>(null);
  const [bossSelectie, setBossSelectie] = useState<MailSelectie | null>(null);
  const selectieTekst = selectie ? concept.tekst.slice(selectie.start, selectie.end).trim() : '';
  const functie = boss?.functie;
  useEffect(() => {
    if (!functie || !visible) return;
    let weg = false;
    void bossStatus(functie).then((s) => { if (!weg) setBossAan(s.mag && s.beschikbaar); });
    return () => { weg = true; };
  }, [functie, visible]);
  const toonBoss = Boolean(boss) && bossAan;
  return (
    <FormSheet
      visible={visible}
      title={titel}
      subtitle={nummer ?? undefined}
      error={error}
      saving={saving}
      submitLabel={saving ? 'Versturen...' : 'Versturen'}
      submitDisabled={laden || !concept.aan.trim() || (vereistOnderwerp && !concept.onderwerp.trim())}
      onSubmit={onVerstuur}
      onClose={() => { setHulpOpen(false); onSluit(); }}
    >
      {laden ? (
        <View style={{ paddingVertical: spacing.xl }}>
          <ActivityIndicator color={t.green600} accessibilityLabel="Sjabloon laden" />
        </View>
      ) : (
        <>
          {melding ? <NoticeBanner toon="info" message={melding} /> : null}
          {kop}
          <FormField
            label="Aan"
            value={concept.aan}
            onChangeText={(aan) => onWijzig({ ...concept, aan })}
            placeholder="emailadres@klant.nl"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FormField
            label="Onderwerp"
            value={concept.onderwerp}
            onChangeText={(onderwerp) => onWijzig({ ...concept, onderwerp })}
          />
          {toonBoss ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              onPress={() => setHulpOpen(true)}
              accessibilityRole="button"
              accessibilityHint="Boss schrijft een voorstel; je verstuurt zelf"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 40,
                paddingHorizontal: 14, borderRadius: 999, backgroundColor: pressed ? t.green100 : t.green50,
                borderWidth: 1, borderColor: t.green100,
              })}
            >
              <Sparkles size={15} color={t.green700} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.green700 }}>Help met schrijven</Text>
            </Pressable>
            {selectieTekst.length > 12 && selectie ? (
              <Pressable
                onPress={() => {
                  setBossSelectie({ sleutel: `s${Date.now()}`, tekst: selectieTekst, start: selectie.start, end: selectie.end, origineel: concept.tekst.slice(selectie.start, selectie.end) });
                  setSelectie(null);
                  setHulpOpen(true);
                }}
                accessibilityRole="button"
                accessibilityHint="Boss herschrijft alleen de geselecteerde tekst"
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14,
                  borderRadius: 999, backgroundColor: pressed ? t.bgAlt : t.card, borderWidth: 1, borderColor: t.lineStrong,
                })}
              >
                <PenLine size={15} color={t.ink} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.ink }}>Herschrijf selectie</Text>
              </Pressable>
            ) : null}
            </View>
          ) : null}
          <FormField
            label="Bericht"
            value={concept.tekst}
            onChangeText={(tekst) => { setSelectie(null); onWijzig({ ...concept, tekst }); }}
            onSelectionChange={toonBoss ? (e) => {
              const { start, end } = e.nativeEvent.selection;
              setSelectie(end > start ? { start, end } : null);
            } : undefined}
            placeholder="Schrijf uw bericht hier..."
            multiline
            style={{ minHeight: 220 }}
          />
          {toonBoss ? (
            <Text style={{ fontSize: 12, color: t.muted }}>Selecteer een stuk tekst om alleen dat door Boss te laten herschrijven.</Text>
          ) : null}
        </>
      )}
      {boss && toonBoss ? (
        <BossMailHulp
          open={hulpOpen && visible}
          onSluit={() => setHulpOpen(false)}
          functie={boss.functie}
          documentId={boss.documentId}
          klantId={boss.klantId}
          nummer={nummer}
          kanOndertekenen={Boolean(boss.kanOndertekenen)}
          concept={concept}
          onWijzig={onWijzig}
          selectie={bossSelectie}
        />
      ) : null}
    </FormSheet>
  );
}
