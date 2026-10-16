/**
 * De tekenpagina voor het handtekeningvak op de telefoon (WebView). Zelfde
 * tekenwerk als HandtekeningCanvas in het dashboard: canvas zo breed als het
 * vak en 160 hoog, lijn #1e293b van 2,5 met ronde uiteinden, en na elke streek
 * de handtekening als PNG-data-URL terug naar de app (sign-werkbon wil precies
 * `data:image/png;base64,…`).
 *
 * Berichten naar de app: `{ type: 'streek', dataUrl }` na elke streek.
 * Vanuit de app: `wis()` via injectJavaScript.
 */
export function handtekeningHtml(hoogte = 160): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;padding:0;background:#fafafa;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
canvas{display:block;width:100%;height:${hoogte}px;touch-action:none}</style></head>
<body><canvas id="c"></canvas><script>
(function(){
  var c=document.getElementById('c'),ctx=c.getContext('2d'),teken=false,laatste=null,iets=false;
  function opzet(){c.width=c.offsetWidth;c.height=${hoogte};ctx.strokeStyle='#1e293b';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';}
  opzet();
  function pos(t){var r=c.getBoundingClientRect();return{x:t.clientX-r.left,y:t.clientY-r.top};}
  function stuur(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'streek',dataUrl:iets?c.toDataURL('image/png'):null}));}
  c.addEventListener('touchstart',function(e){e.preventDefault();teken=true;laatste=pos(e.touches[0]);},{passive:false});
  c.addEventListener('touchmove',function(e){if(!teken)return;e.preventDefault();var p=pos(e.touches[0]);ctx.beginPath();ctx.moveTo(laatste.x,laatste.y);ctx.lineTo(p.x,p.y);ctx.stroke();laatste=p;iets=true;},{passive:false});
  c.addEventListener('touchend',function(){if(teken){teken=false;stuur();}});
  window.wis=function(){ctx.clearRect(0,0,c.width,c.height);iets=false;stuur();};
})();
</script></body></html>`;
}
