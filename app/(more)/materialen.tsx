import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Package, Plus } from 'lucide-react-native';
import {
  AppScreen,
  AppSearchBar,
  AppTopBar,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  NoticeBanner,
  SelectField,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  createMateriaal,
  deleteMateriaal,
  listLeveranciers,
  listMaterialen,
  updateMateriaal,
  type Materiaal,
  type MateriaalForm,
} from '@/services/materiaalService';
import { BTW_TARIEVEN, EENHEDEN, leesBedrag, marge } from '@/lib/werkbonLogica';
import { formatEUR } from '@/lib/format';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { Dialog } from '@/lib/dialog';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { useSchermklasse } from '@/lib/schermklasse';
import { leesbreedte } from '@/lib/schermklasseRegels';
import { ds, dsShadow, spacing, type ThemeColors } from '@/theme';

/**
 * Materialen — de bibliotheek van het dashboard (`MaterialenPage`):
 * standaardmaterialen met prijs en leverancier. Zoeken op naam of
 * artikelnummer; nieuw, bewerken (ook actief/inactief) en verwijderen.
 *
 * Inkoopprijs en marge alleen met het recht `inkoopprijzen` — puur cosmetisch
 * bovenop de echte afscherming: de prijs staat in `materiaal_inkoop` met eigen
 * RLS. Geen voorraadbeheer (bewust, net als op kantoor). Geen rechtencheck op
 * de pagina zelf: het dashboard heeft die ook niet; RLS begrenst op bedrijf.
 */
