import { projeter } from './moteur.js';
import { dechiffrer } from './coffre.js';

const racine = document.getElementById('app');
const CLE_PHRASE = 'horizon.phrase';
const etat = { donnees: null, ecran: 'accueil', scenario: 'central', sim: null };
const grand = window.matchMedia('(min-width: 960px)');
let graphe = null;

// ---------- outils ----------
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const euro = (x) => `${nf.format(Math.round(x))} €`;
const signe = (x) => `${x >= 0 ? '+' : '−'} ${nf.format(Math.abs(Math.round(x)))} €`;
const pct = (x) => `${nf.format(Math.round(x * 100))} %`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLongue = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateCourte = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const POSTES = [
  ['comptes', 'Comptes', '#1F3864'],
  ['livrets', 'Livrets', '#3F5F9A'],
  ['btc', 'Bitcoin', '#B45309'],
  ['scpi', 'SCPI', '#6E8FC9'],
  ['pea', 'PEA', '#1E7B45'],
  ['av', 'Assurance-vie', '#5E9C76'],
  ['parts', 'Parts sociales', '#9AA6B6'],
];
const total = (r) => POSTES.reduce((s, [k]) => s + (r[k] || 0), 0);
const RENDEMENTS = { prudent: 'rdtPeaPrudent', central: 'rdtPeaCentral', optimiste: 'rdtPeaOptimiste' };
const rendement = (nom) => etat.donnees.hyp[RENDEMENTS[nom]];
const couleurCouv = (c) => (c >= 0.995 ? 'var(--vert)' : 'var(--ambre)');

function courbe(valeurs, { l = 340, h = 64, couleur = '#fff', aire = null, etiquette }) {
  if (valeurs.length < 2) return `<p class="petit">Courbe disponible à partir du deuxième relevé.</p>`;
  // Échelle honnête : une variation de moins de 5 % ne remplit pas toute la hauteur.
  const vMin = Math.min(...valeurs), vMax = Math.max(...valeurs);
  const e = Math.max(vMax - vMin, 0.05 * vMax) || 1, min = (vMin + vMax) / 2 - e / 2;
  const pts = valeurs.map((v, i) => [(i / (valeurs.length - 1)) * l, h - 6 - ((v - min) / e) * (h - 14)]);
  const ligne = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const fin = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${l} ${h}" role="img" aria-label="${esc(etiquette)}">
    ${aire ? `<polygon points="0,${h} ${ligne} ${l},${h}" fill="${aire}"/>` : ''}
    <polyline points="${ligne}" fill="none" stroke="${couleur}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${fin[0].toFixed(1)}" cy="${fin[1].toFixed(1)}" r="4" fill="#F2B21A"/></svg>`;
}

const ICONES = {
  accueil: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  simuler: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  patrimoine: '<path d="M12 3v9h9"/><circle cx="12" cy="12" r="9"/>',
  echeances: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
const NOMS = { accueil: 'Accueil', simuler: 'Simuler', patrimoine: 'Patrimoine', echeances: 'Échéances' };

// ---------- écrans ----------
function ecranAccueil(d) {
  const s = d.suivi, dernier = s[s.length - 1], avant = s[s.length - 2];
  const p = projeter(d.hyp, { rendement: rendement(etat.scenario) });
  const delta = avant ? total(dernier) - total(avant) : null;
  const alertes = [...(d.alertes || [])];
  if (!p.pontCouvert) alertes.unshift({ niveau: 'attention', texte: `La réserve de ${d.hyp.ageDepart} à ${d.hyp.ageComplement} ans s'épuise avant la fin (manque ${euro(-p.pontMin)}).` });
  return `
  <section class="hero">
    <div class="rangee" style="align-items:center">
      <div class="sous">Relevé du ${esc(dateLongue(d.releve))}</div>
      <div class="pastille">${s.length} relevé${s.length > 1 ? 's' : ''}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      <div class="sous">Patrimoine mobilisable</div>
      <div class="chiffre" style="font-size:42px;letter-spacing:-1px">${euro(total(dernier))}</div>
      <div class="sous">${delta === null ? '' : `${signe(delta)} depuis le relevé précédent · `}hors fonds bloqué et dette</div>
    </div>
    ${courbe(s.map(total), { etiquette: 'Évolution du patrimoine mobilisable, relevé après relevé' })}
  </section>
  <div class="pad" style="padding-top:18px">
    <div class="segments" style="grid-template-columns:repeat(3,minmax(0,1fr))" role="group" aria-label="Rendement supposé des actions">
      ${Object.keys(RENDEMENTS).map((n) => `<button type="button" data-scenario="${n}" aria-pressed="${etat.scenario === n}">${n[0].toUpperCase() + n.slice(1)} ${pct(rendement(n))}</button>`).join('')}
    </div>
    <div class="carte">
      <div class="rangee"><h2 style="font-size:14px;font-weight:600">Après ${d.hyp.ageComplement} ans</h2><div class="petit">rendement ${etat.scenario}</div></div>
      <div style="display:flex;align-items:baseline;gap:10px">
        <div class="chiffre" style="font-size:34px;color:${couleurCouv(p.couvert)}">${pct(p.couvert)}</div><div class="sous">du besoin couvert</div>
      </div>
      <div class="barre"><div style="width:${Math.min(100, p.couvert * 100).toFixed(1)}%;background:${couleurCouv(p.couvert)}"></div></div>
      <div class="sous">${euro(p.revenu)} soutenables pour ${euro(p.besoin)} visés par mois, en euros d'aujourd'hui</div>
    </div>
    <div class="grille2">
      <div class="carte" style="gap:6px;padding:16px">
        <div class="petit">De ${d.hyp.ageDepart} à ${d.hyp.ageComplement} ans</div>
        <div class="chiffre" style="font-size:20px;color:${p.pontCouvert ? 'var(--vert)' : 'var(--ambre)'}">${p.pontCouvert ? 'Couvert' : `Manque ${euro(-p.pontMin)}`}</div>
        <div class="petit">réserve livrets et fonds euros</div>
      </div>
      <div class="carte" style="gap:6px;padding:16px">
        <div class="petit">Épargne à ajouter</div>
        <div class="chiffre marine" style="font-size:20px">${p.epargneAAjouter > 0 ? `+ ${euro(p.epargneAAjouter)}/mois` : 'Aucune'}</div>
        <div class="petit">${p.epargneAAjouter > 0 ? 'pour atteindre 100 %' : 'objectif atteint'}</div>
      </div>
    </div>
    ${alertes.length ? `<div class="carte" style="gap:10px;padding:16px 18px">
      <h2 style="font-size:14px;font-weight:600">À surveiller</h2>
      ${alertes.map((a) => `<div class="ligne"><div class="point" style="background:${a.niveau === 'attention' ? 'var(--ambre)' : 'var(--marine)'}"></div><div>${esc(a.texte)}</div></div>`).join('')}
    </div>` : ''}
    <button type="button" class="bouton" data-aller="simuler">Tester un scénario</button>
    ${d.feuille ? controleFeuille(d) : ''}
  </div>`;
}

