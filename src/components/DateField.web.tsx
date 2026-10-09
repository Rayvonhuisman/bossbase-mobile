import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Calendar as CalendarIcon, Clock } from 'lucide-react-native';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import { nlDatum } from '@/lib/datum';

/**
 * Webvariant van `DateField` en `TimeField`, met dezelfde props en dezelfde
 * waarden naar buiten: `YYYY-MM-DD` voor een datum, `HH:MM` voor een tijd.
 *
 * `@react-native-community/datetimepicker` heeft geen webimplementatie. De
 * browser heeft wel een eigen kiezer: `<input type="date|time">`. Die werkt
 * met exact het formaat dat de services al verwachten, dus er is hier geen
 * omzetting via `Date` nodig — en daarmee ook geen kans dat een dag door UTC
 * opschuift.
 *
 * Het zichtbare veld is hetzelfde als op iOS en Android. Het echte invoerveld
 * ligt er onzichtbaar overheen: een tik op mobiel opent zo direct de
 * systeemkiezer, en op desktop opent `showPicker()` de kalender bij een klik
 * waar dan ook in het veld (anders reageert alleen het kleine icoon van de
 * browser).
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
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const label_ = nlDatum(value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.veld, disabled && styles.veldUit]}>
        <Text style={label_ ? styles.waarde : styles.leeg}>{label_ ?? placeholder}</Text>
        <CalendarIcon size={18} color={t.muted} strokeWidth={2} />
        <BrowserInvoer
          type="date"
          value={value}
          min={minimum}
          max={maximum}
          disabled={disabled}
          ariaLabel={`${label}: ${label_ ?? placeholder}`}
          onChange={onChange}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.veld, disabled && styles.veldUit]}>
        <Text style={value ? styles.waarde : styles.leeg}>{value ?? placeholder}</Text>
        <Clock size={18} color={t.muted} strokeWidth={2} />
        <BrowserInvoer
          type="time"
          value={value}
          disabled={disabled}
          ariaLabel={`${label}: ${value ?? placeholder}`}
          onChange={onChange}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Het onzichtbare browserveld dat over het zichtbare veld heen ligt. */
function BrowserInvoer({
  type,
  value,
  min,
  max,
  disabled,
  ariaLabel,
  onChange,
}: {
  type: 'date' | 'time';
  value: string | null;
  min?: string | null;
  max?: string | null;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (waarde: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type={type}
      // Een tijd uit de database kan `HH:MM:SS` zijn; de browser toont dan ook
      // seconden. Naar buiten gaat altijd `HH:MM`, net als de native kiezer.
      value={type === 'time' ? (value ?? '').slice(0, 5) : (value ?? '')}
      min={min ?? undefined}
      max={max ?? undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => {
        try {
          ref.current?.showPicker?.();
        } catch {
          // Oudere browsers of een al open kiezer: de standaardklik volstaat.
        }
      }}
      onChange={(e) => {
        // Leegmaken kan in de browser wel, met de native kiezer niet. De
        // velden kennen geen "leeg" als keuze, dus dat negeren we.
        if (e.target.value) onChange(e.target.value.slice(0, type === 'time' ? 5 : 10));
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        border: 0,
        margin: 0,
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
      }}
    />
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    label: { ...typography.label, color: t.muted2 },
    veld: {
      position: 'relative',
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
    veldUit: { opacity: 0.5 },
    waarde: { fontSize: 15, color: t.ink },
    leeg: { fontSize: 15, color: t.muted2 },
    hint: { ...typography.small, color: t.muted },
  });
