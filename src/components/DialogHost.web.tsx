import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { dsShadowPop, radius, spacing, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import {
  abonneerOpDialogen,
  huidigeDialoog,
  verwijderDialoog,
  type DialogKnop,
  type DialogVerzoek,
} from '@/lib/dialogStore';

/**
 * Tekent de dialogen op web (zie `lib/dialog.web.ts`). Staat één keer in de
 * root-layout; op iOS en Android is `DialogHost.tsx` leeg.
 *
 * Gedrag, zo dicht mogelijk bij de systeemdialoog:
 *
 * - Een knop sluit eerst de dialoog en roept dán zijn actie aan. Zo kan een
 *   actie meteen een volgende dialoog openen ("Foto toevoegen" → "Welke
 *   fase?") en kan niemand twee keer op "Verwijderen" drukken. De actie loopt
 *   synchroon in de klik, zodat een bestandskiezer die erin wordt geopend nog
 *   als gebruikersactie telt.
 * - Escape of een klik naast de dialoog betekent "annuleren", en kan dus
 *   alleen als er iets te annuleren valt: een knop met stijl `cancel`, of een
 *   melding met één gewone knop. Bij een keuze zonder annuleerknop, of als de
 *   enige knop destructief is, moet er expliciet gekozen worden — een
 *   destructieve actie gebeurt nooit door wegklikken.
 * - De focus gaat naar de veiligste knop (annuleren als die er is) en keert na
 *   het sluiten terug naar waar hij was. De focus-trap komt van de `Modal` van
 *   react-native-web.
 */
export function DialogHost() {
  const dialoog = useSyncExternalStore(abonneerOpDialogen, huidigeDialoog, huidigeDialoog);
  const vorigeFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Onthoud waar de focus stond vóór de eerste dialoog, en zet hem daar terug
  // als de laatste dialoog uit de rij is.
  useEffect(() => {
    if (dialoog && !wasOpen.current) {
      vorigeFocus.current = document.activeElement as HTMLElement | null;
    }
    if (!dialoog && wasOpen.current) {
      const doel = vorigeFocus.current;
      vorigeFocus.current = null;
      if (doel && document.contains(doel)) requestAnimationFrame(() => doel.focus());
    }
    wasOpen.current = !!dialoog;
  }, [dialoog]);

  const annuleer = dialoog ? annuleerKnop(dialoog) : null;
  const sluitBaar = !!dialoog && dialoog.opties?.cancelable !== false && annuleer !== null;

  const wegklikken = () => {
    if (!dialoog || !sluitBaar) return;
    kies(dialoog, annuleer === 'zonder-knop' ? null : annuleer);
  };

  return (
    // Geen `onRequestClose`: Escape handelt `DialoogInhoud` zelf af (zie daar).
    <Modal transparent visible={!!dialoog} animationType="fade">
      {dialoog ? (
        <DialoogInhoud
          key={dialoog.id}
          dialoog={dialoog}
          sluitBaar={sluitBaar}
          onWegklikken={wegklikken}
        />
      ) : null}
    </Modal>
  );
}

/**
 * Welke knop "annuleren" betekent, of `null` als wegklikken niet mag.
 * `'zonder-knop'`: een melding met één gewone knop die geen actie heeft.
 */
function annuleerKnop(d: DialogVerzoek): DialogKnop | 'zonder-knop' | null {
  const cancel = d.knoppen.find((k) => k.style === 'cancel');
  if (cancel) return cancel;
  const [enige, ...rest] = d.knoppen;
  if (enige && rest.length === 0 && enige.style !== 'destructive') {
    return enige.onPress ? enige : 'zonder-knop';
  }
  return null;
}

function kies(d: DialogVerzoek, knop: DialogKnop | null) {
  verwijderDialoog(d.id);
  if (!knop) {
    d.opties?.onDismiss?.();
    return;
  }
  try {
    const uitkomst = knop.onPress?.();
    if (uitkomst instanceof Promise) {
      uitkomst.catch((e) => console.error('[dialog] actie mislukt', e));
    }
  } catch (e) {
    console.error('[dialog] actie mislukt', e);
  }
}

function DialoogInhoud({
  dialoog,
  sluitBaar,
  onWegklikken,
}: {
  dialoog: DialogVerzoek;
  sluitBaar: boolean;
  onWegklikken: () => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const eersteFocus = useRef<View>(null);

  // Annuleren eerst in de focus: Enter na het openen mag nooit per ongeluk
  // iets verwijderen.
  const focusIndex = Math.max(
    0,
    dialoog.knoppen.findIndex((k) => k.style === 'cancel'),
  );

  // Escape = wegklikken. Zelf afgevangen in plaats van via de `Modal` van
  // react-native-web: die luistert pas als zijn fade-in klaar is, dus een
  // snelle Escape direct na het openen deed niets. Bewust op `keyup`, net als
  // die `Modal`: een formulier-modal eronder wordt pas weer "actief" na deze
  // toetsaanslag, zodat dezelfde Escape niet ook dat formulier sluit.
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !sluitBaar) return;
      e.preventDefault();
      onWegklikken();
    };
    document.addEventListener('keyup', opToets);
    return () => document.removeEventListener('keyup', opToets);
  }, [sluitBaar, onWegklikken]);

  // Tab en Shift+Tab gaan rond over de knoppen van de dialoog. De focus-trap
  // van react-native-web houdt de focus ook binnen de modal, maar met een lege
  // tussenstop; dit is directer en voorspelbaar.
  const kaart = useRef<View>(null);

  // Altijd bovenop. react-native-web zet de container van elke `Modal` in
  // <body> zodra het component mount, met dezelfde z-index. Deze host mount
  // als eerste (in de root-layout), dus een formulier dat later mount lag
  // erboven: een bevestiging als "Uren verwijderen?" vanuit een formulier was
  // onzichtbaar. Bij elke dialoog schuiven we zijn container naar het eind
  // van <body>, zodat hij boven alles ligt wat er op dat moment open is.
  useLayoutEffect(() => {
    let el = kaart.current as unknown as HTMLElement | null;
    while (el && el.parentElement && el.parentElement !== document.body) el = el.parentElement;
    if (el && el.parentElement === document.body && el !== document.body.lastElementChild) {
      document.body.appendChild(el);
    }
  }, []);

  useEffect(() => {
    const opTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const el = kaart.current as unknown as HTMLElement | null;
      const knoppen = el ? Array.from(el.querySelectorAll<HTMLElement>('[role="button"]')) : [];
      if (knoppen.length === 0) return;
      e.preventDefault();
      const nu = knoppen.indexOf(document.activeElement as HTMLElement);
      const stap = e.shiftKey ? -1 : 1;
      const volgende = nu === -1 ? 0 : (nu + stap + knoppen.length) % knoppen.length;
      knoppen[volgende]?.focus();
    };
    document.addEventListener('keydown', opTab);
    return () => document.removeEventListener('keydown', opTab);
  }, []);

  useEffect(() => {
    const el = eersteFocus.current as unknown as HTMLElement | null;
    // Na de fade-in, anders verliest de focus het van de focus-trap.
    const id = setTimeout(() => el?.focus?.(), 30);
    return () => clearTimeout(id);
  }, []);

  // Twee knoppen naast elkaar, zoals de systeemdialoog, met annuleren links.
  // Meer knoppen onder elkaar, met annuleren onderaan — zoals iOS dat doet.
  const naastElkaar = dialoog.knoppen.length === 2;
  const knoppen = [...dialoog.knoppen].sort((a, b) => {
    const verschil = Number(b.style === 'cancel') - Number(a.style === 'cancel');
    return naastElkaar ? verschil : -verschil;
  });
  const titelId = `dialoog-titel-${dialoog.id}`;
  const tekstId = `dialoog-tekst-${dialoog.id}`;

  return (
    <View style={styles.achtergrond}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={sluitBaar ? onWegklikken : undefined}
        // Alleen de muis/vinger: de achtergrond hoort niet in de tabvolgorde.
        accessible={false}
        focusable={false}
      />
      <View
        ref={kaart}
        role="alertdialog"
        aria-modal
        aria-labelledby={titelId}
        aria-describedby={dialoog.bericht ? tekstId : undefined}
        style={styles.kaart}
      >
        <Text id={titelId} role="heading" aria-level={2} style={styles.titel}>
          {dialoog.titel}
        </Text>
        {dialoog.bericht ? (
          <Text id={tekstId} style={styles.bericht}>
            {dialoog.bericht}
          </Text>
        ) : null}
        <View style={[styles.knoppen, naastElkaar && styles.knoppenNaast]}>
          {knoppen.map((knop) => {
            const origineel = dialoog.knoppen.indexOf(knop);
            const stijl = knop.style ?? 'default';
            return (
              <Pressable
                key={`${origineel}-${knop.text ?? ''}`}
                ref={origineel === focusIndex ? eersteFocus : undefined}
                role="button"
                onPress={() => kies(dialoog, knop)}
                style={(state) => {
                  // react-native-web geeft naast `pressed` ook hover en focus door.
                  const s = state as { pressed: boolean; hovered?: boolean; focused?: boolean };
                  return [
                    styles.knop,
                    naastElkaar && styles.knopNaast,
                    stijl === 'cancel' && styles.knopAnnuleer,
                    stijl === 'default' && styles.knopStandaard,
                    stijl === 'destructive' && styles.knopGevaar,
                    (s.hovered || s.pressed) && styles.knopActief,
                    s.focused && styles.knopFocus,
                  ];
                }}
              >
                <Text
                  style={[
                    styles.knopTekst,
                    stijl === 'cancel' && styles.knopTekstAnnuleer,
                    stijl === 'destructive' && styles.knopTekstGevaar,
                  ]}
                >
                  {knop.text ?? 'OK'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    achtergrond: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      // Zelfde verduistering als de kiezers en vellen elders in de app.
      backgroundColor: 'rgba(4,18,12,0.5)',
    },
    kaart: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: t.card,
      borderRadius: 22,
      padding: spacing.xl,
      gap: spacing.sm,
      ...dsShadowPop,
    },
    titel: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: t.ink },
    bericht: { fontSize: 14.5, lineHeight: 21, color: t.muted },
    knoppen: { marginTop: spacing.md, gap: spacing.sm },
    knoppenNaast: { flexDirection: 'row' },
    knop: {
      minHeight: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    knopNaast: { flex: 1 },
    knopAnnuleer: { backgroundColor: t.bgAlt },
    knopStandaard: { backgroundColor: t.green },
    // Rood vlak met witte tekst: in beide thema's onmiskenbaar "dit is niet
    // terug te draaien".
    knopGevaar: { backgroundColor: '#DC2626' },
    knopActief: { opacity: 0.85 },
    knopFocus: {
      outlineColor: t.green700,
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineOffset: 2,
    } as object,
    knopTekst: { fontSize: 15, fontWeight: '700', color: t.greenInk, textAlign: 'center' },
    knopTekstAnnuleer: { color: t.ink },
    knopTekstGevaar: { color: '#FFFFFF' },
  });
