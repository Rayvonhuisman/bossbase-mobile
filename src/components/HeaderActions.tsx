import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { useHulp } from '@/providers/HulpProvider';
import { fonts } from '@/theme';
import { ProfileSettingsButton } from './ProfileSettingsButton';
import { BossAvatar } from './BossChat';

/**
 * De knoppen rechtsboven, op elke pagina — zoals de topbalk van het dashboard:
 * meldingen (bel met teller), Boss, en je profiel. De keuze voor donkere modus
 * staat in het menu, niet meer in de kop.
 */
export function HeaderActions({ iconSize = 38 }: { iconSize?: number }) {
  const { colors: t } = useTheme();
  const { openMeldingen, openBoss, ongelezen } = useHulp();
  const rond = { width: iconSize, height: iconSize, borderRadius: iconSize / 2 };
  return (
    <View style={styles.row}>
      <Pressable
        onPress={openMeldingen}
        accessibilityRole="button"
        accessibilityLabel={ongelezen ? `Notificaties, ${ongelezen} ongelezen` : 'Notificaties'}
        hitSlop={6}
        style={({ pressed }) => [styles.btn, rond, { backgroundColor: t.card, borderColor: t.line }, pressed && { opacity: 0.7 }]}
      >
        <Bell size={18} color={t.ink} strokeWidth={2.2} />
        {ongelezen ? (
          <View style={[styles.badge, { borderColor: t.bg }]}>
            <Text style={styles.badgeTekst}>{ongelezen > 9 ? '9+' : ongelezen}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={openBoss}
        accessibilityRole="button"
        accessibilityLabel="Vraag het Boss"
        hitSlop={6}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <BossAvatar size={iconSize} />
      </Pressable>
      <ProfileSettingsButton size={iconSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: '#1DDB62',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTekst: { fontSize: 10, fontWeight: '800', fontFamily: fonts.bold, color: '#0D0D0D' },
});
