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
// ponctuelle: { montant, annee } }. Une dépense ponctuelle est prise sur la réserve (livrets).
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

    pea = pea * (1 + rendement) + versAnnee + fpciPea;
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
    revenu, couvert, capitalNecessaire, ecartCapital, epargneAAjouter,
    pontFinal: pont, pontMin: pontMin ?? pont, besoinPont, pontCouvert: (pontMin ?? pont) >= 0,
    depassementPlafond: Math.max(0, principal - h.plafondPea * h.nbPea),
    serie,
  };
}
