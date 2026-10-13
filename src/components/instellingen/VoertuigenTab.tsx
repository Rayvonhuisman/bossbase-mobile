import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useSave } from '@/lib/useSave';
import { FASE_KLEUREN } from '@/lib/instellingenRegels';
import { deleteVoertuig, listVoertuigen, saveVoertuig, type Voertuig } from '@/services/instellingenService';
import { Kaart, Schakel, Uitleg, stijlVoorInstellingen } from './Bouwstenen';

type Concept = {
  id: string | null;
  naam: string;
  kenteken: string;
  zitplaatsen: string;
  kleur: string;
  actief: boolean;
};

/**
 * Voertuigen — tabel `voertuigen` (naam*, kenteken, zitplaatsen 1-99 of leeg
 * = geen limiet, kleur, actief). Alleen voor een beheerder met de feature
 * `voertuigen`; de tab is anders niet zichtbaar, net als in het dashboard.
 */
export function VoertuigenTab() {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const [lijst, setLijst] = useState<Voertuig[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const { save, saving, error, setError } = useSave<unknown>();

  const verwerk = useCallback((res: Awaited<ReturnType<typeof listVoertuigen>>) => {
    setLijst(res.data);
    setFout(res.error);
  }, []);
  const laad = useCallback(async () => verwerk(await listVoertuigen()), [verwerk]);

  useEffect(() => {
    let actief = true;
    listVoertuigen().then((r) => actief && verwerk(r));
    return () => {
      actief = false;
    };
  }, [verwerk]);

  const opslaan = () => {
    if (!concept) return;
    save(() => saveVoertuig(concept.id, concept), {
      onSuccess: async () => {
        setConcept(null);
        await laad();
      },
      succesMelding: concept.id ? 'Voertuig bijgewerkt' : 'Voertuig toegevoegd',
    });
  };

  const verwijderen = (v: Voertuig) =>
    Dialog.alert(`${v.naam} verwijderen?`, 'Dit kan niet ongedaan worden gemaakt.', [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: () =>
          save(() => deleteVoertuig(v.id), {
            onSuccess: async () => {
              setConcept(null);
              await laad();
            },
            succesMelding: 'Voertuig verwijderd',
          }),
      },
    ]);

  return (
    <>
      <Kaart
        titel="Voertuigen"
        sub="Bussen en aanhangers die je bij een klus inplant."
        rechts={
          <Button
            label="Toevoegen"
            variant="secondary"
            onPress={() => {
              setError(null);
              setConcept({ id: null, naam: '', kenteken: '', zitplaatsen: '', kleur: '#1DDB62', actief: true });
            }}
          />
        }
      >
        {fout ? <Uitleg toon="fout">{fout}</Uitleg> : null}
        {lijst.length === 0 && !fout ? <Text style={s.hint}>Nog geen voertuigen.</Text> : null}
        {lijst.map((v) => (
          <Pressable
            key={v.id}
            onPress={() => {
              setError(null);
              setConcept({
                id: v.id,
                naam: v.naam,
                kenteken: v.kenteken,
                zitplaatsen: v.zitplaatsen == null ? '' : String(v.zitplaatsen),
                kleur: v.kleur,
                actief: v.actief,
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${v.naam} bewerken`}
            style={({ pressed }) => [s.lijstRij, pressed && { opacity: 0.8 }]}
          >
            <View style={[s.stip, { backgroundColor: v.kleur }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.lijstTitel, !v.actief && { color: t.muted }]}>{v.naam}</Text>
              <Text style={s.lijstSub}>
                {[
                  v.kenteken || null,
                  v.zitplaatsen != null ? `${v.zitplaatsen} zitplaatsen` : 'Geen limiet',
                  v.actief ? 'Actief' : 'Inactief',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        ))}
      </Kaart>

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Voertuig bewerken' : 'Nieuw voertuig'}
        error={error}
        saving={saving}
        submitDisabled={!concept?.naam.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id
            ? {
                label: 'Voertuig verwijderen',
                onPress: () => {
                  const v = lijst.find((x) => x.id === concept.id);
                  if (v) verwijderen(v);
                },
              }
            : undefined
        }
      >
        <FormField
          label="Naam *"
          value={concept?.naam ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, naam: v } : c))}
          placeholder="Bijv. Bus 1"
          autoFocus={!concept?.id}
        />
        <View style={s.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Kenteken"
              value={concept?.kenteken ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, kenteken: v } : c))}
              autoCapitalize="characters"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Zitplaatsen"
              value={concept?.zitplaatsen ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, zitplaatsen: v } : c))}
              keyboardType="number-pad"
              placeholder="Geen limiet"
            />
          </View>
        </View>
        <Text style={s.label}>Kleur</Text>
        <View style={s.chipRij}>
          {FASE_KLEUREN.map((k) => {
            const gekozen = (concept?.kleur ?? '').toLowerCase() === k.value.toLowerCase();
            return (
              <Pressable
                key={k.value}
                onPress={() => setConcept((c) => (c ? { ...c, kleur: k.value } : c))}
                accessibilityRole="button"
                accessibilityLabel={`Kleur ${k.label}`}
                accessibilityState={{ selected: gekozen }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: gekozen ? 2 : 1,
                  borderColor: gekozen ? t.ink : t.line,
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: k.value }} />
              </Pressable>
            );
          })}
        </View>
        {concept?.id ? (
          <Schakel
            titel="Actief"
            uitleg="Een inactief voertuig blijft bewaard maar kun je niet meer inplannen."
            waarde={concept.actief}
            onWissel={(v) => setConcept((c) => (c ? { ...c, actief: v } : c))}
          />
        ) : null}
      </FormSheet>
    </>
  );
}
