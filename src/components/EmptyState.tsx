import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

/**
 * De lege staat uit het goedgekeurde ontwerp: een groen icoonvlak, een korte
 * kop, één zin uitleg en — als er iets te doen valt — de actie eronder.
 *
 * Het icoonvlak is geen versiering: het geeft de lege pagina een middelpunt,
 * zodat "hier staat nog niets" er niet uitziet als "er ging iets mis". Waar
 * dat verschil telt (een mislukte laadpoging) hoort `ErrorState`, niet deze.
 */
export function EmptyState({ title, message, icon, action }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
      gap: 10,
    },
    icon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: t.green50,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: t.ink,
      textAlign: 'center',
    },
    message: {
      fontSize: 13.5,
      lineHeight: 20,
      color: t.muted,
      textAlign: 'center',
      maxWidth: 320,
    },
    action: {
      marginTop: 8,
    },
  });
