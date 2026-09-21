import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Briefcase,
  Camera,
  ChevronRight,
  FileText,
  FolderKanban,
  HelpCircle,
  ListChecks,
  ListTodo,
  type LucideIcon,
  Mail,
  MessageSquarePlus,
  Receipt,
  StickyNote,
  Wallet,
} from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  LoadingScreen,
  NoticeBanner,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { readonlyTekst } from '@/lib/permissions';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { dsShadow, type ThemeColors } from '@/theme';

type Item = {
  icon: LucideIcon;
  title: string;
  sub?: string;
  onPress: () => void;
  /** Mobiele route, zodat het menu dezelfde gate leest als de routebewaking. */
  route?: string;
};

/**
 * Menu tab — de navigatiehub voor alle dashboardfuncties. Dit is NIET het
 * profiel-/accountscherm (dat zit op /profile, achter de avatar rechtsboven).
 *
 * Elk item hier wijst naar een bestaand scherm; er staan geen "binnenkort"-
 * knoppen meer in. Wat een gebruiker niet mag zien wordt door `allowsRoute`
 * weggelaten — dezelfde gate die de routebewaking gebruikt, zodat het menu niet
 * iets kan tonen dat de gate daarna alsnog blokkeert.
 */
export default function MenuScreen() {
  const router = useRouter();
  const { company, profile, user, role } = useAuth();
  const { loaded, allowsRoute, readonly, readonlyReden } = usePermissions();
  const { colors: t, colorMode } = useTheme();

  /**
   * Eén filter voor het hele menu: precies dezelfde gate die de routebewaking
   * gebruikt (ROUTE_GATES). Zo kan het menu niet iets tonen dat de gate daarna
   * alsnog blokkeert, en andersom.
   */
  const zichtbaar = (items: Item[]) => items.filter((i) => !i.route || allowsRoute(i.route));

  /**
   * Vandaag, Agenda, Werkbonnen, Uren en Klanten staan bewust NIET in dit menu:
   * die vijf zitten in de tabbalk, en twee ingangen naar hetzelfde scherm maken
   * een menu langer zonder het bruikbaarder te maken. De routes zelf blijven
   * bestaan — ook voor deeplinks.
   */
  const werk: Item[] = [
    { icon: ListChecks, title: 'Activiteiten', sub: 'Bellen, meetings en notities', onPress: () => router.push('/activities') },
    { icon: ListTodo, title: 'Taken', sub: 'Je openstaande taken', onPress: () => router.push('/tasks') },
    { icon: Camera, title: "Foto's & bestanden", sub: 'Beeld bij werkbonnen', onPress: () => router.push('/files') },
    { icon: StickyNote, title: 'Notities', sub: 'Vrije notities bij klanten', onPress: () => router.push('/notes') },
  ];

  const sales: Item[] = [
    { icon: FolderKanban, title: 'Pipeline', route: '/pipeline', sub: 'Deals per fase', onPress: () => router.push('/pipeline') },
    { icon: Briefcase, title: 'Projecten', sub: 'Status, planning en notities', onPress: () => router.push('/projects') },
    { icon: FileText, title: 'Offertes', route: '/offers', sub: 'Opstellen en opvolgen', onPress: () => router.push('/offers') },
    { icon: Wallet, title: 'Kosten', sub: 'Kosten en inkoop', route: '/expenses', onPress: () => router.push('/expenses') },
    { icon: Receipt, title: 'Facturen', route: '/invoices', sub: 'Aanmaken en betaald zetten', onPress: () => router.push('/invoices') },
  ];

  // Analyse & rapportage (Dashboard, Omzet, Uren-/Werkbonrapportage) is
  // desktop-only by product decision — not exposed in the mobile app.

  const support: Item[] = [
    { icon: HelpCircle, title: 'Help', sub: 'Veelgestelde vragen en contact', onPress: () => router.push('/support') },
    { icon: MessageSquarePlus, title: 'Feedback', sub: 'Deel een idee of probleem', onPress: () => router.push('/support') },
    { icon: Mail, title: 'Contact support', sub: 'Mail of bel ons', onPress: () => router.push('/support') },
  ];

  const naam = profile?.full_name ?? user?.email ?? 'Mijn account';
  const initialenNaam = initialen(profile?.full_name ?? user?.email ?? '?', '?');
  const avatar = avatarKleuren(naam, colorMode === 'dark');
  const rolLabel =
    role === 'admin' ? 'Beheerder' : role === 'planner' ? 'Planner' : 'Medewerker';

  const zichtbaarWerk = zichtbaar(werk);
  const zichtbaarSales = zichtbaar(sales);
  const styles = makeStyles(t);

  // Niets van het menu tonen zolang de rechten onderweg zijn. Een item dat
  // eerst verschijnt en daarna verdwijnt heeft zijn bestaan al verraden.
  if (!loaded) return <LoadingScreen label="Menu laden..." />;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            eyebrow={company?.name ?? undefined}
            title="Menu"
            subtitle="Alle functies van BossBase"
            showProfileButton
          />
        }
      >
        {/* Profielkaart — de eerste rij van het ontwerp: wie ben je, en waar
            pas je dat aan. */}
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.profielKaart, pressed && { opacity: 0.95 }]}
        >
          <View style={[styles.profielAvatar, { backgroundColor: avatar.bg }]}>
            <Text style={[styles.profielAvatarText, { color: avatar.fg }]}>{initialenNaam}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.profielNaam} numberOfLines={1}>
              {naam}
            </Text>
            <Text style={styles.profielMeta} numberOfLines={1}>
              {[rolLabel, company?.name].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <ChevronRight size={18} color={t.muted2} strokeWidth={2} />
        </Pressable>

        {/* Read-only account: dat komt uitsluitend van de server (planStatus),
            en het raakt elke schrijfactie in de app. Zeg het één keer bovenaan
            in plaats van bij elke knop opnieuw. */}
        {readonly ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <NoticeBanner
              title={readonlyTekst(readonlyReden).titel}
              message={readonlyTekst(readonlyReden).uitleg}
            />
          </View>
        ) : null}

        <Group title="Werk & uitvoering" items={zichtbaarWerk} />

        {zichtbaarSales.length > 0 ? (
          <Group title="Sales & administratie" items={zichtbaarSales} />
        ) : null}

        <Group title="Support" items={support} />
      </AppScreen>
    </View>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <>
      <AppSection title={title} variant="eyebrow" />
      <AppListGroup>
        {items.map((it, i) => (
          <AppListItem
            key={it.title}
            first={i === 0}
            icon={it.icon}
            title={it.title}
            subtitle={it.sub}
            onPress={it.onPress}
          />
        ))}
      </AppListGroup>
    </>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    profielKaart: {
      marginHorizontal: 16,
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.rLg,
      ...dsShadow,
    },
    profielAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profielAvatarText: { fontSize: 16, fontWeight: '700' },
    profielNaam: { fontSize: 15.5, fontWeight: '700', color: t.ink },
    profielMeta: { fontSize: 12.5, color: t.muted, marginTop: 2 },

    darkRij: {
      marginHorizontal: 16,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.rLg,
      ...dsShadow,
    },
    darkIcoon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: t.bgAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    darkTitel: { fontSize: 15, fontWeight: '600', color: t.ink },
    darkMeta: { fontSize: 12.5, color: t.muted, marginTop: 2 },

  });
