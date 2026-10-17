import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { useAuth, useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import {
  LID_GEVOLGEN,
  MODUS_UITLEG,
  OVERDRACHT_GEVOLGEN,
  bedrijfGevolgen,
  bedrijfsnaamKlopt,
  bevestigingKlopt,
  datumNl,
  nieuweSleutel,
  verwijderingMelding,
  weergave,
  type VerwijderStatus,
} from '@/lib/accountVerwijderenRegels';
import {
  annuleerBedrijfVerwijdering,
  beantwoordOverdracht,
  bevestigMetWachtwoord,
  haalVerwijderStatus,
  planBedrijfVerwijdering,
  startOverdracht,
  trekOverdrachtIn,
  verwijderBedrijfNu,
  verwijderEigenAccount,
  wisLokaleGegevens,
} from '@/services/accountVerwijderenService';
import { Kaart, Keuze, Uitleg, stijlVoorInstellingen } from './Bouwstenen';

type Venster = 'lid' | 'overdracht' | 'bedrijf' | null;

const punten = (regels: string[]) => regels.map((r) => `• ${r}`).join('\n');

/**
 * Account verwijderen (Apple 5.1.1(v)), onder Instellingen › Mijn profiel.
 *
 * Teamlid: eigen account definitief verwijderen. Eigenaar: eigendom overdragen
 * aan een actieve beheerder (die accepteert) of het hele bedrijf verwijderen,
 * over 30 dagen of direct. Elke ingrijpende stap vraagt het wachtwoord opnieuw
 * (bij Supabase Auth). Alles loopt via de Edge Function account-verwijderen;
 * de server controleert rol, eigendom en bevestiging.
 */
export function AccountVerwijderenKaart() {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const { user, clearSessie } = useAuthMetWissen();

  const [status, setStatus] = useState<VerwijderStatus | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [venster, setVenster] = useState<Venster>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [wachtwoord, setWachtwoord] = useState('');
  const [bevestiging, setBevestiging] = useState('');
  const [ontvanger, setOntvanger] = useState<string | null>(null);
  const [modus, setModus] = useState<'gepland' | 'direct'>('gepland');

  const laad = useCallback(async () => {
    try {
      setStatus(await haalVerwijderStatus());
      setLaadFout(null);
    } catch (e) {
      setLaadFout((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let actief = true;
    haalVerwijderStatus().then(
      (st) => {
        if (!actief) return;
        setStatus(st);
        setLaadFout(null);
      },
      (e: Error) => actief && setLaadFout(e.message),
    );
    return () => {
      actief = false;
    };
  }, []);

  const open = (v: Venster) => {
    setWachtwoord('');
    setBevestiging('');
    setOntvanger(null);
    setModus('gepland');
    setFout(null);
    setVenster(v);
  };
  const sluit = () => !bezig && setVenster(null);

  const voerUit = async (fn: () => Promise<void>) => {
    setBezig(true);
    setFout(null);
    try {
      await fn();
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig(false);
    }
  };

  // De login bestaat niet meer: lokaal alles wissen en naar het inlogscherm.
  const afsluiten = async (titel: string, tekst: string) => {
    setVenster(null);
    await wisLokaleGegevens(user?.id);
    clearSessie();
    Dialog.alert(titel, tekst);
    router.replace('/(auth)/login');
  };

  const lidVerwijderen = () =>
    voerUit(async () => {
      await bevestigMetWachtwoord(wachtwoord);
      const r = await verwijderEigenAccount(nieuweSleutel());
      await afsluiten(
        'Account verwijderd',
        r.status === 'voltooid' ? 'Je account is verwijderd.' : 'Je account wordt verwijderd. Je bent uitgelogd.',
      );
    });

  const overdragen = () =>
    voerUit(async () => {
      if (!ontvanger) return;
      await bevestigMetWachtwoord(wachtwoord);
      const r = await startOverdracht(ontvanger);
      setVenster(null);
      Dialog.alert('Verzoek verstuurd', `De nieuwe eigenaar krijgt een melding. Het verzoek verloopt op ${datumNl(r.verlooptOp)}.`);
      await laad();
    });

  const bedrijfVerwijderen = () =>
    voerUit(async () => {
      await bevestigMetWachtwoord(wachtwoord);
      if (modus === 'direct') {
        const r = await verwijderBedrijfNu(nieuweSleutel(), bevestiging);
        await afsluiten(
          'Bedrijf verwijderd',
          r.status === 'voltooid'
            ? 'Het bedrijf en alle accounts zijn verwijderd.'
            : 'Het bedrijf wordt verwijderd. Je bent uitgelogd.',
        );
        return;
      }
      const r = await planBedrijfVerwijdering(nieuweSleutel());
      setVenster(null);
      Dialog.alert(
        'Verwijdering gepland',
        `Het bedrijf wordt verwijderd op ${datumNl(r.geplandOp)}. Tot die tijd kun je alles bekijken en exporteren, en de verwijdering annuleren.`,
      );
      await laad();
    });

  const kort = (fn: () => Promise<unknown>, titel: string, tekst: string) =>
    voerUit(async () => {
      await fn();
      Dialog.alert(titel, tekst);
      await laad();
    });

  if (laadFout) {
    return (
      <Kaart titel="Account verwijderen">
        <Text style={s.hint}>De gegevens over verwijderen konden niet worden geladen. {laadFout}</Text>
        <View style={s.knoppen}>
          <Button label="Opnieuw proberen" variant="secondary" onPress={laad} />
        </View>
      </Kaart>
    );
  }
  if (!status) {
    return (
      <Kaart titel="Account verwijderen">
        <Text style={s.hint}>Laden…</Text>
      </Kaart>
    );
  }

  const w = weergave(status);
  const melding = verwijderingMelding(status);
  const kanVerwijderenBedrijf = !!wachtwoord && (modus === 'gepland' || bedrijfsnaamKlopt(bevestiging, status.bedrijfsnaam));

  return (
    <>
      <Kaart titel="Account verwijderen">
        {melding ? (
          <Uitleg toon="waarschuwing">{melding}</Uitleg>
        ) : null}
        {w.kanAnnuleren ? (
          <View style={s.knoppen}>
            <Button
              label="Verwijdering annuleren"
              variant="secondary"
              disabled={bezig}
              onPress={() =>
                kort(annuleerBedrijfVerwijdering, 'Verwijdering geannuleerd', 'Je kunt weer gewoon werken.')
              }
            />
          </View>
        ) : null}

        {status.overdrachtIn ? (
          <>
            <Uitleg>
              {`${status.overdrachtIn.vanNaam || 'De eigenaar'} wil het eigendom van het bedrijf aan jou overdragen. ` +
                `Als eigenaar beheer je het abonnement en kun je het bedrijf verwijderen. Geldig tot ${datumNl(status.overdrachtIn.verlooptOp)}.`}
            </Uitleg>
            <View style={s.knoppen}>
              <Button
                label="Accepteren"
                disabled={bezig}
                onPress={() =>
                  kort(() => beantwoordOverdracht(status.overdrachtIn!.id, true), 'Eigendom overgenomen', 'Je bent nu de eigenaar van het bedrijf.')
                }
              />
              <Button
                label="Weigeren"
                variant="ghost"
                disabled={bezig}
                onPress={() =>
                  kort(() => beantwoordOverdracht(status.overdrachtIn!.id, false), 'Overdracht geweigerd', 'Er is niets veranderd.')
                }
              />
            </View>
          </>
        ) : null}

        {w.toonEigenaarKeuzes ? (
          <>
            <Text style={s.hint}>
              Je bent de eigenaar. Wil je alleen je eigen account verwijderen, draag dan eerst het eigendom over aan een
              andere beheerder. Of verwijder het hele bedrijf, met alle teamleden en gegevens.
            </Text>
            {status.overdrachtUit ? (
              <>
                <Uitleg>
                  {`De overdracht aan ${status.overdrachtUit.naarNaam || 'de nieuwe eigenaar'} wacht op acceptatie (tot ${datumNl(status.overdrachtUit.verlooptOp)}). Tot die tijd blijf jij eigenaar.`}
                </Uitleg>
                <View style={s.knoppen}>
                  <Button
                    label="Overdracht intrekken"
                    variant="ghost"
                    disabled={bezig}
                    onPress={() => kort(() => trekOverdrachtIn(status.overdrachtUit!.id), 'Ingetrokken', 'De overdracht is ingetrokken.')}
                  />
                </View>
              </>
            ) : null}
            <View style={s.knoppen}>
              <Button label="Eigendom overdragen" variant="secondary" disabled={!w.kanOverdragen} onPress={() => open('overdracht')} />
              <Button label="Bedrijf verwijderen" variant="secondary" onPress={() => open('bedrijf')} />
            </View>
            {w.geenOpvolger ? (
              <Text style={s.hint}>Overdragen kan aan een actieve beheerder. Maak eerst iemand beheerder bij Team.</Text>
            ) : null}
          </>
        ) : null}

        {w.toonLidVerwijderen ? (
          <>
            <Text style={s.hint}>
              Verwijder je eigen account definitief. Het bedrijf en het werk van je collega’s blijven bestaan.
            </Text>
            <View style={s.knoppen}>
              <Button label="Account verwijderen" variant="secondary" onPress={() => open('lid')} />
            </View>
          </>
        ) : null}
      </Kaart>

      <FormSheet
        visible={venster === 'lid'}
        title="Account verwijderen"
        subtitle="Dit is definitief."
        error={fout}
        saving={bezig}
        submitLabel="Definitief verwijderen"
        submitDisabled={!wachtwoord || !bevestigingKlopt(bevestiging)}
        onSubmit={lidVerwijderen}
        onClose={sluit}
      >
        <Uitleg toon="waarschuwing">{punten(LID_GEVOLGEN)}</Uitleg>
        <WachtwoordVeld waarde={wachtwoord} onChange={setWachtwoord} />
        <FormField
          label="Typ VERWIJDEREN om te bevestigen"
          value={bevestiging}
          onChangeText={setBevestiging}
          placeholder="VERWIJDEREN"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </FormSheet>

      <FormSheet
        visible={venster === 'overdracht'}
        title="Eigendom overdragen"
        subtitle="De nieuwe eigenaar moet het verzoek accepteren."
        error={fout}
        saving={bezig}
        submitLabel="Verzoek versturen"
        submitDisabled={!ontvanger || !wachtwoord}
        onSubmit={overdragen}
        onClose={sluit}
      >
        <Uitleg>{punten(OVERDRACHT_GEVOLGEN)}</Uitleg>
        <Keuze
          label="Nieuwe eigenaar"
          opties={status.kandidaten.map((k) => ({ id: k.id, label: k.naam || 'Beheerder' }))}
          waarde={ontvanger}
          onKies={setOntvanger}
          uitgeschakeld={bezig}
        />
        <WachtwoordVeld waarde={wachtwoord} onChange={setWachtwoord} />
      </FormSheet>

      <FormSheet
        visible={venster === 'bedrijf'}
        title="Bedrijf verwijderen"
        subtitle={status.bedrijfsnaam ?? undefined}
        error={fout}
        saving={bezig}
        submitLabel={modus === 'direct' ? 'Nu definitief verwijderen' : 'Verwijderen over 30 dagen'}
        submitDisabled={!kanVerwijderenBedrijf}
        onSubmit={bedrijfVerwijderen}
        onClose={sluit}
      >
        <Uitleg toon="waarschuwing">{punten(bedrijfGevolgen(status.teamleden))}</Uitleg>
        <Keuze
          label="Wanneer?"
          opties={[
            { id: 'gepland', label: 'Over 30 dagen' },
            { id: 'direct', label: 'Nu definitief' },
          ]}
          waarde={modus}
          onKies={(m) => {
            setModus(m as 'gepland' | 'direct');
            setBevestiging('');
          }}
          uitgeschakeld={bezig}
          hint={MODUS_UITLEG[modus]}
        />
        {modus === 'direct' ? (
          <>
            <Uitleg toon="fout">
              Alles is direct en definitief weg: gegevens, bestanden en de accounts van je hele team. Dit kan niet
              worden teruggezet.
            </Uitleg>
            <FormField
              label={`Typ de bedrijfsnaam „${status.bedrijfsnaam ?? ''}” om te bevestigen`}
              value={bevestiging}
              onChangeText={setBevestiging}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : null}
        <WachtwoordVeld waarde={wachtwoord} onChange={setWachtwoord} />
      </FormSheet>
    </>
  );
}

function WachtwoordVeld({ waarde, onChange }: { waarde: string; onChange: (v: string) => void }) {
  return (
    <FormField
      label="Bevestig met je wachtwoord"
      value={waarde}
      onChangeText={onChange}
      secureTextEntry
      autoCapitalize="none"
      autoComplete="current-password"
    />
  );
}

// Na verwijderen is er geen sessie meer; de provider moet zijn stand meteen
// loslaten zodat er geen gegevens van de vorige gebruiker zichtbaar blijven.
function useAuthMetWissen() {
  const auth = useAuth();
  return { user: auth.user, clearSessie: () => auth.signOut().catch(() => {}) };
}
