// Metro-config: de standaard van Expo, plus één uitzondering.
//
// jsPDF (voor de offerte- en factuur-PDF, src/lib/pdf) laadt voor `doc.html()`
// en SVG optioneel html2canvas, canvg en dompurify. Die functies gebruikt de
// PDF-opbouw van het dashboard niet, maar Metro bundelt ze toch mee (+1,6 MB in
// de iOS-bundel). Hier worden ze vervangen door een lege module.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const LEEG = path.resolve(__dirname, 'src/lib/pdf/leeg.js');
const NIET_NODIG = new Set(['html2canvas', 'canvg', 'dompurify']);

const vorige = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (NIET_NODIG.has(moduleName)) return { type: 'sourceFile', filePath: LEEG };
  return vorige ? vorige(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
