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
import { locale, tx, txm } from '@/i18n';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import {
  BETAALLINK_REDEN, FASE_LABEL, SOORT_LABEL, VERZEND_REDEN, beeindig, berekenAfrekening, euro, getBetaallink, getFactuurPdf,
  getVerhuis, getal, maakFactuur, nl, slaAfrekeningOp, start, teken, uren, verstuurFactuur, verstuurFactuurmailOpnieuw,
  type Controle, type Inhoud, type Verhuis, type VerhuisFase,
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
  { fase: 'voorbereiding', label: txm('Afspraken') },
  { fase: 'akkoord_start', label: txm('Getekend vooraf') },
  { fase: 'gestart', label: txm('Bezig') },
  { fase: 'beeindigd', label: txm('Afrekening') },
  { fase: 'akkoord_eind', label: txm('Getekend achteraf') },
  { fase: 'gefactureerd', label: txm('Factuur') },
];

const tijd = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

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
      Dialog.alert(tx('Niet gelukt'), (e as Error).message);
      await laad();
      return false;
    } finally {
      setBezig(null);
    }
  };

  if (!v) {
    return laadFout ? (
      <View style={s.kaart}>
        <Text style={s.fout}>{tx('Verhuisgegevens laden lukte niet: {fout}', { fout: laadFout })}</Text>
        <Button label={tx('Opnieuw')} variant="secondary" onPress={laad} />
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
        <Text style={s.kopTitel}>{tx('Verhuizing')}</Text>
        <Text style={s.fase}>{tx(FASE_LABEL[v.fase])}</Text>
      </View>
      <Text style={s.stap} accessibilityLabel={tx('Stap {stap} van 6: {naam}', { stap: faseIdx + 1, naam: tx(STAPPEN[faseIdx]?.label ?? '') })}>
        {tx('Stap {stap} van 6 · {naam}', { stap: faseIdx + 1, naam: tx(STAPPEN[faseIdx]?.label ?? '') })}
      </Text>
      <View style={s.balk}>
        {STAPPEN.map((x, i) => (
          <View key={x.fase} style={[s.balkDeel, i <= faseIdx && { backgroundColor: i === faseIdx ? th.ink : th.green }]} />
        ))}
      </View>

      {!v.bestaat ? (
        <Text style={s.hint}>{tx('De afspraken voor deze verhuizing zijn nog niet ingevuld. Dat gebeurt in het dashboard (werkbon › Verhuizing).')}</Text>
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

          {geannuleerd ? <Text style={s.hint}>{tx('Deze werkbon is geannuleerd.')}</Text> : null}

          {!geannuleerd && v.fase === 'voorbereiding' && mag.uitvoeren ? (
            <Button label={tx('Klant laten tekenen vóór de start')} onPress={() => setTekenen(true)} disabled={!!bezig} />
          ) : null}

          {!geannuleerd && v.fase === 'akkoord_start' && mag.uitvoeren ? (
            <Button
              label={tx('Werkzaamheden starten')}
              loading={bezig === 'start'}
              onPress={() =>
                Dialog.alert(tx('Werkzaamheden starten'), tx('De starttijd wordt nu vastgelegd.'), [
                  { text: tx('Annuleren'), style: 'cancel' },
                  { text: tx('Starten'), onPress: () => { doe('start', () => start(werkbonId), { werkbon: true }); } },
                ])
              }
            />
          ) : null}

          {!geannuleerd && v.fase === 'gestart' ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={s.tekst}>{tx('Gestart {wanneer}', { wanneer: tijd(g?.gestart_op) })}</Text>
              {mag.uitvoeren ? (
                <Button
                  label={tx('Werkzaamheden beëindigen')}
                  loading={bezig === 'einde'}
                  onPress={() =>
                    Dialog.alert(tx('Werkzaamheden beëindigen'), tx('De eindtijd wordt nu vastgelegd. Daarna controleer je de uren en kosten.'), [
                      { text: tx('Annuleren'), style: 'cancel' },
                      { text: tx('Beëindigen'), onPress: () => { doe('einde', () => beeindig(werkbonId)); } },
                    ])
                  }
                />
              ) : null}
            </View>
          ) : null}

          {v.fase === 'akkoord_eind' ? <ControleMelding controle={v.controle} totaal={htEind?.inhoud?.totaal_incl} s={s} /> : null}

          {v.fase === 'akkoord_eind' ? (
            mag.factureren ? (
              <Button label={tx('Factuur aanmaken')} loading={bezig === 'factuur'}
                onPress={() => doe('factuur', async () => { await maakFactuur(werkbonId); return null; })} />
            ) : (
              <Text style={s.hint}>{tx('De klant heeft de afrekening getekend. Iemand met het recht Facturen maakt nu de factuur.')}</Text>
            )
          ) : null}

          {v.fase === 'gefactureerd' && v.factuur ? <FactuurDeel v={v} werkbonId={werkbonId} s={s} onVernieuw={laad} /> : null}

          {(v.fase === 'akkoord_eind' || v.fase === 'gefactureerd') ? (
            v.google_review_url ? (
              <QrKaart soort="review" waarde={v.google_review_url} titel={tx('Review op Google')} s={s}
                regel={tx('Scan om een review achter te laten.')}
                uitleg={tx('Toon deze code aan elke klant, ongeacht hoe de klus ging. Dit is geen betaling.')} />
            ) : mag.instellingen ? (
              <Text style={s.melding}>{tx('Review-QR: er is nog geen Google-reviewlink ingesteld. Stel hem in het dashboard in bij Instellingen › Verhuizingen.')}</Text>
            ) : null
          ) : null}

          {v.handtekeningen?.length ? (
            <View style={{ gap: 4 }}>
              <Text style={s.lbl}>{tx('Handtekeningen')}</Text>
              {v.handtekeningen.map((h) => (
                <Text key={h.soort} style={s.sub}>
                  {h.soort === 'start' ? tx('Vooraf') : tx('Achteraf')}: {h.naam} · {tijd(h.getekend_op)} · {euro(h.inhoud?.totaal_incl)}
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
        <Text style={s.lbl}>{tx('Klant')}</Text>
        <Text style={s.waarde}>{g.klant_naam ?? '—'}</Text>
        {tel ? (
          <Pressable onPress={() => Linking.openURL(`tel:${tel}`)} accessibilityRole="link" hitSlop={6}>
            <Text style={s.link}>{g.telefoon}</Text>
          </Pressable>
        ) : null}
        {g.email ? <Text style={s.sub}>{g.email}</Text> : null}
      </View>
      <View>
        <Text style={s.lbl}>{tx('Van')}</Text>
        <Text style={s.waarde}>{g.vertrek_adres ?? '—'}</Text>
        <Text style={[s.lbl, { marginTop: 6 }]}>{tx('Naar')}</Text>
        <Text style={s.waarde}>{g.bestemming_adres ?? '—'}</Text>
        {route ? (
          <Pressable onPress={() => Linking.openURL(route)} accessibilityRole="link" hitSlop={6}>
            <Text style={s.link}>{tx('Route openen')}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View>
          <Text style={s.lbl}>{tx('Geschat')}</Text>
          <Text style={s.waarde}>{g.geschatte_uren != null ? uren(g.geschatte_uren) : '—'}</Text>
          {g.minimum_uren != null ? <Text style={s.sub}>{tx('minimaal {uren}', { uren: uren(g.minimum_uren) })}</Text> : null}
        </View>
        {g.werkelijke_uren != null ? (
          <View>
            <Text style={s.lbl}>{tx('Werkelijk')}</Text>
            <Text style={s.waarde}>{uren(g.werkelijke_uren)}</Text>
            <Text style={s.sub}>{tijd(g.gestart_op)} – {tijd(g.beeindigd_op)}</Text>
          </View>
        ) : null}
      </View>
      {g.afspraken ? (
        <View style={s.afspraken}>
          <Text style={s.lbl}>{tx('Afspraken')}</Text>
          <Text style={s.tekst}>{g.afspraken}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RegelsLijst({ inhoud, werkelijk, s }: { inhoud: Inhoud; werkelijk: boolean; s: S }) {
  // Bij prijzen incl. btw zijn de regelbedragen incl.; subtotaal en btw zijn wat de factuur ervan maakt.
  const incl = inhoud.prijzen === 'incl_btw';
  const afronding = Number(inhoud.afronding || 0);
  return (
    <View style={s.regels}>
      {inhoud.regels.map((r, i) => (
        <View key={i} style={s.regel}>
          <View style={{ flex: 1 }}>
            <Text style={s.tekst}>{r.omschrijving}{r.extra ? `  · ${tx('extra')}` : ''}</Text>
            <Text style={s.sub}>{tx(incl ? '{prijs} {per} incl. btw · {pct}% btw · {aantal}' : '{prijs} {per} excl. btw · {pct}% btw · {aantal}', { prijs: euro(r.eenheidsprijs), per: tx(SOORT_LABEL[r.soort]), pct: r.btw_pct, aantal: r.soort === 'uur' || r.soort === 'reis' ? uren(r.aantal) : `${nl(r.aantal)}${r.soort === 'km' ? ' km' : '×'}` })}</Text>
          </View>
          <Text style={s.bedrag}>{euro(r.bedrag)}</Text>
        </View>
      ))}
      <View style={s.regel}><Text style={[s.sub, { flex: 1 }]}>{tx('Subtotaal excl. btw')}</Text><Text style={s.sub}>{euro(inhoud.totaal_excl)}</Text></View>
      <View style={s.regel}><Text style={[s.sub, { flex: 1 }]}>{tx('Btw')}</Text><Text style={s.sub}>{euro(inhoud.btw)}</Text></View>
      {incl && afronding !== 0 ? (
        <View style={s.regel}><Text style={[s.sub, { flex: 1 }]}>{tx('Afronding btw')}</Text><Text style={s.sub}>{euro(afronding)}</Text></View>
      ) : null}
      <View style={[s.regel, s.totaal]}>
        <Text style={[s.waarde, { flex: 1 }]}>{werkelijk ? tx('Totaal te betalen') : tx('Geschat totaal incl. btw')}</Text>
        <Text style={s.waarde}>{euro(inhoud.totaal_incl)}</Text>
      </View>
    </View>
  );
}

// Afwijkingen die vóór de factuur zichtbaar moeten zijn (zelfde als het dashboard).
function ControleMelding({ controle, totaal, s }: { controle?: Controle | null; totaal?: number | null; s: S }) {
  if (!controle) return null;
  const afw = controle.afwijkende_tarieven ?? [];
  const o = controle.offerte;
  const geaccepteerd = o?.status === 'geaccepteerd';
  const anders = geaccepteerd && totaal != null && Math.abs(Number(o!.totaal_incl || 0) - Number(totaal)) >= 0.005;
  const open = o && !geaccepteerd && o.status !== 'afgewezen';
  if (!afw.length && !controle.extra_regels && !geaccepteerd && !open) return null;
  return (
    <View style={[s.melding, { gap: 4 }]}>
      <Text style={[s.tekst, { fontWeight: '700', color: '#78350f' }]}>{tx('Controleer vóór de factuur')}</Text>
      {afw.map((a, i) => (
        <Text key={i} style={{ color: '#78350f', fontSize: 13 }}>• {a.standaard != null
          ? tx('{wat}: afgesproken {afgesproken}, standaard {standaard}.', { wat: a.omschrijving, afgesproken: euro(a.afgesproken), standaard: euro(a.standaard) })
          : tx('{wat}: afgesproken bedrag {afgesproken} (geen standaardtarief).', { wat: a.omschrijving, afgesproken: euro(a.afgesproken) })}</Text>
      ))}
      {controle.extra_regels > 0 ? <Text style={{ color: '#78350f', fontSize: 13 }}>• {tx('Er staan {n} extra kostenregel(s) op de afrekening.', { n: controle.extra_regels })}</Text> : null}
      {geaccepteerd ? (
        <Text style={{ color: '#78350f', fontSize: 13 }}>• {anders
          ? tx('Geaccepteerde offerte {nummer}: {offerte} incl. btw. De nacalculatie komt op {totaal}, een verschil van {verschil}. Gefactureerd wordt de nacalculatie; is de offerteprijs afgesproken, pas dan de afrekening aan vóór de handtekening.', { nummer: o!.nummer ?? '', offerte: euro(o!.totaal_incl), totaal: euro(totaal), verschil: euro(Number(totaal) - Number(o!.totaal_incl || 0)) })
          : tx('Geaccepteerde offerte {nummer}: {offerte} incl. btw, gelijk aan de nacalculatie.', { nummer: o!.nummer ?? '', offerte: euro(o!.totaal_incl) })}</Text>
      ) : null}
      {open ? <Text style={{ color: '#78350f', fontSize: 13 }}>• {tx('Offerte {nummer} bij deze klus is nog niet geaccepteerd ({status}).', { nummer: o!.nummer ?? '', status: o!.status })}</Text> : null}
    </View>
  );
}

type RegelInvoer = { id?: string; soort: string; omschrijving: string; eenheidsprijs: string; btw_pct: string; werkelijk_aantal: string; extra: boolean };

// Eindcontrole: klusuren en (bij vaste tarieven) de werkelijk gereden
// kilometers. Het bedrag rekent direct mee; wat de klant tekent rekent de server.
function Afrekening({ v, s, bezig, kan, onOpslaan, onTekenen }: {
  v: Verhuis; s: S; bezig: string | null; kan: boolean;
  onOpslaan: (uren: number, regels: Record<string, unknown>[]) => void; onTekenen: () => void;
}) {
  const tarieven = v.tarieven ?? null;
  const incl = !!v.gegevens?.prijzen_incl_btw;
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
  // Lege kilometers = nog niet bevestigd (alleen bij vaste tarieven).
  const kmLeeg = (r: RegelInvoer) => !!tarieven && r.soort === 'km' && !r.extra && r.werkelijk_aantal.trim() === '';
  const kmOnbevestigd = regels.some(kmLeeg);
  const ongeldig = !Number.isFinite(getal(urenTxt)) || regels.some((r) => (!kmLeeg(r) && !Number.isFinite(getal(r.werkelijk_aantal)))
    || getal(r.werkelijk_aantal) < 0
    || (r.extra && (!r.omschrijving.trim() || !Number.isFinite(getal(r.eenheidsprijs)))));
  const kmIdx = tarieven ? regels.findIndex((r) => r.soort === 'km' && !r.extra) : -1;
  const kmRegel = kmIdx >= 0 ? regels[kmIdx] : undefined;
  const live = useMemo(() => berekenAfrekening(regels.map((r) => ({
    ...r, soort: r.soort as Inhoud['regels'][number]['soort'], aantal: Number.isFinite(getal(r.werkelijk_aantal)) ? getal(r.werkelijk_aantal) : 0,
    eenheidsprijs: getal(r.eenheidsprijs), btw_pct: Number(r.btw_pct),
  })), incl), [regels, incl]);

  return (
    <View style={s.afrekening}>
      <Text style={s.lbl}>{tx('Eindcontrole')}</Text>
      <Text style={s.hint}>{tarieven
        ? tx('Controleer de klusuren en vul de werkelijk gereden kilometers in. De klusuren lopen van "Werkzaamheden starten" tot "beëindigen" en bevatten geen reistijd; heen- en terugreis staan apart op de afrekening.')
        : tx('De afgesproken tarieven liggen vast. Pas de aantallen aan en voeg extra kosten toe met hun eigen prijs.')}</Text>
      <FormField label={tarieven ? tx('Klusuren (2 verhuizers incl. bus)') : tx('Werkelijke uren')} value={urenTxt} onChangeText={zetUren} keyboardType="decimal-pad" editable={kan} />
      {kmRegel ? (
        <View style={{ gap: 4 }}>
          <FormField label={`${tx('Werkelijk gereden kilometers')} *`} value={kmRegel.werkelijk_aantal} placeholder={tx('bijv. 60')}
            onChangeText={(w) => zet(kmIdx, 'werkelijk_aantal', w)} keyboardType="number-pad" editable={kan} />
          <Text style={kmLeeg(kmRegel) ? s.fout : s.sub}>{kmLeeg(kmRegel)
            ? tx('Verplicht. Vul 0 in als er niet is gereden.')
            : tx(incl ? '{prijs} per km incl. btw' : '{prijs} per km excl. btw', { prijs: euro(getal(kmRegel.eenheidsprijs)) })}</Text>
        </View>
      ) : null}

      <RegelsLijst inhoud={{ ...(v.te_tekenen?.inhoud ?? { soort: 'eind' }), ...live, regels: live.regels } as Inhoud} werkelijk s={s} />

      {regels.map((r, i) => (r.soort === 'reis' || (kmIdx === i) || (tarieven && r.soort === 'uur' && !r.extra)) ? null : (
        <View key={r.id ?? `n${i}`} style={s.invoerRegel}>
          {r.extra ? (
            <>
              <TextInput style={s.invoer} value={r.omschrijving} placeholder={tx('Omschrijving, bijv. parkeren')} editable={kan}
                accessibilityLabel={tx('Omschrijving extra kosten')} onChangeText={(w) => zet(i, 'omschrijving', w)} />
              <TextInput style={s.invoer} value={r.eenheidsprijs} placeholder={incl ? tx('Prijs incl. btw') : tx('Prijs excl. btw')} keyboardType="decimal-pad"
                editable={kan} accessibilityLabel={incl ? tx('Prijs incl. btw') : tx('Prijs excl. btw')} onChangeText={(w) => zet(i, 'eenheidsprijs', w)} />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }} accessibilityRole="radiogroup" accessibilityLabel={tx('Btw')}>
                <Text style={s.sub}>{tx('Btw')}</Text>
                {(['21', '9', '0'] as const).map((p) => (
                  <Pressable key={p} onPress={() => kan && zet(i, 'btw_pct', p)} accessibilityRole="radio"
                    accessibilityState={{ checked: r.btw_pct === p }} aria-checked={r.btw_pct === p} style={[s.chip, r.btw_pct === p && s.chipAan]}>
                    <Text style={[s.chipTekst, r.btw_pct === p && s.chipTekstAan]}>{p}%</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={s.tekst}>{r.omschrijving} <Text style={s.sub}>· {euro(getal(r.eenheidsprijs))} {tx(SOORT_LABEL[r.soort as 'uur'])}</Text></Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.sub}>{tx('Aantal')}</Text>
            <TextInput style={[s.invoer, { width: 96 }]} value={r.werkelijk_aantal} keyboardType="decimal-pad" editable={kan}
              accessibilityLabel={tx('Aantal {wat}', { wat: r.omschrijving || tx('extra kosten') })} onChangeText={(w) => zet(i, 'werkelijk_aantal', w)} />
            {r.extra && kan ? (
              <Pressable onPress={() => setRegels((rs) => rs.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={tx('Regel verwijderen')} hitSlop={8}>
                <Text style={s.verwijder}>{tx('Verwijderen')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {kan ? (
        <Button label={tx('+ Extra kosten')} variant="secondary"
          onPress={() => setRegels((rs) => [...rs, { soort: 'vast', omschrijving: '', eenheidsprijs: '', btw_pct: '21', werkelijk_aantal: '1', extra: true }])} />
      ) : null}
      <ControleMelding controle={v.controle} totaal={live.totaal_incl} s={s} />
      {kan ? (
        <View style={{ gap: spacing.sm }}>
          <Button label={tx('Eindcontrole opslaan')} variant="secondary" loading={bezig === 'afrekening'} disabled={!gewijzigd || ongeldig || !!bezig}
            onPress={() => onOpslaan(getal(urenTxt), regels.map((r) => (r.id && !r.extra
              ? { id: r.id, werkelijk_aantal: kmLeeg(r) ? null : getal(r.werkelijk_aantal) }
              : { ...(r.id ? { id: r.id } : {}), soort: r.soort, omschrijving: r.omschrijving.trim(), eenheidsprijs: getal(r.eenheidsprijs), btw_pct: Number(r.btw_pct), werkelijk_aantal: getal(r.werkelijk_aantal) })))} />
          <Button label={tx('Afrekening laten tekenen')} disabled={gewijzigd || kmOnbevestigd || !!bezig} onPress={onTekenen} />
          {gewijzigd ? <Text style={s.hint}>{tx('Sla eerst op; de klant tekent voor wat is opgeslagen.')}</Text> : null}
          {!gewijzigd && kmOnbevestigd ? <Text style={s.fout}>{tx('Vul de werkelijk gereden kilometers in en sla op. 0 km mag ook.')}</Text> : null}
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
              <Text style={s.annuleer}>{tx('Annuleren')}</Text>
            </Pressable>
            <Text style={s.modalTitel} numberOfLines={1}>{isStart ? tx('Akkoord vooraf') : tx('Akkoord afrekening')}</Text>
            <View style={{ minWidth: 64 }} />
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled" scrollEnabled={!tekent}>
            <Text style={s.tekst}>
              {isStart
                ? `Ik ga akkoord met de verhuizing${inh.vertrek_adres ? ` van ${inh.vertrek_adres}` : ''}${inh.bestemming_adres ? ` naar ${inh.bestemming_adres}` : ''}, met de afspraken en tarieven hieronder. De uren en kilometers zijn een schatting; afgerekend wordt op wat werkelijk is gewerkt en gereden${inh.minimum_uren != null ? `, met een minimum van ${uren(inh.minimum_uren)}` : ''}${inh.prijzen === 'incl_btw' ? '. Alle bedragen zijn inclusief btw' : ''}.`
                : `Ik ga akkoord met de afronding van de verhuizing en met de afrekening hieronder: ${uren(inh.werkelijke_uren)} gewerkt, van ${tijd(inh.gestart_op)} tot ${tijd(inh.beeindigd_op)}${(() => { const km = inh.regels.find((r) => r.soort === 'km' && !r.extra); return km ? `, en ${nl(km.aantal)} km gereden` : ''; })()}.`}
            </Text>
            {inh.afspraken ? (
              <View style={s.afspraken}><Text style={s.lbl}>{tx('Afspraken')}</Text><Text style={s.tekst}>{inh.afspraken}</Text></View>
            ) : null}
            <RegelsLijst inhoud={inh} werkelijk={!isStart} s={s} />
            {!isStart ? <Text style={s.hint}>{tx('Hierna volgt de factuur per e-mail, met een betaallink en een QR-code voor iDEAL. Tekenen is nog geen betaling.')}</Text> : null}
            <FormField label={tx('Naam ondertekenaar')} value={naam} onChangeText={setNaam} editable={!bezig} autoComplete="name" />
            {/* Niet `disabled` doorgeven: de webversie wist het canvas als die wisselt,
                en na een mislukte poging moet de handtekening blijven staan. */}
            <View pointerEvents={bezig ? 'none' : 'auto'} style={bezig ? { opacity: 0.6 } : undefined}>
              <HandtekeningVak onChange={setPng} onTekenen={setTekent} />
            </View>
            <Text style={s.sub}>{tx('Vastgelegd worden: naam, tijdstip en deze inhoud (kenmerk {kenmerk}…).', { kenmerk: tekenen.sha256.slice(0, 12) })}</Text>
            <Button label={tx('Akkoord en tekenen')} loading={bezig} disabled={!png || !naam.trim()} onPress={() => png && onTeken(naam.trim(), png)} />
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
  const [verzendBezig, setVerzendBezig] = useState(false);
  const mailStatus = v.gegevens?.factuurmail_status;
  const vz = v.gegevens?.verzending_status ?? null;
  const magVersturen = !!(v.mag?.uitvoeren || v.mag?.factureren) && !betaald;
  // Eerst het adres laten zien. De server laat één verzending tegelijk door en
  // weigert een tweede na 'verstuurd': een dubbele tik of een herhaalde poging
  // na een time-out levert geen tweede mail op.
  const versturen = () => {
    const naar = f.email_naar;
    if (!naar) { Dialog.alert(tx('Niet verstuurd'), VERZEND_REDEN.geen_adres); return; }
    Dialog.alert(vz === 'mislukt' ? tx('Factuur opnieuw versturen') : tx('Factuur versturen'),
      tx('Factuur {nummer} ({bedrag}) gaat naar {naar}, met de PDF in de bijlage en een betaallink voor iDEAL. Klopt het e-mailadres?', { nummer: f.nummer, bedrag: euro(f.totaal_incl), naar }), [
        { text: tx('Annuleren'), style: 'cancel' },
        { text: tx('Versturen'), onPress: async () => {
          if (verzendBezig) return;
          setVerzendBezig(true);
          try {
            const r = await verstuurFactuur(werkbonId);
            if (r.uitkomst === 'mislukt') Dialog.alert(tx('Niet verstuurd'), r.fout ? tx('Versturen is mislukt ({fout}). Je kunt dezelfde factuur opnieuw versturen.', { fout: r.fout }) : tx('Versturen is mislukt. Je kunt dezelfde factuur opnieuw versturen.'));
            else if (r.uitkomst === 'niet_verstuurd' && r.reden !== 'al_verstuurd') Dialog.alert(tx('Niet verstuurd'), (r.reden && VERZEND_REDEN[r.reden]) || tx('De factuur is niet verstuurd.'));
          } catch (e) {
            // Geen antwoord: de server kan het wél hebben verstuurd; de status hieronder komt uit de database.
            Dialog.alert(tx('Niet verstuurd'), (e as Error).message);
          } finally {
            setVerzendBezig(false);
            await vernieuw.current();
          }
        } },
      ]);
  };
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
    if (vz !== 'bezig') return undefined;
    const t = setInterval(() => { vernieuw.current(); }, 4000);
    return () => clearInterval(t);
  }, [vz]);
  useEffect(() => {
    const volgen = (!betaald && !!link?.url) || wachtOpWebhook;
    if (!volgen) return undefined;
    const t = setInterval(() => { vernieuw.current(); }, betaald ? 5000 : 10000);
    return () => clearInterval(t);
  }, [betaald, link?.url, wachtOpWebhook]);

  return (
    <View style={s.factuur}>
      <Text style={s.lbl}>{tx('Factuur')}</Text>
      <Text style={s.waarde}>{f.nummer} · {euro(f.totaal_incl)}</Text>
      <Text style={[s.status, betaald && s.statusOk]}>
        {betaald
          ? f.betaald_op
            ? tx('Betaald op {datum}', { datum: new Date(f.betaald_op).toLocaleDateString(locale()) })
            : tx('Betaald')
          : tx('Nog niet betaald')}
      </Text>
      {vz === 'verstuurd' ? (
        <Text style={[s.status, s.statusOk]}>{tx('Verstuurd naar {naar} op {wanneer}', { naar: v.gegevens?.verzending_naar ?? '', wanneer: tijd(v.gegevens?.verzending_verstuurd_op) })}{v.gegevens?.verzending_met_betaallink === false ? ` · ${tx('zonder betaallink')}` : ''}</Text>
      ) : null}
      {vz === 'bezig' ? <Text style={s.hint}>{tx('Factuur wordt verstuurd naar {naar}…', { naar: v.gegevens?.verzending_naar ?? '' })}</Text> : null}
      {vz === 'mislukt' ? (
        <Text style={s.fout}>{v.gegevens?.verzending_fout
          ? tx('Versturen naar {naar} is mislukt ({fout}).', { naar: v.gegevens?.verzending_naar ?? '', fout: v.gegevens.verzending_fout })
          : tx('Versturen naar {naar} is mislukt.', { naar: v.gegevens?.verzending_naar ?? '' })}</Text>
      ) : null}
      {magVersturen && vz !== 'verstuurd' && vz !== 'bezig' ? (
        <View style={{ gap: 4 }}>
          <Button label={vz === 'mislukt' ? tx('Opnieuw versturen') : tx('Factuur versturen')} loading={verzendBezig} disabled={verzendBezig} onPress={versturen} />
          <Text style={s.sub}>{f.email_naar ? tx('Naar {naar}', { naar: f.email_naar }) : tx('Geen e-mailadres bekend')}</Text>
        </View>
      ) : null}
      <Button label={tx('Factuur-PDF delen of openen')} variant="secondary" loading={pdfBezig}
        onPress={async () => {
          setPdfBezig(true);
          try {
            const { pdf_base64, bestandsnaam } = await getFactuurPdf(werkbonId);
            await deelPdf(pdf_base64, bestandsnaam);
          } catch (e) {
            Dialog.alert(tx('PDF niet gelukt'), (e as Error).message);
          } finally {
            setPdfBezig(false);
          }
        }} />

      {!betaald ? (
        link?.url ? (
          <QrKaart soort="betalen" waarde={link.url} titel={tx('Betalen met iDEAL')} s={s}
            regel={tx('Te betalen: {bedrag}', { bedrag: euro(f.totaal_incl) })}
            uitleg={tx('Laat de klant deze code scannen met de camera of de bank-app. De factuur staat pas op betaald als Stripe de betaling bevestigt.')} />
        ) : link ? (
          <View style={{ gap: 6 }}>
            <Text style={s.melding}>
              {tx('Geen betaal-QR.')}{' '}
              {link.fout ?? redenTekst(link.reden)}
            </Text>
            {link.fout ? <Button label={tx('Opnieuw')} variant="ghost" onPress={haalLink} /> : null}
          </View>
        ) : (
          <Text style={s.hint}>{tx('Betaallink ophalen…')}</Text>
        )
      ) : null}

      <Text style={s.sub}>
        {!betaald ? tx('Na de betaling krijgt de klant automatisch een bevestiging met de betaalde factuur.') : null}
        {betaald && mailStatus === 'verstuurd' ? tx('Factuur gemaild naar de klant op {wanneer}.', { wanneer: tijd(v.gegevens?.factuurmail_verstuurd_op) }) : null}
        {wachtOpWebhook ? tx('Factuur wordt naar de klant gemaild…') : null}
        {buitenStripe && mailStatus === 'wacht' ? tx('Betaald buiten iDEAL; de factuur is niet automatisch gemaild.') : null}
        {betaald && mailStatus === 'geen_adres' ? tx('Er is geen e-mailadres bekend; deel de PDF met de klant.') : null}
      </Text>
      {betaald && mailStatus === 'mislukt' ? (
        <Text style={s.fout}>
          {v.gegevens?.factuurmail_fout
            ? tx('Mailen van de factuur is mislukt ({fout}).', { fout: v.gegevens.factuurmail_fout })
            : tx('Mailen van de factuur is mislukt.')}
        </Text>
      ) : null}
      {magMailen ? (
        <Button label={mailStatus === 'mislukt' ? tx('Opnieuw versturen') : tx('Factuur mailen')} variant="secondary" loading={mailBezig}
          onPress={async () => {
            setMailBezig(true);
            try {
              const r = await verstuurFactuurmailOpnieuw(werkbonId);
              if (r.uitkomst !== 'verstuurd') Dialog.alert(tx('Niet verstuurd'), r.fout ?? tx('Mailen is niet gelukt.'));
            } catch (e) {
              Dialog.alert(tx('Niet verstuurd'), (e as Error).message);
            } finally {
              setMailBezig(false);
              await onVernieuw();
            }
          }} />
      ) : null}
    </View>
  );
}

function redenTekst(reden?: string) {
  const r = reden ? BETAALLINK_REDEN[reden] : undefined;
  return r ? tx(r) : tx('Betaallink niet beschikbaar.');
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
        <Text style={[s.qrLabel, { backgroundColor: soort === 'betalen' ? '#15A34A' : '#B45309' }]}>{soort === 'betalen' ? `€ ${tx('BETALEN')}` : `★ ${tx('REVIEW')}`}</Text>
        <Text style={s.qrTitel}>{titel}</Text>
      </View>
      <Pressable onPress={() => setGroot(true)} accessibilityRole="button" accessibilityLabel={tx('{titel}: QR-code groot tonen', { titel })} style={{ alignSelf: 'center' }}>
        <QrCode waarde={waarde} grootte={klein} label={titel} />
      </Pressable>
      <Text style={s.qrTekst}>{regel}</Text>
      <Text style={s.qrSub}>{uitleg}</Text>
      <Button label={tx('Groot tonen')} variant="ghost" onPress={() => setGroot(true)} />
      <Modal visible={groot} animationType="fade" onRequestClose={() => setGroot(false)} transparent>
        <Pressable style={s.grootAchter} onPress={() => setGroot(false)} accessibilityRole="button" accessibilityLabel={tx('Sluiten')}>
          <View style={[s.grootKaart, soort === 'betalen' ? s.qrBetalen : s.qrReview]}>
            <Text style={s.qrTitel}>{titel}</Text>
            <QrCode waarde={waarde} grootte={Math.min(width - 64, 420)} label={titel} />
            <Text style={s.qrTekst}>{regel}</Text>
            <Text style={s.qrSub}>{tx('Tik om te sluiten')}</Text>
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
