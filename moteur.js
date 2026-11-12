// Moteur de projection. Reprend à l'identique les formules de la feuille
// (onglets Projection, Résultats, Stress) : versements en fin d'année,
// capitalisation annuelle. Aucune donnée ici : tout vient de l'appelant.

export function mensualite(taux, n, capital) {
  if (n <= 0) return 0;
  if (taux === 0) return capital / n;
  return (capital * taux) / (1 - Math.pow(1 + taux, -n));
}

export function valeurActuelle(taux, n, mensuel) {
  if (taux === 0) return mensuel * n;
  return (mensuel * (1 - Math.pow(1 + taux, -n))) / taux;
}

// h : hypothèses. opt : { rendement, epargnePlus, choc, depenses, aide, ageDepart,
// ponctuelle: { montant, annee }, rendements: [taux de l'année 1, 2, …] }. Une dépense ponctuelle est prise sur la réserve (livrets).
export function projeter(h, opt = {}) {
  const rendement = opt.rendement ?? h.rdtPeaCentral;
  const epargnePlus = opt.epargnePlus ?? 0;
  const choc = opt.choc ?? 0;
  const depenses = opt.depenses ?? h.depenses;
  const aide = opt.aide ?? h.aide;
  const ageDepart = opt.ageDepart ?? h.ageDepart;
  const ponct = opt.ponctuelle && opt.ponctuelle.montant > 0 ? opt.ponctuelle : null;

  const horizon = h.ageComplement - h.age;
  const ecart = Math.max(0, depenses - h.pension);
  const besoin = ecart + aide;

  let pea = h.peaInitial;
  let principal = h.peaInitial;
  let pont = h.pontInitial ?? 0;
  let pontMin = null;
  let besoinPont = 0;
  const anneesReserveNegative = [];
  const serie = [{ n: 0, annee: h.annee, age: h.age, pea, pont, principal }];

  for (let n = 1; n <= horizon; n++) {
    const age = h.age + n;
    const actif = age - 1 < ageDepart;
    const retraite = age - 1 >= ageDepart && age - 1 < h.ageComplement;
    const versPea = actif ? (n <= h.dureePhase1 ? h.versPea1 : h.versPea2) + epargnePlus : 0;
    const loyers = actif ? h.scpi * h.scpiActif : 0;
    const versAnnee = 12 * (versPea + loyers);
    const versPont = actif ? 12 * h.versPont : 0;
    const fpci = h.fpciActif === 1 && n === h.fpciAnnee ? h.fpciMontant * (1 + h.fpciGain) : 0;
    const fpciPea = fpci * (1 - h.fpciPartPont);
    const fpciPont = fpci * h.fpciPartPont;
    const retrait = retraite ? ecart * 12 * Math.pow(1 + h.inflation, n) : 0;

    pea = pea * (1 + (opt.rendements ? opt.rendements[n - 1] : rendement)) + versAnnee + fpciPea;
    principal += versAnnee + fpciPea;
    const ponctuel = ponct && h.annee + n - 1 === ponct.annee ? ponct.montant : 0;
    const pontAvant = pont;
    pont = pont * (1 + h.rdtPont) + versPont + fpciPont - retrait - ponctuel;
    // Part du retrait de l'année que la réserve n'a pas pu payer
    const manque = retraite ? Math.min(retrait, Math.max(0, Math.max(0, -pont) - Math.max(0, -pontAvant))) : 0;
    if (!retraite && pont < 0) anneesReserveNegative.push(h.annee + n - 1);
    besoinPont += retrait;
    if (retraite) pontMin = pontMin === null ? pont : Math.min(pontMin, pont);
    serie.push({ n, annee: h.annee + n - 1, age, pea, pont, principal, versPea: versAnnee + fpciPea, versPont: versPont + fpciPont, retrait, manque, ponctuel });
  }

  const brut = pea * (1 - choc);
  const gains = Math.max(0, brut - principal);
  const net = brut - gains * h.ps;
  const reliquat = Math.max(0, pont);
  const total = net + reliquat;
  const inflationCumulee = Math.pow(1 + h.inflation, horizon);
  const totalAujourdhui = total / inflationCumulee;
  const tauxMensuel = Math.pow(1 + h.rdtReel, 1 / 12) - 1;
  const mois = h.dureeConso * 12;
  const revenu = mensualite(tauxMensuel, mois, totalAujourdhui);
  const couvert = besoin > 0 ? revenu / besoin : 1;
  const capitalNecessaire = valeurActuelle(tauxMensuel, mois, besoin);
  const ecartCapital = Math.max(0, capitalNecessaire - totalAujourdhui);

  // Épargne mensuelle à ajouter jusqu'au départ pour combler l'écart
  const annees = ageDepart - h.age;
  let epargneAAjouter = 0;
  if (ecartCapital > 0 && annees > 0) {
    const brutPourUn = rendement === 0
      ? annees
      : ((Math.pow(1 + rendement, annees) - 1) / rendement) * Math.pow(1 + rendement, horizon - annees);
    const netPourUn = brutPourUn - h.ps * Math.max(0, brutPourUn - annees);
    epargneAAjouter = (ecartCapital * inflationCumulee) / netPourUn / 12;
  }

  return {
    horizon, ecart, besoin, ageDepart, anneesReserveNegative, brut, principal, net, reliquat, total, totalAujourdhui,
    revenu, couvert, capitalNecessaire, ecartCapital, epargneAAjouter, rendement, gains, inflationCumulee, tauxMensuel, mois,
    pontFinal: pont, pontMin: pontMin ?? pont, besoinPont, pontCouvert: (pontMin ?? pont) >= 0,
    depassementPlafond: Math.max(0, principal - h.plafondPea * h.nbPea),
    serie,
  };
}

