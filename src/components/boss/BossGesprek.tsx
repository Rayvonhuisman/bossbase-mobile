/**
 * Het gesprek met Boss in de werkruimte: wat Boss gebruikt, het gesprek zelf,
 * en onderaan de invoer met plusknop (foto, bestand, bronnen) en microfoon.
 *
 * Gedeeld door offerte en factuur (`OfferteGesprek`, `FactuurGesprek`), zoals
 * `BossShell` in het dashboard. Kort in het gesprek: wat er verandert staat
 * hier, het hele document onder Document.
 *
 * Inspreken: in de webapp de spraakherkenning van de browser (lib/spraak.web);
 * in de iOS- en Android-app de microfoon van het toetsenbord (lib/spraak).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  AlertTriangle, ArrowUp, Camera, Check, ChevronDown, ChevronUp, FileText, Image as ImageIcon, Mic, Plus, Sparkles, Square, X,
} from 'lucide-react-native';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import { DICTEER_HINT, useSpraak } from '@/lib/spraak';
import { BossAvatar } from '../BossChat';

export type Label = { sleutel: string; soort: string; naam: string; onWeg?: () => void };
export type PlusOptie = { label: string; sub?: string; icoon: 'camera' | 'foto' | 'bestand' | 'offerte' | 'werkbon' | 'project'; onPress: () => void };
export type Stap = { l: string; s: 'wacht' | 'bezig' | 'klaar' };

type Props = {
  labels: Label[];
  intro: ReactNode | null;
  children: ReactNode;
  busy: boolean;
  voortgang: Stap[];
  onStop: () => void;
  draft: string;
  setDraft: (f: string | ((oud: string) => string)) => void;
  onSend: (tekst?: string) => void;
  suggesties: string[];
  plusOpties: PlusOptie[];
  placeholder: string;
  /** Verandert bij elk nieuw item: dan naar beneden scrollen. */
  scrollSleutel: string;
};

