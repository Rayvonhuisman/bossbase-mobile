import { StyleSheet, Text, View } from 'react-native';
import { Construction, type LucideIcon } from 'lucide-react-native';
import { ds } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  title: string;
  body: string;
  icon?: LucideIcon;
  /** Optional small footnote, e.g. "Beheer dit op de desktop". */
  note?: string;
};

/**
 * Polished "not yet available on mobile" state for routes whose backend is not
 * yet wired (e.g. photo storage) or which are desktop-only. Honest copy — never
 * implies data is loading or present. Theme-aware text on the page canvas.
 */
export function PlaceholderState({ title, body, icon: Icon = Construction, note }: Props) {
  const { colors: t } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: t.green50 }]}>
        <Icon size={30} color={ds.green} strokeWidth={1.8} />
      </View>
      <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
      <Text style={[styles.body, { color: t.muted }]}>{body}</Text>
      {note ? <Text style={[styles.note, { color: t.muted2 }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
    gap: 8,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  body: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  note: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
});
