import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BookOpen,
  Briefcase,
  Bug,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  HelpCircle,
  Home,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestion,
  Moon,
  Package,
  Phone,
  Receipt,
  Settings,
  Users,
  UsersRound,
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
import { useHulp } from '@/providers/HulpProvider';
import { readonlyTekst } from '@/lib/permissions';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { useSchermklasse } from '@/lib/schermklasse';
import { FAQ_URL, HULP_TELEFOON, HULP_TELEFOON_LINK, KENNISBANK_URL } from '@/lib/hulp';
import { dsShadow, spacing, type ThemeColors } from '@/theme';

type Item = {
  icon: LucideIcon;
  title: string;
  sub?: string;
  onPress: () => void;
  /** Mobiele route, zodat het menu dezelfde poort leest als de routebewaking. */
  route?: string;
};

type Groep = { titel: string; items: Item[] };

/**
 * Menu — dezelfde indeling en volgorde als de zijbalk van het dashboard
 * (Hoofdmenu, Uitvoering, Financieel, Bedrijf). Instellingen en Team staan
 * bij je naam, zoals onderaan de zijbalk van het dashboard.
 *
 * Wat iemand niet mag zien laat `allowsRoute` weg — dezelfde poort als de
 * routebewaking, met dezelfde rechten en pakketregels als het dashboard. Een
 * sectie zonder zichtbare onderdelen verdwijnt, net als in het dashboard.
 *
 * Bewust niet (meer) hier: "Vrije notities" (bestaat niet in het dashboard;
 * klantnotities staan bij de relatie), "Foto's & bestanden" (foto's horen bij
 * de werkbon) en "Taken" (onderdeel van Activiteiten).
 */
