import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { SelectField } from '@/components/SelectField';
import { formatEUR } from '@/lib/format';
import { inclusiefBtw, leesBedrag, materiaalSubtotaal } from '@/lib/werkbonLogica';
import type { Inkoop } from '@/lib/werkbonKosten';
import type { MateriaalWijziging, WerkbonMateriaalRegel } from '@/services/workOrderService';
import { useTheme } from '@/providers';
import { ds, spacing, type ThemeColors } from '@/theme';

/**
 * Regels die je op de werkbon zelf bewerkt, zoals in het dashboard: materiaal
 * (MaterialenSection) en inkopen (InkopenKaart). Een opgeslagen regel staat
 * dicht met een pennetje; open kun je de velden aanpassen, met een vinkje om
 * weer te sluiten en de prullenbak ernaast (RegelKnoppen). Eén regel tegelijk
 * open. Elk veld schrijft weg bij het verlaten; een keuzelijst meteen.
 */

const getal = (s: string) => {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const alsTekst = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const fmtQty = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');

type Lev = { id: string; naam: string };

function Veld({
  styles,
  label,
  waarde,
  onKlaar,
  getalVeld,
  placeholder,
  uit,
  flex = 1,
}: {
  styles: Stijl;
  label: string;
  waarde: string;
  onKlaar: (v: string) => void;
  getalVeld?: boolean;
  placeholder?: string;
  uit?: boolean;
  flex?: number;
}) {
  const [v, setV] = useState(waarde);
  // Komt er een nieuwe waarde uit de database, dan die tonen (zonder effect:
  // de aanbevolen vorm voor "state volgt een prop").
  const [basis, setBasis] = useState(waarde);
  if (basis !== waarde) {
    setBasis(waarde);
    setV(waarde);
  }
  return (
    <View style={{ flex, gap: 4, minWidth: 0 }}>
      <Text style={styles.veldLabel}>{label}</Text>
      <TextInput
        value={v}
        onChangeText={setV}
        onBlur={() => v !== waarde && onKlaar(v)}
        editable={!uit}
        keyboardType={getalVeld ? 'decimal-pad' : 'default'}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        accessibilityLabel={label}
        style={[styles.input, uit && styles.inputUit]}
      />
    </View>
  );
}

function Knoppen({
  styles,
  th,
  open,
  bezig,
  onOpen,
  onKlaar,
  onDelete,
  label,
}: {
  styles: Stijl;
  th: ThemeColors;
  open: boolean;
  bezig: boolean;
  onOpen: () => void;
  onKlaar: () => void;
  onDelete?: () => void;
  label: string;
}) {
  if (bezig) return <ActivityIndicator size="small" color={ds.green700} style={styles.icoonKnop} />;
  return open ? (
    <View style={{ flexDirection: 'row' }}>
      <Pressable onPress={onKlaar} accessibilityRole="button" accessibilityLabel="Klaar met bewerken" style={styles.icoonKnop}>
        <Check size={18} color={ds.green700} strokeWidth={2.4} />
      </Pressable>
      {onDelete ? (
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`${label} verwijderen`} style={styles.icoonKnop}>
          <Trash2 size={16} color="#dc2626" strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  ) : (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${label} bewerken`} style={styles.icoonKnop}>
      <Pencil size={15} color={th.muted} strokeWidth={2} />
    </Pressable>
  );
}

// ── Materiaal ─────────────────────────────────────────────────────────────

export function MateriaalRegel({
  regel,
  open,
  kanBewerken,
  magBedragen,
  magInkoop,
  leveranciers,
  onOpen,
  onSluit,
  onWijzig,
  onDelete,
}: {
  regel: WerkbonMateriaalRegel;
  open: boolean;
  kanBewerken: boolean;
  magBedragen: boolean;
  magInkoop: boolean;
  leveranciers: Lev[];
  onOpen: () => void;
  onSluit: () => void;
  onWijzig: (patch: MateriaalWijziging) => Promise<void>;
  onDelete?: () => void;
}) {
  const { colors: th } = useTheme();
  const styles = useMemo(() => maakStijl(th), [th]);
  const [bezig, setBezig] = useState(false);
  // Uit de bibliotheek: inkoop en leverancier horen bij het materiaal zelf.
  const vast = !!regel.materiaal_id;
  const levNaam = regel.leverancier_id ? (leveranciers.find((l) => l.id === regel.leverancier_id)?.naam ?? '') : '';
  const sub = regel.subtotaal || materiaalSubtotaal(regel.aantal, regel.prijs_per);

  const wijzig = async (patch: MateriaalWijziging) => {
    setBezig(true);
    await onWijzig(patch);
    setBezig(false);
  };

  return (
    <View style={[styles.kaart, open && styles.kaartOpen]}>
      <View style={styles.rij}>
        {!open ? (
          <>
            <View style={styles.qtyPill}>
              <Text style={styles.qtyPillText}>
                {fmtQty(regel.aantal)} {regel.eenheid ?? '×'}
              </Text>
            </View>
            <Text style={styles.naam} numberOfLines={2}>
              {regel.naam}
            </Text>
          </>
        ) : (
          <Veld
            styles={styles}
            label="Materiaal"
            waarde={regel.naam}
            onKlaar={(v) => v.trim() && wijzig({ naam: v.trim() })}
          />
        )}
        {kanBewerken ? (
          <Knoppen
            styles={styles}
            th={th}
            open={open}
            bezig={bezig}
            onOpen={onOpen}
            onKlaar={onSluit}
            onDelete={onDelete}
            label={regel.naam}
          />
        ) : null}
      </View>
      {open ? (
        <View style={styles.velden}>
          <View style={styles.veldRij}>
            <Veld
              styles={styles}
              label="Aantal"
              waarde={alsTekst(regel.aantal)}
              getalVeld
              onKlaar={(v) => {
                const n = getal(v);
                if (n != null && n >= 0) void wijzig({ aantal: n });
              }}
            />
            <Veld
              styles={styles}
              label="Eenheid"
              waarde={regel.eenheid ?? ''}
              placeholder="stuk"
              onKlaar={(v) => wijzig({ eenheid: v.trim() || null })}
            />
            {magBedragen ? (
              <Veld
                styles={styles}
                label="Verkoop"
                waarde={alsTekst(regel.prijs_per)}
                getalVeld
                onKlaar={(v) => wijzig({ prijs_per: leesBedrag(v) ?? 0 })}
              />
            ) : null}
          </View>
          {magInkoop ? (
            vast ? (
              <Text style={styles.vast}>
                {regel.inkoopprijs_per != null ? `Inkoop ${formatEUR(regel.inkoopprijs_per)} p/st` : 'Inkoop —'} · ligt vast op het
                materiaal in de bibliotheek
              </Text>
            ) : (
              <Veld
                styles={styles}
                label="Inkoopprijs per stuk (intern)"
                waarde={alsTekst(regel.inkoopprijs_per)}
                getalVeld
                onKlaar={(v) => wijzig({ inkoopprijs_per: v.trim() === '' ? null : (leesBedrag(v) ?? null) })}
              />
            )
          ) : null}
          {vast ? (
            <Text style={styles.vast}>Leverancier: {levNaam || '—'} (ligt vast op het materiaal)</Text>
          ) : (
            <SelectField
              label="Leverancier"
              value={regel.leverancier_id}
              onChange={(id) => wijzig({ leverancier_id: id })}
              allowEmpty
              emptyLabel="— Geen leverancier —"
              placeholder="— Geen leverancier —"
              options={leveranciers.map((l) => ({ id: l.id, label: l.naam }))}
              disabled={bezig}
            />
          )}
        </View>
      ) : null}
      <Text style={styles.meta}>
        {[
          !open && magBedragen ? `Verkoop ${formatEUR(regel.prijs_per)}` : null,
          !open && magInkoop && regel.inkoopprijs_per != null ? `Inkoop ${formatEUR(regel.inkoopprijs_per)}` : null,
          !open && levNaam ? levNaam : null,
          magBedragen ? `Subtotaal ${formatEUR(sub)} (${formatEUR(inclusiefBtw(sub, regel.btw_percentage))} incl.)` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  );
}

// ── Inkopen ───────────────────────────────────────────────────────────────

export type InkoopPatch = Partial<{ naam: string; eenheid: string | null; aantal: number; prijs_per: number; leverancier_id: string | null }>;

export function InkoopRegel({
  inkoop,
  open,
  kanBewerken,
  leveranciers,
  onOpen,
  onSluit,
  onWijzig,
  onDelete,
}: {
  inkoop: Inkoop;
  open: boolean;
  kanBewerken: boolean;
  leveranciers: Lev[];
  onOpen: () => void;
  onSluit: () => void;
  onWijzig: (patch: InkoopPatch) => Promise<void>;
  onDelete: () => void;
}) {
  const { colors: th } = useTheme();
  const styles = useMemo(() => maakStijl(th), [th]);
  const [bezig, setBezig] = useState(false);
  const levNaam = inkoop.leverancierId ? (leveranciers.find((l) => l.id === inkoop.leverancierId)?.naam ?? '') : '';
  const wijzig = async (patch: InkoopPatch) => {
    setBezig(true);
    await onWijzig(patch);
    setBezig(false);
  };
  return (
    <View style={[styles.kaart, open && styles.kaartOpen]}>
      <View style={styles.rij}>
        {!open ? (
          <>
            <View style={styles.qtyPill}>
              <Text style={styles.qtyPillText}>
                {fmtQty(inkoop.aantal)} {inkoop.eenheid || '×'}
              </Text>
            </View>
            <Text style={styles.naam} numberOfLines={2}>
              {inkoop.naam}
            </Text>
          </>
        ) : (
          // De omschrijving pas bij verlaten opslaan, en nooit leeg (de database weigert dat).
          <Veld styles={styles} label="Omschrijving" waarde={inkoop.naam} onKlaar={(v) => v.trim() && wijzig({ naam: v.trim() })} />
        )}
        {kanBewerken ? (
          <Knoppen
            styles={styles}
            th={th}
            open={open}
            bezig={bezig}
            onOpen={onOpen}
            onKlaar={onSluit}
            onDelete={onDelete}
            label={inkoop.naam}
          />
        ) : null}
      </View>
      {open ? (
        <View style={styles.velden}>
          <View style={styles.veldRij}>
            <Veld
              styles={styles}
              label="Aantal"
              waarde={alsTekst(inkoop.aantal)}
              getalVeld
              onKlaar={(v) => wijzig({ aantal: getal(v) ?? 0 })}
            />
            <Veld styles={styles} label="Eenheid" waarde={inkoop.eenheid} placeholder="stuk" onKlaar={(v) => wijzig({ eenheid: v })} />
            <Veld
              styles={styles}
              label="Kostprijs"
              waarde={alsTekst(inkoop.prijsPer)}
              getalVeld
              onKlaar={(v) => wijzig({ prijs_per: leesBedrag(v) ?? 0 })}
            />
          </View>
          <SelectField
            label="Leverancier"
            value={inkoop.leverancierId}
            onChange={(id) => wijzig({ leverancier_id: id })}
            allowEmpty
            emptyLabel="Geen leverancier"
            placeholder="Geen leverancier"
            options={leveranciers.map((l) => ({ id: l.id, label: l.naam }))}
            disabled={bezig}
          />
        </View>
      ) : null}
      <Text style={styles.meta}>
        {[!open ? `Kostprijs ${formatEUR(inkoop.prijsPer)}` : null, !open && levNaam ? levNaam : null, `Subtotaal ${formatEUR(inkoop.bedrag)}`]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  );
}

/**
 * De invoerregel onder de inkopen (KostenInvoerRegel): omschrijving, aantal,
 * eenheid, kostprijs, leverancier. Na toevoegen weer leeg; zonder
 * omschrijving gebeurt er niets.
 */
export function InkoopInvoer({
  leveranciers,
  onAdd,
}: {
  leveranciers: Lev[];
  onAdd: (f: { naam: string; aantal: number; eenheid: string; prijs_per: number; leverancier_id: string | null }) => Promise<boolean>;
}) {
  const { colors: th } = useTheme();
  const styles = useMemo(() => maakStijl(th), [th]);
  const leeg = { naam: '', aantal: '1', eenheid: '', prijs: '', lev: null as string | null };
  const [f, setF] = useState(leeg);
  const [bezig, setBezig] = useState(false);
  const sub = materiaalSubtotaal(getal(f.aantal) ?? 0, leesBedrag(f.prijs) ?? 0);
  const kan = !!f.naam.trim() && !bezig;
  const voegToe = async () => {
    if (!kan) return;
    setBezig(true);
    const ok = await onAdd({
      naam: f.naam.trim(),
      aantal: getal(f.aantal) || 1,
      eenheid: f.eenheid,
      prijs_per: leesBedrag(f.prijs) ?? 0,
      leverancier_id: f.lev,
    });
    setBezig(false);
    if (ok) setF(leeg);
  };
  return (
    <View style={styles.invoer}>
      <View style={{ gap: 4 }}>
        <Text style={styles.veldLabel}>Omschrijving</Text>
        <TextInput
          value={f.naam}
          onChangeText={(v) => setF((x) => ({ ...x, naam: v }))}
          placeholder="Bijv. steigerhuur"
          placeholderTextColor="#9ca3af"
          onSubmitEditing={voegToe}
          returnKeyType="done"
          style={styles.input}
          accessibilityLabel="Omschrijving inkoop"
        />
      </View>
      <View style={styles.veldRij}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.veldLabel}>Aantal</Text>
          <TextInput value={f.aantal} onChangeText={(v) => setF((x) => ({ ...x, aantal: v }))} keyboardType="decimal-pad" style={styles.input} accessibilityLabel="Aantal" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.veldLabel}>Eenheid</Text>
          <TextInput value={f.eenheid} onChangeText={(v) => setF((x) => ({ ...x, eenheid: v }))} placeholder="stuk" placeholderTextColor="#9ca3af" style={styles.input} accessibilityLabel="Eenheid" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.veldLabel}>Kostprijs</Text>
          <TextInput value={f.prijs} onChangeText={(v) => setF((x) => ({ ...x, prijs: v }))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor="#9ca3af" style={styles.input} accessibilityLabel="Kostprijs per eenheid, excl. btw" />
        </View>
      </View>
      <SelectField
        label="Leverancier"
        value={f.lev}
        onChange={(id) => setF((x) => ({ ...x, lev: id }))}
        allowEmpty
        emptyLabel="Geen leverancier"
        placeholder="Geen leverancier"
        options={leveranciers.map((l) => ({ id: l.id, label: l.naam }))}
      />
      <View style={styles.invoerVoet}>
        <Text style={styles.invoerSub}>{formatEUR(sub)}</Text>
        <Pressable
          onPress={voegToe}
          disabled={!kan}
          accessibilityRole="button"
          accessibilityLabel="Inkoop toevoegen"
          style={({ pressed }) => [styles.plusKnop, !kan && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
        >
          {bezig ? <ActivityIndicator size="small" color={ds.greenInk} /> : <Plus size={18} color={ds.greenInk} strokeWidth={2.4} />}
          <Text style={styles.plusTekst}>Toevoegen</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Stijl = ReturnType<typeof maakStijl>;

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    kaart: { backgroundColor: t.bg, borderRadius: t.rMd, paddingBottom: 8 },
    kaartOpen: { borderWidth: 1, borderColor: t.lineStrong },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingLeft: 12,
      paddingRight: 4,
    },
    qtyPill: {
      minWidth: 44,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: t.green50,
      alignItems: 'center',
    },
    qtyPillText: { fontSize: 13, fontWeight: '800', color: ds.green700, letterSpacing: -0.2 },
    naam: { flex: 1, fontSize: 14.5, fontWeight: '600', color: t.ink },
    meta: { fontSize: 12, color: t.muted, paddingHorizontal: 12, lineHeight: 17 },
    velden: { gap: spacing.sm, paddingHorizontal: 12, paddingBottom: 8 },
    veldRij: { flexDirection: 'row', gap: spacing.sm },
    veldLabel: { fontSize: 11.5, fontWeight: '600', color: t.muted2 },
    input: {
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: 10,
      paddingHorizontal: 10,
      fontSize: 15,
      color: t.ink,
      backgroundColor: t.card,
    },
    inputUit: { backgroundColor: t.bgAlt, color: t.muted },
    vast: { fontSize: 12, color: t.muted, lineHeight: 17 },
    icoonKnop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    invoer: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    invoerVoet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    invoerSub: { fontSize: 13, fontWeight: '700', color: t.ink2 },
    plusKnop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: ds.green,
    },
    plusTekst: { fontSize: 13.5, fontWeight: '700', color: ds.greenInk },
  });