// Le moteur doit retrouver les résultats de la feuille : sinon, on le dit.
function controleFeuille(d) {
  const p = projeter(d.hyp, { rendement: d.hyp.rdtPeaCentral });
  const ecart = Math.abs(p.couvert - d.feuille.couvertCentral);
  return ecart < 0.002
    ? `<p class="petit" style="text-align:center">Calcul conforme à la feuille finance.</p>`
    : `<p class="petit" style="text-align:center;color:#B3261E">Écart avec la feuille finance : ${pct(p.couvert)} ici, ${pct(d.feuille.couvertCentral)} dans la feuille. À signaler.</p>`;
}

function simParDefaut(d) {
  return { epargnePlus: 0, depenses: d.hyp.depenses, aide: d.hyp.aide, scenario: 'central', choc: 0,
    ageDepart: d.hyp.ageDepart, ponctMontant: 0, ponctAnnee: d.hyp.annee + 1, reel: false };
}
const options = (s) => ({ rendement: rendement(s.scenario), epargnePlus: s.epargnePlus, depenses: s.depenses, aide: s.aide,
  choc: s.choc, ageDepart: s.ageDepart, ponctuelle: { montant: s.ponctMontant, annee: s.ponctAnnee } });
const NOTE_SIM = (h) => `Les rendements sont des hypothèses, pas des prévisions. Pour un départ après ${h.ageDepart} ans, la pension reste celle d'un départ à ${h.ageDepart} ans, faute de simulation officielle : le résultat est prudent.`;

function ecranSimuler(d) {
  const { s, h, ref, p } = simuler(d);
  const dpts = Math.round((p.couvert - ref.couvert) * 100);
  const L = 320, H = 110;
  const capRef = ref.serie.map((x) => x.pea + Math.max(0, x.pont));
  const cap = p.serie.map((x, i) => (i === p.serie.length - 1 ? x.pea * (1 - s.choc) : x.pea) + Math.max(0, x.pont));
  const max = Math.max(...capRef, ...cap) || 1;
  const trace = (v) => v.map((y, i) => `${((i / (v.length - 1)) * L).toFixed(1)},${(H - 4 - (y / max) * (H - 12)).toFixed(1)}`).join(' ');
  const xDepart = ((p.ageDepart - h.age) / (h.ageComplement - h.age)) * L;
  const depMin = Math.max(Math.ceil(h.pension / 50) * 50, Math.round((h.depenses * 0.75) / 50) * 50);
  return `
  <div class="entete"><h1>Simuler</h1><p class="sous">Bougez un réglage, le résultat suit. Rien n'est enregistré.</p></div>
  <div class="pad">
    <div class="carte" style="background:var(--marine);color:#fff;gap:10px">
      <div class="rangee"><div class="sous" style="color:var(--clair)">Besoin couvert après ${h.ageComplement} ans</div><div class="petit" style="color:var(--clair)">référence ${pct(ref.couvert)}</div></div>
      <div style="display:flex;align-items:baseline;gap:10px">
        <div class="chiffre" style="font-size:40px" id="sim-couvert">${pct(p.couvert)}</div>
        <div style="font-size:14px;font-weight:600;color:var(--or)">${dpts === 0 ? 'comme la référence' : `${dpts > 0 ? '+' : '−'} ${Math.abs(dpts)} point${Math.abs(dpts) > 1 ? 's' : ''}`}</div>
      </div>
      <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Capital projeté jusqu'à ${h.ageComplement} ans : simulation en trait plein, référence en pointillés">
        <line x1="0" y1="${H - 1}" x2="${L}" y2="${H - 1}" stroke="#3D5A91"/>
        <line x1="${xDepart.toFixed(1)}" y1="0" x2="${xDepart.toFixed(1)}" y2="${H}" stroke="#F2B21A" stroke-width="1.5"/>
        <polyline points="${trace(capRef)}" fill="none" stroke="#9FB3D6" stroke-width="2" stroke-dasharray="5 5"/>
        <polyline points="${trace(cap)}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="rangee petit" style="color:var(--clair)"><span>${h.age} ans</span><span style="color:var(--or);font-weight:600">départ ${p.ageDepart} ans</span><span>${h.ageComplement} ans</span></div>
      <div class="petit" style="color:var(--clair)">${euro(p.revenu)} soutenables pour ${euro(p.besoin)} visés par mois · réserve ${p.ageDepart}-${h.ageComplement} ans : ${p.pontCouvert ? 'couverte' : `manque ${euro(-p.pontMin)}`}</div>
    </div>
    ${revenusParAge(d, true)}
    <div class="carte" style="gap:16px;padding:16px 18px">
      ${reglage('epargnePlus', 'Épargne en plus chaque mois', s.epargnePlus, 0, 1500, 25, (v) => `+ ${euro(v)}`)}
      ${reglage('depenses', 'Dépenses à la retraite', s.depenses, depMin, Math.round((h.depenses * 1.4) / 50) * 50, 50, (v) => `${euro(v)}/mois`)}
      ${reglage('aide', `Aide et adaptation après ${h.ageComplement} ans`, s.aide, 0, 3000, 50, (v) => `${euro(v)}/mois`)}
      ${reglagesPlus(d)}
    </div>
    <div class="reglage">
      <div style="font-size:13px;font-weight:500">Rendement supposé des actions</div>
      <div class="segments" style="grid-template-columns:repeat(3,minmax(0,1fr))" role="group" aria-label="Rendement supposé des actions">
        ${Object.keys(RENDEMENTS).map((n) => `<button type="button" data-sim-scenario="${n}" aria-pressed="${s.scenario === n}">${n[0].toUpperCase() + n.slice(1)} ${pct(rendement(n))}</button>`).join('')}
      </div>
    </div>
    <div class="reglage">
      <div style="font-size:13px;font-weight:500">Krach juste avant ${h.ageComplement} ans</div>
      <div class="segments" style="grid-template-columns:repeat(4,minmax(0,1fr))" role="group" aria-label="Krach juste avant le début du complément">
        ${[0, 0.1, 0.2, 0.35].map((c) => `<button type="button" data-choc="${c}" aria-pressed="${s.choc === c}">${c === 0 ? 'Aucun' : `− ${pct(c)}`}</button>`).join('')}
      </div>
      <p class="petit">${NOTE_SIM(h)}</p>
    </div>
    <button type="button" class="bouton creux" data-raz>Revenir à la référence</button>
  </div>`;
}

function reglage(cle, libelle, valeur, min, max, pas, fmt) {
  return `<div class="reglage"><div class="rangee"><label for="r-${cle}">${esc(libelle)}</label><output for="r-${cle}">${fmt(valeur)}</output></div>
    <input id="r-${cle}" type="range" data-reglage="${cle}" min="${min}" max="${max}" step="${pas}" value="${valeur}"></div>`;
}