export default function MenuScreen() {
  const router = useRouter();
  const { company, profile, user, role } = useAuth();
  const { loaded, allowsRoute, readonly, readonlyReden } = usePermissions();
  const { colors: t, colorMode, toggleColorMode } = useTheme();
  const { openBoss, openMelden } = useHulp();
  const { klasse } = useSchermklasse();
  const tablet = klasse === 'tablet';

  const ga = (route: string) => () => router.push(route as never);
  const zichtbaar = (items: Item[]) => items.filter((i) => !i.route || allowsRoute(i.route));

  const groepen: Groep[] = [
    {
      titel: 'Hoofdmenu',
      items: [
        { icon: Home, title: 'Vandaag', sub: 'Je dag in één oogopslag', onPress: ga('/today') },
        { icon: FolderKanban, title: 'Pipeline', sub: 'Aanvragen en deals per fase', route: '/pipeline', onPress: ga('/pipeline') },
        { icon: Users, title: 'Relaties', sub: 'Klanten en leveranciers', onPress: ga('/customers') },
        { icon: ListChecks, title: 'Activiteiten', sub: 'Bellen, mailen, bezoeken en taken', onPress: ga('/activities') },
      ],
    },
    {
      titel: 'Uitvoering',
      items: [
        { icon: CalendarDays, title: 'Agenda', sub: 'Afspraken en werkbonnen', onPress: ga('/planning') },
        { icon: CalendarRange, title: 'Planning', sub: 'Medewerkers, voertuigen en niet ingepland', route: '/planningbord', onPress: ga('/planningbord') },
        { icon: Briefcase, title: 'Projecten', sub: 'Status, planning en notities', route: '/projects', onPress: ga('/projects') },
        { icon: ClipboardList, title: 'Werkbonnen', sub: 'Klussen en uitvoering', onPress: ga('/work-orders') },
        { icon: Package, title: 'Materialen', sub: 'Standaardmaterialen met prijs en leverancier', onPress: ga('/materialen') },
        { icon: Clock, title: 'Uren', sub: 'Werkdag- en werkbonuren', onPress: ga('/hours') },
      ],
    },
    {
      titel: 'Financieel',
      items: [
        { icon: FileText, title: 'Offertes', sub: 'Opstellen en opvolgen', route: '/offers', onPress: ga('/offers') },
        { icon: Receipt, title: 'Facturen', sub: 'Aanmaken en betaald zetten', route: '/invoices', onPress: ga('/invoices') },
        { icon: Wallet, title: 'Kosten', sub: 'Geboekte kosten en materiaal', route: '/expenses', onPress: ga('/expenses') },
      ],
    },
  ];

  const naam = profile?.full_name ?? user?.email ?? 'Mijn account';
  const initialenNaam = initialen(profile?.full_name ?? user?.email ?? '?', '?');
  const avatar = avatarKleuren(naam, colorMode === 'dark');
  const rolLabel = role === 'admin' ? 'Beheerder' : role === 'planner' ? 'Planner' : 'Medewerker';
  const styles = makeStyles(t);

  // Niets van het menu tonen zolang de rechten onderweg zijn. Een item dat
  // eerst verschijnt en daarna verdwijnt heeft zijn bestaan al verraden.
  if (!loaded) return <LoadingScreen label="Menu laden..." />;

  const bijNaam = zichtbaar([
    { icon: Settings, title: 'Instellingen', route: '/settings', onPress: ga('/settings') },
    { icon: UsersRound, title: 'Team', route: '/team', onPress: ga('/team') },
  ]);

  const ondersteuning: Item[] = [
    { icon: MessageCircleQuestion, title: 'Help', sub: 'Vraag het Boss, onze helpagent', onPress: openBoss },
    { icon: Bug, title: 'Bug of idee', sub: 'Meld het en help BossBase beter maken', onPress: openMelden },
    { icon: BookOpen, title: 'Kennisbank', sub: 'Uitleg en handleidingen op bossbase.nl', onPress: () => void Linking.openURL(KENNISBANK_URL) },
    { icon: HelpCircle, title: 'Veelgestelde vragen', sub: 'Snel antwoord op bossbase.nl', onPress: () => void Linking.openURL(FAQ_URL) },
    { icon: Phone, title: 'Bel ons', sub: HULP_TELEFOON, onPress: () => void Linking.openURL(HULP_TELEFOON_LINK) },
  ];

  const secties = groepen.map((g) => ({ ...g, items: zichtbaar(g.items) })).filter((g) => g.items.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={<AppTopBar eyebrow={company?.name ?? undefined} title="Menu" subtitle="Alle functies van BossBase" showProfileButton />}
      >
        {/* Wie je bent, met Instellingen en Team ernaast — zoals onderaan de
            zijbalk van het dashboard. */}
        <View style={styles.profielBlok}>
          <Pressable
            onPress={ga('/profile')}
            accessibilityRole="button"
            accessibilityLabel={`Profiel van ${naam}`}
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
          {bijNaam.length ? (
            <View style={styles.bijNaam}>
              {bijNaam.map((i) => (
                <Pressable
                  key={i.title}
                  onPress={i.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.bijNaamKnop, pressed && { opacity: 0.85 }]}
                >
                  <i.icon size={17} color={t.ink2} strokeWidth={2} />
                  <Text style={styles.bijNaamTekst}>{i.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {readonly ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <NoticeBanner title={readonlyTekst(readonlyReden).titel} message={readonlyTekst(readonlyReden).uitleg} />
          </View>
        ) : null}

        {/* Op een iPad twee kolommen; op een telefoon (en in Split View) één. */}
        <View style={tablet ? styles.raster : undefined}>
          {[...secties, { titel: 'Ondersteuning', items: ondersteuning }].map((g) => (
            <View key={g.titel} style={tablet ? styles.kolom : undefined}>
              <Group title={g.titel} items={g.items} />
            </View>
          ))}
          <View style={tablet ? styles.kolom : undefined}>
            <AppSection title="Weergave" variant="eyebrow" />
            <View style={styles.donkerRij}>
              <View style={styles.donkerIcoon}>
                <Moon size={18} color={t.ink2} />
              </View>
              <Text style={styles.donkerTitel}>Donkere modus</Text>
              <Switch
                value={colorMode === 'dark'}
                onValueChange={toggleColorMode}
                accessibilityLabel="Donkere modus"
                trackColor={{ true: t.green, false: t.lineStrong }}
              />
            </View>
          </View>
        </View>
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
          <AppListItem key={it.title} first={i === 0} icon={it.icon} title={it.title} subtitle={it.sub} onPress={it.onPress} />
        ))}
      </AppListGroup>
    </>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    profielBlok: { marginHorizontal: 16, marginTop: 4, gap: spacing.sm },
    profielKaart: {
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
    profielAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    profielAvatarText: { fontSize: 16, fontWeight: '700' },
    profielNaam: { fontSize: 15.5, fontWeight: '700', color: t.ink },
    profielMeta: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    bijNaam: { flexDirection: 'row', gap: spacing.sm },
    bijNaamKnop: {
      flex: 1,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: t.rLg,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    bijNaamTekst: { fontSize: 14, fontWeight: '600', color: t.ink },
    raster: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
    kolom: { width: '50%' },
    donkerRij: {
      marginHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      minHeight: 56,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.rLg,
    },
    donkerIcoon: { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgAlt, alignItems: 'center', justifyContent: 'center' },
    donkerTitel: { flex: 1, fontSize: 15, fontWeight: '600', color: t.ink },
  });
