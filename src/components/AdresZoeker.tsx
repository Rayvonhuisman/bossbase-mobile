import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import {
  adresRegel,
  adresVelden,
  lookupDoc,
  lookupUrl,
  suggestieUrl,
  suggestiesUitAntwoord,
  volgendeIndex,
  ZOEK_VERTRAGING_MS,
  type AdresSuggestie,
  type AdresVelden,
} from '@/lib/adresZoeken';

type Props = {
  /** Krijgt de losse velden na een keuze; het formulier eromheen blijft de baas. */
  onSelect?: (velden: AdresVelden) => void;
  label?: string;
  placeholder?: string;
  hint?: string | null;
  disabled?: boolean;
  /**
   * Het veld zelf is de hele adresregel ("Dam 1, 1012 JS Amsterdam"), zoals de
   * locatie op een werkbon of afspraak. Dan is het gecontroleerd via
   * `value`/`onChangeText` en blijft vrije tekst ("bouwkavel achter de kerk")
   * gewoon mogelijk.
   */
  volledigAdres?: boolean;
  value?: string;
  onChangeText?: (tekst: string) => void;
};

const FOUT_ZOEKEN = 'Adres zoeken lukt even niet — je kunt het zelf typen';
const FOUT_DETAILS = 'Adresdetails ophalen mislukt — je kunt het zelf typen';

/**
 * Adres zoeken via PDOK, zoals `AdresZoeker.jsx` in het dashboard. Slaat zelf
 * niets op: een keuze roept alleen `onSelect` aan met straat + huisnummer,
 * postcode en plaats. De losse velden eronder blijven altijd zelf in te vullen.
 *
 * De lijst staat ín de flow onder het veld (geen zwevende laag), zodat hij in
 * een ScrollView of sheet op elk platform tikbaar blijft.
 */
