import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { MobielKader } from '@/components/MobielKader';
import { QrCode } from '@/components/QrCode';
import { Dialog } from '@/lib/dialog';
import { deelPdf } from '@/lib/pdfDelen';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import {
  BETAALLINK_REDEN, FASE_LABEL, SOORT_LABEL, beeindig, euro, getBetaallink, getFactuurPdf, getVerhuis, getal,
  maakFactuur, nl, slaAfrekeningOp, start, teken, uren, verstuurFactuurmailOpnieuw,
  type Inhoud, type Verhuis, type VerhuisFase,
} from '@/services/verhuisService';
import { HandtekeningVak } from './HandtekeningVak';

/**
 * Verhuisflow op de werkbon (VerhuisBlok in het dashboard). Alleen zichtbaar als
 * de functie 'verhuisflow' aanstaat voor het bedrijf; dat zegt de server.
 *
 * In de app: gegevens bekijken, vooraf laten tekenen, starten, beëindigen,
 * afrekening controleren, achteraf laten tekenen, factureren (met het recht
 * Facturen), PDF delen, betaal-QR en review-QR. De afspraken invullen gebeurt in
 * het dashboard.
 *
 * Na elke actie tonen we wat de server terugstuurt. Een fout (ook geen bereik)
 * laat de oude stand staan en zegt dat er niets is opgeslagen.
 */

const STAPPEN: { fase: VerhuisFase; label: string }[] = [
  { fase: 'voorbereiding', label: 'Afspraken' },
  { fase: 'akkoord_start', label: 'Getekend vooraf' },
  { fase: 'gestart', label: 'Bezig' },
  { fase: 'beeindigd', label: 'Afrekening' },
  { fase: 'akkoord_eind', label: 'Getekend achteraf' },
  { fase: 'gefactureerd', label: 'Factuur' },
];