function ecranPatrimoine(d) {
  const s = d.suivi, r = s[s.length - 1], avant = s[s.length - 2], t = total(r);
  const postes = POSTES.filter(([k]) => (r[k] || 0) > 0).sort((a, b) => r[b[0]] - r[a[0]]);
  const gainBtc = d.btc && d.btc.verse ? r.btc / d.btc.verse - 1 : null;
  return `
  <div class="entete"><h1>Patrimoine</h1><p class="sous">Relevé du ${esc(dateLongue(d.releve))}</p></div>
  <div class="pad">
    <div class="carte">
      <div class="rangee"><div class="sous">Mobilisable</div><div class="chiffre marine" style="font-size:26px">${euro(t)}</div></div>
      <div style="display:flex;height:14px;border-radius:999px;overflow:hidden;gap:2px" role="img" aria-label="Répartition : ${postes.map(([k, n]) => `${n} ${pct(r[k] / t)}`).join(', ')}">
        ${postes.map(([k, , c]) => `<div style="width:${((r[k] / t) * 100).toFixed(2)}%;background:${c}"></div>`).join('')}
      </div>
      <p class="petit">Hors fonds bloqué et hors dette, affichés à part plus bas.</p>
    </div>
    <div class="carte" style="padding:6px 18px;gap:0">
      ${postes.map(([k, n, c]) => {
        const dl = avant ? r[k] - (avant[k] || 0) : 0;
        const note = k === 'btc' && gainBtc !== null ? `<span class="petit" style="color:${gainBtc >= 0 ? 'var(--vert)' : 'var(--ambre)'}">${gainBtc >= 0 ? '+' : '−'} ${pct(Math.abs(gainBtc))} depuis l'achat</span>`
          : `<span class="petit">${Math.abs(dl) >= 1 ? `${signe(dl)} depuis le relevé précédent` : `${r[k] / t < 0.01 ? 'moins de 1 %' : pct(r[k] / t)} du total`}</span>`;
        return `<div class="poste"><div class="puce" style="background:${c}"></div><div class="nom">${n}${note}</div><div class="val">${euro(r[k])}</div></div>`;
      }).join('')}
    </div>
    <div class="grille2">
      <div class="carte douce" style="gap:6px;padding:16px"><div class="petit">Fonds bloqué (FPCI)</div><div class="chiffre" style="font-size:18px">${euro(r.fpci || 0)}</div><div class="petit">au coût, valeur réelle inconnue</div></div>
      <div class="carte douce" style="gap:6px;padding:16px"><div class="petit">Dette restante</div><div class="chiffre" style="font-size:18px">${euro(r.dette || 0)}</div><div class="petit">jamais retranchée du total</div></div>
    </div>
    <div class="carte" style="gap:10px;padding:16px 18px">
      <div class="rangee"><h2 style="font-size:14px;font-weight:600">Évolution</h2><div class="petit">${s.length > 1 ? `depuis le ${esc(dateCourte(s[0].date))}` : ''}</div></div>
      ${courbe(s.map(total), { h: 80, couleur: '#1F3864', aire: '#E3E9F4', etiquette: 'Patrimoine mobilisable relevé après relevé' })}
    </div>
    ${engagements(d)}
  </div>`;
}

function ecranEcheances(d) {
  const auj = new Date(); auj.setHours(12, 0, 0, 0);
  const liste = (d.echeances || []).filter((e) => new Date(`${e.date}T12:00:00`) >= auj || e.garder).slice(0, 8);
  const r = d.suivi[d.suivi.length - 1];
  const jauges = {
    btc: () => { if (!d.btc || !d.btc.seuilVente) return ''; const f = Math.min(1, r.btc / d.btc.seuilVente);
      return `<div class="barre" style="height:8px;margin-top:4px"><div style="width:${(f * 100).toFixed(1)}%;background:var(--ambre)"></div></div><div class="petit">${pct(f)} du seuil de vente atteint</div>`; },
    matelas: () => (d.matelasMois == null ? '' : `<div class="petit" style="font-weight:600;color:${d.matelasMois >= 6 ? 'var(--vert)' : 'var(--ambre)'}">${d.matelasMois >= 6 ? 'Tenue' : 'En dessous'} : ${d.matelasMois.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois</div>`),
  };
  return `
  <div class="entete"><h1>Échéances</h1><p class="sous">Ce qui arrive, et les règles que nous nous sommes fixées.</p></div>
  <div class="pad">
    <div class="carte" style="gap:0">
      ${liste.length ? liste.map((e, i) => {
        const dt = new Date(`${e.date}T12:00:00`), jours = Math.round((dt - auj) / 864e5);
        const proche = jours <= 60, moyen = jours <= 1100;
        const couleur = proche ? 'var(--ambre)' : moyen ? 'var(--marine)' : 'var(--bord)';
        const quand = proche ? `${dateCourte(e.date)} · ${jours <= 0 ? "aujourd'hui" : `dans ${jours} jour${jours > 1 ? 's' : ''}`}` : dt.toLocaleDateString('fr-FR', moyen ? { month: 'long', year: 'numeric' } : { year: 'numeric' });
        return `<div class="frise"><div class="rail"><div class="rond" style="background:${couleur}"></div>${i < liste.length - 1 ? '<div class="fil"></div>' : ''}</div>
          <div class="corps"><div style="font-size:12px;font-weight:600;color:${proche ? 'var(--ambre)' : moyen ? 'var(--marine)' : 'var(--gris)'}">${esc(quand[0].toUpperCase() + quand.slice(1))}</div>
          <div style="font-size:14px;font-weight:500">${esc(e.titre)}</div>${e.note ? `<div class="petit">${esc(e.note)}</div>` : ''}</div></div>`;
      }).join('') : '<p class="sous">Aucune échéance à venir.</p>'}
    </div>
    <div class="carte" style="padding:16px 18px">
      <h2 style="font-size:14px;font-weight:600">Nos règles</h2>
      ${(d.regles || []).map((g, i) => `${i ? '<div style="height:1px;background:var(--trait)"></div>' : ''}<div style="display:flex;flex-direction:column;gap:4px">
        <div style="font-size:13px;font-weight:500">${esc(g.titre)}</div><div class="sous">${esc(g.texte)}</div>${g.jauge && jauges[g.jauge] ? jauges[g.jauge]() : ''}</div>`).join('')}
    </div>
    ${horloges(d)}
    <button type="button" class="lien" data-oublier>Verrouiller l'application sur cet appareil</button>
  </div>`;
}

const ECRANS = { accueil: ecranAccueil, simuler: ecranSimuler, patrimoine: ecranPatrimoine, echeances: ecranEcheances };

// ---------- grand écran ----------
const PAGES = { accueil: 'Tableau de bord', projection: 'Projection', patrimoine: 'Patrimoine', echeances: 'Échéances et budget' };
const ICONES_G = { ...ICONES, projection: '<path d="M4 20V4M4 20h16M8 16l4-5 3 3 5-7"/>' };

function simuler(d) {
  if (!etat.sim) etat.sim = simParDefaut(d);
  const s = etat.sim, h = d.hyp;
  const derniere = h.annee + (s.ageDepart - h.age) - 1;
  if (s.ponctAnnee > derniere) s.ponctAnnee = derniere;
  return { s, h, ref: projeter(h, { rendement: h.rdtPeaCentral }), p: projeter(h, options(s)) };
}

function reglagesPlus(d) {
  const { s, h } = simuler(d);
  const annees = [];
  for (let a = h.annee; a < h.annee + (s.ageDepart - h.age); a++) annees.push(a);
  return `<div class="reglage"><div style="font-size:13px;font-weight:500">Âge de départ</div>
      <div class="segments" style="grid-template-columns:repeat(3,minmax(0,1fr))" role="group" aria-label="Âge de départ">
        ${[0, 1, 2].map((k) => `<button type="button" data-age="${h.ageDepart + k}" aria-pressed="${s.ageDepart === h.ageDepart + k}">${h.ageDepart + k} ans</button>`).join('')}</div></div>
    <div class="reglage"><div class="rangee"><label for="r-ponctMontant">Dépense ponctuelle, prise sur les livrets</label><output for="r-ponctMontant">${s.ponctMontant ? euro(s.ponctMontant) : 'aucune'}</output></div>
      <input id="r-ponctMontant" type="range" data-reglage="ponctMontant" min="0" max="40000" step="500" value="${s.ponctMontant}">
      <div class="rangee" style="align-items:center"><label for="r-ponctAnnee" class="petit">Année de la dépense</label>
        <select id="r-ponctAnnee" data-reglage="ponctAnnee" class="choix">${annees.map((a) => `<option value="${a}" ${a === s.ponctAnnee ? 'selected' : ''}>${a}</option>`).join('')}</select></div></div>`;
}

// Revenus mensuels par âge, en euros d'aujourd'hui : pension, réserve, complément, manque.
function revenusParAge(d, compact = false) {
  const { s, h, p } = simuler(d);
  const fin = h.ageComplement + h.dureeConso, barres = [];
  for (let a = p.ageDepart; a < fin; a++) {
    if (a < h.ageComplement) {
      const x = p.serie[a - h.age + 1], defl = Math.pow(1 + h.inflation, x.n) * 12;
      barres.push({ a, pension: h.pension, reserve: (x.retrait - x.manque) / defl, complement: 0, manque: x.manque / defl, besoin: h.pension + p.ecart });
    } else {
      barres.push({ a, pension: h.pension, reserve: 0, complement: Math.min(p.revenu, p.besoin), manque: Math.max(0, p.besoin - p.revenu), besoin: h.pension + p.besoin });
    }
  }
  const L = compact ? 320 : 820, H = compact ? 150 : 260, ml = compact ? 0 : 58, mt = 8, mb = 22;
  const max = Math.ceil(Math.max(...barres.map((b) => b.besoin)) / 500) * 500;
  const lb = (L - ml) / barres.length, Y = (v) => mt + (1 - v / max) * (H - mt - mb);
  const COUL = { pension: '#1F3864', reserve: '#6E8FC9', complement: '#1E7B45', manque: '#F3C9A0' };
  let rects = '', ligne = '', etiq = '';
  barres.forEach((b, i) => {
    let bas = 0;
    for (const k of ['pension', 'reserve', 'complement', 'manque']) {
      if (b[k] > 0.5) rects += `<rect x="${(ml + i * lb + 0.5).toFixed(1)}" y="${Y(bas + b[k]).toFixed(1)}" width="${(lb - 1).toFixed(1)}" height="${(Y(bas) - Y(bas + b[k])).toFixed(1)}" fill="${COUL[k]}"/>`;
      bas += b[k];
    }
    ligne += `${i ? ' ' : ''}${(ml + i * lb).toFixed(1)},${Y(b.besoin).toFixed(1)} ${(ml + (i + 1) * lb).toFixed(1)},${Y(b.besoin).toFixed(1)}`;
    if (b.a % 5 === 0 || (i === 0 && !compact && b.a % 5 < 4)) etiq += `<text x="${(ml + (i + 0.5) * lb).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#5B6675">${b.a}</text>`;
  });
  let grille = '';
  if (!compact) for (let v = 0; v <= max; v += max > 4000 ? 1000 : 500) grille += `<line x1="${ml}" x2="${L}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#E6EAF0"/><text x="${ml - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5B6675">${nf.format(v)} €</text>`;
  const avant = barres.filter((b) => b.a < h.ageComplement && b.manque > 1), apres = barres[barres.length - 1];
  const lecture = [
    avant.length ? `De ${avant[0].a} à ${h.ageComplement} ans, la réserve ne suffit pas : il manque jusqu'à ${euro(Math.max(...avant.map((b) => b.manque)))} par mois.` : `De ${p.ageDepart} à ${h.ageComplement} ans, pension et réserve couvrent les dépenses.`,
    apres.manque > 1 ? `Après ${h.ageComplement} ans, il manque ${euro(apres.manque)} par mois sur ${euro(apres.besoin)}.` : `Après ${h.ageComplement} ans, les dépenses sont couvertes.`,
  ].join(' ');
  return `<div class="carte" style="gap:10px">
    <div class="rangee"><h2 style="font-size:14px;font-weight:600">Revenus par âge</h2><div class="petit">par mois, euros d'aujourd'hui${compact ? '' : ' · avec les réglages du simulateur'}</div></div>
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Revenus mensuels de ${p.ageDepart} à ${fin - 1} ans : pension, réserve, complément tiré du capital, et manque par rapport aux dépenses. ${esc(lecture)}">
      ${grille}${rects}<polyline points="${ligne}" fill="none" stroke="#1B2430" stroke-width="1.5"/>${etiq}</svg>
    <div class="legende"><span><i style="background:${COUL.pension}"></i>Pension</span><span><i style="background:${COUL.reserve}"></i>Réserve</span><span><i style="background:${COUL.complement}"></i>Complément tiré du capital</span><span><i style="background:${COUL.manque}"></i>Manque</span><span><i style="background:#1B2430;height:2px"></i>Dépenses</span></div>
    <p class="sous">${lecture}</p></div>`;
}

