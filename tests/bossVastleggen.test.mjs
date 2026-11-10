/**
 * Boss legt vast in de app: kaartjes uit boss-chat (versie 2), het pad als
 * context, en de overdracht van metingen naar Vertel het Boss.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { contextUitPad, datumTekst, kopVan, kiesKeuze, waaromNiet, zetBossMeting, pakBossMeting } = await import('../src/lib/boss/vastleggen.ts');

const ID = '541a8117-12c2-4ef8-8afb-d681302ceeea';
const kaart = (k = {}) => ({
  id: 'k1', soort: 'notitie', klant: null, project: null, keuzes: [], keuze_soort: null, gezocht: '', niet_gevonden: false,
  tekst: 'Heeft een hond.', taak_soort: '', datum: '', tijd: '', datum_onzeker: false, geweigerd: null, ...k,
});

test('context uit het pad: klant- en projectscherm, verder niets', () => {
  assert.deepEqual(contextUitPad(`/customers/${ID}`), { klant_id: ID });
  assert.deepEqual(contextUitPad(`/project/${ID}`), { project_id: ID });
  assert.equal(contextUitPad(`/customers/contract/${ID}`), null);
  assert.equal(contextUitPad('/customers/new'), null);
  assert.equal(contextUitPad('/'), null);
  assert.equal(contextUitPad(null), null);
});

test('kop en datum', () => {
  assert.equal(kopVan(kaart({ klant: { id: ID, naam: 'Jan Jansen' } })), 'Notitie bij Jan Jansen');
  assert.equal(kopVan(kaart({ soort: 'taak', taak_soort: 'call', klant: { id: ID, naam: 'Jan Jansen' } })), 'Bellen · Jan Jansen');
  assert.equal(kopVan(kaart({ soort: 'metingen', project: { id: ID, naam: 'Woning', klant_id: null, klant_naam: null } })), 'Metingen voor Woning');
  assert.equal(datumTekst('2026-11-12'), 'do 12 nov');
  assert.equal(datumTekst(''), '');
});

test('kiezen tussen twee Jansens', () => {
  const k = kaart({ keuze_soort: 'klant', gezocht: 'Jansen', keuzes: [{ id: 'a', naam: 'Jan Jansen', sub: '' }, { id: 'b', naam: 'Piet Jansen', sub: '' }] });
  assert.match(waaromNiet(k), /Welke klant bedoel je met "Jansen"/);
  const gekozen = kiesKeuze(k, 'b');
  assert.equal(gekozen.klant.naam, 'Piet Jansen');
  assert.equal(waaromNiet(gekozen), null);
});

test('niet gevonden, geweigerd en taak zonder klant', () => {
  assert.match(waaromNiet(kaart({ gezocht: 'Pietersen', niet_gevonden: true })), /geen klant bij "Pietersen"/);
  assert.match(waaromNiet(kaart({ geweigerd: 'Zit in Groei en Team.' })), /Groei en Team/);
  assert.equal(waaromNiet(kaart({ soort: 'taak', tekst: 'Offerte nabellen', datum: '2026-11-13' })), null);
});

test('metingen: tekst wacht op het juiste project, één keer', () => {
  zetBossMeting(ID, 'woonkamer 5,20 bij 4,10');
  assert.equal(pakBossMeting('ander'), null);
  assert.equal(pakBossMeting(ID), 'woonkamer 5,20 bij 4,10');
  assert.equal(pakBossMeting(ID), null);
});
