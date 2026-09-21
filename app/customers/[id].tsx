import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronRight,
  ClipboardList,
  Mail,
  MapPin,
  Navigation as NavigationIcon,
  Pencil,
  Phone,
} from 'lucide-react-native';
import {
  AnimatedScreen,
  AppCard,
  AppSection,
  AppTopBar,
  Button,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  StatusBadge,
  StatusBarScrim,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { deleteCustomer, getCustomer, updateCustomer } from '@/services/customerService';
import { listWorkOrders } from '@/services/workOrderService';
import { callPhone, openMaps, sendMail } from '@/lib/linking';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { createNote, listNotes, type NoteRow } from '@/services/noteService';
import { formatDateNL } from '@/lib/format';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import type { Customer, WorkOrderWithCustomer } from '@/types/domain';
import { maakThemaStijlen, useStyles } from '@/lib/useStyles';
import { useLaden } from '@/lib/useLaden';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** De bewerkbare velden van een klant. */
type KlantConcept = {
  name: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  kvk: string;
  btw: string;
  notes: string;
};

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

function isZakelijk(c: Customer): boolean {
  return !!(c.kvk_number && c.kvk_number.trim());
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CustomerDetailScreen() {
  const styles = useStyles(themaStijlen);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { companyId } = useAuth();
  const { colors: th, colorMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded: rechtenGeladen, mag } = usePermissions();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [concept, setConcept] = useState<KlantConcept | null>(null);
  const [notities, setNotities] = useState<NoteRow[]>([]);
  const [nieuweNotitie, setNieuweNotitie] = useState('');
  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveNotitie, saving: notitieBezig, error: notitieFout } = useSave<unknown>();
  const [workOrders, setWorkOrders] = useState<WorkOrderWithCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async () => {
      if (!id) return;
      setError(null);

      const [custResp, woResp, noteResp] = await Promise.all([
        getCustomer(id),
        listWorkOrders({}),
        listNotes({ customerId: id }),
      ]);
      // De notities zijn bijzaak op dit scherm: mislukken ze, dan blijft de
      // klantkaart gewoon staan.
      if (!noteResp.error) setNotities(noteResp.data);

      if (custResp.error || !custResp.data) {
        setError(custResp.error ?? 'Klant niet gevonden.');
        setCustomer(null);
        setWorkOrders([]);
      } else {
        // RLS filtert op company_id — extra defensive check:
        if (companyId && custResp.data.company_id !== companyId) {
          setError('Deze klant hoort niet bij jouw bedrijf.');
          setCustomer(null);
        } else {
          setCustomer(custResp.data);
        }
        // Filter werkbonnen op deze klant
        if (!woResp.error && woResp.data) {
          setWorkOrders(woResp.data.filter((w) => w.customer_id === id));
        }
      }

    },
    [id, companyId],
  );

  /**
   * Stille verversing bij terugkeer op dit scherm; `refreshing` blijft
   * voorbehouden aan een echte pull-to-refresh.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  const onCall = () => {
    if (!callPhone(customer?.phone)) {
      Alert.alert('Geen telefoonnummer', 'Voor deze klant is geen nummer bekend.');
    }
  };
  const onMail = () => {
    if (!sendMail(customer?.email)) {
      Alert.alert('Geen e-mailadres', 'Voor deze klant is geen e-mail bekend.');
    }
  };
  const onNavigate = () => {
    const addr = [customer?.address, customer?.postcode, customer?.city]
      .filter(Boolean)
      .join(', ');
    if (!openMaps(addr)) {
      Alert.alert('Geen adres', 'Voor deze klant is geen adres bekend.');
    }
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Klant" onBack={() => router.back()} />
          <LoadingScreen label="Klant laden..." />
        </View>
      </>
    );
  }
  if (error || !customer) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Klant" onBack={() => router.back()} />
          <ErrorState
            title="Klant niet gevonden"
            message={error ?? 'Deze klant bestaat niet of je hebt geen toegang.'}
            onRetry={opnieuw}
          />
        </View>
      </>
    );
  }

  const name = customer.name ?? '—';
  const tag = isZakelijk(customer) ? 'Zakelijk' : 'Particulier';
  const fullAddress = [customer.address, customer.postcode, customer.city]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={th.green}
              colors={[th.green]}
              progressViewOffset={insets.top}
            />
          }
        >
          {/* De kop scrolt mee met de pagina, zoals in het ontwerp. */}
          <AppTopBar
            variant="detail"
            onBack={() => router.back()}
            eyebrow="Klant"
            title={name}
            subtitle={[customer.city, tag].filter(Boolean).join(' · ') || undefined}
            rightAction={
              rechtenGeladen && mag('klanten', 'wijzigen') ? (
                <HeaderIconButton
                  icon={Pencil}
                  label="Klant bewerken"
                  variant="plain"
                  onPress={() => {
                    setSaveError(null);
                    setConcept({
                      name: customer.name ?? '',
                      email: customer.email ?? '',
                      phone: customer.phone ?? '',
                      address: customer.address ?? '',
                      postcode: customer.postcode ?? '',
                      city: customer.city ?? '',
                      kvk: customer.kvk_number ?? '',
                      btw: customer.btw_number ?? '',
                      notes: customer.notes ?? '',
                    });
                  }}
                />
              ) : undefined
            }
          />
          <AnimatedScreen>
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{initials(name)}</Text>
            </View>
            <Text style={[styles.heroName, { color: th.ink }]} numberOfLines={2}>
              {name}
            </Text>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{tag}</Text>
              </View>
              {customer.kvk_number ? (
                <Text style={styles.heroKvk}>KvK {customer.kvk_number}</Text>
              ) : null}
            </View>
          </View>

          {/* Quick actions */}
          <View style={styles.actionsRow}>
            <ActionBtn
              icon={<Phone size={18} color={ds.greenInk} strokeWidth={2.4} />}
              label="Bellen"
              primary
              disabled={!customer.phone}
              onPress={onCall}
            />
            <ActionBtn
              icon={<NavigationIcon size={18} color={th.ink} strokeWidth={2} />}
              label="Route"
              disabled={!customer.address && !customer.city}
              onPress={onNavigate}
            />
            <ActionBtn
              icon={<Mail size={18} color={th.ink} strokeWidth={2} />}
              label="Mail"
              disabled={!customer.email}
              onPress={onMail}
            />
          </View>

          {/* Contact card */}
          <AppSection title="Contact" variant="eyebrow" />
          <View style={{ paddingHorizontal: 16 }}>
            <AppCard padding={0}>
              <InfoRow label="Telefoon" value={customer.phone} onPress={customer.phone ? onCall : undefined} />
              <InfoRow label="E-mail" value={customer.email} last onPress={customer.email ? onMail : undefined} />
            </AppCard>
          </View>

          {/* Address card */}
          {(fullAddress || customer.city) ? (
            <>
              <AppSection title="Adres" variant="eyebrow" />
              <View style={{ paddingHorizontal: 16 }}>
                <Pressable
                  onPress={onNavigate}
                  style={({ pressed }) => [styles.addressCard, dsShadow, pressed && { opacity: 0.95 }]}
                >
                  <MapPin size={18} color={th.green700} strokeWidth={2} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.addressText} numberOfLines={3}>
                      {fullAddress || customer.city}
                    </Text>
                  </View>
                  <NavigationIcon size={16} color={th.muted} strokeWidth={2} />
                </Pressable>
              </View>
            </>
          ) : null}

          {/* Werkbonnen */}
          <AppSection title="Werkbonnen" count={workOrders.length} variant="eyebrow" />
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {workOrders.length === 0 ? (
              <AppCard padding={20} style={styles.emptyCard}>
                <ClipboardList size={28} color={th.muted2} strokeWidth={1.8} />
                <Text style={styles.emptyText}>Nog geen werkbonnen voor deze klant</Text>
              </AppCard>
            ) : (
              workOrders.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => router.push(`/work-orders/${w.id}`)}
                  style={({ pressed }) => [styles.woRow, dsShadow, pressed && { opacity: 0.95 }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.woTitle} numberOfLines={1}>
                      {w.titel}
                    </Text>
                    {w.omschrijving ? (
                      <Text style={styles.woSub} numberOfLines={1}>
                        {w.omschrijving}
                      </Text>
                    ) : null}
                  </View>
                  <StatusBadge status={w.status} />
                  <ChevronRight size={16} color={th.muted2} strokeWidth={2} />
                </Pressable>
              ))
            )}
          </View>

          {/* Notities bij deze klant — dezelfde `notes`-tabel als het
              dashboard, gefilterd op customer_id. */}
          <AppSection title="Notities" count={notities.length} variant="eyebrow" />
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {notities.length === 0 ? (
              <AppCard padding={20} style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {mag('notities', 'maken')
                    ? 'Nog geen notities. Voeg er hieronder één toe.'
                    : 'Nog geen notities bij deze klant.'}
                </Text>
              </AppCard>
            ) : (
              notities.map((n) => (
                <AppCard key={n.id} padding={14}>
                  <Text style={styles.notitieTekst}>{n.body}</Text>
                  <Text style={styles.notitieMeta}>{formatDateNL(n.created_at)}</Text>
                </AppCard>
              ))
            )}

            {mag('notities', 'maken') ? (
              <>
                <FormField
                  label="Nieuwe notitie"
                  value={nieuweNotitie}
                  onChangeText={setNieuweNotitie}
                  placeholder="Wat moet er bewaard blijven?"
                  multiline
                />
                {notitieFout ? <Text style={styles.notitieFout}>{notitieFout}</Text> : null}
                <Button
                  label={notitieBezig ? 'Opslaan…' : 'Notitie toevoegen'}
                  variant="secondary"
                  loading={notitieBezig}
                  disabled={!nieuweNotitie.trim() || notitieBezig}
                  onPress={() => {
                    if (!id) return;
                    saveNotitie(() => createNote({ body: nieuweNotitie, customer_id: id }), {
                      onSuccess: async () => {
                        setNieuweNotitie('');
                        const { data } = await listNotes({ customerId: id });
                        setNotities(data);
                      },
                    });
                  }}
                />
              </>
            ) : null}
          </View>
          </AnimatedScreen>
        </ScrollView>
        <StatusBarScrim />

        <FormSheet
          visible={concept !== null}
          title="Klant bewerken"
          subtitle={customer.name ?? undefined}
          error={saveError}
          saving={saving}
          submitDisabled={!concept?.name.trim()}
          onSubmit={() => {
            if (!concept || !id) return;
            save(
              () =>
                updateCustomer(id, {
                  name: concept.name,
                  email: concept.email,
                  phone: concept.phone,
                  address: concept.address,
                  postcode: concept.postcode,
                  city: concept.city,
                  kvk_number: concept.kvk,
                  btw_number: concept.btw,
                  notes: concept.notes,
                }),
              {
                onSuccess: async () => {
                  setConcept(null);
                  await herlaad();
                },
              },
            );
          }}
          onClose={() => setConcept(null)}
          destructive={
            mag('klanten', 'verwijderen')
              ? {
                  label: 'Klant verwijderen',
                  onPress: () =>
                    bevestigVerwijderen(
                      'Klant',
                      () => {
                        if (!id) return;
                        save(() => deleteCustomer(id), {
                          onSuccess: () => {
                            setConcept(null);
                            router.back();
                          },
                        });
                      },
                      'Werkbonnen, offertes en facturen van deze klant blijven bestaan en blokkeren het verwijderen.',
                    ),
                }
              : undefined
          }
        >
          <FormField
            label="Naam"
            value={concept?.name ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, name: v } : c))}
            placeholder="Bedrijfs- of klantnaam"
          />
          <FormField
            label="E-mail"
            value={concept?.email ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, email: v } : c))}
            placeholder="naam@bedrijf.nl"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          <FormField
            label="Telefoon"
            value={concept?.phone ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, phone: v } : c))}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
          />
          <FormField
            label="Adres"
            value={concept?.address ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, address: v } : c))}
            placeholder="Straat en huisnummer"
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Postcode"
                value={concept?.postcode ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, postcode: v } : c))}
                placeholder="1234 AB"
                autoCapitalize="characters"
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <FormField
                label="Plaats"
                value={concept?.city ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, city: v } : c))}
                placeholder="Plaats"
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="KvK"
                value={concept?.kvk ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, kvk: v } : c))}
                placeholder="12345678"
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1.3 }}>
              <FormField
                label="Btw-nummer"
                value={concept?.btw ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, btw: v } : c))}
                placeholder="NL123456789B01"
                autoCapitalize="characters"
              />
            </View>
          </View>
          <FormField
            label="Notities"
            value={concept?.notes ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, notes: v } : c))}
            placeholder="Optioneel"
            multiline
          />
        </FormSheet>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionBtn({
  icon,
  label,
  onPress,
  primary,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles(themaStijlen);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        primary ? styles.actionBtnPrimary : styles.actionBtnGhost,
        disabled && { opacity: 0.4 },
        pressed && !disabled && { opacity: 0.92 },
      ]}
    >
      {icon}
      <Text style={[styles.actionLabel, primary && { color: ds.greenInk }]}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value: string | null | undefined;
  onPress?: () => void;
  last?: boolean;
}) {
  const styles = useStyles(themaStijlen);
  const v = value ?? '—';
  const tappable = !!onPress && !!value;
  const content = (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, tappable && { color: ds.green700 }]}
        numberOfLines={1}
      >
        {v}
      </Text>
    </View>
  );
  if (tappable) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 12,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: ds.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: ds.greenInk,
    letterSpacing: -0.6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: t.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.green50,
  },
  heroBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: t.green700,
  },
  heroKvk: {
    fontSize: 12,
    color: t.muted,
    fontWeight: '600',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnPrimary: {
    backgroundColor: ds.green,
  },
  actionBtnGhost: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.2,
  },

  // Info card
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.line,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: t.muted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  infoValue: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: t.ink,
    textAlign: 'right',
  },

  // Address
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.card,
    borderRadius: ds.rMd,
    padding: 14,
  },
  addressText: {
    fontSize: 14,
    color: t.ink,
    lineHeight: 20,
  },

  // Werkbon rows
  woRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: t.card,
    borderRadius: ds.rMd,
  },
  woTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.2,
  },
  woSub: {
    fontSize: 12.5,
    color: t.muted,
    marginTop: 2,
  },

  // Empty
  notitieTekst: { fontSize: 14, lineHeight: 20, color: t.ink },
  notitieMeta: { fontSize: 12, color: t.muted, marginTop: 6 },
  notitieFout: { fontSize: 12.5, fontWeight: '600', color: t.statusRejectFg },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: t.muted,
    textAlign: 'center',
  },
});

/**
 * Licht en donker worden één keer opgebouwd; elke component in dit bestand
 * kiest er met `useStyles(themaStijlen)` tussen. Twee stylesheets kosten niets
 * — ze worden eenmalig aangemaakt — en zo mist geen enkele subcomponent het
 * thema.
 */
const themaStijlen = maakThemaStijlen(makeStyles);
