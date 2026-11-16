# Vertalen in de app

Nederlands is de brontaal. Alle tekst in de code blijft Nederlands; die tekst
is zelf de sleutel van de vertaling. Ontbreekt een vertaling, dan toont de app
het Nederlands.

## Tekst markeren

```ts
import { tx, txn, txm, locale } from '@/i18n';

tx('Werkbon opslaan')
tx('{naam} is ingepland op {datum}', { naam, datum })
txn('{n} werkbon', '{n} werkbonnen', aantal)          // meervoud; {n} = aantal
tx('Open', undefined, 'status')                       // zelfde woord, andere betekenis
```

- **Niet `t`**: die naam is in de app de themakleuren (`const { colors: t }`).
- **Geen `${...}` in de tekst.** Gebruik `{naam}` en geef de waarde mee:
  `tx('Hallo {naam}', { naam })`, niet `tx(\`Hallo ${naam}\`)`. Hele zinnen
  in één tx(), niet in stukken geknipt: `tx('Nog {n} dagen')`, niet
  `tx('Nog') + n + tx('dagen')`. Woordvolgorde verschilt per taal.
- **Moduleniveau** (constanten buiten een component, zoals
  `const LABELS = {...}`): daar wordt de tekst uitgerekend bij het laden en
  wisselt hij niet mee. Markeer met `txm('...')` en vertaal bij het tonen:
  `tx(LABELS[status])`.
- **Datums en getallen**: geen `'nl-NL'` vast in Intl. Gebruik `locale()`:
  `new Intl.DateTimeFormat(locale(), {...})`. Een formatter op moduleniveau
  wordt dan een functie (of wordt in het component gemaakt).
  Tijdzone blijft `Europe/Amsterdam`.
- **Bedragen**: valuta blijft EUR; alleen de opmaak volgt `locale()`.

## Wat níet vertalen

- Namen van klanten, projecten, bedrijven, producten en alles uit de database.
- `BossBase`, `Boss` (de assistent), `Moneybird`, `SnelStart`, `AFAS`,
  `Stripe`, `iDEAL`, `KvK`, `IBAN`.
- Statussen en codes die naar de database gaan (`'concept'`, `'open'`): alleen
  het **label** dat de gebruiker ziet vertalen, nooit de waarde.
- Tekst die naar **klanten** gaat (offerte-, factuur- en werkbon-PDF, mails
  naar klanten): die blijft Nederlands. BossBase richt zich op bedrijven in
  Nederland; de klanten van die bedrijven zijn Nederlands. Alleen de schermen
  zijn voor de medewerker in zijn eigen taal.
- Logregels, `console.*`, `__DEV__`-tekst, commentaar, foutcodes.
- Juridische teksten (voorwaarden, verwerkersovereenkomst) en de inhoud van
  de hulppagina's: die blijven voorlopig Nederlands.

## Woordenlijst

Vast, zodat elk scherm dezelfde woorden gebruikt. Toon: informeel (je/du/tu/ty),
kort, zoals een collega het zegt. Geen letterlijke vertalingen die raar lopen.

| NL | en | de | fr | es | pt | pl | ro | bg | uk | tr |
|---|---|---|---|---|---|---|---|---|---|---|
| werkbon | work order | Arbeitsauftrag | bon d'intervention | orden de trabajo | ordem de trabalho | zlecenie | fișă de lucru | работна карта | наряд | iş emri |
| offerte | quote | Angebot | devis | presupuesto | orçamento | oferta | ofertă | оферта | кошторис | teklif |
| factuur | invoice | Rechnung | facture | factura | fatura | faktura | factură | фактура | рахунок | fatura |
| klant | customer | Kunde | client | cliente | cliente | klient | client | клиент | клієнт | müşteri |
| aanvraag (lead) | enquiry | Anfrage | demande | solicitud | pedido | zapytanie | cerere | запитване | запит | talep |
| project | project | Projekt | projet | proyecto | projeto | projekt | proiect | проект | проєкт | proje |
| planning | schedule | Planung | planning | planificación | planeamento | harmonogram | planificare | график | графік | planlama |
| medewerker | employee | Mitarbeiter | employé | empleado | colaborador | pracownik | angajat | служител | працівник | çalışan |
| beheerder | admin | Administrator | administrateur | administrador | administrador | administrator | administrator | администратор | адміністратор | yönetici |
| uren | hours | Stunden | heures | horas | horas | godziny | ore | часове | години | saatler |
| activiteit | activity | Aktivität | activité | actividad | atividade | aktywność | activitate | дейност | активність | etkinlik |
| agenda | calendar | Kalender | agenda | agenda | agenda | kalendarz | calendar | календар | календар | takvim |
| nacalculatie | job costing | Nachkalkulation | coût réel | costes reales | custos reais | rozliczenie kosztów | costuri reale | реални разходи | фактичні витрати | gerçekleşen maliyet |
| materialen | materials | Material | matériaux | materiales | materiais | materiały | materiale | материали | матеріали | malzemeler |
| kosten | costs | Kosten | frais | gastos | custos | koszty | costuri | разходи | витрати | giderler |
| meerwerk | extra work | Mehrarbeit | travaux supplémentaires | trabajo adicional | trabalho extra | prace dodatkowe | lucrări suplimentare | допълнителна работа | додаткові роботи | ek iş |
| handtekening | signature | Unterschrift | signature | firma | assinatura | podpis | semnătură | подпис | підпис | imza |
| opdrachtgever | client | Auftraggeber | donneur d'ordre | cliente | cliente | zleceniodawca | beneficiar | възложител | замовник | işveren |
| uitvoerder | assigned to | ausführend | exécutant | asignado a | responsável pela execução | wykonawca | executant | изпълнител | виконавець | uygulayan |
| voertuig | vehicle | Fahrzeug | véhicule | vehículo | veículo | pojazd | vehicul | превозно средство | транспорт | araç |
| contract | contract | Vertrag | contrat | contrato | contrato | umowa | contract | договор | договір | sözleşme |
| btw | VAT | MwSt. | TVA | IVA | IVA | VAT | TVA | ДДС | ПДВ | KDV |
| Vandaag (tab) | Today | Heute | Aujourd'hui | Hoy | Hoje | Dzisiaj | Astăzi | Днес | Сьогодні | Bugün |
| opslaan | save | speichern | enregistrer | guardar | guardar | zapisz | salvează | запази | зберегти | kaydet |
| annuleren | cancel | abbrechen | annuler | cancelar | cancelar | anuluj | anulează | отказ | скасувати | iptal |
| concept | draft | Entwurf | brouillon | borrador | rascunho | szkic | ciornă | чернова | чернетка | taslak |
| inloggen | log in | anmelden | se connecter | iniciar sesión | iniciar sessão | zaloguj się | autentificare | вход | увійти | giriş yap |

Portugees is Europees Portugees (pt-PT).
