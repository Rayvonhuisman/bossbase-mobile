/* Thema vóór de eerste weergave (zie src/lib/themaKeuze.ts). Geen afhankelijkheden. */
(function () {
  var donker = false;
  try {
    window.localStorage.removeItem('bb.colorMode'); /* oude sleutel, zie themaKeuze.shared.ts */
    var opgeslagen = window.localStorage.getItem('bb.weergave');
    if (opgeslagen === 'dark') donker = true;
    else if (opgeslagen !== 'light') donker = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) {
    /* geen opslag (privévenster): systeemvoorkeur of licht */
  }
  if (!donker) return;
  var achtergrond = '#0D0D0D';
  document.documentElement.style.backgroundColor = achtergrond;
  document.documentElement.style.colorScheme = 'dark';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', achtergrond);
  document.addEventListener('DOMContentLoaded', function () {
    document.body.style.backgroundColor = achtergrond;
  });
})();
