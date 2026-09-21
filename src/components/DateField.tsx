import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar as CalendarIcon, Clock } from 'lucide-react-native';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import {
  isoVanDatum,
  nlDatum,
  parseISODatum,
  parseISOTijd,
  tijdVanDatum,
} from '@/lib/datum';

/**
 * Datum- en tijdselectie voor de hele app.
 *
 * Waarom één component en geen los invoerveld per scherm:
 *
 * - **Niemand typt meer een datum.** Een tekstveld met `JJJJ-MM-DD` vraagt de
 *   gebruiker om het formaat van de database te kennen. Dat is de verkeerde
 *   kant op geredeneerd: het toestel heeft een kalender, dus die gebruiken we.
 * - **Eén conversie, op één plek.** De waarde blijft naar buiten toe gewoon
 *   `YYYY-MM-DD` — precies wat de services en de kolom `date` verwachten — maar
 *   de omzetting van en naar een `Date` gebeurt uitsluitend in `lib/datum.ts`,
 *   met lokale componenten. Zo kan een gekozen dag nooit door UTC een dag
 *   opschuiven.
 * - **Zelfde vorm als `FormField`.** Label, hoogte, hoek en kleuren komen uit
 *   dezelfde tokens, zodat een formulier er niet uitziet als twee formulieren.
 *
 * Op iOS staat de kiezer in een klein vel onderaan met een knop "Gereed": de
 * inline-kiezer van iOS schrijft zijn waarde pas bij het sluiten weg, en een
 * expliciete bevestiging maakt zichtbaar wat er gekozen is. Op Android opent de
 * systeemdialoog, die zijn eigen OK/Annuleren meebrengt.
 */

type DateProps = {
  label: string;
  /** `YYYY-MM-DD`, of leeg. */
  value: string | null;
  onChange: (waarde: string) => void;
  hint?: string;
  /** Niet eerder dan deze dag (`YYYY-MM-DD`) — bijvoorbeeld een begindatum. */
  minimum?: string | null;
  /** Niet later dan deze dag (`YYYY-MM-DD`). */
  maximum?: string | null;
  /** Tekst als er nog niets gekozen is. */
  placeholder?: string;
  disabled?: boolean;
};

export function DateField({
  label,
  value,
  onChange,
  hint,
  minimum,
  maximum,
  placeholder = 'Kies een datum',
  disabled,
}: DateProps) {
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [open, setOpen] = useState(false);

  const gekozen = parseISODatum(value) ?? new Date();
  const label_ = nlDatum(value);

  const zet = (event: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed' || !d) return;
      onChange(isoVanDatum(d));
      return;
    }
    if (d) onChange(isoVanDatum(d));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${label_ ?? placeholder}`}
        style={({ pressed }) => [styles.veld, disabled && styles.veldUit, pressed && styles.veldIn]}
      >
        <Text style={label_ ? styles.waarde : styles.leeg}>{label_ ?? placeholder}</Text>
        <CalendarIcon size={18} color={t.muted} strokeWidth={2} />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {open && Platform.OS === 'ios' ? (
        <KiezerVel titel={label} onSluit={() => setOpen(false)} styles={styles}>
          <DateTimePicker
            value={gekozen}
            mode="date"
            display="inline"
            locale="nl-NL"
            themeVariant={colorMode}
            minimumDate={parseISODatum(minimum) ?? undefined}
            maximumDate={parseISODatum(maximum) ?? undefined}
            onChange={zet}
          />
        </KiezerVel>
      ) : null}

      {open && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={gekozen}
          mode="date"
          display="default"
          minimumDate={parseISODatum(minimum) ?? undefined}
          maximumDate={parseISODatum(maximum) ?? undefined}
          onChange={zet}
        />
      ) : null}
    </View>
  );
}

type TimeProps = {
  label: string;
  /** `HH:MM`, of leeg. */
  value: string | null;
  onChange: (waarde: string) => void;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function TimeField({
  label,
  value,
  onChange,
  hint,
  placeholder = 'Kies een tijd',
  disabled,
}: TimeProps) {
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [open, setOpen] = useState(false);

  const gekozen = parseISOTijd(value) ?? new Date();

  const zet = (event: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed' || !d) return;
      onChange(tijdVanDatum(d));
      return;
    }
    if (d) onChange(tijdVanDatum(d));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={({ pressed }) => [styles.veld, disabled && styles.veldUit, pressed && styles.veldIn]}
      >
        <Text style={value ? styles.waarde : styles.leeg}>{value ?? placeholder}</Text>
        <Clock size={18} color={t.muted} strokeWidth={2} />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {open && Platform.OS === 'ios' ? (
        <KiezerVel titel={label} onSluit={() => setOpen(false)} styles={styles}>
          <DateTimePicker
            value={gekozen}
            mode="time"
            display="spinner"
            locale="nl-NL"
            themeVariant={colorMode}
            minuteInterval={5}
            onChange={zet}
          />
        </KiezerVel>
      ) : null}

      {open && Platform.OS !== 'ios' ? (
        <DateTimePicker value={gekozen} mode="time" display="default" is24Hour onChange={zet} />
      ) : null}
    </View>
  );
}

/** Het vel onderaan waarin de iOS-kiezer staat, met één duidelijke bevestiging. */
function KiezerVel({
  titel,
  onSluit,
  styles,
  children,
}: {
  titel: string;
  onSluit: () => void;
  styles: ReturnType<typeof makeStyles>;
  children: React.ReactNode;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onSluit}>
      <Pressable style={styles.overlay} onPress={onSluit}>
        {/* Tik náást het vel sluit; een tik erop mag niet doorlekken. */}
        <Pressable style={styles.vel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.velKop}>
            <Text style={styles.velTitel}>{titel}</Text>
            <Pressable onPress={onSluit} hitSlop={10} accessibilityRole="button">
              <Text style={styles.velGereed}>Gereed</Text>
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
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
      justifyContent: 'space-between',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: spacing.sm,
      backgroundColor: t.card,
    },
    veldIn: { opacity: 0.85 },
    veldUit: { opacity: 0.5 },
    waarde: { fontSize: 15, color: t.ink },
    leeg: { fontSize: 15, color: t.muted2 },
    hint: { ...typography.small, color: t.muted },

    overlay: {
      flex: 1,
      backgroundColor: 'rgba(4,18,12,0.5)',
      justifyContent: 'flex-end',
    },
    vel: {
      backgroundColor: t.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    velKop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: spacing.sm,
    },
    velTitel: { fontSize: 17, fontWeight: '700', color: t.ink },
    velGereed: { fontSize: 15, fontWeight: '700', color: t.green700 },
  });
