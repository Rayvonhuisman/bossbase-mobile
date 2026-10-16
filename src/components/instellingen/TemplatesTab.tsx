import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { AppFilterChips } from '@/components/AppFilterChips';
import { usePermissions, useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useSave } from '@/lib/useSave';
import { alsTekst } from '@/lib/notitieTekst';
import { openDashboard } from '@/lib/dashboardLink';
import {
  NIEUW_TEMPLATE_VARS,
  STANDAARD_BODY,
  STANDAARD_TEMPLATE_TYPES,
  TEMPLATE_CONFIGS,
  controleerNieuwTemplate,
  tekstNaarEditorHtml,
} from '@/lib/instellingenRegels';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
  type EmailTemplate,
} from '@/services/instellingenService';
import { Kaart, Schakel, Uitleg, stijlVoorInstellingen } from './Bouwstenen';
import { aankoopTekst, toonAankoopInfo } from '@/lib/aankoopInfo';

type Form = {
  onderwerp: string;
  tekst: string;
  /** De tekst zoals hij binnenkwam; alleen bij een wijziging gaat de body mee. */
  origineel: string;
  actief: boolean;
  auto: boolean;
  dagen: string;
};

const naarForm = (t: EmailTemplate): Form => {
  const tekst = alsTekst(t.body);
  return {
    onderwerp: t.onderwerp,
    tekst,
    origineel: tekst,
    actief: t.actief,
    auto: t.auto_versturen,
    dagen: String(t.auto_dagen ?? 7),
  };
};

/**
 * E-mailtemplates — tabel `email_templates`, zoals het dashboard: per type
 * actief, onderwerp, bericht, variabelen, automatisch verzenden (+ dagen) met
 * de feature-gate, terugzetten naar standaard, en eigen templates (feature
 * `eigen_email_templates`).
 *
 * Het bericht bewerk je hier als platte tekst. Het dashboard heeft een
 * opmaak-editor (vet, cursief, lijsten); die opmaak blijft staan zolang je de
 * tekst hier niet aanpast. Pas je hem wel aan, dan wordt het bericht als
 * gewone regels opgeslagen.
 */