// Recherche par dichotomie de la valeur x (entre a et b) pour laquelle f(x) atteint la cible.
// f doit être monotone sur l'intervalle. Renvoie null si la cible est hors d'atteinte.
export function resoudre(f, cible, a, b, croissante = true) {
  const fa = f(a), fb = f(b);
  if (croissante ? (fa > cible || fb < cible) : (fa < cible || fb > cible)) return null;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fm < cible) === croissante) a = m; else b = m;
  }
  return (a + b) / 2;
}

// Générateur pseudo-aléatoire à graine fixe : les mêmes réglages donnent les mêmes tirages.
function generateur(graine) {
  let t = graine >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Tirages de trajectoires : rendement annuel du PEA aléatoire (loi log-normale, moyenne = rendement
// retenu, écart-type = volatilite). Le reste du modèle est inchangé. Hypothèse, pas une prévision.
export function tirages(h, opt = {}, { volatilite = 0.15, nombre = 1000, graine = 20261108 } = {}) {
  const moyenne = opt.rendement ?? h.rdtPeaCentral;
  const horizon = h.ageComplement - h.age;
  const sigma = Math.sqrt(Math.log(1 + (volatilite * volatilite) / ((1 + moyenne) * (1 + moyenne))));
  const mu = Math.log(1 + moyenne) - (sigma * sigma) / 2;
  const alea = generateur(graine);
  const normale = () => Math.sqrt(-2 * Math.log(1 - alea())) * Math.cos(2 * Math.PI * alea());
  const couverts = [];
  for (let k = 0; k < nombre; k++) {
    const rendements = Array.from({ length: horizon }, () => Math.exp(mu + sigma * normale()) - 1);
    couverts.push(projeter(h, { ...opt, rendements }).couvert);
  }
  couverts.sort((x, y) => x - y);
  const centile = (q) => couverts[Math.min(nombre - 1, Math.floor(q * nombre))];
  const part = (seuil) => couverts.filter((c) => c >= seuil).length / nombre;
  return { couverts, p10: centile(0.1), p50: centile(0.5), p90: centile(0.9), auMoins100: part(0.995), auMoins80: part(0.8), volatilite, nombre };
}
