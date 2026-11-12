// Valeurs attendues calculées par une réimplémentation indépendante (Python),
// sur les hypothèses inventées de exemple.json. Aucune donnée réelle ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projeter, mensualite, valeurActuelle, resoudre, tirages } from '../moteur.js';
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

test('solveur : le rendement trouvé donne bien 100 % de couverture', () => {
  const r = resoudre((x) => projeter(hyp, { rendement: x }).couvert, 1, 0, 0.2);
  proche(projeter(hyp, { rendement: r }).couvert, 1, 1e-9);
  assert.equal(resoudre((x) => x, 5, 0, 1), null);
});
test('solveur : dépenses soutenables (fonction décroissante)', () => {
  const dep = resoudre((x) => projeter(hyp, { rendement: 0.05, depenses: x }).couvert, 1, hyp.pension, hyp.depenses * 2, false);
  proche(projeter(hyp, { rendement: 0.05, depenses: dep }).couvert, 1, 1e-9);
  assert.ok(dep < hyp.depenses);
});
test('rendements année par année constants = rendement fixe', () => {
  const n = hyp.ageComplement - hyp.age;
  proche(projeter(hyp, { rendements: Array(n).fill(0.05) }).couvert, projeter(hyp, { rendement: 0.05 }).couvert, 1e-12);
});
test('tirages : reproductibles, ordonnés, et sans volatilité égaux au calcul fixe', () => {
  const a = tirages(hyp, { rendement: 0.05 }, { nombre: 300 }), b = tirages(hyp, { rendement: 0.05 }, { nombre: 300 });
  assert.deepEqual(a.couverts, b.couverts);
  assert.ok(a.p10 <= a.p50 && a.p50 <= a.p90 && a.auMoins100 <= a.auMoins80);
  const fixe = tirages(hyp, { rendement: 0.05 }, { nombre: 20, volatilite: 1e-9 });
  proche(fixe.p50, projeter(hyp, { rendement: 0.05 }).couvert, 1e-6);
});

test('loyers SCPI après le départ : ils réduisent l\'écart, donc le besoin et les retraits de la réserve', () => {
  const h2 = { ...hyp, scpiApres: 100, taxeScpiApres: 0.3 };
  const a = projeter(hyp, { rendement: 0.05 }), b = projeter(h2, { rendement: 0.05 });
  proche(b.loyersNets, 70);
  proche(a.ecart - b.ecart, 70); proche(a.besoin - b.besoin, 70);
  assert.ok(b.couvert > a.couvert && b.besoinPont < a.besoinPont);
  proche(a.brut, b.brut); proche(a.principal, b.principal);
});
test('loyers SCPI : jamais plus que l\'écart, et coupés par l\'interrupteur', () => {
  const grands = projeter({ ...hyp, scpiApres: 5000, taxeScpiApres: 0 }, { rendement: 0.05 });
  assert.equal(grands.ecart, 0);
  const coupes = projeter({ ...hyp, scpiApres: 100, taxeScpiApres: 0.3, scpiActif: 0 }, { rendement: 0.05 });
  assert.equal(coupes.loyersNets, 0);
  proche(coupes.couvert, projeter({ ...hyp, scpiActif: 0 }, { rendement: 0.05 }).couvert, 1e-12);
});
test('épargne en moins : le versement ne devient jamais négatif', () => {
  const a = projeter(hyp, { rendement: 0.05, epargnePlus: -100 });
  const zero = projeter(hyp, { rendement: 0.05, epargnePlus: -100000 });
  assert.ok(a.principal < projeter(hyp, { rendement: 0.05 }).principal && a.couvert < projeter(hyp, { rendement: 0.05 }).couvert);
  // Plus aucun versement mensuel : restent le capital initial, les loyers réinvestis avant le départ et la part du fonds bloqué.
  proche(zero.principal, hyp.peaInitial + 12 * hyp.scpi * hyp.scpiActif * (hyp.ageDepart - hyp.age) + hyp.fpciMontant * (1 - hyp.fpciPartPont));
});
test('dépenses actuelles : le solveur trouve le plafond qui donne 100 %', () => {
  const base = 2300;
  const couv = (x) => projeter(hyp, { rendement: 0.05, epargnePlus: base - x }).couvert;
  const x = resoudre(couv, 1, 1000, 3800, false);
  assert.ok(x < base);
  proche(couv(x), 1, 1e-9);
});