export function AdresZoeker({
  onSelect,
  label = 'Zoek adres',
  placeholder = 'Bijv. Dam 1 Amsterdam of 1012 JS 1',
  hint = 'Optioneel — je kunt de velden hieronder ook zelf invullen.',
  disabled = false,
  volledigAdres = false,
  value,
  onChangeText,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const gecontroleerd = value !== undefined;
  const [eigen, setEigen] = useState('');
  const tekst = gecontroleerd ? value : eigen;
  // Na een await de nieuwste callbacks gebruiken, niet die van vóór de lookup.
  const terug = useRef({ onSelect, onChangeText });
  useEffect(() => {
    terug.current = { onSelect, onChangeText };
  });
  const zetTekst = (v: string) => (gecontroleerd ? terug.current.onChangeText?.(v) : setEigen(v));

  const [items, setItems] = useState<AdresSuggestie[]>([]);
  const [open, setOpen] = useState(false);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [actief, setActief] = useState(-1);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sluitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const levend = useRef(true);

  useEffect(() => {
    levend.current = true;
    return () => {
      levend.current = false;
      abort.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (sluitTimer.current) clearTimeout(sluitTimer.current);
    };
  }, []);

  // Alleen zoeken als de gebruiker zelf typt; een waarde die van buitenaf
  // binnenkomt (klantadres overnemen, bestaande locatie) klapt niets open.
  const typ = (v: string) => {
    zetTekst(v);
    if (timer.current) clearTimeout(timer.current);
    const url = suggestieUrl(v);
    if (!url) {
      abort.current?.abort();
      setItems([]);
      setOpen(false);
      setFout('');
      setLaden(false);
      return;
    }
    setLaden(true);
    timer.current = setTimeout(() => zoek(url), ZOEK_VERTRAGING_MS);
  };

  const zoek = async (url: string) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`PDOK gaf status ${res.status}`);
      const lijst = suggestiesUitAntwoord(await res.json());
      if (!levend.current || ctrl.signal.aborted) return;
      setItems(lijst);
      setActief(-1);
      setOpen(true);
      setFout(lijst.length ? '' : 'Geen adres gevonden');
    } catch (e) {
      // Opgevolgd door een nieuwere zoekopdracht: niets melden.
      if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError' || !levend.current) return;
      setItems([]);
      setOpen(true);
      setFout(FOUT_ZOEKEN);
    } finally {
      if (levend.current && !ctrl.signal.aborted) setLaden(false);
    }
  };

  const kies = async (item: AdresSuggestie) => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    setOpen(false);
    setItems([]);
    setActief(-1);
    zetTekst(item.weergavenaam);
    setLaden(true);
    setFout('');
    try {
      const res = await fetch(lookupUrl(item.id));
      if (!res.ok) throw new Error(`PDOK gaf status ${res.status}`);
      const doc = lookupDoc(await res.json());
      if (!doc) throw new Error('Geen adresdetails ontvangen');
      if (!levend.current) return;
      const velden = adresVelden(doc);
      // Volledig-adresveld: de hele regel, met de postcode zoals wij hem schrijven.
      if (volledigAdres) zetTekst(adresRegel(velden));
      terug.current.onSelect?.(velden);
    } catch {
      if (levend.current) setFout(FOUT_DETAILS);
    } finally {
      if (levend.current) setLaden(false);
    }
  };

  // Webtoetsenbord: pijltjes door de lijst, Enter kiest, Escape sluit.
  const toets = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (!open || !items.length) return;
    const k = e.nativeEvent.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      setActief((i) => volgendeIndex(i, items.length, k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Enter' && items[actief]) {
      e.preventDefault();
      kies(items[actief]);
    } else if (k === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // Even wachten bij blur: een tik op een suggestie laat het veld eerst los.
  const blur = () => {
    if (sluitTimer.current) clearTimeout(sluitTimer.current);
    sluitTimer.current = setTimeout(() => {
      if (levend.current) setOpen(false);
    }, 200);
  };
  const focus = () => {
    if (sluitTimer.current) clearTimeout(sluitTimer.current);
    if (items.length || fout) setOpen(true);
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.veld, disabled && styles.veldUit]}>
        {volledigAdres ? <MapPin size={16} color={t.muted} /> : <Search size={16} color={t.muted} />}
        <TextInput
          value={tekst ?? ''}
          onChangeText={typ}
          onKeyPress={toets}
          onFocus={focus}
          onBlur={blur}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={t.muted2}
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="search"
          accessibilityLabel={label || 'Zoek adres'}
          aria-expanded={open}
          style={styles.input}
        />
        {laden ? <ActivityIndicator size="small" color={t.muted} /> : null}
      </View>

      {open ? (
        <View style={styles.lijst} accessibilityRole="list">
          {items.map((item, i) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.weergavenaam}
              aria-selected={i === actief}
              onPress={() => kies(item)}
              onHoverIn={() => setActief(i)}
              style={({ pressed }) => [
                styles.rij,
                i > 0 && styles.rijRand,
                (pressed || i === actief) && { backgroundColor: t.bgAlt },
              ]}
            >
              <MapPin size={15} color={t.muted2} />
              <Text style={styles.rijTekst} numberOfLines={2}>
                {item.weergavenaam}
              </Text>
            </Pressable>
          ))}
          {!items.length && fout ? <Text style={styles.leeg}>{fout}</Text> : null}
        </View>
      ) : null}

      {!open && fout ? <Text style={styles.fout}>{fout}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    label: { ...typography.label, color: t.muted2 },
    veld: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      backgroundColor: t.card,
    },
    veldUit: { opacity: 0.5 },
    input: {
      flex: 1,
      minHeight: 46,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: t.ink,
    },
    lijst: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      backgroundColor: t.card,
      overflow: 'hidden',
    },
    rij: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rijRand: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    rijTekst: { flex: 1, fontSize: 15, color: t.ink },
    leeg: { padding: spacing.md, paddingHorizontal: 14, color: t.muted, fontSize: 14 },
    fout: { ...typography.small, color: t.muted },
    hint: { ...typography.small, color: t.muted },
  });
