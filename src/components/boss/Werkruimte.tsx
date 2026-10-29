/**
 * De Boss-werkruimte: een offerte of factuur opstellen met Boss.
 *
 * Hetzelfde ontwerp als het dashboard (`components/boss/Werkruimte.jsx`), voor
 * een telefoon: het document en het gesprek als twee tabbladen. Op een iPad of
 * breed browservenster (vanaf {@link NAAST_ELKAAR_VANAF}) staan ze naast
 * elkaar: links het document, rechts Boss.
 *
 * Het document is het formulier zelf: dezelfde velden, dezelfde opslag. De
 * werkruimte bepaalt alleen de indeling, en voegt toe:
 *   - "Nog nodig" op een vaste plek bovenaan het document;
 *   - Bewerken / Voorbeeld (zoals de klant het leest);
 *   - onderaan het totaal en de knoppen Opslaan als concept en Opslaan en versturen;
 *   - na toepassen een melding met "Bekijk document" als je op Gesprek staat.
 *
 * Beide panelen blijven gemount; wisselen verliest niets.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronUp, Eye, FileText, MessageSquare, Pencil } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import { NAAST_ELKAAR_VANAF, WERKRUIMTE_MAX } from '@/lib/schermklasseRegels';
import { spacing, type ThemeColors } from '@/theme';
import { MobielKader } from '../MobielKader';

export type Aandachtspunt = { tekst: string; actie?: { label: string; onPress: () => void } };

type Ctx = {
  naastElkaar: boolean;
  toonDocument: () => void;
  /** Na toepassen: een melding met "Bekijk document" (alleen als het document niet in beeld is). */
  meldToegepast: (tekst: string) => void;
};
const WerkruimteCtx = createContext<Ctx | null>(null);
export const useWerkruimte = () => useContext(WerkruimteCtx);

type Props = {
  open: boolean;
  titel: string;
  nummer?: string | null;
  status: { label: string; toon: 'concept' | 'versie' };
  bossBezig: boolean;
  /** Kaarten die op de gebruiker wachten (vraag, voorstel): stipje op de tab Gesprek. */
  bossWacht: number;
  onTerug: () => void;
  gesprek: ReactNode;
  document: ReactNode;
  voorbeeld: ReactNode;
  aandachtspunten: Aandachtspunt[];
  totaal: { excl: number; incl: number };
  acties: ReactNode;
};