export default function MaterialenScreen() {
  const router = useRouter();
  const { companyId } = useAuth();
  const { can, readonly } = usePermissions();
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { klasse } = useSchermklasse();
  const magInkoop = can('inkoopprijzen');

  const [lijst, setLijst] = useState<Materiaal[]>([]);
  const [leveranciers, setLeveranciers] = useState<{ id: string; naam: string; actief: boolean }[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [zoek, setZoek] = useState('');
  const [modal, setModal] = useState<Materiaal | 'nieuw' | null>(null);

  const laad = useCallback(async () => {
    const [m, l] = await Promise.all([listMaterialen(), listLeveranciers()]);
    if (m.error) setFout(m.error);
    else {
      setFout(null);
      setLijst(m.data);
    }
    if (!l.error) setLeveranciers(l.data);
  }, []);
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(laad, { onFout: setFout });

  const levNaam = (id: string | null) => (id ? (leveranciers.find((l) => l.id === id)?.naam ?? '') : '');
  const term = zoek.trim().toLowerCase();
  const gefilterd = lijst.filter(
    (m) => m.naam.toLowerCase().includes(term) || m.artikelnummer.toLowerCase().includes(term),
  );

  const verwijder = (m: Materiaal) =>
    Dialog.alert(
      `"${m.naam}" verwijderen?`,
      'Werkbonregels die dit materiaal gebruiken blijven bestaan met hun eigen prijzen.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteMateriaal(m.id);
            if (error) return Dialog.alert('Niet verwijderd', error);
            setLijst((l) => l.filter((x) => x.id !== m.id));
            setModal(null);
            Dialog.alert('Materiaal verwijderd');
          },
        },
      ],
    );

  const kop = (
    <AppTopBar
      variant="detail"
      title="Materialen"
      subtitle={`${lijst.length} ${lijst.length === 1 ? 'materiaal' : 'materialen'} in je bibliotheek`}
      onBack={() => terugOfNaar(router, '/menu')}
      rightAction={
        !readonly ? <HeaderIconButton icon={Plus} label="Nieuw materiaal" onPress={() => setModal('nieuw')} /> : undefined
      }
    />
  );

  if (loading && lijst.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {kop}
        <LoadingScreen label="Materialen laden…" />
      </View>
    );
  }
  if (fout && lijst.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {kop}
        <ErrorState title="Materialen laden is mislukt." message={fout} onRetry={opnieuw} />
      </View>
    );
  }

  const tablet = klasse === 'tablet';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen header={kop} refreshing={refreshing} onRefresh={onRefresh}>
        <View style={styles.inhoud}>
          {fout ? <NoticeBanner toon="fout" message={fout} onPress={() => herlaad()} /> : null}
          <AppSearchBar value={zoek} onChange={setZoek} placeholder="Zoek op naam of artikelnummer…" />

          {gefilterd.length === 0 ? (
            <View style={styles.leeg}>
              <View style={styles.leegIcoon}>
                <Package size={26} color={t.green700} />
              </View>
              <Text style={styles.leegTitel}>Geen materialen gevonden</Text>
              <Text style={styles.leegTekst}>
                {lijst.length === 0
                  ? 'Voeg je veelgebruikte materialen toe — dan staan prijs en leverancier meteen goed op een werkbon.'
                  : 'Pas je zoekopdracht aan.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.raster, tablet && styles.rasterTablet]}>
              {gefilterd.map((m) => {
                const mg = marge(m.inkoopprijs, m.verkoopprijs);
                const av = avatarKleuren(m.naam, colorMode === 'dark');
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setModal(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.naam} bewerken`}
                    style={({ pressed }) => [
                      styles.kaart,
                      tablet && styles.kaartTablet,
                      !m.actief && { opacity: 0.55 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={styles.kaartKop}>
                      <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                        <Text style={[styles.avatarTekst, { color: av.fg }]}>{initialen(m.naam)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.naam} numberOfLines={2}>
                          {m.naam}
                          {!m.actief ? <Text style={styles.inactief}>  inactief</Text> : null}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          {[m.artikelnummer, m.eenheid, levNaam(m.leverancierId)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={t.muted2} />
                    </View>
                    <View style={styles.prijsRij}>
                      {magInkoop ? (
                        <Prijs styles={styles} label="Inkoop" waarde={m.inkoopprijs != null ? formatEUR(m.inkoopprijs) : '—'} />
                      ) : null}
                      <Prijs styles={styles} label="Verkoop" waarde={m.verkoopprijs != null ? formatEUR(m.verkoopprijs) : '—'} sterk />
                      {magInkoop ? (
                        <Prijs
                          styles={styles}
                          label="Marge"
                          waarde={mg ? `${formatEUR(mg.bedrag)}${mg.pct != null ? ` · ${mg.pct}%` : ''}` : '—'}
                          kleur={mg ? (mg.bedrag < 0 ? '#dc2626' : '#15A34A') : undefined}
                        />
                      ) : null}
                      <Prijs styles={styles} label="BTW" waarde={`${m.btwPct}%`} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={styles.voet}>Prijzen excl. btw. Geen voorraadbeheer: je koopt per klus in.</Text>
        </View>
      </AppScreen>

      {modal ? (
        <MateriaalSheet
          key={modal === 'nieuw' ? 'nieuw' : modal.id}
          materiaal={modal === 'nieuw' ? null : modal}
          leveranciers={leveranciers}
          magInkoop={magInkoop}
          onClose={() => setModal(null)}
          onVerwijder={modal !== 'nieuw' && !readonly ? () => verwijder(modal) : undefined}
          onOpslaan={async (form) => {
            if (!companyId) return 'Je sessie is nog niet geladen.';
            const res = modal === 'nieuw' ? await createMateriaal(companyId, form) : await updateMateriaal(modal.id, form);
            if (!res.data) return res.error ?? 'Opslaan mislukt';
            setModal(null);
            herlaad();
            Dialog.alert(
              modal === 'nieuw' ? 'Materiaal toegevoegd' : 'Materiaal bijgewerkt',
              res.error ? `Maar de inkoopprijs niet: ${res.error}` : undefined,
            );
            return null;
          }}
        />
      ) : null}
    </View>
  );
}

function Prijs({
  styles,
  label,
  waarde,
  sterk,
  kleur,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  waarde: string;
  sterk?: boolean;
  kleur?: string;
}) {
  return (
    <View style={styles.prijs}>
      <Text style={styles.prijsLabel}>{label}</Text>
      <Text style={[styles.prijsWaarde, sterk && { fontWeight: '800' }, kleur ? { color: kleur } : null]}>{waarde}</Text>
    </View>
  );
}

/** MateriaalModal van het dashboard: naam*, eenheid, artikelnummer, prijzen, leverancier*, btw, actief. */
function MateriaalSheet({
  materiaal,
  leveranciers,
  magInkoop,
  onClose,
  onOpslaan,
  onVerwijder,
}: {
  materiaal: Materiaal | null;
  leveranciers: { id: string; naam: string; actief: boolean }[];
  magInkoop: boolean;
  onClose: () => void;
  onOpslaan: (form: MateriaalForm) => Promise<string | null>;
  onVerwijder?: () => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const bewerken = !!materiaal;
  const getal = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
  const [naam, setNaam] = useState(materiaal?.naam ?? '');
  const [eenheid, setEenheid] = useState(materiaal?.eenheid ?? 'stuk');
  const [artikelnummer, setArtikelnummer] = useState(materiaal?.artikelnummer ?? '');
  const [inkoop, setInkoop] = useState(getal(materiaal?.inkoopprijs));
  const [verkoop, setVerkoop] = useState(getal(materiaal?.verkoopprijs));
  const [leverancierId, setLeverancierId] = useState<string | null>(materiaal?.leverancierId ?? null);
  const [btw, setBtw] = useState<number>(materiaal?.btwPct ?? 21);
  const [actief, setActief] = useState(materiaal?.actief ?? true);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const mg = marge(leesBedrag(inkoop), leesBedrag(verkoop));
  // Eenheid van een ouder materiaal die niet in de vaste lijst staat: tonen.
  const eenheden: string[] = (EENHEDEN as readonly string[]).includes(eenheid) ? [...EENHEDEN] : [...EENHEDEN, eenheid];
  const levOpties = leveranciers
    .filter((l) => l.actief || l.id === leverancierId)
    .map((l) => ({ id: l.id, label: l.naam }));

  const submit = async () => {
    if (!naam.trim()) return setFout('Naam is verplicht');
    // Verplicht omdat hij via de kostenregel naar de boekhouding gaat.
    if (!leverancierId) return setFout('Kies een leverancier');
    const vk = verkoop.trim() ? leesBedrag(verkoop) : null;
    if (verkoop.trim() && vk === null) return setFout('Vul een geldige verkoopprijs in.');
    const ik = inkoop.trim() ? leesBedrag(inkoop) : null;
    if (magInkoop && inkoop.trim() && ik === null) return setFout('Vul een geldige inkoopprijs in.');
    setBezig(true);
    setFout(null);
    const melding = await onOpslaan({
      naam,
      eenheid,
      artikelnummer,
      verkoopprijs: vk,
      leverancierId,
      btwPct: btw,
      actief,
      ...(magInkoop ? { inkoopprijs: ik } : {}),
    });
    setBezig(false);
    if (melding) setFout(melding);
  };

  return (
    <FormSheet
      visible
      title={bewerken ? 'Materiaal bewerken' : 'Nieuw materiaal'}
      subtitle="Prijzen excl. btw"
      error={fout}
      saving={bezig}
      onSubmit={submit}
      onClose={onClose}
      destructive={onVerwijder ? { label: 'Verwijderen', onPress: onVerwijder } : undefined}
    >
      <FormField label="Naam *" value={naam} onChangeText={setNaam} placeholder="Bijv. Installatiedraad 2,5mm²" autoFocus={!bewerken} />
      <View>
        <Text style={styles.veldLabel}>Eenheid</Text>
        <View style={styles.chipRij}>
          {eenheden.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEenheid(e)}
              accessibilityRole="radio"
              accessibilityState={{ selected: eenheid === e }}
              style={[styles.chip, eenheid === e && styles.chipAan]}
            >
              <Text style={[styles.chipTekst, eenheid === e && { color: t.green700 }]}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FormField label="Artikelnummer (optioneel)" value={artikelnummer} onChangeText={setArtikelnummer} autoCapitalize="none" />
      {magInkoop ? (
        <FormField label="Inkoopprijs (excl. btw · intern)" value={inkoop} onChangeText={setInkoop} keyboardType="decimal-pad" placeholder="0,00" />
      ) : null}
      <FormField label="Verkoopprijs (excl. btw · naar de klant)" value={verkoop} onChangeText={setVerkoop} keyboardType="decimal-pad" placeholder="0,00" />
      {magInkoop && mg ? (
        <Text style={[styles.marge, { color: mg.bedrag < 0 ? '#dc2626' : '#15A34A' }]}>
          Marge: {formatEUR(mg.bedrag)}
          {mg.pct != null ? ` · ${mg.pct}%` : ''} (excl. btw)
        </Text>
      ) : null}
      <SelectField
        label="Leverancier *"
        value={leverancierId}
        onChange={setLeverancierId}
        options={levOpties}
        placeholder="Kies een leverancier"
        hint={
          bewerken && !materiaal?.leverancierId
            ? 'Dit materiaal heeft nog geen leverancier. Vul hem aan om op te kunnen slaan.'
            : levOpties.length === 0
              ? 'Nog geen leveranciers. Voeg ze toe op het dashboard (Leveranciers).'
              : undefined
        }
      />
      <View>
        <Text style={styles.veldLabel}>BTW-tarief</Text>
        <View style={styles.chipRij}>
          {BTW_TARIEVEN.map((p) => (
            <Pressable
              key={p}
              onPress={() => setBtw(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: btw === p }}
              style={[styles.chip, btw === p && styles.chipAan]}
            >
              <Text style={[styles.chipTekst, btw === p && { color: t.green700 }]}>{p}%</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {bewerken ? (
        <View style={styles.actiefRij}>
          <Text style={styles.actiefTekst}>
            Actief — inactieve materialen zijn niet meer te kiezen op een werkbon
          </Text>
          <Switch
            value={actief}
            onValueChange={setActief}
            trackColor={{ true: ds.green, false: t.line }}
            accessibilityLabel="Actief"
          />
        </View>
      ) : null}
    </FormSheet>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { ...leesbreedte, maxWidth: 880, paddingHorizontal: 16, paddingTop: 12, gap: spacing.md },
    raster: { gap: 10 },
    rasterTablet: { flexDirection: 'row', flexWrap: 'wrap' },
    kaart: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: ds.rMd,
      padding: 14,
      gap: 10,
      ...dsShadow,
    },
    kaartTablet: { width: '48.8%' },
    kaartKop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    avatarTekst: { fontSize: 12, fontWeight: '700' },
    naam: { fontSize: 15, fontWeight: '600', color: t.ink },
    inactief: { fontSize: 12, fontWeight: '500', color: t.muted },
    sub: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    prijsRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    prijs: { minWidth: 64 },
    prijsLabel: { fontSize: 11, fontWeight: '700', color: t.muted2, textTransform: 'uppercase', letterSpacing: 0.4 },
    prijsWaarde: { fontSize: 14, fontWeight: '600', color: t.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
    leeg: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 6 },
    leegIcoon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: t.green50,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    leegTitel: { fontSize: 17, fontWeight: '800', color: t.ink },
    leegTekst: { fontSize: 13.5, color: t.muted, textAlign: 'center', lineHeight: 19 },
    voet: { fontSize: 12, color: t.muted2, textAlign: 'center', paddingVertical: 12 },
    veldLabel: { fontSize: 12, fontWeight: '500', color: t.ink2, marginBottom: 6 },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 44,
      minWidth: 52,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipAan: { borderColor: ds.green, backgroundColor: t.green50 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    marge: { fontSize: 13, fontWeight: '600' },
    actiefRij: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    actiefTekst: { flex: 1, fontSize: 13.5, color: t.ink2, lineHeight: 19 },
  });
