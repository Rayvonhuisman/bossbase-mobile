import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { onb } from './_tokens';

// ─────────────────────────────────────────────────────────────────────────────
// StepDots
// ─────────────────────────────────────────────────────────────────────────────

export function StepDots({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === step;
        const past = i < step;
        return (
          <View
            key={i}
            style={{
              height: 6,
              width: active ? 22 : 6,
              borderRadius: 999,
              backgroundColor: active || past ? onb.ink : 'rgba(10,10,10,0.12)',
            }}
          />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────────────────────

export function TopBar({
  step,
  total = 4,
  showBack = true,
}: {
  step: number;
  total?: number;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={[styles.backBtn, { opacity: showBack ? 1 : 0 }]}
        disabled={!showBack}
      >
        <ChevronLeft size={20} color={onb.ink} strokeWidth={2.4} />
      </Pressable>
      <StepDots step={step} total={total} />
      <View style={{ width: 40 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PrimaryButton (donkere ink button)
// ─────────────────────────────────────────────────────────────────────────────

export function PrimaryButton({
  label,
  onPress,
  trailing,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  trailing?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        isDisabled && { opacity: 0.45 },
        pressed && !isDisabled && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.primaryBtnText}>{loading ? 'Bezig...' : label}</Text>
      {!loading && trailing ? trailing : null}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GreenButton (groen + donkere ink-text)
// ─────────────────────────────────────────────────────────────────────────────

export function GreenButton({
  label,
  onPress,
  trailing,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  trailing?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.greenBtn,
        isDisabled && { opacity: 0.45 },
        pressed && !isDisabled && { opacity: 0.9 },
      ]}
    >
      <Text style={styles.greenBtnText}>{loading ? 'Bezig...' : label}</Text>
      {!loading && trailing ? trailing : null}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GhostLink
// ─────────────────────────────────────────────────────────────────────────────

export function GhostLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field
// ─────────────────────────────────────────────────────────────────────────────

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  isPassword?: boolean;
  error?: string;
};

export function Field({ label, hint, isPassword, error, ...props }: FieldProps) {
  const [show, setShow] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldBox,
          focused && { borderColor: onb.ink },
          error && { borderColor: '#C81E1E' },
        ]}
      >
        <TextInput
          {...props}
          secureTextEntry={isPassword && !show}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={onb.faint}
          style={styles.fieldInput}
        />
        {isPassword ? (
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={6}>
            {show ? (
              <EyeOff size={18} color={onb.muted} strokeWidth={2} />
            ) : (
              <Eye size={18} color={onb.muted} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// We need React for the Field hooks — use a runtime import to avoid
// circular-import warnings in some bundlers.
import * as React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: onb.hair,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: onb.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  greenBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: onb.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: onb.green,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  greenBtnText: {
    color: onb.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  ghost: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    color: onb.ink,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: onb.muted,
    marginBottom: 8,
    paddingLeft: 4,
    letterSpacing: -0.1,
  },
  fieldBox: {
    height: 58,
    borderRadius: 16,
    backgroundColor: onb.field,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  fieldInput: {
    flex: 1,
    fontSize: 17,
    color: onb.ink,
    letterSpacing: -0.2,
    padding: 0,
  },
  fieldError: {
    fontSize: 12.5,
    color: '#C81E1E',
    paddingLeft: 4,
    marginTop: 6,
    fontWeight: '600',
  },
  fieldHint: {
    fontSize: 12.5,
    color: onb.muted,
    paddingLeft: 4,
    marginTop: 6,
  },
});
