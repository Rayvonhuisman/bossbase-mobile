import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, FileSignature } from 'lucide-react-native';
import { usePermissions, useTheme } from '@/providers';
import { ds, dsShadow, spacing, type ThemeColors } from '@/theme';
import { formatDateNL } from '@/lib/format';
import { alsTekst } from '@/lib/notitieTekst';
import {
  deadlineTekst,
  PRIORITEIT_LABEL,
  resterendTekst,
  slaRegels,
  slaSoortLabel,
  type Prioriteit,
} from '@/lib/sla';
import { getWerkbonContractInfo, installatieNaam, type WerkbonContractInfo } from '@/services/contractService';
import { SlaBadge } from './SlaBadge';

/**
 * Het contractblok op een werkbon: contract, installatie, prioriteit, de
 * SLA-deadlines met hun status en wat er binnen het contract valt.
 *
 * Alles komt uit `bb_werkbon_contract_info` (security definer, voor wie de
 * werkbon mag zien). Die geeft nooit prijzen; een monteur zonder recht
 * contracten ziet dus wel de afspraak, niet wat hij kost.
 *
 * `ververs` verandert als de werkbon zelf opnieuw geladen is (status,
 * prioriteit, gestart/afgerond), zodat de deadlines en de status meelopen.
 */
export function ContractBlok({
  werkbonId,
  status,
  ververs,
}: {
  werkbonId: string;
  /** Werkbonstatus: een geannuleerde werkbon heeft geen SLA meer. */
  status: string | null | undefined;
  ververs: string;
}) {
  const router = useRouter();
  const { can, hasFeature } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [info, setInfo] = useState<WerkbonContractInfo | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  // Elke minuut opnieuw rekenen, zodat "nog 1 u 59 min" niet blijft staan.
  const [nu, setNu] = useState(() => Date.now());

  useEffect(() => {
    let leeft = true;
    void getWerkbonContractInfo(werkbonId).then((r) => {
      if (!leeft) return;
      setFout(r.error);
      if (!r.error) setInfo(r.data);
      setNu(Date.now());
    });
    return () => {
      leeft = false;
    };
  }, [werkbonId, ververs]);

  useEffect(() => {
    const id = setInterval(() => setNu(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (fout && !info) {
    return (
      <View style={styles.kaart}>
        <Text style={styles.gedempt}>Contractgegevens konden niet worden geladen.</Text>
      </View>
    );
  }
  if (!info || (!info.contract && !info.installatie)) return null;

  const c = info.contract;
  const regels = slaRegels(
    {
      status,
      sla_reactie_voor: info.sla_reactie_voor,
      sla_oplossen_voor: info.sla_oplossen_voor,
      gestart_op: info.gestart_op,
      afgerond_op: info.afgerond_op,
    },
    info.sla,
    nu,
  );
  const prioriteit = info.prioriteit && info.prioriteit in PRIORITEIT_LABEL ? (info.prioriteit as Prioriteit) : null;
  const magContractOpenen = !!c && can('contracten') && hasFeature('contracten');
  const ins = info.installatie;
  const binnen = alsTekst(c?.binnen_contract ?? '').trim();

  return (
    <View style={styles.sectie}>
      <View style={styles.kop}>
        <FileSignature size={16} color={ds.green700} />
        <Text style={styles.kopTitel}>{c ? 'Contract' : 'Installatie'}</Text>
      </View>
      <View style={styles.kaart}>
        {c ? (
          <Pressable
            disabled={!magContractOpenen}
            onPress={() => router.push(`/customers/contract/${c.id}`)}
            accessibilityRole={magContractOpenen ? 'link' : undefined}
            style={({ pressed }) => [styles.contractRij, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.contractNummer}>{c.nummer ?? 'Contract'}</Text>
              <Text style={styles.contractTitel} numberOfLines={2}>
                {c.titel ?? ''}
              </Text>
            </View>
            {magContractOpenen ? <ChevronRight size={16} color={t.muted} /> : null}
          </Pressable>
        ) : null}

        {prioriteit || info.sla?.niveau ? (
          <View style={styles.pillen}>
            {prioriteit ? (
              <View style={[styles.pil, prioriteit === 'spoed' && { backgroundColor: t.statusRejectBg }]}>
                <Text style={[styles.pilTekst, prioriteit === 'spoed' && { color: t.statusRejectFg }]}>
                  {PRIORITEIT_LABEL[prioriteit]}
                </Text>
              </View>
            ) : null}
            {info.sla?.niveau ? (
              <Text style={styles.gedempt}>
                SLA {info.sla.niveau}
                {info.sla.klok === 'werkuren' ? ' · werkuren (ma–vr 8–17)' : info.sla.klok === 'altijd' ? ' · 24/7' : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        {regels.map((r) => (
          <View key={r.soort} style={styles.slaRij}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.label}>{slaSoortLabel(r.soort)}</Text>
              <Text style={styles.waarde}>
                {deadlineTekst(r.deadline)}
                {(() => {
                  const klaar = r.soort === 'reactie' ? (info.gestart_op ?? info.afgerond_op) : info.afgerond_op;
                  if (klaar) return ` · ${r.soort === 'reactie' ? 'gestart' : 'afgerond'} ${deadlineTekst(klaar)}`;
                  return ` · ${resterendTekst(r.deadline, nu)}`;
                })()}
              </Text>
            </View>
            <SlaBadge status={r.status} klein />
          </View>
        ))}

        {info.uiterlijk_op ? (
          <View style={styles.regel}>
            <Text style={styles.label}>Uiterlijk uitvoeren op</Text>
            <Text style={styles.waarde}>{formatDateNL(info.uiterlijk_op)}</Text>
          </View>
        ) : null}

        {info.sla_toelichting ? (
          <View style={styles.regel}>
            <Text style={styles.label}>Toelichting</Text>
            <Text style={styles.waarde}>{info.sla_toelichting}</Text>
          </View>
        ) : null}

        {ins ? (
          <View style={styles.regel}>
            <Text style={styles.label}>Installatie</Text>
            <Text style={styles.waarde}>{installatieNaam(ins)}</Text>
            {ins.serienummer || ins.plaatsingsdatum ? (
              <Text style={styles.gedempt}>
                {[
                  ins.serienummer ? `Serienummer ${ins.serienummer}` : null,
                  ins.plaatsingsdatum ? `geplaatst ${formatDateNL(ins.plaatsingsdatum)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
            {ins.adres || ins.plaats ? (
              <Text style={styles.gedempt}>{[ins.adres, [ins.postcode, ins.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</Text>
            ) : null}
            {ins.notities ? <Text style={styles.gedempt}>{ins.notities}</Text> : null}
          </View>
        ) : null}

        {info.beurt?.omschrijving ? (
          <View style={styles.regel}>
            <Text style={styles.label}>Onderhoudsbeurt</Text>
            <Text style={styles.waarde}>{info.beurt.omschrijving}</Text>
          </View>
        ) : null}

        {binnen ? (
          <View style={styles.regel}>
            <Text style={styles.label}>Binnen het contract</Text>
            <Text style={styles.waarde}>{binnen}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    // Zelfde opbouw als de secties van het werkbondetail (Section in [id].tsx).
    sectie: { gap: 8 },
    kop: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
    kopTitel: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: 0.72,
      textTransform: 'uppercase',
      color: t.muted2,
    },
    kaart: {
      backgroundColor: t.card,
      borderRadius: t.rLg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      padding: spacing.lg,
      gap: spacing.md,
      ...dsShadow,
    },
    contractRij: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    contractNummer: { fontSize: 12, fontWeight: '700', color: t.muted, fontVariant: ['tabular-nums'] },
    contractTitel: { fontSize: 15, fontWeight: '600', color: t.ink },
    pillen: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    pil: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bgAlt },
    pilTekst: { fontSize: 12.5, fontWeight: '700', color: t.ink2 },
    slaRij: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    regel: { gap: 2 },
    label: { fontSize: 12, fontWeight: '600', color: t.muted },
    waarde: { fontSize: 14, color: t.ink, lineHeight: 20 },
    gedempt: { fontSize: 12.5, color: t.muted, lineHeight: 18 },
  });