function reserveGraphique(d) {
  const { h, p } = simuler(d);
  const pts = p.serie, L = 820, H = 200, ml = 58, mr = 30, mt = 10, mb = 26, n = pts.length - 1;
  const v = pts.map((x) => x.pont), haut = Math.max(...v, 1), bas = Math.min(...v, 0);
  const pas = [5000, 10000, 20000, 25000, 50000, 100000].find((q) => (haut - bas) / q <= 6) || 200000;
  const max = Math.ceil(haut / pas) * pas, min = Math.floor(bas / pas) * pas;
  const X = (i) => ml + (i / n) * (L - ml - mr), Y = (y) => mt + (1 - (y - min) / (max - min)) * (H - mt - mb);
  let grille = '', ages = '';
  for (let y = min; y <= max; y += pas) grille += `<line x1="${ml}" x2="${L - mr}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" stroke="${y === 0 ? '#5B6675' : '#E6EAF0'}"/><text x="${ml - 8}" y="${(Y(y) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5B6675">${nf.format(y / 1000)} k€</text>`;
  for (let i = 0; i <= n; i++) if (i === 0 || i === n || ((h.age + i) % 5 === 0 && i > 2 && i < n - 2)) ages += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#5B6675">${h.age + i} ans</text>`;
  const trace = v.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const vide = pts.find((x) => x.age - 1 >= p.ageDepart && x.pont < 0);
  const xd = X(p.ageDepart - h.age);
  const lecture = vide ? `La réserve est épuisée à ${vide.age - 1} ans ; il manque ${euro(-p.pontMin)} au total avant ${h.ageComplement} ans.`
    : p.anneesReserveNegative.length ? `La dépense ponctuelle entame la réserve de sécurité de ${p.anneesReserveNegative[0]} à ${p.anneesReserveNegative[p.anneesReserveNegative.length - 1]}, puis la réserve tient jusqu'à ${h.ageComplement} ans.`
    : `La réserve tient jusqu'à ${h.ageComplement} ans ; il en reste ${euro(p.reliquat)} qui s'ajoutent au capital.`;
  return `<div class="carte" style="gap:10px"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Réserve en livrets et fonds euros</h2><div class="petit">solde en fin d'année, euros courants</div></div>
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Solde de la réserve de ${h.age} à ${h.ageComplement} ans. ${esc(lecture)}">${grille}
      <line x1="${xd.toFixed(1)}" x2="${xd.toFixed(1)}" y1="${mt}" y2="${H - mb}" stroke="#B45309" stroke-width="1.5" stroke-dasharray="3 4"/>
      <polyline points="${trace}" fill="none" stroke="${vide ? '#B3261E' : '#1F3864'}" stroke-width="2.5" stroke-linejoin="round"/>${ages}</svg>
    <p class="sous">${lecture}</p></div>`;
}

