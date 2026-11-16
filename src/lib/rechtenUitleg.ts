import { txm } from '@/i18n';
import { vertaald } from './vertaald';

/**
 * De uitgebreide uitleg achter het info-icoon per recht, letterlijk uit
 * `src/config/permissions.js` van het dashboard (veld `uitleg`). Los van
 * `permissionGroups.ts` gehouden zodat de rechtenmatrix zelf ongemoeid blijft.
 */
export const RECHT_UITLEG: Record<string, string> = vertaald({
  klanten_bewerken:
    txm('Laat de gebruiker klanten aanmaken en klantgegevens bewerken. Zonder dit recht is de klantenlijst alleen-lezen: klanten bekijken kan wel, aanpassen niet.'),
  klanten_verwijderen:
    txm('Laat de gebruiker klanten definitief verwijderen. Zonder dit recht ontbreekt de verwijder-knop in de klantenlijst en op de klantkaart.'),
  verkoop:
    txm('Geeft toegang tot de Pipeline: aanvragen en projecten bekijken en beheren, plus de pipeline-widgets op het dashboard (nieuwe aanvragen, actieve aanvragen, conversie, funnel). Dit wordt ook server-side afgedwongen: zonder dit recht is de pipeline nergens zichtbaar.'),
  contracten:
    txm('Geeft toegang tot de Contracten-pagina: onderhoudscontracten opstellen, laten ondertekenen en beheren, met de beurten, de prijs per periode, de SLA-niveaus en het SLA-rapport. Ook installaties beheren. Dit wordt server-side afgedwongen: zonder dit recht komen contracten niet uit de database. Wie een werkbon onder een contract heeft, ziet op die werkbon wel het contract, de installatie, de prioriteit en de reactietijden, maar geen prijzen.'),
  projecten:
    txm('Geeft toegang tot de Projecten-pagina. Wélke projecten iemand daar ziet regelt de database: zonder ‘Alle projecten & werkbonnen inzien’ zijn dat alleen de projecten waaraan hij is toegewezen of waarvan hij een werkbon heeft. Bewerken vraagt apart om ‘Projecten bewerken’.'),
  projecten_bewerken:
    txm('Projecten aanmaken en bewerken — ook projecten waar je zelf niet aan gekoppeld bent. Je eigen projecten zie je altijd, ook zonder dit recht; dit recht gaat over het wijzigen.'),
  werkbonnen_bewerken:
    txm('Alle werkbonnen bewerken, ook die waarvan je geen verantwoordelijke bent, inclusief het registreren van materiaalkosten daarop. De verantwoordelijke van een werkbon mag díe bon sowieso al bewerken; dit is het ‘overal’-recht daarbovenop.'),
  planning:
    txm('Toegang tot de Planning-pagina (werkbonnen inplannen met drag & drop), het mogen inplannen van alle werkbonnen, en het bewerken van agenda-afspraken van collega’s.'),
  alles_inzien:
    txm('Normaal ziet een medewerker alleen zijn eigen projecten en werkbonnen. Met dit recht ziet hij die van het hele team. Dit geeft brede inzage in het werk van collega’s — zet het alleen aan als dat nodig is.'),
  agenda_inzien:
    txm('Laat de agenda-afspraken van collega’s zien (alleen inzien, niet bewerken). Normaal ziet een medewerker alleen zijn eigen agenda.'),
  projectbedragen:
    txm('Toont bedragen op projecten, werkbonnen en de klantkaart: projectwaarde, gefactureerd, betaald, kosten en winst per project/klant. Staat los van de gevoeliger bedrijfsomzet. Standaard uit.'),
  bedrijfsfinancien:
    txm('Toegang tot de Financiën-pagina en de omzet-/winst-widgets op het dashboard (omzet en winst per maand, pipeline-waarde, geaccepteerde waarde, grafieken). Gevoelige bedrijfscijfers; standaard uit.'),
  offertes:
    txm('Geeft toegang tot de Offertes-pagina: offertes opstellen, versturen en de status volgen. Ook het tabblad ‘Offertes’ op de klantkaart en het offerte-widget op het dashboard worden zichtbaar.'),
  facturen:
    txm('Geeft toegang tot de Facturen-pagina: facturen aanmaken, versturen en de betaalstatus bijhouden. Ook het facturen-tabblad op de klantkaart en de facturatie-widgets op het dashboard worden zichtbaar.'),
  inkoopprijzen:
    txm('Toont de inkoopprijs van materialen (materialenbibliotheek, werkbonregels, marge-kolom), de kostprijs per uur op geboekte uren, de calculatie van offertes en daarmee de nacalculatie: begroot tegenover werkelijk en het resultaat per project en klant. Zonder dit recht ziet de gebruiker alleen verkoopprijzen en inkopen. Dit wordt server-side afgedwongen: deze prijzen komen zonder dit recht niet uit de database, ook niet via een directe API-call. Kostprijzen per uur instellen kan alleen een admin. Standaard alleen voor admins.'),
  kosten:
    txm('Geeft toegang tot de Kosten-pagina om kosten en inkoop vast te leggen en te bekijken, plus het kosten-tabblad op de klantkaart en de kosten-widgets. Materiaalkosten die op een werkbon worden geboekt vallen onder ‘Werkbonnen bewerken’, niet onder dit recht.'),
  team:
    txm('Geeft toegang tot de Team-pagina om teamleden te bekijken. Let op: teamleden uitnodigen, rechten instellen en verwijderen blijft voorbehouden aan admins.'),
  instellingen:
    txm('Geeft toegang tot de bedrijfsinstellingen (bedrijfsgegevens, e-mailinstellingen, enzovoort). Het eigen ‘Mijn profiel’ kan iedereen altijd beheren; dit recht gaat alleen over de bedrijfsbrede instellingen.'),
  database:
    txm('Geeft toegang tot de Database & Export-pagina om bedrijfsgegevens (zoals klanten) te bekijken en te exporteren naar Excel.'),
});

/** Zelfde waarschuwing als `WARN_TEXT` in het dashboard. */
export const BREDE_INZAGE_WAARSCHUWING = txm(
  'Let op: dit geeft brede inzage in projecten, werkbonnen of agenda van collega’s. Weet je zeker dat je dit wilt aanzetten?',
);
