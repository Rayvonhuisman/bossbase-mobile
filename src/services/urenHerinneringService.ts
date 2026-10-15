import { supabase } from '@/lib/supabase';
import { lokaalNaarUtc, lokaleDatum, lokaleTijd, vandaagIso } from '@/lib/nlTijd';
import { agendaWerkbonItems } from '@/lib/planningRegels';
import {
  herinneringActief,
  openWerkdagen,
  plusDagenIso,
  TERUG_DAGEN,
  type GeplandeDag,
  type HerinneringMoment,
  type OpenWerkdag,
} from '@/lib/urenHerinnering';
import { getCompanySettings } from './settingsService';
import { listCompanyProfiles } from './teamService';
import { listWerkbonnenInBereik } from './planningService';
import { listUrenForProfile } from './timeEntryService';

/**
 * De gegevens voor "Vul je werkdag in" (zie `lib/urenHerinnering.ts`): dezelfde
 * bronnen als de herinnering in het dashboard. Faalt stil — een herinnering
 * mag de homepage nooit blokkeren.
 */
export async function laadUrenHerinnering(
  uid: string,
  rol: string | null | undefined,
): Promise<{ dagen: OpenWerkdag[]; intervalMin: number }> {
  const leeg = { dagen: [], intervalMin: 0 };
  if (rol === 'admin') return leeg;
  try {
    const [inst, leden] = await Promise.all([getCompanySettings(), listCompanyProfiles()]);
    const weekdag = new Date().getDay() || 7;
    const intervalMin = Number(inst.data.uren_herinnering_interval_min ?? 0);
    const actief = herinneringActief({
      rol,
      actieveLeden: leden.data.filter((l) => l.actief).length,
      intervalMin,
      uitgesloten: inst.data.uren_herinnering_uitgesloten,
      dagen: inst.data.uren_herinnering_dagen,
      uid,
      weekdag,
    });
    if (!actief) return leeg;

    const vandaag = vandaagIso();
    const van = plusDagenIso(vandaag, -TERUG_DAGEN);
    const startISO = lokaalNaarUtc(van, '00:00')?.toISOString() ?? `${van}T00:00:00Z`;
    const eindISO = lokaalNaarUtc(vandaag, '23:59')?.toISOString() ?? `${vandaag}T23:59:59Z`;

    const [wbRes, actRes, urenRes] = await Promise.all([
      listWerkbonnenInBereik(van, vandaag),
      supabase
        .from('activities')
        .select('id, title, due_at, end_time, assigned_to, assigned_to_ids')
        .gte('due_at', startISO)
        .lte('due_at', eindISO)
        .or(`assigned_to.eq.${uid},assigned_to_ids.cs.{${uid}}`)
        // Zelfde volgorde als het dashboard: de eerste activiteit van de dag geeft de context.
        .order('due_at', { ascending: true })
        .order('id', { ascending: true }),
      listUrenForProfile(uid, van, vandaag),
    ]);

    const gepland: GeplandeDag[] = [];
    for (const it of agendaWerkbonItems(wbRes.data, { uid, gedeeld: false, van, tot: vandaag, ookAfgerond: true })) {
      gepland.push({
        datum: it.datum,
        eind: it.eindtijd,
        label: [it.werkbon.titel, it.werkbon.customer?.name].filter(Boolean).join(' · ') || 'Werkbon',
        werkbonId: it.werkbon.id,
      });
    }
    type ActRij = { id: string; title: string | null; due_at: string | null; end_time: string | null; assigned_to_ids: string[] | null; assigned_to: string | null };
    for (const a of (actRes.data as ActRij[] | null) ?? []) {
      if (!a.due_at) continue;
      // Het dashboard telt de lijst met toegewezenen; de oude enkele kolom als terugval.
      const ids = a.assigned_to_ids?.length ? a.assigned_to_ids : a.assigned_to ? [a.assigned_to] : [];
      if (!ids.includes(uid)) continue;
      gepland.push({ datum: lokaleDatum(a.due_at), eind: a.end_time ?? null, label: a.title || 'Activiteit', werkbonId: null });
    }
    const geboekt = (urenRes.data ?? [])
      .filter((r) => r.bron === 'werkdag' && Number(r.uren) > 0)
      .map((r) => r.datum);

    const dagen = openWerkdagen({
      gepland,
      geboekt,
      vandaag,
      nuTijd: lokaleTijd(new Date()),
      moment: (inst.data.uren_herinnering_moment ?? 'volgende_ochtend') as HerinneringMoment,
    });
    return { dagen, intervalMin };
  } catch {
    return leeg;
  }
}
