import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { SelectField } from '@/components/SelectField';
import { useTheme, useToast } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useSave } from '@/lib/useSave';
import { gewijzigdeVelden, isLeeg } from '@/lib/gewijzigdeVelden';
import { formatEUR } from '@/lib/format';
import {
  AGENDA_START_UREN,
  HERINNERING_INTERVALLEN,
  HERINNERING_MOMENTEN,
  WEEKDAGEN,
  agendaEindUren,
  uurLabel,
  wisselInLijst,
} from '@/lib/instellingenRegels';
import {
  upsertCompanySettings,
  type CompanySettings,
  type HerinneringMoment,
  type SettingsInput,
} from '@/services/settingsService';
import {
  deleteEenheid,
  listEenheden,
  listHerinneringTeam,
  saveEenheid,
  type EigenEenheid,
} from '@/services/instellingenService';
import { Keuze, Kaart, Schakel, Uitleg, stijlVoorInstellingen } from './Bouwstenen';

type Form = {
  uurtarief: string;
  reiskosten: string;
  btw: string;
  btwStelsel: string;
  geldig: string;
  betaaltermijn: string;
  interval: number;
  moment: HerinneringMoment;
  dagen: number[];
  mail: boolean;
  uitgesloten: string[];
  agendaStart: number;
  agendaEind: number;
};

const naarForm = (c: CompanySettings): Form => ({
  uurtarief: String(c.uurtarief),
  reiskosten: String(c.reiskosten_per_km).replace('.', ','),
  btw: String(c.btw_pct),
  btwStelsel: c.btw_stelsel === 'kas' ? 'kas' : 'factuur',
  geldig: String(c.offerte_geldig_dagen),
  betaaltermijn: String(c.betaaltermijn_dagen),
  interval: c.uren_herinnering_interval_min,
  moment: c.uren_herinnering_moment,
  dagen: c.uren_herinnering_dagen,
  mail: c.uren_herinnering_mail,
  uitgesloten: c.uren_herinnering_uitgesloten,
  agendaStart: c.agenda_start_uur,
  agendaEind: c.agenda_eind_uur,
});

const getal = (v: string) => Number(v.replace(',', '.'));

/** Het formulier zoals de service het verwacht (alle velden). */
const naarInvoer = (f: Form, perMedewerker: boolean): SettingsInput => ({
  uurtarief: getal(f.uurtarief),
  reiskosten_per_km: getal(f.reiskosten),
  btw_pct: getal(f.btw),
  btw_stelsel: f.btwStelsel,
  offerte_geldig_dagen: Number(f.geldig),
  betaaltermijn_dagen: Number(f.betaaltermijn),
  uren_herinnering_interval_min: f.interval,
  uren_herinnering_moment: f.moment,
  uren_herinnering_dagen: f.dagen,
  uren_herinnering_mail: f.mail,
  uren_herinnering_uitgesloten: perMedewerker ? f.uitgesloten : [],
  agenda_start_uur: f.agendaStart,
  agenda_eind_uur: f.agendaEind,
});

/**
 * Standaardwaarden — tabel `bedrijfsinstellingen` (vier kaarten, één
 * formulier, zoals het dashboard) en tabel `eigen_eenheden`. Het veld
 * standaardmarge staat er bewust niet: het dashboard toont het ook niet meer.
 */