function sensibilite(d) {
  const h = d.hyp, base = projeter(h, { rendement: h.rdtPeaCentral });
  const cas = [
    ['+ 100 € d\'épargne par mois', { epargnePlus: 100 }],
    ['− 100 € de dépenses par mois à la retraite', { depenses: h.depenses - 100 }],
    [`Départ à ${h.ageDepart + 1} ans au lieu de ${h.ageDepart}`, { ageDepart: h.ageDepart + 1 }],
    ['+ 1 point de rendement des actions', { rendement: h.rdtPeaCentral + 0.01 }],
    ['− 1 point de rendement des actions', { rendement: h.rdtPeaCentral - 0.01 }],
    [`Dépense de 10 000 € en ${h.annee + 1}`, { ponctuelle: { montant: 10000, annee: h.annee + 1 } }],
    [`Krach de 20 % juste avant ${h.ageComplement} ans`, { choc: 0.2 }],
  ].map(([nom, o]) => { const p = projeter(h, { rendement: h.rdtPeaCentral, ...o }); return { nom, delta: (p.couvert - base.couvert) * 100, couvert: p.couvert }; })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const maxi = Math.max(...cas.map((c) => Math.abs(c.delta))) || 1;
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Ce qui pèse le plus</h2><div class="petit">effet sur la part du besoin couverte après ${h.ageComplement} ans (référence ${pct(base.couvert)})</div></div>
    <table class="tab"><tbody>${cas.map((c) => `<tr><td>${esc(c.nom)}</td>
      <td style="width:34%"><div style="height:8px;border-radius:999px;background:${c.delta >= 0 ? 'var(--vert)' : 'var(--ambre)'};width:${Math.max(2, (Math.abs(c.delta) / maxi) * 100).toFixed(0)}%;margin-left:auto"></div></td>
      <td style="color:${c.delta >= 0 ? 'var(--vert)' : 'var(--ambre)'};font-weight:600">${c.delta >= 0 ? '+' : '−'} ${Math.abs(c.delta).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt</td><td>${pct(c.couvert)}</td></tr>`).join('')}</tbody></table>
    <p class="petit">Chaque ligne change un seul réglage par rapport à la référence. Les effets ne s'additionnent pas exactement.</p></div>`;
}

