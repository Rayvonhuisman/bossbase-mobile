import { useState } from 'react';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import {
  Building2,
  ChevronRight,
  Globe,
  HelpCircle,
  Pencil,
  Plug,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { AnimatedScreen, AppTopBar, FormField, FormSheet,
  LoadingScreen,
  OnderStatusbalk,
} from '@/components';
import { useAuth, usePermissions, useTaal, useTheme } from '@/providers';
import { TALEN, tx, txm } from '@/i18n';
import { updateEigenProfiel, wijzigWachtwoordMetHuidig } from '@/services/profileService';
import { useSave } from '@/lib/useSave';
import type { Role } from '@/types/domain';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import { maakThemaStijlen, useStyles } from '@/lib/useStyles';
import { terugOfNaar } from '@/lib/navigatie';

const ROLE_LABELS: Record<Role, string> = {
  admin: txm('Beheerder'),
  planner: txm('Planner'),
  medewerker: txm('Medewerker'),
};

// ---------------------------------------------------------------------------
// Screen — profile / account settings (opened from top-right avatar)
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const styles = useStyles(themaStijlen);
  const router = useRouter();
  const { user, profile, company, role, signOut, refreshProfile } = useAuth();
  const { allowsRoute, loaded: rechtenGeladen } = usePermissions();
  const { colors: th, colorMode } = useTheme();

  const fullName = profile?.full_name?.trim() || user?.email?.split('@')[0] || tx('Gebruiker');
  const initials = computeInitials(profile?.full_name ?? user?.email ?? '?');
  const roleLabel = role ? tx(ROLE_LABELS[role]) : tx('Onbekende rol');
  const companyName = company?.name ?? '—';
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  const [naamConcept, setNaamConcept] = useState<string | null>(null);
  const [wachtwoord, setWachtwoord] = useState<{ huidig: string; nieuw: string; herhaal: string } | null>(null);
  const [wachtwoordFout, setWachtwoordFout] = useState<string | null>(null);
  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { taal, kiesTaal } = useTaal();
  const [taalOpen, setTaalOpen] = useState(false);
  const taalNaam = TALEN.find((l) => l.code === taal)?.naam ?? 'Nederlands';

  const onLogout = () => {
    Dialog.alert(tx('Uitloggen?'), tx('Je wordt teruggebracht naar het inlogscherm.'), [
      { text: tx('Annuleren'), style: 'cancel' },
      { text: tx('Uitloggen'), style: 'destructive', onPress: () => signOut() },
    ]);
  };


  // Beheerfuncties pas tonen als de rechten binnen zijn. Een rij die eerst
  // verschijnt en daarna verdwijnt heeft zijn bestaan al verraden — en dat
  // geldt voor Team en Bedrijfsinstellingen net zo goed als voor het menu.
  if (!rechtenGeladen) {
    return (
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />
        <AppTopBar variant="detail" onBack={() => terugOfNaar(router, '/today')} title={tx('Profiel')} />
        <LoadingScreen label={tx('Profiel laden...')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />
      <OnderStatusbalk>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* De kop scrolt mee met de pagina, zoals in het ontwerp. */}
        <AppTopBar
          variant="detail"
          onBack={() => terugOfNaar(router, '/today')}
          title={tx('Profiel')}
          subtitle={`${roleLabel} · ${companyName}`}
          rightAction={
            <Pressable
              onPress={() => {
                setSaveError(null);
                setNaamConcept(profile?.full_name ?? '');
              }}
              accessibilityRole="button"
              accessibilityLabel={tx('Profiel bewerken')}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <Pencil size={18} color={th.ink} strokeWidth={2} />
            </Pressable>
          }
        />
        <AnimatedScreen>
        {/* Profile hero card */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <View style={styles.heroTop}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroName} numberOfLines={1}>
                {fullName}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {user?.email ?? '—'}
              </Text>
              <View style={styles.heroPillRow}>
                <View style={styles.heroPill}>
                  <View style={styles.heroPillDot} />
                  <Text style={styles.heroPillText}>{roleLabel}</Text>
                </View>
                <Text style={styles.heroCompany} numberOfLines={1}>
                  {companyName}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.heroStats}>
            <HeroStat n="—" label={tx('Deze maand')} />
            <HeroStat n="—" label={tx('Werkbonnen')} />
            <HeroStat n="—" label={tx('Klanten')} />
          </View>
        </View>
        {/*
          TODO(backend): vul hero-stats met echte aggregates:
          - Deze maand   → som uren urenregistratie (profile_id = me, deze maand)
          - Werkbonnen   → count werkbonnen toegewezen aan mij
          - Klanten      → count distinct customers gerelateerd via deals/werkbonnen
        */}


        {/*
          Bedrijf en Team staan hier, en alleen hier. Ze stonden eerder óók in
          het menu; twee ingangen naar hetzelfde beheerscherm maken niet
          duidelijker waar je iets regelt.

          De gates zijn ongewijzigd: precies dezelfde `allowsRoute` die de
          routebewaking gebruikt, dus wat hier verborgen blijft is ook via een
          directe deeplink dicht.
        */}
        {allowsRoute('/settings') || allowsRoute('/integrations') ? (
          <>
            <SectionHead title={tx('Bedrijf')} />
            <ListGroup
              items={[
                ...(allowsRoute('/settings')
                  ? [
                      {
                        icon: Building2,
                        title: tx('Bedrijfsinstellingen'),
                        sub: `${companyName} · ${tx('tarieven, btw en gegevens')}`,
                        onPress: () => router.push('/settings'),
                      },
                    ]
                  : []),
                ...(allowsRoute('/integrations')
                  ? [
                      {
                        icon: Plug,
                        title: tx('Integraties'),
                        sub: 'Moneybird, Stripe, SnelStart en AFAS',
                        onPress: () => router.push('/integrations'),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        ) : null}

        {allowsRoute('/team') ? (
          <>
            <SectionHead title={tx('Team')} />
            <ListGroup
              items={[
                {
                  icon: Users,
                  title: tx('Teamleden'),
                  sub: tx('Uitnodigen, rechten en toegang'),
                  onPress: () => router.push('/team'),
                },
              ]}
            />
          </>
        ) : null}

        {/* Account */}
        <SectionHead title={tx('Account')} />
        <ListGroup
          items={[
            {
              icon: ShieldCheck,
              title: tx('Wachtwoord wijzigen'),
              sub: user?.email ?? '—',
              onPress: () => {
                setWachtwoordFout(null);
                setWachtwoord({ huidig: '', nieuw: '', herhaal: '' });
              },
            },
            {
              icon: Globe,
              title: tx('Taal'),
              sub: taalNaam,
              onPress: () => setTaalOpen(true),
            },
            {
              icon: HelpCircle,
              title: tx('Hulp & support'),
              sub: tx('Veelgestelde vragen en contact'),
              onPress: () => router.push('/support'),
            },
          ]}
        />

        {/* Logout */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Pressable
            accessibilityRole="button"
            onPress={onLogout}
            style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.logoutText}>{tx('Uitloggen')}</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>BossBase Mobile · v{appVersion}</Text>
        </AnimatedScreen>
      </ScrollView>
      </OnderStatusbalk>

      {/* Eigen naam wijzigen. De policy op `profiles` is `id = auth.uid()`:
          alleen je eigen rij, en dat is precies wat dit formulier doet. */}
      <FormSheet
        visible={naamConcept !== null}
        title={tx('Profiel bewerken')}
        error={saveError}
        saving={saving}
        submitDisabled={!naamConcept?.trim()}
        onSubmit={() => {
          if (naamConcept === null) return;
          save(() => updateEigenProfiel({ full_name: naamConcept }), {
            onSuccess: async () => {
              setNaamConcept(null);
              await refreshProfile();
            },
          });
        }}
        onClose={() => setNaamConcept(null)}
      >
        <FormField
          label={tx('Naam')}
          value={naamConcept ?? ''}
          onChangeText={setNaamConcept}
          placeholder={tx('Voor- en achternaam')}
          autoFocus
        />
        <Text style={styles.hint}>
          {tx('Je rol en bedrijf worden door een beheerder ingesteld.')}
        </Text>
      </FormSheet>

      <FormSheet
        visible={wachtwoord !== null}
        title={tx('Wachtwoord wijzigen')}
        subtitle={user?.email ?? undefined}
        error={wachtwoordFout ?? saveError}
        saving={saving}
        submitLabel={tx('Wachtwoord opslaan')}
        submitDisabled={!wachtwoord?.huidig || !wachtwoord?.nieuw || !wachtwoord?.herhaal}
        onSubmit={() => {
          if (!wachtwoord) return;
          if (wachtwoord.nieuw !== wachtwoord.herhaal) {
            setWachtwoordFout(tx('De twee wachtwoorden zijn niet gelijk.'));
            return;
          }
          setWachtwoordFout(null);
          // Altijd met het huidige wachtwoord, net als Instellingen › Profiel en
          // het dashboard: een open toestel mag het wachtwoord niet zomaar
          // kunnen wijzigen (review 26-10, S4-02).
          save(() => wijzigWachtwoordMetHuidig(wachtwoord.huidig, wachtwoord.nieuw), {
            onSuccess: () => {
              setWachtwoord(null);
              Dialog.alert(tx('Gelukt'), tx('Je wachtwoord is gewijzigd.'));
            },
          });
        }}
        onClose={() => setWachtwoord(null)}
      >
        <FormField
          label={tx('Huidig wachtwoord')}
          value={wachtwoord?.huidig ?? ''}
          onChangeText={(v) => setWachtwoord((w) => (w ? { ...w, huidig: v } : w))}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          autoFocus
        />
        <FormField
          label={tx('Nieuw wachtwoord')}
          value={wachtwoord?.nieuw ?? ''}
          onChangeText={(v) => setWachtwoord((w) => (w ? { ...w, nieuw: v } : w))}
          placeholder={tx('Minstens 8 tekens')}
          secureTextEntry
          autoCapitalize="none"
        />
        <FormField
          label={tx('Herhaal wachtwoord')}
          value={wachtwoord?.herhaal ?? ''}
          onChangeText={(v) => setWachtwoord((w) => (w ? { ...w, herhaal: v } : w))}
          placeholder={tx('Nogmaals')}
          secureTextEntry
          autoCapitalize="none"
        />
      </FormSheet>

      {/* Taal kiezen. Geldt voor jou alleen (profiles.taal), op elk toestel en
          ook in het dashboard. De talen staan in hun eigen taal. */}
      <FormSheet
        visible={taalOpen}
        title={tx('Taal')}
        subtitle={tx('Alleen voor jou. Je collega\'s houden hun eigen taal.')}
        hideSubmit
        onSubmit={() => setTaalOpen(false)}
        onClose={() => setTaalOpen(false)}
      >
        <View style={styles.listGroup}>
          {TALEN.map((l, i) => (
            <Pressable
              key={l.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: l.code === taal }}
              aria-checked={l.code === taal}
              onPress={async () => {
                setTaalOpen(false);
                if (l.code !== taal) await kiesTaal(l.code);
              }}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.rowTitle, { flex: 1 }]}>{l.naam}</Text>
              {l.code === taal ? <Text style={styles.rowTitle}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      </FormSheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeroStat({ n, label }: { n: string; label: string }) {
  const styles = useStyles(themaStijlen);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.heroStatN}>{n}</Text>
      <Text style={styles.heroStatL}>{label}</Text>
    </View>
  );
}

function SectionHead({ title }: { title: string }) {
  const styles = useStyles(themaStijlen);
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

type RowItem = {
  icon: LucideIcon;
  title: string;
  sub: string;
  onPress?: () => void;
};

function ListGroup({ items }: { items: RowItem[] }) {
  const styles = useStyles(themaStijlen);
  return (
    <View style={styles.listGroup}>
      {items.map((row, i) => (
        <ListRow key={row.title} item={row} first={i === 0} />
      ))}
    </View>
  );
}

function ListRow({ item, first }: { item: RowItem; first: boolean }) {
  const styles = useStyles(themaStijlen);
  const { colors: th } = useTheme();
  const Icon = item.icon;
  const content = (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Icon size={18} color={th.ink2} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.sub}
        </Text>
      </View>
      <ChevronRight size={16} color={th.muted2} strokeWidth={2} />
    </View>
  );

  if (item.onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={item.onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeInitials(source: string | null | undefined): string {
  if (!source) return '?';
  const cleaned = source.trim();
  if (!cleaned) return '?';
  if (cleaned.includes('@')) return cleaned.charAt(0).toUpperCase();
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: t.ink,
    letterSpacing: -0.4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 18,
    // Forest ink uit het ontwerp — dezelfde kleur als de tabbalk en de
    // herokaart op Vandaag, zodat "donker vlak" overal hetzelfde vlak is.
    backgroundColor: t.barBg,
    borderRadius: ds.rXl,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  heroGlow: {
    position: 'absolute',
    right: -50,
    top: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: ds.green,
    opacity: 0.12,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroAvatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: ds.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: ds.greenInk,
    letterSpacing: -0.5,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  heroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(29,219,98,0.18)',
  },
  heroPillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ds.green,
  },
  heroPillText: {
    color: ds.green,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroCompany: {
    flex: 1,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  heroStatN: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  heroStatL: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },

  // Section head
  sectionHead: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 10,
  },
  sectionTitle: {
    // Sectielabel uit het ontwerp: klein, kapitaal, ruime letterafstand.
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    color: t.muted2,
  },

  // List
  listGroup: {
    marginHorizontal: 16,
    backgroundColor: t.card,
    borderRadius: ds.rMd,
    overflow: 'hidden',
    ...dsShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: t.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontSize: 12,
    color: t.muted,
    marginTop: 1,
  },

  // Logout
  logoutBtn: {
    height: 50,
    borderRadius: ds.rMd,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: t.statusRejectFg,
    letterSpacing: -0.2,
  },
  hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
  version: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 11.5,
    color: t.muted2,
  },
});

/**
 * Licht en donker worden één keer opgebouwd; elke component in dit bestand
 * kiest er met `useStyles(themaStijlen)` tussen. Twee stylesheets kosten niets
 * — ze worden eenmalig aangemaakt — en zo mist geen enkele subcomponent het
 * thema.
 */
const themaStijlen = maakThemaStijlen(makeStyles);
