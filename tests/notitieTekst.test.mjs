/** Dashboard-HTML → nette platte tekst, en terug. Nooit HTML renderen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { alsTekst, alsHtml } = await import('../src/lib/notitieTekst.ts');

test('regels uit de notitie-editor van het dashboard', () => {
  assert.equal(alsTekst('<div>Eerste regel</div><div>Tweede <b>vet</b></div>'), 'Eerste regel\nTweede vet');
  assert.equal(alsTekst('Regel 1<br>Regel 2<br/>Regel 3'), 'Regel 1\nRegel 2\nRegel 3');
});

test('@-vermeldingen: span en legacy-markup worden @Naam', () => {
  const span = '<span class="bb-mention" data-id="u1" data-name="Piet Jansen" contenteditable="false">@Piet Jansen</span> kijk even';
  assert.equal(alsTekst(span), '@Piet Jansen kijk even');
  assert.equal(alsTekst('<span class="bb-mention" data-id="u1" data-name="Piet"></span>'), '@Piet');
  assert.equal(alsTekst('Hoi @[Kees de Vries](abc-123)!'), 'Hoi @Kees de Vries!');
});

test('lijsten en entiteiten', () => {
  assert.equal(alsTekst('<ul><li>Een</li><li>Twee</li></ul>'), '• Een\n• Twee');
  assert.equal(alsTekst('A &amp; B &lt;3 &nbsp;&#39;x&#39; &#x20AC;5'), "A & B <3  'x' €5");
});

test('platte tekst blijft gelijk; leeg blijft leeg', () => {
  assert.equal(alsTekst('Gewoon een notitie\nmet regel'), 'Gewoon een notitie\nmet regel');
  assert.equal(alsTekst(null), '');
  assert.equal(alsTekst(''), '');
});

test('geen script of opmaak als tekst', () => {
  assert.equal(alsTekst('<script>alert(1)</script><p>Veilig</p>'), 'Veilig');
  assert.equal(alsTekst('<img src=x onerror=alert(1)>Tekst'), 'Tekst');
});

test('terug naar HTML: geëscaped, regels als <br>', () => {
  assert.equal(alsHtml('a < b & "c"\nd'), 'a &lt; b &amp; &quot;c&quot;<br>d');
  // Heen en terug levert dezelfde tekst op.
  assert.equal(alsTekst(alsHtml('Regel 1\nRegel <2> & zo')), 'Regel 1\nRegel <2> & zo');
});