export function Werkruimte({
  open, titel, nummer, status, bossBezig, bossWacht, onTerug, gesprek, document, voorbeeld, aandachtspunten, totaal, acties,
}: Props) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const naastElkaar = Math.min(width, WERKRUIMTE_MAX) >= NAAST_ELKAAR_VANAF;
  const [tab, setTab] = useState<'document' | 'gesprek'>('gesprek');
  const [weergave, setWeergave] = useState<'bewerken' | 'voorbeeld'>('bewerken');
  const [aandachtOpen, setAandachtOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [documentGezien, setDocumentGezien] = useState(true);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const toonDocument = useCallback(() => {
    setWeergave('bewerken');
    setTab('document');
    setToast(null);
    setDocumentGezien(true);
  }, []);
  const meldToegepast = useCallback((tekst: string) => {
    setDocumentGezien(false);
    if (naastElkaar) return;
    setToast(tekst);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, [naastElkaar]);
  const ctx = useMemo(() => ({ naastElkaar, toonDocument, meldToegepast }), [naastElkaar, toonDocument, meldToegepast]);

  const docVlak = (
    <View style={[s.vlak, !naastElkaar && tab !== 'document' && s.verborgen]}>
      <View style={s.docKop}>
        <View style={s.seg} accessibilityRole="tablist">
          {(['bewerken', 'voorbeeld'] as const).map((w) => (
            <Pressable key={w} onPress={() => setWeergave(w)} accessibilityRole="tab" accessibilityState={{ selected: weergave === w }} style={[s.segKnop, weergave === w && s.segAan]}>
              {w === 'bewerken' ? <Pencil size={14} color={weergave === w ? t.ink : t.muted} /> : <Eye size={14} color={weergave === w ? t.ink : t.muted} />}
              <Text style={[s.segTekst, weergave === w && s.segTekstAan]}>{w === 'bewerken' ? 'Bewerken' : 'Voorbeeld'}</Text>
            </Pressable>
          ))}
        </View>
        {aandachtspunten.length ? (
          <Pressable onPress={() => setAandachtOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: aandachtOpen }} style={s.nodig}>
            <AlertTriangle size={14} color={t.statusWarnFg} />
            <Text style={s.nodigTekst} numberOfLines={1}>
              Nog nodig: {aandachtspunten[0]!.tekst}{aandachtspunten.length > 1 ? ` en ${aandachtspunten.length - 1} meer` : ''}
            </Text>
            {aandachtOpen ? <ChevronUp size={14} color={t.statusWarnFg} /> : <ChevronDown size={14} color={t.statusWarnFg} />}
          </Pressable>
        ) : (
          <View style={s.klaar} accessibilityRole="text"><Check size={14} color={t.green700} strokeWidth={2.6} /><Text style={s.klaarTekst}>Klaar om op te slaan</Text></View>
        )}
      </View>
      {aandachtOpen && aandachtspunten.length ? (
        <View style={s.aandachtLijst}>
          {aandachtspunten.map((a) => (
            <View key={a.tekst} style={s.aandachtRij}>
              <Text style={s.aandachtTekst}>{a.tekst}</Text>
              {a.actie ? (
                <Pressable onPress={() => { setAandachtOpen(false); setWeergave('bewerken'); a.actie!.onPress(); }} accessibilityRole="button" hitSlop={6}>
                  <Text style={s.aandachtActie}>{a.actie.label}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.docScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}>
        <View style={weergave !== 'bewerken' && s.verborgen}>{document}</View>
        {weergave === 'voorbeeld' ? voorbeeld : null}
      </ScrollView>
      <View style={[s.voet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={s.voetTotaal}>
          <Text style={s.voetLabel}>Totaal incl. btw</Text>
          <Text style={s.voetBedrag}>{formatEURCent(totaal.incl)}</Text>
          <Text style={s.voetSub}>{formatEURCent(totaal.excl)} excl.</Text>
        </View>
        <View style={s.voetKnoppen}>{acties}</View>
      </View>
    </View>
  );

  const gesprekVlak = (
    <View style={[s.vlak, naastElkaar && s.gesprekNaast, !naastElkaar && tab !== 'gesprek' && s.verborgen, { paddingBottom: insets.bottom }]}>
      {naastElkaar ? (
        <View style={s.gesprekKop}><MessageSquare size={16} color={t.green700} /><Text style={s.gesprekKopTekst}>Boss</Text><Text style={s.gesprekKopSub}>AI-assistent · doet een voorstel, jij beslist</Text></View>
      ) : null}
      {gesprek}
      {toast && !naastElkaar && tab === 'gesprek' ? (
        <Pressable onPress={toonDocument} accessibilityRole="button" style={[s.toast, { bottom: 96 + insets.bottom }]}>
          <Text style={s.toastTekst} numberOfLines={2}>{toast}</Text>
          <Text style={s.toastActie}>Bekijk document ›</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={onTerug}>
      <WerkruimteCtx.Provider value={ctx}>
        <MobielKader soort="werkruimte">
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[s.kop, { paddingTop: insets.top + 6 }]}>
              <View style={s.kopRij}>
                <Pressable onPress={onTerug} accessibilityRole="button" accessibilityLabel="Terug naar het formulier. Je gesprek en het document blijven bewaard." hitSlop={8} style={s.terug}>
                  <ChevronLeft size={22} color={t.ink2} />
                  {naastElkaar ? <Text style={s.terugTekst}>Terug</Text> : null}
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.titel} numberOfLines={1} accessibilityRole="header">{titel}</Text>
                  <View style={s.meta}>
                    {nummer ? <Text style={s.nummer}>{nummer}</Text> : null}
                    <View style={[s.punt, status.toon === 'versie' && { backgroundColor: t.statusSubmitFg }]} />
                    <Text style={s.metaTekst} numberOfLines={1}>{status.label}</Text>
                    {bossBezig ? <Text style={s.bezig}>· Boss werkt eraan</Text> : null}
                  </View>
                </View>
              </View>
              {!naastElkaar ? (
                <View style={s.tabs} accessibilityRole="tablist">
                  <Pressable onPress={toonDocument} accessibilityRole="tab" accessibilityState={{ selected: tab === 'document' }} style={[s.tab, tab === 'document' && s.tabAan]}>
                    <FileText size={15} color={tab === 'document' ? t.ink : t.muted} />
                    <Text style={[s.tabTekst, tab === 'document' && s.tabTekstAan]}>Document</Text>
                    {aandachtspunten.length ? <View style={s.teller}><Text style={s.tellerTekst}>{aandachtspunten.length}</Text></View> : null}
                    {!documentGezien && tab !== 'document' ? <View style={s.stip} accessibilityLabel="Nieuw in het document" /> : null}
                  </Pressable>
                  <Pressable onPress={() => setTab('gesprek')} accessibilityRole="tab" accessibilityState={{ selected: tab === 'gesprek' }} style={[s.tab, tab === 'gesprek' && s.tabAan]}>
                    <MessageSquare size={15} color={tab === 'gesprek' ? t.ink : t.muted} />
                    <Text style={[s.tabTekst, tab === 'gesprek' && s.tabTekstAan]}>Gesprek</Text>
                    {(bossBezig || bossWacht > 0) && tab !== 'gesprek' ? <View style={s.stip} accessibilityLabel={bossBezig ? 'Boss werkt' : 'Boss wacht op je'} /> : null}
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={[s.lijf, naastElkaar && s.lijfNaast]}>
              {docVlak}
              {gesprekVlak}
            </View>
          </KeyboardAvoidingView>
        </MobielKader>
      </WerkruimteCtx.Provider>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kop: { backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.lineStrong, paddingHorizontal: spacing.md, paddingBottom: 10, gap: 10 },
    kopRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    terug: { height: 36, minWidth: 36, borderRadius: 18, backgroundColor: t.bgAlt, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 6, gap: 2 },
    terugTekst: { fontSize: 14, fontWeight: '600', color: t.ink2, paddingRight: 6 },
    titel: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: t.ink },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    nummer: { fontSize: 12.5, fontWeight: '600', color: t.ink2 },
    punt: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F59E0B' },
    metaTekst: { fontSize: 12.5, color: t.muted, flexShrink: 1 },
    bezig: { fontSize: 12.5, fontWeight: '600', color: t.green700 },
    tabs: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: t.bgAlt, borderRadius: 14 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 11 },
    tabAan: { backgroundColor: t.card, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    tabTekst: { fontSize: 14, fontWeight: '600', color: t.muted },
    tabTekstAan: { color: t.ink },
    teller: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: t.statusWarnBg, alignItems: 'center', justifyContent: 'center' },
    tellerTekst: { fontSize: 11, fontWeight: '700', color: t.statusWarnFg },
    stip: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.green },
    lijf: { flex: 1 },
    lijfNaast: { flexDirection: 'row', gap: 12, padding: 12 },
    vlak: { flex: 1, minWidth: 0 },
    verborgen: { display: 'none' },
    gesprekNaast: { flex: 0, width: '40%', minWidth: 340, backgroundColor: t.bg, borderRadius: t.rXl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: t.lineStrong },
    gesprekKop: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 12, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.lineStrong },
    gesprekKopTekst: { fontSize: 15, fontWeight: '700', color: t.ink },
    gesprekKopSub: { fontSize: 12.5, color: t.muted, flexShrink: 1 },
    docKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.lg, paddingTop: 10 },
    seg: { flexDirection: 'row', padding: 3, backgroundColor: t.bgAlt, borderRadius: 12 },
    segKnop: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 9 },
    segAan: { backgroundColor: t.card },
    segTekst: { fontSize: 13, fontWeight: '600', color: t.muted },
    segTekstAan: { color: t.ink },
    nodig: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.statusWarnBg, borderRadius: 999, paddingHorizontal: 11, height: 32, flexShrink: 1, maxWidth: '100%' },
    nodigTekst: { fontSize: 12.5, fontWeight: '600', color: t.statusWarnFg, flexShrink: 1 },
    klaar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    klaarTekst: { fontSize: 12.5, fontWeight: '600', color: t.green700 },
    aandachtLijst: { marginHorizontal: spacing.lg, marginTop: 8, backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.line },
    aandachtRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    aandachtTekst: { flex: 1, fontSize: 14, color: t.ink2 },
    aandachtActie: { fontSize: 14, fontWeight: '700', color: t.green700 },
    docScroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 32 },
    voet: { backgroundColor: t.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: spacing.lg, paddingTop: 14, gap: 10, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 8 },
    voetTotaal: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    voetLabel: { fontSize: 12.5, color: t.muted },
    voetBedrag: { fontSize: 20, fontWeight: '700', color: t.ink, fontVariant: ['tabular-nums'] },
    voetSub: { fontSize: 12, color: t.muted2, fontVariant: ['tabular-nums'] },
    voetKnoppen: { flexDirection: 'row', gap: 8 },
    toast: { position: 'absolute', left: 16, right: 16, backgroundColor: '#0F172A', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
    toastTekst: { flex: 1, fontSize: 14, color: '#FFFFFF' },
    toastActie: { fontSize: 14, fontWeight: '700', color: '#4ADE80' },
  });
