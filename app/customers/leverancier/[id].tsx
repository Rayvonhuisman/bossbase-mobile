import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Mail, Navigation as NavigationIcon, Pencil, Phone } from 'lucide-react-native';
import {
  AppTopBar,
  Button,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  OnderStatusbalk,
} from '@/components';
import {
  GegevensRij,
  KaartBlok,
  KaartCijfers,
  KaartKolommen,
  KaartLeeg,
  KaartRij,
} from '@/components/RelatieKaart';
import {
  LeverancierVelden,
  conceptVanLeverancier,
  leverancierConceptGeldig,
  type LeverancierConcept,
} from '@/components/LeverancierVelden';
import { usePermissions, useTheme } from '@/providers';
import {
  addLeverancierNotitie,
  deleteLeverancier,
  getLeverancier,
  isActief,
  leverancierNaam,
  listLeverancierMaterialen,
  listLeverancierTijdlijn,
  updateLeverancier,
  type Leverancier,
  type LeverancierMateriaal,
  type LeverancierTijdlijnRegel,
} from '@/services/leverancierService';
import { callPhone, openMaps, sendMail } from '@/lib/linking';
import { Dialog } from '@/lib/dialog';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, type ThemeColors } from '@/theme';

/**
 * Leverancierskaart — `LeverancierPage.jsx` van het dashboard: kop met badge
 * Leverancier/Inactief, snelle cijfers (met `projectbedragen`), notities
 * (`leverancier_tijdlijn`), materialen van deze leverancier, de tijdlijn en de
 * gegevens. Bewerken vraagt `klanten_bewerken`, verwijderen
 * `klanten_verwijderen` — dezelfde rechten als het dashboard en de RLS.
 *
 * Niet overgenomen: e-mail versturen vanaf de kaart (de app verstuurt geen
 * mail) — de mailknop opent het eigen mailprogramma.
 */

const LIJST = '/customers?soort=leveranciers';
const TIJDLIJN_LABEL: Record<string, string> = {
  notitie_toegevoegd: 'Notitie',
  email_verstuurd: 'E-mail verstuurd',
};