const tijd = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export function VerhuisSectie({ werkbonId, onWerkbonGewijzigd }: { werkbonId: string; onWerkbonGewijzigd?: () => void }) {
  const { colors: th } = useTheme();
  const s = useMemo(() => maakStijl(th), [th]);
  const [v, setV] = useState<Verhuis | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [tekenen, setTekenen] = useState(false);

  const laad = useCallback(async () => {
    try {
      const d = await getVerhuis(werkbonId);
      setV(d);
      setLaadFout(null);
    } catch (e) {
      setLaadFout((e as Error).message);
    }
  }, [werkbonId]);
  // Laden bij openen; laad zet de state pas na het antwoord van de server.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { laad(); }, [laad]);

  const doe = async (naam: string, fn: () => Promise<Verhuis | { verhuis: Verhuis } | null>, opties: { werkbon?: boolean } = {}) => {
    if (bezig) return false;
    setBezig(naam);
    try {
      const r = await fn();
      const nieuw = r && 'verhuis' in r ? r.verhuis : r && 'actief' in r ? r : null;
      if (nieuw) setV(nieuw); else await laad();
      if (opties.werkbon) onWerkbonGewijzigd?.();
      return true;
    } catch (e) {
      Dialog.alert('Niet gelukt', (e as Error).message);
      await laad();
      return false;
    } finally {
      setBezig(null);
    }
  };

  if (!v) {
    return laadFout ? (
      <View style={s.kaart}>
        <Text style={s.fout}>Verhuisgegevens laden lukte niet: {laadFout}</Text>
        <Button label="Opnieuw" variant="secondary" onPress={laad} />
      </View>
    ) : null;
  }
  if (!v.actief) return null;

  const g = v.gegevens;
  const mag = v.mag ?? { afspraken: false, uitvoeren: false, factureren: false, instellingen: false };
  const faseIdx = STAPPEN.findIndex((x) => x.fase === v.fase);
  const htStart = v.handtekeningen?.find((h) => h.soort === 'start');
  const htEind = v.handtekeningen?.find((h) => h.soort === 'eind');
  const getoond: Inhoud | undefined = htEind?.inhoud ?? (v.fase === 'voorbereiding' ? v.te_tekenen?.inhoud : htStart?.inhoud);
  const geannuleerd = v.werkbon_status === 'geannuleerd';

  return (
    <View style={s.kaart}>
      <View style={s.kopRij}>
        <Text style={s.kopTitel}>Verhuizing</Text>
        <Text style={s.fase}>{FASE_LABEL[v.fase]}</Text>
      </View>
      <Text style={s.stap} accessibilityLabel={`Stap ${faseIdx + 1} van 6: ${STAPPEN[faseIdx]?.label}`}>
        Stap {faseIdx + 1} van 6 · {STAPPEN[faseIdx]?.label}
      </Text>
      <View style={s.balk}>
        {STAPPEN.map((x, i) => (
          <View key={x.fase} style={[s.balkDeel, i <= faseIdx && { backgroundColor: i === faseIdx ? th.ink : th.green }]} />
        ))}
      </View>

      {!v.bestaat ? (
        <Text style={s.hint}>De afspraken voor deze verhuizing zijn nog niet ingevuld. Dat gebeurt in het dashboard (werkbon › Verhuizing).</Text>
      ) : (
        <>
          <Gegevens v={v} s={s} />

          {v.fase !== 'beeindigd' && getoond ? <RegelsLijst inhoud={getoond} werkelijk={!!htEind} s={s} /> : null}

          {v.fase === 'beeindigd' ? (
            <Afrekening
              // Nieuwe stand van de server: het formulier opnieuw beginnen.
              key={`${v.gegevens?.werkelijke_uren}|${(v.regels ?? []).map((r) => `${r.id}:${r.werkelijk_aantal}:${r.eenheidsprijs}`).join(',')}`}
              v={v} s={s} bezig={bezig} kan={mag.uitvoeren}
              onOpslaan={(u, r) => doe('afrekening', () => slaAfrekeningOp(werkbonId, u, r))}
              onTekenen={() => setTekenen(true)} />
          ) : null}

          {geannuleerd ? <Text style={s.hint}>Deze werkbon is geannuleerd.</Text> : null}

          {!geannuleerd && v.fase === 'voorbereiding' && mag.uitvoeren ? (
            <Button label="Klant laten tekenen vóór de start" onPress={() => setTekenen(true)} disabled={!!bezig} />
          ) : null}

          {!geannuleerd && v.fase === 'akkoord_start' && mag.uitvoeren ? (
            <Button
              label="Werkzaamheden starten"
              loading={bezig === 'start'}
              onPress={() =>
                Dialog.alert('Werkzaamheden starten', 'De starttijd wordt nu vastgelegd.', [
                  { text: 'Annuleren', style: 'cancel' },
                  { text: 'Starten', onPress: () => { doe('start', () => start(werkbonId), { werkbon: true }); } },
                ])
              }
            />
          ) : null}

          {!geannuleerd && v.fase === 'gestart' ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.tekst}>Gestart {tijd(g?.gestart_op)}</Text>
              {mag.uitvoeren ? (
                <Button
                  label="Werkzaamheden beëindigen"
                  loading={bezig === 'einde'}
                  onPress={() =>
                    Dialog.alert('Werkzaamheden beëindigen', 'De eindtijd wordt nu vastgelegd. Daarna controleer je de uren en kosten.', [
                      { text: 'Annuleren', style: 'cancel' },
                      { text: 'Beëindigen', onPress: () => { doe('einde', () => beeindig(werkbonId)); } },
                    ])
                  }
                />
              ) : null}
            </View>
          ) : null}

          {v.fase === 'akkoord_eind' ? (
            mag.factureren ? (
              <Button label="Eindafrekening factureren" loading={bezig === 'factuur'}
                onPress={() => doe('factuur', async () => { await maakFactuur(werkbonId); return null; })} />
            ) : (
              <Text style={s.hint}>De klant heeft de afrekening getekend. Iemand met het recht Facturen maakt nu de factuur.</Text>
            )
          ) : null}

          {v.fase === 'gefactureerd' && v.factuur ? <FactuurDeel v={v} werkbonId={werkbonId} s={s} onVernieuw={laad} /> : null}

          {(v.fase === 'akkoord_eind' || v.fase === 'gefactureerd') ? (
            v.google_review_url ? (
              <QrKaart soort="review" waarde={v.google_review_url} titel="Review op Google" s={s}
                regel="Scan om een review achter te laten."
                uitleg="Toon deze code aan elke klant, ongeacht hoe de klus ging. Dit is geen betaling." />
            ) : mag.instellingen ? (
              <Text style={s.melding}>Review-QR: er is nog geen Google-reviewlink ingesteld. Stel hem in het dashboard in bij Instellingen › Verhuizingen.</Text>
            ) : null
          ) : null}

          {v.handtekeningen?.length ? (
            <View style={{ gap: 4 }}>
              <Text style={s.lbl}>Handtekeningen</Text>
              {v.handtekeningen.map((h) => (
                <Text key={h.soort} style={s.sub}>
                  {h.soort === 'start' ? 'Vooraf' : 'Achteraf'}: {h.naam} · {tijd(h.getekend_op)} · {euro(h.inhoud?.totaal_incl)}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}

      {tekenen && v.te_tekenen ? (
        <TekenModal
          tekenen={v.te_tekenen}
          standaardNaam={g?.klant_naam ?? ''}
          bezig={bezig === 'teken'}
          onClose={() => setTekenen(false)}
          onTeken={async (naam, png) => {
            const soort = v.te_tekenen!.soort;
            const ok = await doe('teken', () => teken(werkbonId, soort, naam, v.te_tekenen!.sha256, png), { werkbon: soort === 'eind' });
            if (ok) setTekenen(false);
          }}
        />
      ) : null}
    </View>
  );
}

type S = ReturnType<typeof maakStijl>;

function Gegevens({ v, s }: { v: Verhuis; s: S }) {
  const g = v.gegevens!;
  const tel = g.telefoon?.replace(/\s/g, '');
  const route = g.vertrek_adres && g.bestemming_adres
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(g.vertrek_adres)}&destination=${encodeURIComponent(g.bestemming_adres)}`
    : null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View>
        <Text style={s.lbl}>Klant</Text>
        <Text style={s.waarde}>{g.klant_naam ?? '—'}</Text>
        {tel ? (
          <Pressable onPress={() => Linking.openURL(`tel:${tel}`)} accessibilityRole="link" hitSlop={6}>
            <Text style={s.link}>{g.telefoon}</Text>
          </Pressable>
        ) : null}
        {g.email ? <Text style={s.sub}>{g.email}</Text> : null}
      </View>
      <View>
        <Text style={s.lbl}>Van</Text>
        <Text style={s.waarde}>{g.vertrek_adres ?? '—'}</Text>
        <Text style={[s.lbl, { marginTop: 6 }]}>Naar</Text>
        <Text style={s.waarde}>{g.bestemming_adres ?? '—'}</Text>
        {route ? (
          <Pressable onPress={() => Linking.openURL(route)} accessibilityRole="link" hitSlop={6}>
            <Text style={s.link}>Route openen</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View>
          <Text style={s.lbl}>Geschat</Text>
          <Text style={s.waarde}>{g.geschatte_uren != null ? uren(g.geschatte_uren) : '—'}</Text>
          {g.minimum_uren != null ? <Text style={s.sub}>minimaal {uren(g.minimum_uren)}</Text> : null}
        </View>
        {g.werkelijke_uren != null ? (
          <View>
            <Text style={s.lbl}>Werkelijk</Text>
            <Text style={s.waarde}>{uren(g.werkelijke_uren)}</Text>
            <Text style={s.sub}>{tijd(g.gestart_op)} – {tijd(g.beeindigd_op)}</Text>
          </View>
        ) : null}
      </View>
      {g.afspraken ? (
        <View style={s.afspraken}>
          <Text style={s.lbl}>Afspraken</Text>
          <Text style={s.tekst}>{g.afspraken}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RegelsLijst({ inhoud, werkelijk, s }: { inhoud: Inhoud; werkelijk: boolean; s: S }) {
  return (
    <View style={s.regels}>
      {inhoud.regels.map((r, i) => (
        <View key={i} style={s.regel}>
          <View style={{ flex: 1 }}>
            <Text style={s.tekst}>{r.omschrijving}{r.extra ? '  · extra' : ''}</Text>
            <Text style={s.sub}>{euro(r.eenheidsprijs)} {SOORT_LABEL[r.soort]} excl. btw · {r.btw_pct}% btw · {r.soort === 'uur' ? uren(r.aantal) : `${nl(r.aantal)}${r.soort === 'km' ? ' km' : '×'}`}</Text>
          </View>
          <Text style={s.bedrag}>{euro(r.bedrag)}</Text>
        </View>
      ))}
      <View style={s.regel}><Text style={[s.sub, { flex: 1 }]}>Totaal excl. btw</Text><Text style={s.sub}>{euro(inhoud.totaal_excl)}</Text></View>
      <View style={s.regel}><Text style={[s.sub, { flex: 1 }]}>Btw</Text><Text style={s.sub}>{euro(inhoud.btw)}</Text></View>
      <View style={[s.regel, s.totaal]}>
        <Text style={[s.waarde, { flex: 1 }]}>{werkelijk ? 'Totaal' : 'Geschat totaal'} incl. btw</Text>
        <Text style={s.waarde}>{euro(inhoud.totaal_incl)}</Text>
      </View>
    </View>
  );
}

type RegelInvoer = { id?: string; soort: string; omschrijving: string; eenheidsprijs: string; btw_pct: string; werkelijk_aantal: string; extra: boolean };

function Afrekening({ v, s, bezig, kan, onOpslaan, onTekenen }: {
  v: Verhuis; s: S; bezig: string | null; kan: boolean;
  onOpslaan: (uren: number, regels: Record<string, unknown>[]) => void; onTekenen: () => void;
}) {
  const begin = useMemo<RegelInvoer[]>(() => (v.regels ?? []).map((r) => ({
    id: r.id, soort: r.soort, omschrijving: r.omschrijving, eenheidsprijs: nl(r.eenheidsprijs),
    btw_pct: String(r.btw_pct), werkelijk_aantal: nl(r.werkelijk_aantal), extra: r.extra,
  })), [v.regels]);
  const beginUren = nl(v.gegevens?.werkelijke_uren);
  const [urenTxt, setUrenTxt] = useState(beginUren);
  const [regels, setRegels] = useState(begin);
  const minimum = Number(v.gegevens?.minimum_uren || 0);
  const gewijzigd = urenTxt !== beginUren || JSON.stringify(regels) !== JSON.stringify(begin);
  const zet = (i: number, k: keyof RegelInvoer, w: string) => setRegels((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: w } : r)));
  const zetUren = (txt: string) => {
    setUrenTxt(txt);
    const u = getal(txt);
    if (!Number.isFinite(u)) return;
    setRegels((rs) => rs.map((r) => (r.soort === 'uur' && !r.extra ? { ...r, werkelijk_aantal: nl(Math.max(u, minimum)) } : r)));
  };
  const ongeldig = !Number.isFinite(getal(urenTxt)) || regels.some((r) => !Number.isFinite(getal(r.werkelijk_aantal))
    || (r.extra && (!r.omschrijving.trim() || !Number.isFinite(getal(r.eenheidsprijs)))));
  const inhoud = v.te_tekenen?.inhoud;

  return (
    <View style={s.afrekening}>
      <Text style={s.lbl}>Afrekening controleren</Text>
      <Text style={s.hint}>De afgesproken tarieven liggen vast. Pas de aantallen aan en voeg extra kosten toe met hun eigen prijs.</Text>
      <FormField label="Werkelijke uren" value={urenTxt} onChangeText={zetUren} keyboardType="decimal-pad" editable={kan} />
      {regels.map((r, i) => (
        <View key={r.id ?? `n${i}`} style={s.invoerRegel}>
          {r.extra ? (
            <>
              <TextInput style={s.invoer} value={r.omschrijving} placeholder="Omschrijving, bijv. parkeren" editable={kan}
                accessibilityLabel="Omschrijving extra kosten" onChangeText={(w) => zet(i, 'omschrijving', w)} />
              <TextInput style={s.invoer} value={r.eenheidsprijs} placeholder="Prijs excl. btw" keyboardType="decimal-pad"
                editable={kan} accessibilityLabel="Prijs excl. btw" onChangeText={(w) => zet(i, 'eenheidsprijs', w)} />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }} accessibilityRole="radiogroup" accessibilityLabel="Btw">
                <Text style={s.sub}>Btw</Text>
                {(['21', '9', '0'] as const).map((p) => (
                  <Pressable key={p} onPress={() => kan && zet(i, 'btw_pct', p)} accessibilityRole="radio"
                    accessibilityState={{ checked: r.btw_pct === p }} aria-checked={r.btw_pct === p} style={[s.chip, r.btw_pct === p && s.chipAan]}>
                    <Text style={[s.chipTekst, r.btw_pct === p && s.chipTekstAan]}>{p}%</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={s.tekst}>{r.omschrijving} <Text style={s.sub}>· {euro(getal(r.eenheidsprijs))} {SOORT_LABEL[r.soort as 'uur']}</Text></Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.sub}>Aantal</Text>
            <TextInput style={[s.invoer, { width: 96 }]} value={r.werkelijk_aantal} keyboardType="decimal-pad" editable={kan}
              accessibilityLabel={`Aantal ${r.omschrijving || 'extra kosten'}`} onChangeText={(w) => zet(i, 'werkelijk_aantal', w)} />
            {r.extra && kan ? (
              <Pressable onPress={() => setRegels((rs) => rs.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Regel verwijderen" hitSlop={8}>
                <Text style={s.verwijder}>Verwijderen</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {kan ? (
        <Button label="+ Extra kosten" variant="secondary"
          onPress={() => setRegels((rs) => [...rs, { soort: 'vast', omschrijving: '', eenheidsprijs: '', btw_pct: '21', werkelijk_aantal: '1', extra: true }])} />
      ) : null}
      {inhoud && !gewijzigd ? <Text style={s.waarde}>Totaal incl. btw: {euro(inhoud.totaal_incl)}</Text> : null}
      {kan ? (
        <View style={{ gap: spacing.sm }}>
          <Button label="Afrekening opslaan" variant="secondary" loading={bezig === 'afrekening'} disabled={!gewijzigd || ongeldig || !!bezig}
            onPress={() => onOpslaan(getal(urenTxt), regels.map((r) => (r.id && !r.extra
              ? { id: r.id, werkelijk_aantal: getal(r.werkelijk_aantal) }
              : { ...(r.id ? { id: r.id } : {}), soort: r.soort, omschrijving: r.omschrijving.trim(), eenheidsprijs: getal(r.eenheidsprijs), btw_pct: Number(r.btw_pct), werkelijk_aantal: getal(r.werkelijk_aantal) })))} />
          <Button label="Afrekening laten tekenen" disabled={gewijzigd || !!bezig} onPress={onTekenen} />
          {gewijzigd ? <Text style={s.hint}>Sla eerst op; de klant tekent voor wat is opgeslagen.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function TekenModal({ tekenen, standaardNaam, bezig, onClose, onTeken }: {
  tekenen: NonNullable<Verhuis['te_tekenen']>; standaardNaam: string; bezig: boolean;
  onClose: () => void; onTeken: (naam: string, png: string) => void;
}) {
  const { colors: th } = useTheme();
  const s = useMemo(() => maakStijl(th), [th]);
  const [naam, setNaam] = useState(standaardNaam);
  const [png, setPng] = useState<string | null>(null);
  const [tekent, setTekent] = useState(false);
  const inh = tekenen.inhoud;
  const isStart = tekenen.soort === 'start';
  return (
    <Modal visible animationType="slide" onRequestClose={() => !bezig && onClose()} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalKop}>
            <Pressable onPress={() => !bezig && onClose()} hitSlop={8} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={s.annuleer}>Annuleren</Text>
            </Pressable>
            <Text style={s.modalTitel} numberOfLines={1}>{isStart ? 'Akkoord vooraf' : 'Akkoord afrekening'}</Text>
            <View style={{ minWidth: 64 }} />
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled" scrollEnabled={!tekent}>
            <Text style={s.tekst}>
              {isStart
                ? `Ik ga akkoord met de verhuizing${inh.vertrek_adres ? ` van ${inh.vertrek_adres}` : ''}${inh.bestemming_adres ? ` naar ${inh.bestemming_adres}` : ''}, met de afspraken en tarieven hieronder. De uren en kilometers zijn een schatting; afgerekend wordt op wat werkelijk is gewerkt${inh.minimum_uren != null ? `, met een minimum van ${uren(inh.minimum_uren)}` : ''}.`
                : `Ik ga akkoord met de afronding van de verhuizing en met de afrekening hieronder: ${uren(inh.werkelijke_uren)} gewerkt, van ${tijd(inh.gestart_op)} tot ${tijd(inh.beeindigd_op)}.`}
            </Text>
            {inh.afspraken ? (
              <View style={s.afspraken}><Text style={s.lbl}>Afspraken</Text><Text style={s.tekst}>{inh.afspraken}</Text></View>
            ) : null}
            <RegelsLijst inhoud={inh} werkelijk={!isStart} s={s} />
            {!isStart ? <Text style={s.hint}>Hierna volgt de factuur. Betalen kan met iDEAL via de QR-code; tekenen is nog geen betaling.</Text> : null}
            <FormField label="Naam ondertekenaar" value={naam} onChangeText={setNaam} editable={!bezig} autoComplete="name" />
            {/* Niet `disabled` doorgeven: de webversie wist het canvas als die wisselt,
                en na een mislukte poging moet de handtekening blijven staan. */}
            <View pointerEvents={bezig ? 'none' : 'auto'} style={bezig ? { opacity: 0.6 } : undefined}>
              <HandtekeningVak onChange={setPng} onTekenen={setTekent} />
            </View>
            <Text style={s.sub}>Vastgelegd worden: naam, tijdstip en deze inhoud (kenmerk {tekenen.sha256.slice(0, 12)}…).</Text>
            <Button label="Akkoord en tekenen" loading={bezig} disabled={!png || !naam.trim()} onPress={() => png && onTeken(naam.trim(), png)} />
          </ScrollView>
        </KeyboardAvoidingView>
      </MobielKader>
    </Modal>
  );
}

function FactuurDeel({ v, werkbonId, s, onVernieuw }: { v: Verhuis; werkbonId: string; s: S; onVernieuw: () => Promise<void> }) {
  const f = v.factuur!;
  const betaald = f.status === 'betaald';
  const [link, setLink] = useState<{ url: string | null; reden?: string; fout?: string } | null>(null);
  const [pdfBezig, setPdfBezig] = useState(false);
  const [mailBezig, setMailBezig] = useState(false);
  const mailStatus = v.gegevens?.factuurmail_status;
  // Betaald buiten iDEAL (handmatig op betaald gezet): de webhook stuurt dan niets.
  const buitenStripe = betaald && f.stripe_payment_status !== 'paid';
  const wachtOpWebhook = betaald && !buitenStripe && (mailStatus === 'wacht' || mailStatus === 'bezig');
  const magMailen = !!(v.mag?.uitvoeren || v.mag?.factureren)
    && betaald && (mailStatus === 'mislukt' || (buitenStripe && mailStatus === 'wacht'));
  const vernieuw = useRef(onVernieuw);
  useEffect(() => { vernieuw.current = onVernieuw; }, [onVernieuw]);

  const haalLink = useCallback(async () => {
    try { setLink(await getBetaallink(werkbonId)); } catch (e) { setLink({ url: null, fout: (e as Error).message }); }
  }, [werkbonId]);
  // Betaallink ophalen zolang er niet betaald is; de state volgt pas na het antwoord.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!betaald) haalLink(); }, [betaald, haalLink]);
  // Terwijl de klant betaalt elke 10 s kijken; daarna de mailstatus volgen.
  useEffect(() => {
    const volgen = (!betaald && !!link?.url) || wachtOpWebhook;
    if (!volgen) return undefined;
    const t = setInterval(() => { vernieuw.current(); }, betaald ? 5000 : 10000);
    return () => clearInterval(t);
  }, [betaald, link?.url, wachtOpWebhook]);

  return (
    <View style={s.factuur}>
      <Text style={s.lbl}>Factuur</Text>
      <Text style={s.waarde}>{f.nummer} · {euro(f.totaal_incl)}</Text>
      <Text style={[s.status, betaald && s.statusOk]}>
        {betaald ? `Betaald${f.betaald_op ? ` op ${new Date(f.betaald_op).toLocaleDateString('nl-NL')}` : ''}` : 'Nog niet betaald'}
      </Text>
      <Button label="Factuur-PDF delen of openen" variant="secondary" loading={pdfBezig}
        onPress={async () => {
          setPdfBezig(true);
          try {
            const { pdf_base64, bestandsnaam } = await getFactuurPdf(werkbonId);
            await deelPdf(pdf_base64, bestandsnaam);
          } catch (e) {
            Dialog.alert('PDF niet gelukt', (e as Error).message);
          } finally {
            setPdfBezig(false);
          }
        }} />

      {!betaald ? (
        link?.url ? (
          <QrKaart soort="betalen" waarde={link.url} titel="Betalen met iDEAL" s={s}
            regel={`Te betalen: ${euro(f.totaal_incl)}`}
            uitleg="Laat de klant deze code scannen met de camera of de bank-app. De factuur staat pas op betaald als Stripe de betaling bevestigt." />
        ) : link ? (
          <View style={{ gap: 6 }}>
            <Text style={s.melding}>Geen betaal-QR. {link.fout ?? BETAALLINK_REDEN[link.reden ?? ''] ?? 'Betaallink niet beschikbaar.'}</Text>
            {link.fout ? <Button label="Opnieuw" variant="ghost" onPress={haalLink} /> : null}
          </View>
        ) : (
          <Text style={s.hint}>Betaallink ophalen…</Text>
        )
      ) : null}

      <Text style={s.sub}>
        {!betaald ? 'Na de betaling krijgt de klant de factuur automatisch per e-mail.' : null}
        {betaald && mailStatus === 'verstuurd' ? `Factuur gemaild naar de klant op ${tijd(v.gegevens?.factuurmail_verstuurd_op)}.` : null}
        {wachtOpWebhook ? 'Factuur wordt naar de klant gemaild…' : null}
        {buitenStripe && mailStatus === 'wacht' ? 'Betaald buiten iDEAL; de factuur is niet automatisch gemaild.' : null}
        {betaald && mailStatus === 'geen_adres' ? 'Er is geen e-mailadres bekend; deel de PDF met de klant.' : null}
      </Text>
      {betaald && mailStatus === 'mislukt' ? (
        <Text style={s.fout}>Mailen van de factuur is mislukt{v.gegevens?.factuurmail_fout ? ` (${v.gegevens.factuurmail_fout})` : ''}.</Text>
      ) : null}
      {magMailen ? (
        <Button label={mailStatus === 'mislukt' ? 'Opnieuw versturen' : 'Factuur mailen'} variant="secondary" loading={mailBezig}
          onPress={async () => {
            setMailBezig(true);
            try {
              const r = await verstuurFactuurmailOpnieuw(werkbonId);
              if (r.uitkomst !== 'verstuurd') Dialog.alert('Niet verstuurd', r.fout ?? 'Mailen is niet gelukt.');
            } catch (e) {
              Dialog.alert('Niet verstuurd', (e as Error).message);
            } finally {
              setMailBezig(false);
              await onVernieuw();
            }
          }} />
      ) : null}
    </View>
  );
}

function QrKaart({ soort, waarde, titel, regel, uitleg, s }: {
  soort: 'betalen' | 'review'; waarde: string; titel: string; regel: string; uitleg: string; s: S;
}) {
  const { width } = useWindowDimensions();
  const [groot, setGroot] = useState(false);
  const klein = Math.min(220, width - 96);
  return (
    <View style={[s.qr, soort === 'betalen' ? s.qrBetalen : s.qrReview]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.qrLabel, { backgroundColor: soort === 'betalen' ? '#15A34A' : '#B45309' }]}>{soort === 'betalen' ? '€ BETALEN' : '★ REVIEW'}</Text>
        <Text style={s.qrTitel}>{titel}</Text>
      </View>
      <Pressable onPress={() => setGroot(true)} accessibilityRole="button" accessibilityLabel={`${titel}: QR-code groot tonen`} style={{ alignSelf: 'center' }}>
        <QrCode waarde={waarde} grootte={klein} label={titel} />
      </Pressable>
      <Text style={s.qrTekst}>{regel}</Text>
      <Text style={s.qrSub}>{uitleg}</Text>
      <Button label="Groot tonen" variant="ghost" onPress={() => setGroot(true)} />
      <Modal visible={groot} animationType="fade" onRequestClose={() => setGroot(false)} transparent>
        <Pressable style={s.grootAchter} onPress={() => setGroot(false)} accessibilityRole="button" accessibilityLabel="Sluiten">
          <View style={[s.grootKaart, soort === 'betalen' ? s.qrBetalen : s.qrReview]}>
            <Text style={s.qrTitel}>{titel}</Text>
            <QrCode waarde={waarde} grootte={Math.min(width - 64, 420)} label={titel} />
            <Text style={s.qrTekst}>{regel}</Text>
            <Text style={s.qrSub}>Tik om te sluiten</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    kaart: { backgroundColor: t.card, borderRadius: 14, padding: spacing.lg, gap: spacing.md, borderLeftWidth: 3, borderLeftColor: t.green },
    kopRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    kopTitel: { fontSize: 17, fontWeight: '700', color: t.ink, letterSpacing: -0.3 },
    fase: { fontSize: 12, fontWeight: '700', color: t.green700, backgroundColor: t.green50, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
    stap: { fontSize: 12.5, color: t.muted, fontWeight: '600' },
    balk: { flexDirection: 'row', gap: 4 },
    balkDeel: { flex: 1, height: 5, borderRadius: 3, backgroundColor: t.line },
    lbl: { fontSize: 11, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    waarde: { fontSize: 15, fontWeight: '700', color: t.ink },
    tekst: { fontSize: 14, lineHeight: 20, color: t.ink },
    sub: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    link: { fontSize: 14, color: t.green700, fontWeight: '600', paddingVertical: 4 },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    fout: { fontSize: 13, color: '#b91c1c', fontWeight: '600' },
    melding: { fontSize: 13, lineHeight: 19, color: '#78350f', backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 10 },
    afspraken: { backgroundColor: t.bgAlt, borderRadius: 8, padding: 10, gap: 4 },
    regels: { gap: 2 },
    regel: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    bedrag: { fontSize: 14, fontWeight: '600', color: t.ink },
    totaal: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: t.lineStrong, paddingTop: 8 },
    afrekening: { gap: spacing.sm, backgroundColor: t.bgAlt, borderRadius: 10, padding: 12 },
    invoerRegel: { gap: 6, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    invoer: { fontSize: 16, color: t.ink, backgroundColor: t.card, borderWidth: 1, borderColor: t.lineStrong, borderRadius: 8, paddingHorizontal: 10, minHeight: 44 },
    chip: { minWidth: 48, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: t.lineStrong, alignItems: 'center', justifyContent: 'center' },
    chipAan: { backgroundColor: t.ink, borderColor: t.ink },
    chipTekst: { fontSize: 14, color: t.ink, fontWeight: '600' },
    chipTekstAan: { color: t.card },
    verwijder: { fontSize: 13, color: '#b91c1c', textDecorationLine: 'underline', paddingVertical: 10 },
    factuur: { gap: spacing.sm, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12 },
    status: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
    statusOk: { color: t.green700, backgroundColor: t.green50 },
    qr: { borderWidth: 2, borderRadius: 12, padding: 12, gap: 10 },
    qrBetalen: { borderColor: '#1DDB62', backgroundColor: '#f0fdf4' },
    qrReview: { borderColor: '#f5b301', backgroundColor: '#fffbeb' },
    // QR-kaarten zijn altijd licht (de code moet scanbaar blijven): vaste donkere tekst.
    qrTitel: { fontSize: 15, fontWeight: '700', color: '#111827' },
    qrTekst: { fontSize: 14, lineHeight: 20, color: '#111827' },
    qrSub: { fontSize: 12.5, lineHeight: 18, color: '#4b5563' },
    qrLabel: { fontSize: 11, fontWeight: '800', color: '#ffffff', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', letterSpacing: 0.4 },
    grootAchter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    grootKaart: { borderWidth: 2, borderRadius: 16, padding: 16, gap: 12, alignItems: 'center' },
    modalKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: t.line, gap: 8 },
    annuleer: { fontSize: 15, color: t.muted, minWidth: 64 },
    modalTitel: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: t.ink },
    modalBody: { padding: spacing.lg, gap: spacing.lg, backgroundColor: t.bg },
  });