export function StandaardTab({
  instellingen,
  magWijzigen,
  onGewijzigd,
}: {
  instellingen: CompanySettings;
  magWijzigen: boolean;
  onGewijzigd: () => Promise<void>;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const [form, setForm] = useState<Form>(() => naarForm(instellingen));
  const [perMedewerker, setPerMedewerker] = useState(instellingen.uren_herinnering_uitgesloten.length > 0);
  // De stand zoals geladen; het scherm geeft na opslaan een nieuwe `key`.
  const [geladen] = useState<SettingsInput>(() =>
    naarInvoer(naarForm(instellingen), instellingen.uren_herinnering_uitgesloten.length > 0),
  );
  const { toon } = useToast();
  const [team, setTeam] = useState<{ id: string; naam: string }[]>([]);
  const [eenheden, setEenheden] = useState<EigenEenheid[]>([]);
  const [eenheid, setEenheid] = useState<
    { id: string | null; naam: string; standaard_prijs: string; eenheid_label: string; btw_pct: string } | null
  >(null);
  const { save, saving, error } = useSave<unknown>();
  const { save: saveE, saving: eBezig, error: eFout } = useSave<unknown>();

  // Het formulier volgt `instellingen` via een nieuwe `key` vanuit het scherm;
  // hier alleen de lijsten die deze tab zelf ophaalt.
  const laadEenheden = useCallback(async () => setEenheden(await listEenheden()), []);
  useEffect(() => {
    let actief = true;
    listEenheden().then((r) => actief && setEenheden(r));
    listHerinneringTeam().then((r) => actief && setTeam(r));
    return () => {
      actief = false;
    };
  }, []);

  const opslaan = () => {
    // Alleen wat echt veranderd is; niets veranderd = niets wegschrijven.
    // Start- en einduur gaan samen mee, zodat de service ze samen toetst.
    const wijzigingen = gewijzigdeVelden(geladen, naarInvoer(form, perMedewerker), {
      samen: [['agenda_start_uur', 'agenda_eind_uur']],
    });
    if (isLeeg(wijzigingen)) {
      toon('Er is niets gewijzigd.', 'info');
      return;
    }
    return save(() => upsertCompanySettings(wijzigingen), {
      onSuccess: () => onGewijzigd(),
      succesMelding: 'Standaardwaarden opgeslagen',
    });
  };

  const opslaanKnop = magWijzigen ? (
    <>
      {error ? <Uitleg toon="fout">{error}</Uitleg> : null}
      <Button label="Opslaan" loading={saving} disabled={saving} onPress={opslaan} />
    </>
  ) : null;

  const eenheidOpslaan = () => {
    if (!eenheid) return;
    saveE(() => saveEenheid(eenheid.id, eenheid), {
      onSuccess: async () => {
        setEenheid(null);
        await laadEenheden();
      },
      succesMelding: 'Eenheid opgeslagen',
    });
  };

  const eenheidWeg = (e: EigenEenheid) =>
    Dialog.alert(
      'Eigen eenheid verwijderen?',
      'Bestaande offertes/facturen behouden hun bedrag.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () =>
            saveE(() => deleteEenheid(e.id), {
              onSuccess: () => laadEenheden(),
              succesMelding: 'Eenheid verwijderd',
            }),
        },
      ],
    );

  const herinneringAan = form.interval > 0;

  return (
    <>
      {!magWijzigen ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Uitleg>Je kunt de standaardwaarden bekijken. Wijzigen kan alleen een beheerder.</Uitleg>
        </View>
      ) : null}

      <Kaart titel="Standaardwaarden" sub="Wordt vooringevuld bij nieuwe offertes en werkbonnen.">
        <View style={s.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Uurtarief (€/uur)"
              value={form.uurtarief}
              onChangeText={(v) => setForm((f) => ({ ...f, uurtarief: v }))}
              keyboardType="decimal-pad"
              editable={magWijzigen}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Reiskosten (€/km)"
              value={form.reiskosten}
              onChangeText={(v) => setForm((f) => ({ ...f, reiskosten: v }))}
              keyboardType="decimal-pad"
              editable={magWijzigen}
            />
          </View>
        </View>
        <View style={s.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="BTW (%)"
              value={form.btw}
              onChangeText={(v) => setForm((f) => ({ ...f, btw: v }))}
              keyboardType="decimal-pad"
              editable={magWijzigen}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Offerte geldig (dagen)"
              value={form.geldig}
              onChangeText={(v) => setForm((f) => ({ ...f, geldig: v }))}
              keyboardType="number-pad"
              editable={magWijzigen}
            />
          </View>
        </View>
        <FormField
          label="Betaaltermijn facturen (dagen)"
          value={form.betaaltermijn}
          onChangeText={(v) => setForm((f) => ({ ...f, betaaltermijn: v }))}
          keyboardType="number-pad"
          editable={magWijzigen}
          hint="Na hoeveel dagen een nieuwe factuur vervalt. Heeft een klant een eigen betaaltermijn, dan geldt die. Bestaande facturen houden hun vervaldatum."
        />
        <Keuze
          label="BTW-stelsel"
          opties={[
            { id: 'factuur', label: 'Factuurstelsel' },
            { id: 'kas', label: 'Kasstelsel' },
          ]}
          waarde={form.btwStelsel}
          onKies={(v) => setForm((f) => ({ ...f, btwStelsel: v }))}
          uitgeschakeld={!magWijzigen}
          hint={
            form.btwStelsel === 'kas'
              ? 'Kasstelsel — omzet telt op betaaldatum'
              : 'Factuurstelsel — omzet telt op factuurdatum'
          }
        />
        {opslaanKnop}
      </Kaart>

      <Kaart
        titel="Herinneringen"
        sub="Herinner medewerkers eraan hun uren in te vullen voor verstreken geplande dagen."
      >
        <Schakel
          titel="Uren-herinnering"
          uitleg="Medewerkers die gepland stonden en nog geen werkdag hebben ingevuld, krijgen de melding 'Vul je werkdag in'. De beheerder krijgt hem zelf niet."
          waarde={herinneringAan}
          onWissel={(v) => setForm((f) => ({ ...f, interval: v ? 60 : 0 }))}
          uitgeschakeld={!magWijzigen}
        />
        {herinneringAan ? (
          <>
            <Keuze
              label="Herhalen"
              opties={HERINNERING_INTERVALLEN}
              waarde={String(form.interval)}
              onKies={(v) => setForm((f) => ({ ...f, interval: Number(v) }))}
              uitgeschakeld={!magWijzigen}
              hint="De melding in de app kan worden weggeklikt en keert op dit interval terug tot de werkdag is ingevuld. Een mail gaat één keer per werkdag."
            />
            <Keuze
              label="Voor wie"
              opties={[
                { id: 'alle', label: 'Alle medewerkers' },
                { id: 'per', label: 'Per medewerker instellen' },
              ]}
              waarde={perMedewerker ? 'per' : 'alle'}
              onKies={(v) => {
                const per = v === 'per';
                setPerMedewerker(per);
                if (!per) setForm((f) => ({ ...f, uitgesloten: [] }));
              }}
              uitgeschakeld={!magWijzigen}
            />
            {perMedewerker ? (
              <View style={{ gap: 4 }}>
                <Text style={s.label}>Medewerkers die de herinnering krijgen</Text>
                {team.length === 0 ? <Text style={s.hint}>Er zijn nog geen medewerkers.</Text> : null}
                {team.map((m) => (
                  <Schakel
                    key={m.id}
                    titel={m.naam}
                    waarde={!form.uitgesloten.includes(m.id)}
                    onWissel={(aan) =>
                      setForm((f) => ({ ...f, uitgesloten: wisselInLijst(f.uitgesloten, m.id, !aan) }))
                    }
                    uitgeschakeld={!magWijzigen}
                  />
                ))}
              </View>
            ) : null}
            <Keuze
              label="Wanneer"
              opties={HERINNERING_MOMENTEN}
              waarde={form.moment}
              onKies={(v) => setForm((f) => ({ ...f, moment: v as HerinneringMoment }))}
              uitgeschakeld={!magWijzigen}
              hint="Na afloop van de werkdag: vanaf de eindtijd die voor de medewerker gepland staat (zonder eindtijd 17:00). Einde van de dag: vanaf 17:00. De volgende ochtend: de dag erna, per mail om 07:00."
            />
            <View style={{ gap: 4 }}>
              <Text style={s.label}>Op welke dagen</Text>
              <View style={s.chipRij}>
                {WEEKDAGEN.map((naam, i) => {
                  const aan = form.dagen.includes(i + 1);
                  return (
                    <Pressable
                      key={naam}
                      onPress={() =>
                        setForm((f) => ({ ...f, dagen: wisselInLijst(f.dagen, i + 1, !aan) }))
                      }
                      disabled={!magWijzigen}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: aan, disabled: !magWijzigen }}
                      aria-checked={aan}
                      accessibilityLabel={naam}
                      style={[s.chip, aan && s.chipActief, !magWijzigen && s.uit]}
                    >
                      <Text style={[s.chipTekst, aan && s.chipTekstActief]}>{naam.slice(0, 2)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.hint}>
                Staat een dag uit, dan komt de herinnering op de eerstvolgende dag die aan staat.
              </Text>
            </View>
            <Keuze
              label="Hoe"
              opties={[
                { id: 'app', label: 'Melding in de app' },
                { id: 'mail', label: 'In de app en per mail' },
              ]}
              waarde={form.mail ? 'mail' : 'app'}
              onKies={(v) => setForm((f) => ({ ...f, mail: v === 'mail' }))}
              uitgeschakeld={!magWijzigen}
            />
          </>
        ) : null}
        {opslaanKnop}
      </Kaart>

      <Kaart
        titel="Agenda"
        sub="Welk deel van de dag standaard in beeld staat. De agenda beslaat altijd 24 uur — dit bepaalt alleen het zichtbare venster."
      >
        <SelectField
          label="Eerste zichtbare uur"
          options={AGENDA_START_UREN.map((u) => ({ id: String(u), label: uurLabel(u) }))}
          value={String(form.agendaStart)}
          onChange={(v) =>
            setForm((f) => {
              const start = Number(v ?? f.agendaStart);
              return { ...f, agendaStart: start, agendaEind: f.agendaEind > start ? f.agendaEind : start + 1 };
            })
          }
          disabled={!magWijzigen}
        />
        <SelectField
          label="Laatste zichtbare uur"
          options={agendaEindUren(form.agendaStart).map((u) => ({ id: String(u), label: uurLabel(u) }))}
          value={String(form.agendaEind)}
          onChange={(v) => setForm((f) => ({ ...f, agendaEind: Number(v ?? f.agendaEind) }))}
          disabled={!magWijzigen}
        />
        {opslaanKnop}
      </Kaart>

      <Kaart
        titel="Eigen prijzen / eenheden"
        sub="Verschijnen als regeltype naast Uren, Km en Overig in offertes en facturen."
        rechts={
          magWijzigen ? (
            <Button
              label="Toevoegen"
              variant="secondary"
              onPress={() => setEenheid({ id: null, naam: '', standaard_prijs: '', eenheid_label: '', btw_pct: '' })}
            />
          ) : undefined
        }
      >
        {eenheden.length === 0 ? <Text style={s.hint}>Nog geen eigen eenheden aangemaakt.</Text> : null}
        {eenheden.map((e) => (
          <View key={e.id} style={s.lijstRij}>
            <View style={{ flex: 1 }}>
              <Text style={s.lijstTitel}>{e.naam}</Text>
              <Text style={s.lijstSub}>
                {formatEUR(e.standaard_prijs)}
                {e.eenheid_label ? ` per ${e.eenheid_label}` : ''}
                {e.btw_pct != null ? ` · ${e.btw_pct}% btw` : ''}
              </Text>
            </View>
            {magWijzigen ? (
              <>
                <Pressable
                  onPress={() =>
                    setEenheid({
                      id: e.id,
                      naam: e.naam,
                      standaard_prijs: String(e.standaard_prijs).replace('.', ','),
                      eenheid_label: e.eenheid_label,
                      btw_pct: e.btw_pct == null ? '' : String(e.btw_pct),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${e.naam} bewerken`}
                  style={s.iconKnop}
                >
                  <Pencil size={17} color={t.muted} />
                </Pressable>
                <Pressable
                  onPress={() => eenheidWeg(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.naam} verwijderen`}
                  style={s.iconKnop}
                >
                  <Trash2 size={17} color={t.statusRejectFg} />
                </Pressable>
              </>
            ) : null}
          </View>
        ))}
      </Kaart>

      <FormSheet
        visible={eenheid !== null}
        title={eenheid?.id ? 'Eenheid bewerken' : 'Nieuwe eenheid'}
        error={eFout}
        saving={eBezig}
        submitDisabled={!eenheid?.naam.trim()}
        onSubmit={eenheidOpslaan}
        onClose={() => setEenheid(null)}
      >
        <FormField
          label="Naam *"
          value={eenheid?.naam ?? ''}
          onChangeText={(v) => setEenheid((c) => (c ? { ...c, naam: v } : c))}
          placeholder="Bijv. Liter verf"
          autoFocus
        />
        <FormField
          label="Standaardprijs (€)"
          value={eenheid?.standaard_prijs ?? ''}
          onChangeText={(v) => setEenheid((c) => (c ? { ...c, standaard_prijs: v } : c))}
          placeholder="0,00"
          keyboardType="decimal-pad"
        />
        <FormField
          label="Eenheid-label (optioneel)"
          value={eenheid?.eenheid_label ?? ''}
          onChangeText={(v) => setEenheid((c) => (c ? { ...c, eenheid_label: v } : c))}
          placeholder="Bijv. liter"
        />
        <FormField
          label="BTW % (optioneel)"
          value={eenheid?.btw_pct ?? ''}
          onChangeText={(v) => setEenheid((c) => (c ? { ...c, btw_pct: v } : c))}
          placeholder="Bedrijfsstandaard"
          keyboardType="decimal-pad"
        />
      </FormSheet>
    </>
  );
}