export default function LeverancierKaart() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, can, readonly } = usePermissions();

  const [lev, setLev] = useState<Leverancier | null>(null);
  const [tijdlijn, setTijdlijn] = useState<LeverancierTijdlijnRegel[]>([]);
  const [materialen, setMaterialen] = useState<LeverancierMateriaal[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [concept, setConcept] = useState<LeverancierConcept | null>(null);
  const [nieuweNotitie, setNieuweNotitie] = useState('');
  const [alleNotities, setAlleNotities] = useState(false);
  const { save, saving, error: saveFout, setError: setSaveFout } = useSave<unknown>();
  const { save: saveNotitie, saving: notitieBezig, error: notitieFout } = useSave<unknown>();

  const load = useCallback(async () => {
    if (!id) return;
    setFout(null);
    const [levRes, tlRes, matRes] = await Promise.all([
      getLeverancier(id),
      listLeverancierTijdlijn(id),
      listLeverancierMaterialen(id),
    ]);
    if (levRes.error || !levRes.data) {
      setFout(levRes.error ?? 'Deze leverancier bestaat niet of je hebt geen toegang.');
      setLev(null);
      return;
    }
    setLev(levRes.data);
    if (!tlRes.error) setTijdlijn(tlRes.data);
    if (!matRes.error) setMaterialen(matRes.data);
  }, [id]);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setFout });

  const terug = () => terugOfNaar(router, LIJST);

  if (loading && !lev) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <AppTopBar variant="detail" title="Leverancier" onBack={terug} />
          <LoadingScreen label="Leverancier laden..." />
        </View>
      </>
    );
  }
  if (!lev) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <AppTopBar variant="detail" title="Leverancier" onBack={terug} />
          <ErrorState
            title="Leverancier niet gevonden"
            message={fout ?? 'Deze leverancier bestaat niet of je hebt geen toegang.'}
            onRetry={opnieuw}
          />
        </View>
      </>
    );
  }

  const naam = leverancierNaam(lev);
  const actief = isActief(lev);
  const telefoon = lev.telefoon || lev.mobiel;
  const adres = [lev.address, [lev.postcode, lev.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const magBewerken = rechtenGeladen && can('klanten_bewerken');
  const magVerwijderen = rechtenGeladen && can('klanten_verwijderen');
  const magNotitie = rechtenGeladen && !readonly;
  const toonInkoop = rechtenGeladen && can('inkoopprijzen');
  const notities = tijdlijn.filter((r) => r.type === 'notitie_toegevoegd');
  const overigeTijdlijn = tijdlijn.filter((r) => r.type !== 'notitie_toegevoegd');
  const zichtbareNotities = alleNotities ? notities : notities.slice(0, 2);

  const bellen = () => {
    if (!callPhone(telefoon)) Dialog.alert('Geen telefoonnummer', 'Voor deze leverancier is geen nummer bekend.');
  };
  const mailen = () => {
    if (!sendMail(lev.email)) {
      Dialog.alert('Geen e-mailadres', 'Deze leverancier heeft geen e-mailadres. Vul er een in bij Gegevens.');
    }
  };
  const route = () => {
    if (!openMaps(adres)) Dialog.alert('Geen adres', 'Voor deze leverancier is geen adres bekend.');
  };

  const overzichtKolom = (
    <>
      <KaartBlok
        titel="Notities"
        aantal={notities.length}
        actie={notities.length > 2 ? (alleNotities ? 'Minder' : `Alle notities (${notities.length})`) : undefined}
        onActie={() => setAlleNotities((v) => !v)}
      >
        {magNotitie ? (
          <View style={styles.notitieInvoer}>
            <FormField
              label="Nieuwe notitie"
              value={nieuweNotitie}
              onChangeText={setNieuweNotitie}
              placeholder="Afspraken, levertijden, contactmomenten…"
              multiline
            />
            {notitieFout ? <Text style={styles.fout}>{notitieFout}</Text> : null}
            <Button
              label={notitieBezig ? 'Opslaan…' : 'Toevoegen'}
              variant="secondary"
              loading={notitieBezig}
              disabled={!nieuweNotitie.trim() || notitieBezig}
              onPress={() => {
                if (!id) return;
                saveNotitie(() => addLeverancierNotitie(id, nieuweNotitie), {
                  onSuccess: async () => {
                    setNieuweNotitie('');
                    await herlaad();
                  },
                });
              }}
            />
          </View>
        ) : null}
        {notities.length === 0 ? (
          <KaartLeeg tekst="Nog geen notities bij deze leverancier." />
        ) : (
          zichtbareNotities.map((n, i) => (
            <KaartRij
              key={n.id}
              eerste={i === 0 && !magNotitie}
              titel={[formatDateNL(n.aangemaakt_op), n.auteurNaam].filter(Boolean).join(' · ')}
              sub={n.tekst}
            />
          ))
        )}
      </KaartBlok>

      <KaartBlok titel="Materialen" aantal={materialen.length}>
        {materialen.length === 0 ? (
          <KaartLeeg tekst="Nog geen materialen gekoppeld aan deze leverancier." />
        ) : (
          materialen.map((m, i) => {
            const marge =
              toonInkoop && m.inkoopprijs != null && m.verkoopprijs != null
                ? m.verkoopprijs - m.inkoopprijs
                : null;
            return (
              <KaartRij
                key={m.id}
                eerste={i === 0}
                titel={m.naam || 'Materiaal'}
                sub={[
                  m.eenheid,
                  toonInkoop && m.inkoopprijs != null ? `Inkoop ${formatEUR(m.inkoopprijs)}` : null,
                  marge != null ? `Marge ${formatEUR(marge)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={
                  <Text style={[styles.bedrag, marge != null && marge < 0 && { color: t.statusRejectFg }]}>
                    {m.verkoopprijs != null ? formatEUR(m.verkoopprijs) : '—'}
                  </Text>
                }
              />
            );
          })
        )}
      </KaartBlok>

      {overigeTijdlijn.length > 0 ? (
        <KaartBlok titel="Tijdlijn" aantal={overigeTijdlijn.length}>
          {overigeTijdlijn.slice(0, 20).map((r, i) => (
            <KaartRij
              key={r.id}
              eerste={i === 0}
              titel={TIJDLIJN_LABEL[r.type] ?? r.type.replace(/_/g, ' ')}
              sub={[formatDateNL(r.aangemaakt_op), r.tekst].filter(Boolean).join(' · ')}
            />
          ))}
        </KaartBlok>
      ) : null}
    </>
  );

  const gegevensKolom = (
    <>
      <KaartBlok titel="Gegevens">
        <GegevensRij eerste label="Contactpersoon" waarde={lev.contactpersoon} />
        <GegevensRij label="E-mail" waarde={lev.email} onPress={mailen} />
        <GegevensRij label="Telefoon" waarde={lev.telefoon} onPress={bellen} />
        <GegevensRij
          label="Mobiel"
          waarde={lev.mobiel}
          onPress={() => callPhone(lev.mobiel)}
        />
        <GegevensRij label="Adres" waarde={adres} onPress={route} />
        <GegevensRij label="Website" waarde={lev.website} />
        <GegevensRij label="KvK" waarde={lev.kvk_number} />
        <GegevensRij label="Btw" waarde={lev.btw_number} />
        <GegevensRij label="IBAN" waarde={lev.iban} />
        <GegevensRij
          label="Betaaltermijn"
          waarde={lev.betaaltermijn_dagen != null ? `${lev.betaaltermijn_dagen} dagen` : null}
        />
      </KaartBlok>
    </>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />
        <OnderStatusbalk>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.green}
              colors={[t.green]}
              progressViewOffset={0}
            />
          }
        >
          <AppTopBar
            variant="detail"
            onBack={terug}
            eyebrow={actief ? 'Leverancier' : 'Leverancier · inactief'}
            title={naam}
            subtitle={[lev.contactpersoon, lev.city].filter(Boolean).join(' · ') || undefined}
            rightAction={
              magBewerken ? (
                <HeaderIconButton
                  icon={Pencil}
                  label="Leverancier bewerken"
                  variant="plain"
                  onPress={() => {
                    setSaveFout(null);
                    setConcept(conceptVanLeverancier(lev));
                  }}
                />
              ) : undefined
            }
          />

          <View style={styles.badgeRij}>
            <View style={[styles.badge, !actief && styles.badgeInactief]}>
              <Text style={[styles.badgeTekst, !actief && styles.badgeTekstInactief]}>
                {actief ? 'Leverancier' : 'Inactief'}
              </Text>
            </View>
          </View>

          <View style={styles.acties}>
            <SnelKnop label="Bellen" primair uit={!telefoon} onPress={bellen}>
              <Phone size={18} color={ds.greenInk} strokeWidth={2.4} />
            </SnelKnop>
            <SnelKnop label="Route" uit={!adres} onPress={route}>
              <NavigationIcon size={18} color={t.ink} strokeWidth={2} />
            </SnelKnop>
            <SnelKnop label="Mail" uit={!lev.email} onPress={mailen}>
              <Mail size={18} color={t.ink} strokeWidth={2} />
            </SnelKnop>
          </View>

          {rechtenGeladen && can('projectbedragen') ? (
            <KaartCijfers
              cijfers={[
                { label: 'Materialen', waarde: String(materialen.length) },
                {
                  label: 'Betaaltermijn',
                  waarde: lev.betaaltermijn_dagen != null ? `${lev.betaaltermijn_dagen} dagen` : '—',
                },
              ]}
            />
          ) : null}

          <KaartKolommen links={gegevensKolom} rechts={overzichtKolom} />
        </ScrollView>
        </OnderStatusbalk>

        <FormSheet
          visible={concept !== null}
          title="Leverancier bewerken"
          subtitle={naam}
          error={saveFout}
          saving={saving}
          submitDisabled={!concept || !leverancierConceptGeldig(concept)}
          onSubmit={() => {
            if (!concept || !id) return;
            save(() => updateLeverancier(id, concept), {
              succesMelding: 'Leverancier opgeslagen',
              onSuccess: async () => {
                setConcept(null);
                await herlaad();
              },
            });
          }}
          onClose={() => setConcept(null)}
          destructive={
            magVerwijderen
              ? {
                  label: 'Leverancier verwijderen',
                  onPress: () =>
                    bevestigVerwijderen(
                      'Leverancier',
                      () => {
                        if (!id) return;
                        save(() => deleteLeverancier(id), {
                          onSuccess: (_data, extra) => {
                            setConcept(null);
                            if (typeof extra?.waarschuwing === 'string') {
                              Dialog.alert('Let op', extra.waarschuwing);
                            }
                            terugOfNaar(router, LIJST);
                          },
                        });
                      },
                      'Een leverancier met kostenposten kan niet verwijderd worden.',
                    ),
                }
              : undefined
          }
        >
          {concept ? <LeverancierVelden waarde={concept} onChange={setConcept} /> : null}
        </FormSheet>
      </View>
    </>
  );
}

function SnelKnop({
  label,
  primair,
  uit,
  onPress,
  children,
}: {
  label: string;
  primair?: boolean;
  uit?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      disabled={uit}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!uit }}
      style={({ pressed }) => [
        styles.snelKnop,
        primair ? styles.snelKnopPrimair : styles.snelKnopRand,
        uit && { opacity: 0.4 },
        pressed && !uit && { opacity: 0.92 },
      ]}
    >
      {children}
      <Text style={[styles.snelKnopTekst, primair && { color: ds.greenInk }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    badgeRij: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.green50 },
    badgeInactief: { backgroundColor: t.card, borderWidth: 1, borderColor: t.line },
    badgeTekst: { fontSize: 11.5, fontWeight: '800', color: t.green700 },
    badgeTekstInactief: { color: t.muted },
    acties: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    snelKnop: {
      flex: 1,
      height: 52,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    snelKnopPrimair: { backgroundColor: ds.green },
    snelKnopRand: { backgroundColor: t.card, borderWidth: 1, borderColor: t.line },
    snelKnopTekst: { fontSize: 14, fontWeight: '700', color: t.ink },
    notitieInvoer: { padding: 14, gap: 10 },
    fout: { fontSize: 12.5, fontWeight: '600', color: t.statusRejectFg },
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink },
  });
