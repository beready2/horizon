// Valeurs attendues calculées par une réimplémentation indépendante (Python),
// sur les hypothèses inventées de exemple.json. Aucune donnée réelle ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projeter, mensualite, valeurActuelle } from '../moteur.js';
import { chiffrer, dechiffrer } from '../coffre.js';

const { hyp } = JSON.parse(await readFile(new URL('../exemple.json', import.meta.url), 'utf8'));
const proche = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('scénario central', () => {
  const p = projeter(hyp, { rendement: 0.05 });
  proche(p.brut, 448349.55418865767); proche(p.principal, 162000);
  proche(p.pontFinal, 1252.6062343126587); proche(p.pontMin, 1252.6062343126587);
  proche(p.revenu, 1033.0136180789236); proche(p.couvert, 0.6886757453859491);
});
test('scénario prudent', () => {
  const p = projeter(hyp, { rendement: 0.03 });
  proche(p.brut, 297453.108947717); proche(p.couvert, 0.47524890073672693);
});
test('épargne en plus', () => {
  const p = projeter(hyp, { rendement: 0.05, epargnePlus: 200 });
  proche(p.brut, 577615.846110572); proche(p.principal, 210000); proche(p.couvert, 0.8870222006260918);
});
test('krach de 20 %', () => {
  const p = projeter(hyp, { rendement: 0.05, choc: 0.2 });
  proche(p.brut, 358679.64335092617); proche(p.couvert, 0.561847269741503);
});
test("l'épargne à ajouter ramène la couverture à 100 %", () => {
  const p = projeter(hyp, { rendement: 0.05 });
  proche(projeter(hyp, { rendement: 0.05, epargnePlus: p.epargneAAjouter }).couvert, 1, 1e-9);
});
test('mensualité et valeur actuelle sont inverses', () => {
  proche(valeurActuelle(0.0025, 300, mensualite(0.0025, 300, 100000)), 100000);
});
test('chiffrement : aller-retour, et refus de la mauvaise phrase', async () => {
  const c = await chiffrer({ a: 1, texte: 'é€' }, 'une phrase de test assez longue');
  assert.deepEqual(await dechiffrer(c, 'une phrase de test assez longue'), { a: 1, texte: 'é€' });
  await assert.rejects(dechiffrer(c, 'mauvaise phrase'));
});

test('sans option, âge de départ et dépense ponctuelle ne changent rien', () => {
  const a = projeter(hyp, { rendement: 0.05 });
  const b = projeter(hyp, { rendement: 0.05, ageDepart: hyp.ageDepart, ponctuelle: { montant: 0, annee: 2030 } });
  proche(a.couvert, b.couvert, 1e-12); proche(a.pontFinal, b.pontFinal, 1e-12);
});
test('une dépense ponctuelle réduit la réserve de son montant capitalisé', () => {
  const a = projeter(hyp, { rendement: 0.05 });
  const b = projeter(hyp, { rendement: 0.05, ponctuelle: { montant: 5000, annee: hyp.annee + 2 } });
  const anneesRestantes = (hyp.ageComplement - hyp.age) - 3; // payée en fin de 3e année
  proche(a.pontFinal - b.pontFinal, 5000 * Math.pow(1 + hyp.rdtPont, anneesRestantes));
  proche(a.brut, b.brut); assert.ok(b.couvert < a.couvert);
});
test('partir un an plus tard : un an de versements en plus, un an de retraits en moins', () => {
  const a = projeter(hyp, { rendement: 0.05 });
  const b = projeter(hyp, { rendement: 0.05, ageDepart: hyp.ageDepart + 1 });
  proche(b.principal - a.principal, 12 * (hyp.versPea2 + hyp.scpi * hyp.scpiActif));
  assert.ok(b.couvert > a.couvert && b.besoinPont < a.besoinPont);
});
test('réserve insuffisante : le manque annuel ne dépasse jamais le retrait', () => {
  const p = projeter(hyp, { rendement: 0.05, depenses: hyp.depenses + 600 });
  assert.equal(p.pontCouvert, false);
  for (const x of p.serie.slice(1)) assert.ok(x.manque >= 0 && x.manque <= x.retrait + 1e-9);
  assert.ok(p.serie.some((x) => x.manque > 0));
});
