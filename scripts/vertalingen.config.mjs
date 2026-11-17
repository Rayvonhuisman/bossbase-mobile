// Instellingen voor scripts/vertalingen-bijwerken.mjs (de app). Zelfde script
// als in het dashboard-repo (~/BossBase); alleen de paden verschillen.
export default {
  talen: ['en', 'de', 'fr', 'es', 'pt', 'pl', 'ro', 'bg', 'uk', 'tr'],
  leesmij: 'src/i18n/LEESMIJ.md',
  schermtekst: [
    { naam: 'app', scan: [['scripts/talen-check.mjs']], bron: 'src/i18n/bron.json', map: 'src/i18n/talen' },
  ],
  artikelen: null,
  uiExtra: 'These are labels and messages in a mobile app for tradespeople on the job: short and clear, they must fit on a phone screen.',
};