// PEA réel (relevés) contre PEA prévu par le plan à la même date.
function trajectoire(d) {
  const h = d.hyp, ref = projeter(h, { rendement: h.rdtPeaCentral }).serie;
  const jour = (iso) => new Date(`${iso}T12:00:00`).getTime();
  const debut = jour(d.debutModele || d.suivi[0].date);
  const reperes = ref.map((x, i) => [i === 0 ? debut : jour(`${x.annee}-12-31`), x.pea]);
  const prevu = (t) => {
    if (t <= reperes[0][0]) return reperes[0][1];
    for (let i = 1; i < reperes.length; i++) if (t <= reperes[i][0]) { const [t0, v0] = reperes[i - 1], [t1, v1] = reperes[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
    return reperes[reperes.length - 1][1];
  };
  const lignes = d.suivi.map((r) => ({ date: r.date, reel: r.pea || 0, prevu: prevu(jour(r.date)) }));
  const der = lignes[lignes.length - 1], ecart = der.reel - der.prevu;
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Suis-je sur la trajectoire ?</h2><div class="petit">PEA réel contre PEA prévu par le plan, rendement central</div></div>
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><div class="chiffre" style="font-size:28px;color:${ecart >= 0 ? 'var(--vert)' : 'var(--ambre)'}">${ecart >= 0 ? 'En avance' : 'En retard'} de ${euro(Math.abs(ecart))}</div>
      <div class="sous">réel ${euro(der.reel)} · prévu ${euro(der.prevu)} au ${esc(dateCourte(der.date))}</div></div>
    <div class="defile"><table class="tab"><thead><tr><th>Relevé</th><th>PEA réel</th><th>PEA prévu</th><th>Écart</th></tr></thead><tbody>
      ${[...lignes].reverse().slice(0, 8).map((l) => `<tr><td>${esc(dateCourte(l.date))}</td><td>${euro(l.reel)}</td><td>${euro(l.prevu)}</td><td style="color:${l.reel >= l.prevu ? 'var(--vert)' : 'var(--ambre)'}">${signe(l.reel - l.prevu)}</td></tr>`).join('')}</tbody></table></div>
    <p class="petit">Le plan compte dès le premier jour le capital de départ prévu pour le PEA : tant que ce versement n'est pas fait, l'écart lui correspond. Seul le PEA est comparé ; les livrets ne sont pas suivis par le plan.</p></div>`;
}

function engagements(d) {
  const e = d.engagements;
  if (!e) return '';
  return `<div class="carte"><h2 style="font-size:14px;font-weight:600">Liquidités et engagements</h2>
    <table class="tab"><tbody><tr><td>Liquidités disponibles</td><td>${euro(e.liquidites)}</td></tr>
    ${e.lignes.map((l) => `<tr><td>${esc(l.libelle)}</td><td>− ${euro(l.montant)}</td></tr>`).join('')}
    <tr><td><b>Reste après engagements</b></td><td><b>${euro(e.reste)}</b></td></tr></tbody></table>
    ${e.note ? `<p class="petit">${esc(e.note)}</p>` : ''}</div>`;
}

function horloges(d) {
  if (!d.horloges || !d.horloges.length) return '';
  const auj = Date.now();
  return `<div class="carte" style="padding:16px 18px"><h2 style="font-size:14px;font-weight:600">Horloges fiscales</h2>
    ${d.horloges.map((x) => {
      const t0 = new Date(`${x.debut}T12:00:00`), t1 = new Date(t0); t1.setFullYear(t1.getFullYear() + x.dureeAns);
      const f = Math.max(0, Math.min(1, (auj - t0) / (t1 - t0))), resteMois = Math.max(0, Math.round((t1 - auj) / (864e5 * 30.44)));
      return `<div style="display:flex;flex-direction:column;gap:5px"><div class="rangee"><div style="font-size:13px;font-weight:500">${esc(x.libelle)}</div><div class="petit">${x.dureeAns} ans le ${esc(dateCourte(t1.toISOString().slice(0, 10)))}</div></div>
        <div class="barre" style="height:8px"><div style="width:${(f * 100).toFixed(1)}%;background:${f >= 1 ? 'var(--vert)' : 'var(--marine)'}"></div></div>
        <div class="petit">${f >= 1 ? 'Durée atteinte' : `encore ${resteMois >= 24 ? `${Math.floor(resteMois / 12)} ans et ${resteMois % 12} mois` : `${resteMois} mois`}`}${x.note ? ` · ${esc(x.note)}` : ''}</div></div>`;
    }).join('')}</div>`;
}

const CLE_SCENARIOS = 'horizon.scenarios';
function lireScenarios() { try { return JSON.parse(localStorage.getItem(CLE_SCENARIOS)) || []; } catch { return []; } }
function ecrireScenarios(l) { try { localStorage.setItem(CLE_SCENARIOS, JSON.stringify(l)); } catch { /* stockage indisponible */ } }
function scenariosEnregistres(d) {
  const liste = lireScenarios();
  return `<div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--trait);padding-top:14px">
    <div style="font-size:13px;font-weight:500">Scénarios enregistrés sur cet appareil</div>
    ${liste.length ? `<table class="tab"><tbody>${liste.map((x, i) => `<tr><td>${esc(x.nom)}</td><td>${pct(projeter(d.hyp, options({ ...simParDefaut(d), ...x.s })).couvert)}</td>
      <td style="width:1%"><button type="button" class="lien" data-charger="${i}" style="min-height:32px">Charger</button></td><td style="width:1%"><button type="button" class="lien" data-suppr="${i}" style="min-height:32px" aria-label="Supprimer ${esc(x.nom)}">Supprimer</button></td></tr>`).join('')}</tbody></table>` : '<p class="petit">Aucun pour l\'instant.</p>'}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><label for="nom-scenario" class="petit" style="position:absolute;left:-9999px">Nom du scénario</label>
      <input id="nom-scenario" class="champ" style="min-height:44px;font-size:14px;flex:1;min-width:180px" maxlength="40" placeholder="Nom du scénario, par exemple « Mini-pelle 2027 »">
      <button type="button" class="bouton creux" data-enreg style="width:auto;min-height:44px;font-size:14px">Enregistrer les réglages</button></div></div>`;
}

function grandGraphique(d) {
  const { s, h, ref, p } = simuler(d);
  const L = 820, H = 340, ml = 58, mr = 30, mt = 12, mb = 30, n = p.serie.length - 1;
  const cap = (pr, choc = 0) => pr.serie.map((x, i) => (i === n ? x.pea * (1 - choc) : x.pea) + Math.max(0, x.pont));
    const unite = (v) => (s.reel ? v.map((y, i) => y / Math.pow(1 + h.inflation, i)) : v);
  const bas = unite(cap(projeter(h, { ...options(s), choc: 0, rendement: h.rdtPeaPrudent })));
  const haut = unite(cap(projeter(h, { ...options(s), choc: 0, rendement: h.rdtPeaOptimiste })));
  const cRef = unite(cap(ref)), cSim = unite(cap(p, s.choc));
  const brut = Math.max(...haut, ...cRef, ...cSim);
  const pas = [50000, 100000, 200000, 250000, 500000, 1000000].find((q) => brut / q <= 6) || 2000000;
  const max = Math.ceil(brut / pas) * pas;
  const X = (i) => ml + (i / n) * (L - ml - mr), Y = (v) => mt + (1 - v / max) * (H - mt - mb);
  const trace = (v) => v.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const xDepart = X(p.ageDepart - h.age);
  let grille = '';
  for (let v = 0; v <= max; v += pas) grille += `<line x1="${ml}" x2="${L - mr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#E6EAF0"/><text x="${ml - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#5B6675">${nf.format(v / 1000)} k€</text>`;
  let ages = '';
  for (let i = 0; i <= n; i++) if (i === 0 || i === n || ((h.age + i) % 5 === 0 && i > 2 && i < n - 2)) ages += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5B6675">${h.age + i} ans</text>`;
  graphe = { L, ml, mr, n, age: h.age, annee: h.annee, cSim, cRef, X };
  const dpts = Math.round((p.couvert - ref.couvert) * 100);
  return `<div class="carte">
    <div class="rangee" style="align-items:flex-end;flex-wrap:wrap">
      <div><div class="sous">Besoin couvert après ${h.ageComplement} ans, avec vos réglages</div>
        <div style="display:flex;align-items:baseline;gap:12px"><div class="chiffre" id="sim-couvert" style="font-size:44px;color:${couleurCouv(p.couvert)}">${pct(p.couvert)}</div>
        <div style="font-size:14px;font-weight:600;color:var(--gris)">${dpts === 0 ? `référence ${pct(ref.couvert)}` : `${dpts > 0 ? '+' : '−'} ${Math.abs(dpts)} point${Math.abs(dpts) > 1 ? 's' : ''} par rapport à la référence (${pct(ref.couvert)})`}</div></div></div>
      <div class="sous" style="text-align:right">${euro(p.revenu)} soutenables pour ${euro(p.besoin)} visés par mois<br>Réserve ${p.ageDepart}-${h.ageComplement} ans : ${p.pontCouvert ? 'couverte' : `manque ${euro(-p.pontMin)}`} · capital à ${h.ageComplement} ans : ${euro(p.totalAujourdhui)} d'aujourd'hui</div>
    </div>
    <div data-graphe style="position:relative">
      <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Capital projeté (PEA et réserve) de ${h.age} à ${h.ageComplement} ans, ${s.reel ? "en euros d'aujourd'hui" : 'en euros courants'} : simulation, référence et fourchette prudent-optimiste">
        ${grille}
        <polygon points="${trace(haut)} ${trace(bas).split(' ').reverse().join(' ')}" fill="#EEF1F6"/>
        <line x1="${xDepart.toFixed(1)}" x2="${xDepart.toFixed(1)}" y1="${mt}" y2="${H - mb}" stroke="#B45309" stroke-width="1.5" stroke-dasharray="3 4"/>
        <text x="${(xDepart + 6).toFixed(1)}" y="${mt + 12}" font-size="11" font-weight="600" fill="#B45309">départ ${p.ageDepart} ans</text>
        <polyline points="${trace(cRef)}" fill="none" stroke="#6E8FC9" stroke-width="2" stroke-dasharray="6 5"/>
        <polyline points="${trace(cSim)}" fill="none" stroke="#1F3864" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <line id="g-curseur" x1="0" x2="0" y1="${mt}" y2="${H - mb}" stroke="#1B2430" stroke-width="1" visibility="hidden"/>
        ${ages}
      </svg>
      <div id="g-bulle" class="bulle" hidden></div>
    </div>
    <div class="legende"><span><i style="background:#1F3864"></i>Vos réglages</span><span><i style="background:#6E8FC9"></i>Référence (central, sans réglage)</span><span><i style="background:#EEF1F6;border:1px solid #C9D1DD"></i>Entre rendement prudent et optimiste</span><span>PEA et réserve cumulés</span>
      <span class="segments mini" role="group" aria-label="Unité du graphique"><button type="button" data-reel="0" aria-pressed="${!s.reel}">Euros courants</button><button type="button" data-reel="1" aria-pressed="${!!s.reel}">Euros d'aujourd'hui</button></span></div>
  </div>`;
}

function commandes(d) {
  const { s, h } = simuler(d);
  const depMin = Math.max(Math.ceil(h.pension / 50) * 50, Math.round((h.depenses * 0.75) / 50) * 50);
  return `<div class="carte" style="gap:18px">
    <div class="rangee"><h2 style="font-size:14px;font-weight:600">Simulateur</h2><button type="button" class="lien" data-raz style="min-height:0">Revenir à la référence</button></div>
    <div class="grille-cmd">
      ${reglage('epargnePlus', 'Épargne en plus chaque mois', s.epargnePlus, 0, 1500, 25, (v) => `+ ${euro(v)}`)}
      ${reglage('depenses', 'Dépenses à la retraite', s.depenses, depMin, Math.round((h.depenses * 1.4) / 50) * 50, 50, (v) => `${euro(v)}/mois`)}
      ${reglage('aide', `Aide et adaptation après ${h.ageComplement} ans`, s.aide, 0, 3000, 50, (v) => `${euro(v)}/mois`)}
      <div class="reglage"><div style="font-size:13px;font-weight:500">Rendement supposé des actions</div>
        <div class="segments" style="grid-template-columns:repeat(3,minmax(0,1fr))" role="group" aria-label="Rendement supposé des actions">
          ${Object.keys(RENDEMENTS).map((n) => `<button type="button" data-sim-scenario="${n}" aria-pressed="${s.scenario === n}">${n[0].toUpperCase() + n.slice(1)} ${pct(rendement(n))}</button>`).join('')}</div></div>
      <div class="reglage"><div style="font-size:13px;font-weight:500">Krach juste avant ${h.ageComplement} ans</div>
        <div class="segments" style="grid-template-columns:repeat(4,minmax(0,1fr))" role="group" aria-label="Krach juste avant le début du complément">
          ${[0, 0.1, 0.2, 0.35].map((c) => `<button type="button" data-choc="${c}" aria-pressed="${s.choc === c}">${c === 0 ? 'Aucun' : `− ${pct(c)}`}</button>`).join('')}</div></div>
      ${reglagesPlus(d)}
    </div>
    <p class="petit">${NOTE_SIM(h)}</p>
    ${scenariosEnregistres(d)}
  </div>`;
}

function pageProjection(d) {
  const { h, p } = simuler(d);
  return `${revenusParAge(d)}${reserveGraphique(d)}
  <div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Année par année, avec les réglages du simulateur</h2><div class="petit">euros courants, versements en fin d'année</div></div>
    <div class="defile"><table class="tab"><thead><tr><th>Année</th><th>Âge en fin d'année</th><th>Versé sur le PEA</th><th>PEA</th><th>Versé sur la réserve</th><th>Retrait de la réserve</th><th>Réserve</th><th>Total</th></tr></thead><tbody>
    ${p.serie.slice(1).map((x) => `<tr${x.age - 1 === p.ageDepart ? ' class="repere"' : ''}><td>${x.annee}</td><td>${x.age}</td><td>${x.versPea ? euro(x.versPea) : '—'}</td><td>${euro(x.pea)}</td><td>${x.versPont ? euro(x.versPont) : '—'}</td><td>${x.retrait ? euro(x.retrait) : '—'}</td><td style="color:${x.pont < 0 ? '#B3261E' : 'inherit'}">${euro(x.pont)}</td><td><b>${euro(x.pea + Math.max(0, x.pont))}</b></td></tr>`).join('')}
    </tbody></table></div>
    <p class="petit">La ligne surlignée est la première année de retraite. Le PEA est affiché avant prélèvements sociaux et avant krach éventuel.</p>
  </div>`;
}

function historique(d) {
  const s = [...d.suivi].reverse(), postes = POSTES.filter(([k]) => d.suivi.some((r) => r[k]));
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Relevés</h2><div class="petit">en euros</div></div>
    <div class="defile"><table class="tab"><thead><tr><th>Date</th>${postes.map(([, n]) => `<th>${n}</th>`).join('')}<th>Mobilisable</th><th>Fonds bloqué</th><th>Dette</th></tr></thead><tbody>
    ${s.map((r) => `<tr><td>${esc(dateCourte(r.date))}</td>${postes.map(([k]) => `<td>${nf.format(Math.round(r[k] || 0))}</td>`).join('')}<td><b>${nf.format(Math.round(total(r)))}</b></td><td>${nf.format(Math.round(r.fpci || 0))}</td><td>${nf.format(Math.round(r.dette || 0))}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function budget(d) {
  const b = d.budget;
  if (!b) return '';
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Budget mensuel</h2><div class="petit">${esc(b.source || '')}</div></div>
    <table class="tab"><tbody>
    ${b.lignes.map((l) => `<tr><td>${esc(l.libelle)}</td><td>${l.mensuel < 0 ? '− ' : ''}${euro(Math.abs(l.mensuel))}</td></tr>`).join('')}
    <tr><td><b>Excédent</b></td><td><b>${euro(b.excedent)}</b></td></tr>
    <tr><td>Épargne visée</td><td>${euro(b.epargneVisee)}</td></tr>
    <tr><td><b>Écart</b></td><td style="color:${b.ecart < 0 ? '#B3261E' : 'var(--vert)'}"><b>${signe(b.ecart)}</b></td></tr>
    </tbody></table>
    ${b.note ? `<p class="petit">${esc(b.note)}</p>` : ''}</div>`;
}

function afficherGrand(d) {
  if (etat.ecran === 'simuler') etat.ecran = 'accueil';
  etat.scenario = 'central';
  const corps = {
    accueil: () => `<div class="colonnes"><div>${ecranAccueil(d)}</div><div class="pile">${grandGraphique(d)}${commandes(d)}${sensibilite(d)}</div></div>`,
    projection: () => `<div class="pile">${pageProjection(d)}${commandes(d)}</div>`,
    patrimoine: () => `<div class="colonnes"><div>${ecranPatrimoine(d)}</div><div class="pile">${trajectoire(d)}${historique(d)}</div></div>`,
    echeances: () => `<div class="colonnes"><div>${ecranEcheances(d)}</div><div class="pile">${budget(d) || '<div class="carte"><p class="sous">Budget non publié dans cet export.</p></div>'}</div></div>`,
  };
  racine.className = 'large';
  racine.innerHTML = `<aside class="cote">
      <div class="titre" style="font-size:22px;font-weight:700;color:var(--marine);padding:0 10px 14px">Horizon</div>
      <nav class="menu" aria-label="Navigation principale">${Object.keys(PAGES).map((e) => `<button type="button" data-aller="${e}" ${etat.ecran === e ? 'aria-current="page"' : ''}>
        <svg aria-hidden="true" style="width:20px;height:20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES_G[e]}</svg>${PAGES[e]}</button>`).join('')}</nav>
      <div style="flex:1"></div>
      <p class="petit" style="padding:0 10px">Relevé du ${esc(dateCourte(d.releve))}</p>
    </aside>
    <main class="contenu">${d.exemple ? '<div class="bandeau" style="border-radius:12px">Mode démonstration : chiffres inventés</div>' : ''}
      <h1 class="titre" style="font-size:28px;font-weight:700;color:var(--marine)">${PAGES[etat.ecran]}</h1>${corps[etat.ecran]()}</main>`;
}

function afficher() {
  const d = etat.donnees;
  graphe = null;
  if (grand.matches) return afficherGrand(d);
  if (etat.ecran === 'projection') etat.ecran = 'simuler';
  racine.className = '';
  racine.innerHTML = `${d.exemple ? '<div class="bandeau">Mode démonstration : chiffres inventés</div>' : ''}
    <main>${ECRANS[etat.ecran](d)}</main>
    <nav class="bas" aria-label="Navigation principale">${Object.keys(ECRANS).map((e) => `<button type="button" data-aller="${e}" ${etat.ecran === e ? 'aria-current="page"' : ''}>
      <svg aria-hidden="true" style="width:22px;height:22px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[e]}</svg>${NOMS[e]}</button>`).join('')}</nav>`;
}
grand.addEventListener('change', () => { if (etat.donnees) afficher(); });

// ---------- interactions ----------
racine.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.aller) { etat.ecran = b.dataset.aller; afficher(); window.scrollTo(0, 0); }
  else if (b.dataset.scenario) { etat.scenario = b.dataset.scenario; afficher(); }
  else if (b.dataset.simScenario) { etat.sim.scenario = b.dataset.simScenario; afficher(); }
  else if (b.dataset.choc !== undefined) { etat.sim.choc = Number(b.dataset.choc); afficher(); }
  else if (b.dataset.age) { etat.sim.ageDepart = Number(b.dataset.age); afficher(); }
  else if (b.dataset.reel !== undefined) { etat.sim.reel = b.dataset.reel === '1'; afficher(); }
  else if ('enreg' in b.dataset) {
    const nom = document.getElementById('nom-scenario').value.trim();
    if (!nom) { document.getElementById('nom-scenario').focus(); return; }
    const { reel, ...reglages } = etat.sim;
    ecrireScenarios([...lireScenarios().filter((x) => x.nom !== nom), { nom, s: reglages }].slice(-12));
    afficher();
  }
  else if (b.dataset.charger !== undefined) { const x = lireScenarios()[Number(b.dataset.charger)]; if (x) { etat.sim = { ...simParDefaut(etat.donnees), ...x.s }; afficher(); } }
  else if (b.dataset.suppr !== undefined) { const l = lireScenarios(); l.splice(Number(b.dataset.suppr), 1); ecrireScenarios(l); afficher(); }
  else if ('raz' in b.dataset) { etat.sim = null; afficher(); }
  else if ('oublier' in b.dataset) { try { localStorage.removeItem(CLE_PHRASE); } catch { /* stockage indisponible */ } etat.donnees = null; verrou(); }
  else if ('demo' in b.dataset) { demo(); }
});
racine.addEventListener('input', (ev) => {
  const c = ev.target.dataset.reglage;
  if (!c) return;
  etat.sim[c] = Number(ev.target.value);
  const y = window.scrollY;
  afficher();
  const champ = document.getElementById(`r-${c}`);
  champ.focus({ preventScroll: true });
  window.scrollTo(0, y);
});

racine.addEventListener('pointermove', (ev) => {
  const zone = ev.target.closest('[data-graphe]');
  if (!zone || !graphe) return;
  const svg = zone.querySelector('svg'), r = svg.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * graphe.L;
  const i = Math.max(0, Math.min(graphe.n, Math.round(((x - graphe.ml) / (graphe.L - graphe.ml - graphe.mr)) * graphe.n)));
  const cx = graphe.X(i), curseur = zone.querySelector('#g-curseur'), bulle = zone.querySelector('#g-bulle');
  curseur.setAttribute('x1', cx); curseur.setAttribute('x2', cx); curseur.setAttribute('visibility', 'visible');
  bulle.hidden = false;
  bulle.innerHTML = `<b>${graphe.age + i} ans</b> · ${i === 0 ? graphe.annee : graphe.annee + i - 1}<br>Vos réglages : ${euro(graphe.cSim[i])}<br>Référence : ${euro(graphe.cRef[i])}`;
  const gauche = (cx / graphe.L) * r.width;
  bulle.style.left = `${Math.min(Math.max(gauche + 12, 0), r.width - 190)}px`;
});
racine.addEventListener('pointerleave', () => {
  const b = document.getElementById('g-bulle'), c = document.getElementById('g-curseur');
  if (b) b.hidden = true;
  if (c) c.setAttribute('visibility', 'hidden');
}, true);

// ---------- ouverture ----------
let coffre = null;

function verrou(message = '') {
  racine.innerHTML = `<form class="verrou" id="f-verrou">
    <div style="display:flex;flex-direction:column;gap:8px">
      <h1 class="titre" style="font-size:30px;font-weight:700;color:var(--marine)">Horizon</h1>
      <p class="sous">${coffre ? 'Saisissez la phrase secrète du foyer pour ouvrir les données.' : "Aucune donnée chiffrée n'est encore publiée."}</p>
    </div>
    ${coffre ? `<div style="display:flex;flex-direction:column;gap:8px">
      <label for="phrase" style="font-size:13px;font-weight:500">Phrase secrète</label>
      <input class="champ" id="phrase" type="password" autocomplete="current-password" required>
      <label style="display:flex;gap:10px;align-items:center;font-size:13px;min-height:44px"><input type="checkbox" id="retenir" checked style="width:20px;height:20px;accent-color:var(--marine)">Retenir sur cet appareil</label>
      <div class="erreur" role="alert">${esc(message)}</div>
    </div>
    <button class="bouton" type="submit">Ouvrir</button>` : ''}
    <button type="button" class="lien" data-demo>Voir une démonstration avec des chiffres inventés</button>
  </form>`;
  const f = document.getElementById('f-verrou');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const phrase = document.getElementById('phrase').value;
    const retenir = document.getElementById('retenir').checked;
    f.querySelector('button[type=submit]').textContent = 'Ouverture…';
    if (await ouvrir(phrase)) { if (retenir) { try { localStorage.setItem(CLE_PHRASE, phrase); } catch { /* stockage indisponible */ } } }
    else verrou('Phrase incorrecte.');
  });
}

async function ouvrir(phrase) {
  try {
    etat.donnees = await dechiffrer(coffre, phrase);
    etat.ecran = 'accueil'; etat.sim = null;
    afficher();
    return true;
  } catch { return false; }
}

async function demo() {
  const r = await fetch('exemple.json');
  etat.donnees = await r.json();
  etat.ecran = 'accueil'; etat.sim = null;
  afficher();
}

async function demarrer() {
  try {
    const r = await fetch(`donnees.chiffre.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) coffre = await r.json();
  } catch { coffre = null; }
  let phrase = null;
  try { phrase = localStorage.getItem(CLE_PHRASE); } catch { phrase = null; }
  if (coffre && phrase && (await ouvrir(phrase))) return;
  verrou();
}
demarrer();