export function BossGesprek({
  labels, intro, children, busy, voortgang, onStop, draft, setDraft, onSend, suggesties, plusOpties, placeholder, scrollSleutel,
}: Props) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const lijst = useRef<ScrollView>(null);
  const veld = useRef<TextInput>(null);
  const [menu, setMenu] = useState(false);
  const [dicteerHint, setDicteerHint] = useState(false);
  const spraak = useSpraak({ setTekst: (f) => setDraft((oud) => f(oud)) });
  const luistert = spraak.stand !== 'uit';

  useEffect(() => {
    const id = setTimeout(() => lijst.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [scrollSleutel, busy]);

  const mic = () => {
    if (luistert) return spraak.stop();
    if (spraak.ondersteund) return spraak.start();
    // Native: het dicteren van het toetsenbord.
    veld.current?.focus();
    setDicteerHint(true);
  };
  const leeg = !draft.trim();

  return (
    <View style={{ flex: 1 }}>
      {labels.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.ctxRij} contentContainerStyle={s.ctx}>
          {labels.map((l) => (
            <View key={l.sleutel} style={s.chip}>
              <Text style={s.chipTekst} numberOfLines={1}>
                <Text style={s.chipSoort}>{l.soort}: </Text>{l.naam}
              </Text>
              {l.onWeg ? (
                <Pressable onPress={l.onWeg} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${l.soort} ${l.naam} niet gebruiken`}>
                  <X size={13} color={t.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView ref={lijst} style={{ flex: 1 }} contentContainerStyle={s.draad} keyboardShouldPersistTaps="handled">
        {intro}
        {children}
        {busy ? (
          <Kaart soort="ai" rol="status">
            <View style={s.kopRij}>
              <View style={s.kopLinks}><Sparkles size={16} color={t.green700} /><Text style={s.kopTekst}>Boss werkt eraan</Text></View>
              <KleineKnop label="Stoppen" variant="secundair" onPress={onStop} icoon={<Square size={12} color={t.ink} />} />
            </View>
            {voortgang.map((x) => (
              <View key={x.l} style={s.stap}>
                <View style={[s.bol, x.s === 'klaar' && s.bolKlaar, x.s === 'bezig' && s.bolBezig]}>
                  {x.s === 'klaar' ? <Check size={11} color={t.green700} strokeWidth={3} /> : null}
                </View>
                <Text style={[s.stapTekst, x.s === 'bezig' && s.stapBezig]}>{x.l}{x.s === 'bezig' ? '…' : ''}</Text>
              </View>
            ))}
          </Kaart>
        ) : null}
      </ScrollView>

      <View style={s.invoerVlak}>
        {menu ? (
          <View style={s.menu} accessibilityRole="menu">
            {plusOpties.map((o) => (
              <Pressable key={o.label} onPress={() => { setMenu(false); o.onPress(); }} accessibilityRole="menuitem" style={({ pressed }) => [s.menuItem, pressed && { backgroundColor: t.bgAlt }]}>
                <View style={s.menuIcoon}>{icoonVan(o.icoon, t)}</View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuLabel}>{o.label}</Text>
                  {o.sub ? <Text style={s.menuSub}>{o.sub}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!busy && suggesties.length > 0 && !luistert ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sugg} keyboardShouldPersistTaps="handled">
            {suggesties.map((x) => (
              <Pressable key={x} onPress={() => onSend(x)} accessibilityRole="button" style={({ pressed }) => [s.suggKnop, pressed && { opacity: 0.7 }]}>
                <Text style={s.suggTekst}>{x.replace(/\.$/, '')}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {luistert ? (
          <View style={s.luister} accessibilityLiveRegion="polite">
            <Text style={s.luisterKop}>{spraak.stand === 'start' ? 'Microfoon starten…' : 'Boss luistert… tik op stop als je klaar bent'}</Text>
            {spraak.tussen ? <Text style={s.luisterTekst}>{spraak.tussen}</Text> : null}
          </View>
        ) : null}
        {spraak.fout ? (
          <Pressable onPress={spraak.wisFout} style={s.melding} accessibilityRole="alert">
            <AlertTriangle size={14} color={t.statusRejectFg} />
            <Text style={s.meldingTekst}>{spraak.fout} Wat in het invoerveld staat, blijft staan.</Text>
          </Pressable>
        ) : null}
        {dicteerHint && Platform.OS !== 'web' ? (
          <Pressable onPress={() => setDicteerHint(false)} style={[s.melding, s.hint]}>
            <Mic size={14} color={t.green700} />
            <Text style={[s.meldingTekst, { color: t.ink2 }]}>{DICTEER_HINT}</Text>
          </Pressable>
        ) : null}
        <View style={s.invoerRij}>
          <Pressable
            onPress={() => setMenu((m) => !m)}
            accessibilityRole="button"
            accessibilityLabel="Foto, bestand of bron toevoegen"
            accessibilityState={{ expanded: menu }}
            style={({ pressed }) => [s.rond, pressed && { opacity: 0.7 }]}
          >
            {menu ? <X size={20} color={t.ink2} /> : <Plus size={22} color={t.ink2} />}
          </Pressable>
          <TextInput
            ref={veld}
            value={draft}
            onChangeText={(v) => { setDraft(v); if (dicteerHint) setDicteerHint(false); }}
            placeholder={placeholder}
            placeholderTextColor={t.muted2}
            multiline
            style={s.invoer}
            accessibilityLabel="Opdracht voor Boss"
            onKeyPress={(e) => {
              const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                onSend();
              }
            }}
          />
          {leeg || luistert ? (
            <Pressable
              onPress={mic}
              accessibilityRole="button"
              accessibilityLabel={luistert ? 'Inspreken stoppen' : 'Opdracht inspreken'}
              style={({ pressed }) => [s.rond, s.mic, luistert && s.micAan, pressed && { opacity: 0.8 }]}
            >
              {luistert ? <Square size={16} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={20} color="#0D0D0D" />}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onSend()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Opdracht versturen naar Boss"
              style={({ pressed }) => [s.rond, s.mic, busy && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
            >
              <ArrowUp size={20} color="#0D0D0D" strokeWidth={2.6} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function icoonVan(i: PlusOptie['icoon'], t: ThemeColors) {
  const p = { size: 18, color: t.green700 };
  if (i === 'camera') return <Camera {...p} />;
  if (i === 'foto') return <ImageIcon {...p} />;
  if (i === 'bestand') return <FileText {...p} />;
  return <FileText {...p} />;
}

// ── Bouwstenen voor de kaarten ─────────────────────────────────────────────

export function Kaart({ soort = 'gewoon', rol, children }: { soort?: 'gewoon' | 'ai' | 'vraag' | 'fout' | 'klaar' | 'oud'; rol?: 'status' | 'alert'; children: ReactNode }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View
      accessibilityRole={rol === 'alert' ? 'alert' : undefined}
      accessibilityLiveRegion={rol ? 'polite' : undefined}
      style={[s.kaart, soort === 'vraag' && s.kaartVraag, soort === 'fout' && s.kaartFout, soort === 'klaar' && s.kaartKlaar, soort === 'oud' && { opacity: 0.75 }]}
    >
      {children}
    </View>
  );
}

export function KaartKop({ titel, badge, icoon = 'ai' }: { titel: string; badge?: { tekst: string; toon: 'ctrl' | 'ok' | 'grijs' }; icoon?: 'ai' | 'vraag' | 'ok' | 'fout' }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const ic = icoon === 'ok' ? <Check size={16} color={t.green700} strokeWidth={2.6} />
    : icoon === 'fout' ? <AlertTriangle size={16} color={t.statusRejectFg} />
    : icoon === 'vraag' ? <Sparkles size={16} color={t.statusWarnFg} />
    : <Sparkles size={16} color={t.green700} />;
  return (
    <View style={s.kopRij}>
      <View style={s.kopLinks}>{ic}<Text style={[s.kopTekst, icoon === 'fout' && { color: t.statusRejectFg }]}>{titel}</Text></View>
      {badge ? (
        <View style={[s.badge, badge.toon === 'ctrl' && { backgroundColor: t.statusWarnBg }, badge.toon === 'ok' && { backgroundColor: t.green50 }]}>
          <Text style={[s.badgeTekst, badge.toon === 'ctrl' && { color: t.statusWarnFg }, badge.toon === 'ok' && { color: t.green700 }]}>{badge.tekst}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function KaartTekst({ children, klein }: { children: ReactNode; klein?: boolean }) {
  const { colors: t } = useTheme();
  return <Text style={{ fontSize: klein ? 12.5 : 14.5, lineHeight: klein ? 18 : 21, color: klein ? t.muted : t.ink2 }}>{children}</Text>;
}

export function IkBubbel({ tekst }: { tekst: string }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return <View style={s.ik}><Text style={s.ikTekst}>{tekst}</Text></View>;
}

export function BossBubbel({ tekst }: { tekst: string }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.bossRij}>
      <BossAvatar size={28} />
      <View style={s.bossBubbel}><Text style={s.bossTekst}>{tekst}</Text></View>
    </View>
  );
}

export function KleineKnop({ label, onPress, variant = 'primair', disabled, icoon }: { label: string; onPress: () => void; variant?: 'primair' | 'secundair' | 'stil'; disabled?: boolean; icoon?: ReactNode }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.knop, variant === 'primair' && s.knopPrimair, variant === 'secundair' && s.knopSecundair, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
    >
      {icoon}
      <Text style={[s.knopTekst, variant === 'stil' && { color: t.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function Knoppen({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** Waarschuwingen van Boss: kort en altijd zichtbaar. */
export function Waarschuwingen({ lijst }: { lijst?: string[] }) {
  const { colors: t } = useTheme();
  if (!lijst?.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {lijst.map((w, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
          <AlertTriangle size={14} color={t.statusWarnFg} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: t.statusWarnFg }}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

/** Toelichting staat standaard dicht: het voorstel zelf is wat telt. */
export function Uitleg({ lijst, titel = 'Waarop is dit gebaseerd?' }: { lijst?: string[]; titel?: string }) {
  const { colors: t } = useTheme();
  const [open, setOpen] = useState(false);
  if (!lijst?.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={6}>
        {open ? <ChevronUp size={14} color={t.muted} /> : <ChevronDown size={14} color={t.muted} />}
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.muted }}>{titel} ({lijst.length})</Text>
      </Pressable>
      {open ? lijst.map((b, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
          <Check size={13} color={t.green700} style={{ marginTop: 3 }} />
          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: t.muted }}>{b}</Text>
        </View>
      )) : null}
    </View>
  );
}

/**
 * Een lange lijst wijzigingen: de eerste drie, en een knop voor de rest. Zo
 * staan het totaal en de knoppen bij een factuur van veertien regels toch
 * direct in beeld.
 */
export function Inklap<T>({ items, render, eerst = 3 }: { items: T[]; render: (x: T, i: number) => ReactNode; eerst?: number }) {
  const { colors: t } = useTheme();
  const [open, setOpen] = useState(false);
  const lang = items.length > eerst + 2;
  const zichtbaar = lang && !open ? items.slice(0, eerst) : items;
  return (
    <View style={{ gap: 8 }}>
      {zichtbaar.map(render)}
      {lang ? (
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {open ? <ChevronUp size={14} color={t.green700} /> : <ChevronDown size={14} color={t.green700} />}
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.green700 }}>{open ? 'Minder tonen' : `Alle ${items.length} wijzigingen tonen`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Eén regel in een voorstel: + nieuw, ~ gewijzigd, − weg. */
export function WijzigRegel({ teken, titel, sub, bedrag, oudTitel }: { teken: '+' | '~' | '−'; titel: string; sub?: ReactNode; bedrag?: string; oudTitel?: string }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const kleur = teken === '+' ? { bg: t.green50, fg: t.green700 } : teken === '~' ? { bg: t.statusSubmitBg, fg: t.statusSubmitFg } : { bg: t.statusRejectBg, fg: t.statusRejectFg };
  return (
    <View style={s.wz}>
      <View style={[s.tk, { backgroundColor: kleur.bg }]} accessibilityLabel={teken === '+' ? 'Nieuw' : teken === '~' ? 'Gewijzigd' : 'Verwijderd'}>
        <Text style={[s.tkTekst, { color: kleur.fg }]}>{teken}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {oudTitel ? <Text style={s.wzOud}>{oudTitel}</Text> : null}
        <Text style={[s.wzTitel, teken === '−' && s.wzOud]}>{titel}</Text>
        {sub ? <Text style={s.wzSub}>{sub}</Text> : null}
      </View>
      {bedrag ? <Text style={s.wzBedrag}>{bedrag}</Text> : null}
    </View>
  );
}

export function TotaalRegels({ excl, incl, voorExcl, voorIncl }: { excl: string; incl: string; voorExcl?: string | null; voorIncl?: string | null }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.totaal}>
      <View style={s.totaalRij}><Text style={s.totaalLabel}>Subtotaal excl. btw</Text><Text style={s.totaalWaarde}>{voorExcl ? <Text style={s.doorgehaald}>{voorExcl}  </Text> : null}{excl}</Text></View>
      <View style={s.totaalRij}><Text style={[s.totaalLabel, s.vet]}>Totaal incl. btw</Text><Text style={[s.totaalWaarde, s.vet]}>{voorIncl ? <Text style={s.doorgehaald}>{voorIncl}  </Text> : null}{incl}</Text></View>
    </View>
  );
}

/** Een keuze met knoppen (een vraag van Boss, een werkbon kiezen). */
export function Opties({ opties, gekozen, onKies }: { opties: { waarde: string; label: string }[]; gekozen: string; onKies: (w: string) => void }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.opties}>
      {opties.map((o) => (
        <Pressable key={o.waarde} onPress={() => onKies(o.waarde)} accessibilityRole="radio" accessibilityState={{ checked: gekozen === o.waarde }} style={[s.optie, gekozen === o.waarde && s.optieAan]}>
          <Text style={[s.optieTekst, gekozen === o.waarde && s.optieTekstAan]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function KiesLijst({ items, onKies }: { items: { id: string; titel: string; sub?: string }[]; onKies: (id: string) => void }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.kiesLijst}>
      {items.map((x, i) => (
        <Pressable key={x.id} onPress={() => onKies(x.id)} accessibilityRole="button" style={({ pressed }) => [s.kiesItem, i > 0 && s.kiesRand, pressed && { backgroundColor: t.green50 }]}>
          <Text style={s.kiesTitel}>{x.titel}</Text>
          {x.sub ? <Text style={s.kiesSub} numberOfLines={1}>{x.sub}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    ctxRij: { flexGrow: 0 },
    ctx: { gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 2 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 10, height: 30, maxWidth: 240 },
    chipTekst: { fontSize: 12.5, color: t.ink2, flexShrink: 1 },
    chipSoort: { color: t.muted },
    draad: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'flex-end' },
    kaart: { backgroundColor: t.card, borderRadius: t.rLg, padding: 14, gap: 10 },
    kaartVraag: { borderWidth: 1.5, borderColor: '#F5C26B' },
    kaartFout: { backgroundColor: t.statusRejectBg },
    kaartKlaar: { backgroundColor: t.green50 },
    kopRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    kopLinks: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 },
    kopTekst: { fontSize: 15, fontWeight: '600', color: t.ink, flexShrink: 1 },
    badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: t.bgAlt },
    badgeTekst: { fontSize: 12, fontWeight: '600', color: t.muted },
    stap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bol: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: t.lineStrong, alignItems: 'center', justifyContent: 'center' },
    bolKlaar: { backgroundColor: t.green50, borderColor: t.green50 },
    bolBezig: { borderColor: t.green },
    stapTekst: { fontSize: 13.5, color: t.muted },
    stapBezig: { color: t.ink, fontWeight: '600' },
    ik: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: '#1DDB62', borderRadius: 18, borderTopRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
    ikTekst: { fontSize: 15, lineHeight: 21, color: '#0D0D0D' },
    bossRij: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', maxWidth: '92%' },
    bossBubbel: { flexShrink: 1, backgroundColor: t.card, borderRadius: 18, borderTopLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
    bossTekst: { fontSize: 15, lineHeight: 21, color: t.ink },
    knop: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, height: 38 },
    knopPrimair: { backgroundColor: t.green },
    knopSecundair: { backgroundColor: t.bgAlt },
    knopTekst: { fontSize: 14, fontWeight: '600', color: '#0D0D0D' },
    wz: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    tk: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    tkTekst: { fontSize: 13, fontWeight: '800' },
    wzTitel: { fontSize: 14, fontWeight: '600', color: t.ink },
    wzOud: { fontSize: 13, color: t.muted, textDecorationLine: 'line-through' },
    wzSub: { fontSize: 12.5, color: t.muted, marginTop: 1 },
    wzBedrag: { fontSize: 14, fontWeight: '700', color: t.ink, fontVariant: ['tabular-nums'] },
    totaal: { backgroundColor: t.bgAlt, borderRadius: 12, padding: 10, gap: 3 },
    totaalRij: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    totaalLabel: { fontSize: 13, color: t.muted },
    totaalWaarde: { fontSize: 13, color: t.ink, fontVariant: ['tabular-nums'] },
    vet: { fontWeight: '700', color: t.ink, fontSize: 14 },
    doorgehaald: { color: t.muted, textDecorationLine: 'line-through', fontWeight: '400' },
    opties: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    optie: { borderWidth: 1.5, borderColor: t.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    optieAan: { borderColor: t.green, backgroundColor: t.green50 },
    optieTekst: { fontSize: 13.5, color: t.ink2 },
    optieTekstAan: { fontWeight: '600', color: t.ink },
    kiesLijst: { backgroundColor: t.bgAlt, borderRadius: 14, overflow: 'hidden' },
    kiesItem: { paddingHorizontal: 14, paddingVertical: 11, gap: 2 },
    kiesRand: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.lineStrong },
    kiesTitel: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    kiesSub: { fontSize: 12.5, color: t.muted },
    invoerVlak: { backgroundColor: t.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.lineStrong, paddingHorizontal: 12, paddingTop: 10, gap: 8 },
    menu: { backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.line, padding: 6 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
    menuIcoon: { width: 34, height: 34, borderRadius: 10, backgroundColor: t.green50, alignItems: 'center', justifyContent: 'center' },
    menuLabel: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    menuSub: { fontSize: 12.5, color: t.muted },
    sugg: { gap: 6 },
    suggKnop: { borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 11, height: 32, justifyContent: 'center' },
    suggTekst: { fontSize: 12.5, fontWeight: '600', color: t.ink2 },
    luister: { gap: 4, paddingHorizontal: 4 },
    luisterKop: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
    luisterTekst: { fontSize: 14, fontStyle: 'italic', color: t.ink2 },
    melding: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: t.statusRejectBg, borderRadius: 12, padding: 10 },
    hint: { backgroundColor: t.green50 },
    meldingTekst: { flex: 1, fontSize: 13, lineHeight: 18, color: t.statusRejectFg },
    invoerRij: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    rond: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.bgAlt, alignItems: 'center', justifyContent: 'center' },
    mic: { backgroundColor: '#1DDB62' },
    micAan: { backgroundColor: '#DC2626' },
    invoer: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, backgroundColor: t.bg, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 15, lineHeight: 21, color: t.ink },
  });