export function TemplatesTab({ magWijzigen }: { magWijzigen: boolean }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => stijlVoorInstellingen(t), [t]);
  const { hasFeature } = usePermissions();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  const [actief, setActief] = useState<string>('offerte');
  // Concepten per template-id: wat je hier typt blijft staan als je even een
  // ander template bekijkt, en verdwijnt na opslaan.
  const [concepten, setConcepten] = useState<Record<string, Form>>({});
  const [nieuw, setNieuw] = useState<{ naam: string; type: string; onderwerp: string; tekst: string } | null>(null);
  const { save, saving, error } = useSave<unknown>();
  const { save: saveNieuw, saving: nieuwBezig, error: nieuwFout, setError: setNieuwFout } = useSave<unknown>();

  const verwerk = useCallback((res: Awaited<ReturnType<typeof listEmailTemplates>>) => {
    setTemplates(res.data);
    setFout(res.error);
    setGeladen(true);
  }, []);
  const laad = useCallback(async () => verwerk(await listEmailTemplates()), [verwerk]);

  useEffect(() => {
    let actief = true;
    listEmailTemplates().then((r) => actief && verwerk(r));
    return () => {
      actief = false;
    };
  }, [verwerk]);

  // Volgorde: eerst de standaardtypes in de vaste volgorde, dan eigen templates.
  const lijst = useMemo(() => {
    const standaard = TEMPLATE_CONFIGS.map((c) => templates.find((x) => x.type === c.type)).filter(
      (x): x is EmailTemplate => Boolean(x),
    );
    const eigen = templates.filter((x) => !STANDAARD_TEMPLATE_TYPES.has(x.type));
    return [...standaard, ...eigen];
  }, [templates]);

  const huidig = lijst.find((x) => x.type === actief) ?? lijst[0] ?? null;
  const config = TEMPLATE_CONFIGS.find((c) => c.type === huidig?.type);
  const isEigen = huidig ? !STANDAARD_TEMPLATE_TYPES.has(huidig.type) : false;

  const form: Form | null = huidig ? (concepten[huidig.id] ?? naarForm(huidig)) : null;
  const setForm = (pas: (f: Form | null) => Form | null) => {
    if (!huidig) return;
    setConcepten((c) => {
      const volgende = pas(c[huidig.id] ?? naarForm(huidig));
      return volgende ? { ...c, [huidig.id]: volgende } : c;
    });
  };
  const vergeetConcept = (id: string) =>
    setConcepten((c) => {
      const { [id]: _weg, ...rest } = c;
      return rest;
    });

  const featureVoorAuto = config?.feature;
  const autoToegestaan = !featureVoorAuto || hasFeature(featureVoorAuto);
  const vars = config?.vars ?? NIEUW_TEMPLATE_VARS;

  const opslaan = () => {
    if (!huidig || !form) return;
    const dagen = Number(form.dagen);
    save(
      () =>
        updateEmailTemplate(huidig.id, {
          onderwerp: form.onderwerp,
          body: form.tekst !== form.origineel ? tekstNaarEditorHtml(form.tekst) : undefined,
          actief: form.actief,
          auto_versturen: form.auto,
          auto_dagen: Number.isFinite(dagen) ? dagen : 7,
        }),
      {
        onSuccess: async () => {
          vergeetConcept(huidig.id);
          await laad();
        },
        succesMelding: 'Template opgeslagen',
      },
    );
  };

  const terugzetten = () => {
    if (!huidig || !STANDAARD_BODY[huidig.type]) return;
    Dialog.alert('Template terugzetten naar standaard?', 'Sla daarna op om het te bewaren.', [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Terugzetten',
        onPress: () => setForm((f) => (f ? { ...f, tekst: STANDAARD_BODY[huidig.type] ?? f.tekst } : f)),
      },
    ]);
  };

  const verwijderen = () => {
    if (!huidig) return;
    Dialog.alert(
      `Template "${huidig.name || huidig.type}" verwijderen?`,
      'Dit kan niet ongedaan worden gemaakt.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () =>
            save(() => deleteEmailTemplate(huidig.id), {
              onSuccess: async () => {
                setActief('offerte');
                await laad();
              },
              succesMelding: 'Template verwijderd',
            }),
        },
      ],
    );
  };

  const nieuwOpenen = () => {
    if (!hasFeature('eigen_email_templates')) {
      Dialog.alert(
        'Eigen e-mailtemplates',
        aankoopTekst(
          'Zelf nieuwe e-mailtemplates aanmaken zit in Groei en Team. Je abonnement wijzig je op het dashboard.',
          'Zelf nieuwe e-mailtemplates aanmaken zit niet in je huidige abonnement.',
        ),
        // iOS (App Store 3.1.1): geen knop naar abonnementsbeheer buiten de app.
        toonAankoopInfo()
          ? [
              { text: 'Sluiten', style: 'cancel' },
              { text: 'Naar het dashboard', onPress: () => void openDashboard('abonnement') },
            ]
          : [{ text: 'Sluiten', style: 'cancel' }],
      );
      return;
    }
    setNieuwFout(null);
    setNieuw({ naam: '', type: '', onderwerp: '', tekst: '' });
  };

  const nieuwAanmaken = () => {
    if (!nieuw) return;
    const check = controleerNieuwTemplate(
      nieuw.naam,
      nieuw.type,
      templates.map((x) => x.type),
    );
    if (!check.ok) {
      setNieuwFout(check.melding);
      return;
    }
    saveNieuw(
      () =>
        createEmailTemplate({
          type: check.slug,
          name: nieuw.naam.trim(),
          onderwerp: nieuw.onderwerp,
          body: tekstNaarEditorHtml(nieuw.tekst),
        }),
      {
        onSuccess: async () => {
          setNieuw(null);
          await laad();
          setActief(check.slug);
        },
        succesMelding: 'Template aangemaakt',
      },
    );
  };

  if (!geladen) {
    return (
      <Kaart>
        <Text style={s.hint}>Templates laden…</Text>
      </Kaart>
    );
  }

  if (fout || lijst.length === 0) {
    return (
      <Kaart titel="E-mailtemplates">
        <Text style={s.hint}>{fout ?? 'Geen e-mailtemplates gevonden.'}</Text>
      </Kaart>
    );
  }

  return (
    <>
      <View style={{ paddingTop: 12 }}>
        <AppFilterChips
          chips={lijst.map((x) => ({
            id: x.type,
            label: TEMPLATE_CONFIGS.find((c) => c.type === x.type)?.label ?? (x.name || x.type),
          }))}
          active={huidig?.type ?? ''}
          onChange={setActief}
        />
      </View>

      {huidig && form ? (
        <Kaart
          titel={config?.label ?? (huidig.name || huidig.type)}
          rechts={
            magWijzigen ? (
              <Button label="Nieuw template" variant="ghost" onPress={nieuwOpenen} />
            ) : undefined
          }
        >
          <Schakel
            titel="Actief"
            waarde={form.actief}
            onWissel={(v) => setForm((f) => (f ? { ...f, actief: v } : f))}
            uitgeschakeld={!magWijzigen}
          />
          <View style={{ gap: 4 }}>
            <Text style={s.label}>Variabelen (tik om toe te voegen)</Text>
            <View style={s.chipRij}>
              {vars.map((v) => (
                <Pressable
                  key={v}
                  onPress={() =>
                    setForm((f) => (f ? { ...f, tekst: `${f.tekst}{{${v}}}` } : f))
                  }
                  disabled={!magWijzigen}
                  accessibilityRole="button"
                  accessibilityLabel={`Variabele ${v} invoegen`}
                  style={[s.chip, !magWijzigen && s.uit]}
                >
                  <Text style={s.chipTekst}>{`{{${v}}}`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <FormField
            label="Onderwerp"
            value={form.onderwerp}
            onChangeText={(v) => setForm((f) => (f ? { ...f, onderwerp: v } : f))}
            editable={magWijzigen}
          />
          <FormField
            label="Berichttekst"
            value={form.tekst}
            onChangeText={(v) => setForm((f) => (f ? { ...f, tekst: v } : f))}
            multiline
            editable={magWijzigen}
            style={{ minHeight: 220 }}
          />
          {huidig.type === 'factuur' ? (
            <Text style={s.hint}>
                {'{{betaalinstructie}}'} wordt de betaallink van Stripe als die gekoppeld is, en anders de
              tekst om over te maken naar je rekening.
            </Text>
          ) : null}

          {config?.showAutoToggle ? (
            autoToegestaan ? (
              <>
                <Schakel
                  titel="Automatisch verzenden"
                  waarde={form.auto}
                  onWissel={(v) => setForm((f) => (f ? { ...f, auto: v } : f))}
                  uitgeschakeld={!magWijzigen}
                />
                {config.showAutoDagen && form.auto ? (
                  <FormField
                    label={`Verzenden na (${config.dagenLabel ?? 'dagen'})`}
                    value={form.dagen}
                    onChangeText={(v) => setForm((f) => (f ? { ...f, dagen: v } : f))}
                    keyboardType="number-pad"
                    editable={magWijzigen}
                  />
                ) : null}
              </>
            ) : (
              <Uitleg>Automatisch verzenden zit in Groei en Team.</Uitleg>
            )
          ) : null}

          {error ? <Uitleg toon="fout">{error}</Uitleg> : null}
          {magWijzigen ? (
            <View style={s.knoppen}>
              <Button label="Opslaan" loading={saving} disabled={saving} onPress={opslaan} />
              {STANDAARD_BODY[huidig.type] ? (
                <Button label="Reset" variant="secondary" disabled={saving} onPress={terugzetten} />
              ) : null}
              {isEigen ? (
                <Button label="Verwijderen" variant="ghost" disabled={saving} onPress={verwijderen} />
              ) : null}
            </View>
          ) : (
            <Text style={s.hint}>Templates wijzigen kan iemand met het recht Instellingen.</Text>
          )}
        </Kaart>
      ) : null}

      <FormSheet
        visible={nieuw !== null}
        title="Nieuw template"
        error={nieuwFout}
        saving={nieuwBezig}
        submitLabel="Aanmaken"
        submitDisabled={!nieuw?.naam.trim()}
        onSubmit={nieuwAanmaken}
        onClose={() => setNieuw(null)}
      >
        <FormField
          label="Naam *"
          value={nieuw?.naam ?? ''}
          onChangeText={(v) => setNieuw((c) => (c ? { ...c, naam: v } : c))}
          autoFocus
        />
        <FormField
          label="Type/slug"
          value={nieuw?.type ?? ''}
          onChangeText={(v) => setNieuw((c) => (c ? { ...c, type: v } : c))}
          placeholder="Wordt automatisch gemaakt uit de naam"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FormField
          label="Onderwerp"
          value={nieuw?.onderwerp ?? ''}
          onChangeText={(v) => setNieuw((c) => (c ? { ...c, onderwerp: v } : c))}
        />
        <View style={{ gap: 4 }}>
          <Text style={s.label}>Variabelen</Text>
          <View style={s.chipRij}>
            {NIEUW_TEMPLATE_VARS.map((v) => (
              <Pressable
                key={v}
                onPress={() => setNieuw((c) => (c ? { ...c, tekst: `${c.tekst}{{${v}}}` } : c))}
                accessibilityRole="button"
                accessibilityLabel={`Variabele ${v} invoegen`}
                style={s.chip}
              >
                <Text style={s.chipTekst}>{`{{${v}}}`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <FormField
          label="Berichttekst"
          value={nieuw?.tekst ?? ''}
          onChangeText={(v) => setNieuw((c) => (c ? { ...c, tekst: v } : c))}
          multiline
          style={{ minHeight: 160 }}
        />
      </FormSheet>
    </>
  );
}
