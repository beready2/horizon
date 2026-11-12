import { projeter, resoudre, tirages } from './moteur.js';
import { dechiffrer } from './coffre.js';

const racine = document.getElementById('app');
const CLE_PHRASE = 'horizon.phrase';
const CLE_THEME = 'horizon.theme';
// En thème sombre, les couleurs écrites en dur dans les graphiques sont remplacées à l'affichage.
const SOMBRE = { '#1F3864': '#A9C1EE', '#E6EAF0': '#263041', '#5B6675': '#A3AEBD', '#EEF1F6': '#243044', '#E3E9F4': '#1E2A3F',
  '#1B2430': '#E8ECF2', '#B45309': '#F0A04B', '#1E7B45': '#5CCB8B', '#B3261E': '#FF8A80', '#3F5F9A': '#7FA0DC', '#C9D1DD': '#3A465A', '#F3C9A0': '#8A6238', '#D9A441': '#C9983F' };
const themeSombre = () => document.documentElement.dataset.theme === 'sombre';
const teinter = (html) => (themeSombre() ? html.replace(/#[0-9A-Fa-f]{6}\b/g, (c) => SOMBRE[c.toUpperCase()] || SOMBRE[c] || c) : html);
function appliquerTheme(nom) {
  document.documentElement.dataset.theme = nom === 'sombre' ? 'sombre' : 'clair';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = nom === 'sombre' ? '#0E131B' : '#1F3864';
}
let themeInitial = 'clair';
try { themeInitial = localStorage.getItem(CLE_THEME) || 'clair'; } catch { themeInitial = 'clair'; }
appliquerTheme(themeInitial);
const boutonTheme = () => `<button type="button" class="lien" data-theme-suivant="${themeSombre() ? 'clair' : 'sombre'}">${themeSombre() ? 'Passer au thème clair' : 'Passer au thème sombre'}</button>`;
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
    ${explication(d)}
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
    ageDepart: d.hyp.ageDepart, ponctMontant: 0, ponctAnnee: d.hyp.annee + 1, reel: false, vol: 0.15 };
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
    <div class="carte" style="background:var(--marine-fond);color:#fff;gap:10px">
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
      <div class="petit" style="color:var(--clair)">${phraseProbabilite(d)}</div>
    </div>
    ${revenusParAge(d, true)}
    <div class="carte" style="gap:16px;padding:16px 18px">
      ${reglageAvantRetraite(d)}
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


// Dépenses mensuelles actuelles : chaque euro non dépensé est épargné (PEA d'abord). Sans budget publié, on garde le réglage d'épargne.
const baseDepenses = (d) => (d.budget && typeof d.budget.consommation === 'number' ? d.budget.consommation : null);
function depenseMaximale(d) {
  const { s, h } = simuler(d), base = baseDepenses(d);
  const couv = (x) => projeter(h, { ...options(s), epargnePlus: base - x }).couvert;
  const bas = Math.max(1000, base - 1500), haut = base + 1500;
  if (couv(bas) < 0.995) return { etat: 'impossible', bas };
  if (couv(haut) >= 0.995) return { etat: 'libre', haut };
  return { etat: 'valeur', x: resoudre(couv, 1, bas, haut, false) };
}
function reglageAvantRetraite(d) {
  const { s } = simuler(d), base = baseDepenses(d);
  if (base === null) return reglage('epargnePlus', 'Épargne en plus chaque mois', s.epargnePlus, 0, 1500, 25, (v) => `+ ${euro(v)}`);
  const dep = base - s.epargnePlus, visee = d.budget.epargneVisee ?? 0, m = depenseMaximale(d);
  const lecture = m.etat === 'valeur' ? `Pour être couvert à 100 %, ne pas dépasser <b>${euro(m.x)}</b> par mois avant la retraite.`
    : m.etat === 'libre' ? `La couverture de 100 % est atteinte même avec ${euro(m.haut)} de dépenses.`
    : `Réduire les dépenses actuelles ne suffit pas, même à ${euro(m.bas)} par mois.`;
  return `<div class="reglage">${reglage('depActuelles', 'Dépenses mensuelles avant la retraite', dep, Math.max(1000, Math.round((base - 1000) / 25) * 25), Math.round((base + 500) / 25) * 25, 25, (v) => `${euro(v)}/mois`)}
    <p class="petit">Épargne qui en découle : <b>${euro(visee + s.epargnePlus)} par mois</b> (visée ${euro(visee)}). Chaque euro non dépensé est placé. ${lecture}</p></div>`;
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
    <button type="button" class="bouton creux sans-impression" data-aller="revue">Fiche de revue annuelle</button>
    ${boutonTheme()}
    <button type="button" class="lien" data-oublier>Verrouiller l'application sur cet appareil</button>
  </div>`;
}

const ECRANS = { accueil: ecranAccueil, simuler: ecranSimuler, patrimoine: ecranPatrimoine, echeances: ecranEcheances };

// ---------- grand écran ----------
const PAGES = { accueil: 'Tableau de bord', projection: 'Projection', patrimoine: 'Patrimoine', echeances: 'Échéances et budget', revue: 'Revue annuelle' };
const ICONES_G = { ...ICONES, projection: '<path d="M4 20V4M4 20h16M8 16l4-5 3 3 5-7"/>', revue: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>' };

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
      barres.push({ a, pension: h.pension, loyers: p.loyersNets, reserve: (x.retrait - x.manque) / defl, complement: 0, manque: x.manque / defl, besoin: h.pension + p.loyersNets + p.ecart });
    } else {
      barres.push({ a, pension: h.pension, loyers: p.loyersNets, reserve: 0, complement: Math.min(p.revenu, p.besoin), manque: Math.max(0, p.besoin - p.revenu), besoin: h.pension + p.loyersNets + p.besoin });
    }
  }
  const L = compact ? 320 : 820, H = compact ? 150 : 260, ml = compact ? 0 : 58, mt = 8, mb = 22;
  const max = Math.ceil(Math.max(...barres.map((b) => b.besoin)) / 500) * 500;
  const lb = (L - ml) / barres.length, Y = (v) => mt + (1 - v / max) * (H - mt - mb);
  const COUL = { pension: '#1F3864', loyers: '#D9A441', reserve: '#6E8FC9', complement: '#1E7B45', manque: '#F3C9A0' };
  let rects = '', ligne = '', etiq = '';
  barres.forEach((b, i) => {
    let bas = 0;
    for (const k of ['pension', 'loyers', 'reserve', 'complement', 'manque']) {
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
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Revenus mensuels de ${p.ageDepart} à ${fin - 1} ans : pension, loyers SCPI, réserve, complément tiré du capital, et manque par rapport aux dépenses. ${esc(lecture)}">
      ${grille}${rects}<polyline points="${ligne}" fill="none" stroke="#1B2430" stroke-width="1.5"/>${etiq}</svg>
    <div class="legende"><span><i style="background:${COUL.pension}"></i>Pension</span>${p.loyersNets > 0 ? `<span><i style="background:${COUL.loyers}"></i>Loyers SCPI nets</span>` : ''}<span><i style="background:${COUL.reserve}"></i>Réserve</span><span><i style="background:${COUL.complement}"></i>Complément tiré du capital</span><span><i style="background:${COUL.manque}"></i>Manque</span><span><i style="background:#1B2430;height:2px"></i>Dépenses</span></div>
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
    ['Inflation durable à 3,5 % par an', {}, { inflation: 0.035 }],
    ['Stagflation : rendement 2 %, inflation 3,5 %, loyers − 30 %', { rendement: 0.02 }, { inflation: 0.035, scpi: h.scpi * 0.7, scpiApres: (h.scpiApres ?? 0) * 0.7 }],
    ['Krach de 35 % et fonds bloqué restitué à 80 %', { choc: 0.35 }, { fpciMontant: h.fpciMontant * 0.8 }],
  ].map(([nom, o, hyp]) => { const p = projeter({ ...h, ...(hyp || {}) }, { rendement: h.rdtPeaCentral, ...o }); return { nom, delta: (p.couvert - base.couvert) * 100, couvert: p.couvert }; })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const maxi = Math.max(...cas.map((c) => Math.abs(c.delta))) || 1;
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Ce qui pèse le plus</h2><div class="petit">effet sur la part du besoin couverte après ${h.ageComplement} ans (référence ${pct(base.couvert)})</div></div>
    <table class="tab"><tbody>${cas.map((c) => `<tr><td style="white-space:normal">${esc(c.nom)}</td>
      <td style="width:30%"><div style="height:8px;border-radius:999px;background:${c.delta >= 0 ? 'var(--vert)' : 'var(--ambre)'};width:${Math.max(2, (Math.abs(c.delta) / maxi) * 100).toFixed(0)}%;margin-left:auto"></div></td>
      <td style="color:${c.delta >= 0 ? 'var(--vert)' : 'var(--ambre)'};font-weight:600">${c.delta >= 0 ? '+' : '−'} ${Math.abs(c.delta).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt</td><td>${pct(c.couvert)}</td></tr>`).join('')}</tbody></table>
    <p class="petit">Chaque ligne part de la référence. Les effets ne s'additionnent pas exactement. Avec une inflation plus forte, la pension suit les prix mais les rendements nominaux supposés ne changent pas : le capital perd du pouvoir d'achat.</p></div>`;
}

// Détail du calcul, avec les chiffres du moment, et ce qu'il faudrait pour atteindre 100 %.
function explication(d) {
  const h = d.hyp, p = projeter(h, { rendement: rendement(etat.scenario) });
  const requis = resoudre((x) => projeter(h, { rendement: x }).couvert, 1, 0, 0.25);
  const depMax = resoudre((x) => projeter(h, { rendement: rendement(etat.scenario), depenses: x }).couvert, 1, h.pension, h.depenses * 3, false);
  const etape = (titre, calcul) => `<div style="display:flex;flex-direction:column;gap:2px"><div style="font-size:13px;font-weight:500">${titre}</div><div class="sous">${calcul}</div></div>`;
  const dix = (x) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return `<div class="carte" style="padding:14px 18px;display:block"><details data-calcul ${etat.calcul ? 'open' : ''}><summary style="font-size:14px;font-weight:600;cursor:pointer;min-height:44px;display:flex;align-items:center;gap:8px">Comment ce chiffre est-il calculé ?</summary>
    <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0 6px">
    ${etape('1. Le besoin mensuel après ' + h.ageComplement + ' ans', `dépenses ${euro(h.depenses)} − pension ${euro(h.pension)}${p.loyersNets > 0 ? ` − loyers SCPI nets ${euro(p.loyersNets)}` : ''} + aide ${euro(h.aide)} = <b>${euro(p.besoin)}</b>`)}
    ${etape('2. Le PEA à ' + h.ageComplement + ' ans, à ' + dix(p.rendement) + ' % par an', `${euro(p.brut)}, dont ${euro(p.principal)} versés et ${euro(p.gains)} de gains`)}
    ${etape('3. Après prélèvements sociaux', `${euro(p.brut)} − ${dix(h.ps)} % × ${euro(p.gains)} = <b>${euro(p.net)}</b>`)}
    ${etape('4. Avec le reste de la réserve', `${euro(p.net)} + ${euro(p.reliquat)} = ${euro(p.total)}, en euros de ${h.annee + p.horizon}`)}
    ${etape("5. En euros d'aujourd'hui", `${euro(p.total)} ÷ ${p.inflationCumulee.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} (inflation de ${dix(h.inflation)} % pendant ${p.horizon} ans) = <b>${euro(p.totalAujourdhui)}</b>`)}
    ${etape('6. Le revenu que ce capital permet', `consommé sur ${h.dureeConso} ans, placé à ${dix(h.rdtReel)} % au-dessus de l'inflation : <b>${euro(p.revenu)} par mois</b>`)}
    ${etape('7. La part couverte', `${euro(p.revenu)} ÷ ${euro(p.besoin)} = <b>${pct(p.couvert)}</b>`)}
    <div style="height:1px;background:var(--trait)"></div>
    <div style="font-size:13px;font-weight:600">Pour atteindre 100 %, une seule de ces trois choses suffit</div>
    <div class="sous">${p.epargneAAjouter > 0 ? `Épargner <b>${euro(p.epargneAAjouter)} de plus par mois</b> jusqu'au départ` : 'Épargne : objectif déjà atteint'}<br>
      ${requis === null ? 'Rendement : hors d\'atteinte' : `ou obtenir <b>${dix(requis)} % par an</b> sur les actions au lieu de ${dix(h.rdtPeaCentral)} %`}<br>
      ${depMax === null ? 'Dépenses : hors d\'atteinte' : `ou ramener les dépenses de retraite à <b>${euro(depMax)} par mois</b> au lieu de ${euro(h.depenses)}`}</div>
    </div></details></div>`;
}

function probabilites(d) {
  const { s, h } = simuler(d);
  return tirages(h, options(s), { volatilite: s.vol ?? 0.15 });
}
function phraseProbabilite(d) {
  const t = probabilites(d), n = Math.round(t.auMoins100 * 10);
  return `Avec des rendements aléatoires : besoin couvert en entier ${n === 0 ? 'dans moins d\'un cas sur 10' : `dans ${n} cas sur 10`}.`;
}
function probabilite(d) {
  const { s, h } = simuler(d), t = probabilites(d);
  const bornes = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, Infinity], noms = ['< 20 %', '20-40', '40-60', '60-80', '80-100', '100-120', '120-140', '≥ 140 %'];
  const parts = noms.map((_, i) => t.couverts.filter((c) => c >= bornes[i] && c < bornes[i + 1]).length / t.nombre);
  const maxi = Math.max(...parts) || 1, L = 820, H = 170, lb = L / noms.length;
  const barres = parts.map((q, i) => { const hh = (q / maxi) * (H - 44); return `<rect x="${(i * lb + 8).toFixed(1)}" y="${(H - 24 - hh).toFixed(1)}" width="${(lb - 16).toFixed(1)}" height="${Math.max(1, hh).toFixed(1)}" rx="4" fill="${i >= 5 ? '#1E7B45' : '#B45309'}"/>
    <text x="${((i + 0.5) * lb).toFixed(1)}" y="${(H - 30 - hh).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="#1B2430">${pct(q)}</text>
    <text x="${((i + 0.5) * lb).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#5B6675">${noms[i]}</text>`; }).join('');
  const n100 = Math.round(t.auMoins100 * 10);
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Et si les rendements varient d'une année à l'autre ?</h2><div class="petit">${nf.format(t.nombre)} trajectoires tirées au hasard, avec les réglages du simulateur</div></div>
    <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><div class="chiffre" style="font-size:28px;color:${t.auMoins100 >= 0.5 ? 'var(--vert)' : 'var(--ambre)'}">${n100 === 0 ? 'Moins d\'un cas sur 10' : `${n100} cas sur 10`}</div><div class="sous">où le besoin est couvert en entier · au moins 80 % couverts dans ${pct(t.auMoins80)} des cas</div></div>
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Répartition des trajectoires selon la part du besoin couverte après ${h.ageComplement} ans">${barres}</svg>
    <div class="sous">Une fois sur dix, la couverture est inférieure à ${pct(t.p10)} ; une fois sur deux, inférieure à ${pct(t.p50)} ; une fois sur dix, supérieure à ${pct(t.p90)}.</div>
    <div class="rangee" style="align-items:center;flex-wrap:wrap"><div style="font-size:13px;font-weight:500">Ampleur supposée des variations annuelles</div>
      <div class="segments" style="grid-template-columns:repeat(3,auto)" role="group" aria-label="Volatilité annuelle supposée">${[0.1, 0.15, 0.2].map((v) => `<button type="button" data-vol="${v}" aria-pressed="${(s.vol ?? 0.15) === v}" style="padding:0 14px">${pct(v)}</button>`).join('')}</div></div>
    <p class="petit">Hypothèse, pas une prévision : chaque année, le rendement du PEA est tiré au hasard autour du rendement retenu. La moitié des trajectoires finit sous le calcul à rendement fixe, parce que les mauvaises années pèsent plus que les bonnes. La réserve et la phase de retraite ne sont pas tirées au hasard.</p></div>`;
}

function courbeReperes(serie, reperes, etiquette) {
  const L = 380, H = 150, ml = 4, mr = 4, mt = 10, mb = 20;
  const v = serie.map((x) => x[1]), tout = [...v, ...reperes.map((r) => r.v)];
  const min = Math.min(...tout) * 0.97, max = Math.max(...tout) * 1.03;
  const X = (i) => ml + (i / (serie.length - 1)) * (L - ml - mr), Y = (y) => mt + (1 - (y - min) / (max - min)) * (H - mt - mb);
  return `<svg viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(etiquette)}">
    ${reperes.map((r) => `<line x1="${ml}" x2="${L - mr}" y1="${Y(r.v).toFixed(1)}" y2="${Y(r.v).toFixed(1)}" stroke="${r.couleur}" stroke-width="1.5" stroke-dasharray="5 4"/>`).join('')}
    <polyline points="${v.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="#1F3864" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${ml}" y="${H - 4}" font-size="11" fill="#5B6675">${esc(dateCourte(serie[0][0]))}</text><text x="${L - mr}" y="${H - 4}" text-anchor="end" font-size="11" fill="#5B6675">${esc(dateCourte(serie[serie.length - 1][0]))}</text></svg>`;
}

// Grandes tendances seulement : un point par semaine, et la distance aux repères de décision.
function tendances(d) {
  const t = d.tendances;
  if (!t) return '';
  const blocs = [];
  const var2 = (x) => `${x >= 0 ? '+' : '−'} ${Math.abs(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  if (t.btc && t.btc.serie && t.btc.serie.length > 1) {
    const b = t.btc, cours = b.serie[b.serie.length - 1][1], haut = Math.max(...b.serie.map((x) => x[1]));
    const revient = d.btc && d.btc.verse ? d.btc.verse / b.quantite : null, seuil = d.btc && d.btc.seuilVente ? d.btc.seuilVente / b.quantite : null;
    const reperes = [revient && { v: revient, couleur: '#5B6675', nom: 'prix de revient' }, seuil && { v: seuil, couleur: '#B45309', nom: 'seuil de vente' }].filter(Boolean);
    blocs.push(`<div style="display:flex;flex-direction:column;gap:8px"><div class="rangee"><div style="font-size:13px;font-weight:600">Bitcoin</div><div class="chiffre" style="font-size:18px">${euro(cours)}</div></div>
      ${courbeReperes(b.serie, reperes, 'Cours hebdomadaire du Bitcoin, avec le prix de revient et le cours qui déclenche la règle de vente')}
      <div class="legende"><span><i style="background:#5B6675;height:2px"></i>Prix de revient${revient ? ` ${euro(revient)}` : ''}</span><span><i style="background:#B45309;height:2px"></i>Seuil de vente${seuil ? ` ${euro(seuil)}` : ''}</span></div>
      <div class="sous">${revient ? `${var2(cours / revient - 1)} depuis l'achat · ` : ''}${var2(cours / haut - 1)} sous le plus haut de la période.${seuil ? ` <b>La règle de vente se déclenche à ${euro(seuil)} le Bitcoin : il faut encore ${var2(seuil / cours - 1)}.</b>` : ''}</div></div>`);
  }
  if (t.gpea && t.gpea.serie && t.gpea.serie.length > 1) {
    const g = t.gpea, v = g.serie.map((x) => x[1]), cours = v[v.length - 1], haut = Math.max(...v);
    const fen = v.slice(-26), moyenne = fen.reduce((a, x) => a + x, 0) / fen.length, achat = g.verse && g.parts ? g.verse / g.parts : null;
    const reperes = [{ v: moyenne, couleur: '#5B6675', nom: 'moyenne' }, achat && { v: achat, couleur: '#1E7B45', nom: 'achat' }].filter(Boolean);
    const fmt = (x) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    blocs.push(`<div style="display:flex;flex-direction:column;gap:8px"><div class="rangee"><div style="font-size:13px;font-weight:600">GPEA (actions monde)</div><div class="chiffre" style="font-size:18px">${fmt(cours)}</div></div>
      ${courbeReperes(g.serie, reperes, 'Cours hebdomadaire du GPEA, avec sa moyenne récente et le prix moyen d\'achat')}
      <div class="legende"><span><i style="background:#5B6675;height:2px"></i>Moyenne des ${fen.length} dernières semaines ${fmt(moyenne)}</span>${achat ? `<span><i style="background:#1E7B45;height:2px"></i>Prix moyen d'achat ${fmt(achat)}</span>` : ''}</div>
      <div class="sous">${var2(cours / haut - 1)} sous le plus haut de la période · ${var2(cours / moyenne - 1)} par rapport à sa moyenne récente. Aucune règle d'achat n'est écrite pour l'instant.</div></div>`);
  }
  if (!blocs.length) return '';
  return `<div class="carte"><div class="rangee"><h2 style="font-size:14px;font-weight:600">Tendances</h2><div class="petit">un point par semaine, mis à jour au relevé</div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">${blocs.join('')}</div></div>`;
}

function enReserve() {
  return `<div class="carte" style="padding:16px 18px"><h2 style="font-size:14px;font-weight:600">En réserve, pour plus tard</h2>
    <div class="ligne"><div class="point" style="background:var(--bord)"></div><div><b>Rendement réel de chaque placement</b> (taux annuel calculé sur les dates de versement). Utile quand il y aura au moins un an d'historique.</div></div>
    <div class="ligne"><div class="point" style="background:var(--bord)"></div><div><b>Retraits en trois poches</b> à la retraite (court, moyen et long terme), pour ne pas vendre des actions après un krach. À étudier quelques années avant le départ.</div></div>
    <div class="ligne"><div class="point" style="background:var(--bord)"></div><div><b>Simulateur de retrait du PEA</b>, net de prélèvements. À ajouter à l'approche des premiers retraits.</div></div></div>`;
}

function pageRevue(d) {
  const h = d.hyp, r = d.suivi[d.suivi.length - 1];
  const c = (n) => projeter(h, { rendement: h[RENDEMENTS[n]] });
  const ref = c('central'), t = tirages(h, { rendement: h.rdtPeaCentral });
  const requis = resoudre((x) => projeter(h, { rendement: x }).couvert, 1, 0, 0.25);
  const auj = new Date(); auj.setHours(12, 0, 0, 0);
  const limite = new Date(auj); limite.setFullYear(limite.getFullYear() + 1);
  const proches = (d.echeances || []).filter((e) => { const x = new Date(`${e.date}T12:00:00`); return x >= auj && x <= limite; });
  const ligne = (a, b) => `<tr><td style="white-space:normal">${a}</td><td><b>${b}</b></td></tr>`;
  const cases = ["Épargne réellement versée sur l'année, comparée à l'épargne visée", 'Fonds bloqué : appels payés, distributions reçues, dernière valeur communiquée', 'Taux servis par les livrets et les fonds en euros', "Changements de fiscalité de l'année (prélèvements sociaux, enveloppes)", 'Simulation officielle de pension, si une nouvelle est disponible', 'Droits à retraite du conjoint', 'Loyers réellement reçus, comparés à la valeur retenue', 'Hypothèses de la feuille : âge, dépenses, rendements, à corriger si besoin'];
  return `<div class="pile" style="max-width:820px">
    <div class="rangee sans-impression" style="align-items:center"><p class="sous">Une page à imprimer ou à enregistrer en PDF, chaque novembre.</p><button type="button" class="bouton" data-imprimer style="width:auto;padding:0 22px">Imprimer</button></div>
    <div class="carte"><div class="rangee"><h2 class="titre" style="font-size:20px;font-weight:700;color:var(--marine)">Revue annuelle</h2><div class="sous">${esc(auj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))} · relevé du ${esc(dateCourte(d.releve))}</div></div>
      <table class="tab"><tbody>
      ${ligne('Patrimoine mobilisable', euro(total(r)))}${ligne('Fonds bloqué, au coût', euro(r.fpci || 0))}${ligne('Dette restante', euro(r.dette || 0))}
      ${ligne(`Besoin couvert après ${h.ageComplement} ans : prudent · central · optimiste`, `${pct(c('prudent').couvert)} · ${pct(ref.couvert)} · ${pct(c('optimiste').couvert)}`)}
      ${ligne('Trajectoires aléatoires où le besoin est couvert en entier', pct(t.auMoins100))}
      ${ligne(`Réserve de ${h.ageDepart} à ${h.ageComplement} ans`, ref.pontCouvert ? 'Couverte' : `Manque ${euro(-ref.pontMin)}`)}
      ${ligne('Épargne à ajouter par mois pour atteindre 100 %', ref.epargneAAjouter > 0 ? euro(ref.epargneAAjouter) : 'Aucune')}
      ${ligne('Rendement des actions nécessaire pour atteindre 100 %', requis === null ? 'Hors d\'atteinte' : `${(requis * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`)}
      ${d.budget ? ligne('Excédent mensuel moins épargne visée', signe(d.budget.ecart)) : ''}
      ${d.matelasMois != null ? ligne('Réserve de sécurité, en mois de dépenses', d.matelasMois.toLocaleString('fr-FR', { maximumFractionDigits: 1 })) : ''}
      ${d.btc && d.btc.seuilVente ? ligne('Bitcoin : part du seuil de vente atteinte', pct(r.btc / d.btc.seuilVente)) : ''}
      </tbody></table></div>
    ${(d.alertes || []).length ? `<div class="carte"><h2 style="font-size:14px;font-weight:600">À surveiller</h2>${d.alertes.map((a) => `<div class="ligne"><div class="point" style="background:${a.niveau === 'attention' ? 'var(--ambre)' : 'var(--marine)'}"></div><div>${esc(a.texte)}</div></div>`).join('')}</div>` : ''}
    <div class="carte"><h2 style="font-size:14px;font-weight:600">Échéances des douze prochains mois</h2>
      ${proches.length ? `<table class="tab"><tbody>${proches.map((e) => `<tr><td>${esc(dateCourte(e.date))}</td><td style="text-align:left;white-space:normal">${esc(e.titre)}${e.note ? ` · ${esc(e.note)}` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="sous">Aucune.</p>'}</div>
    <div class="carte"><h2 style="font-size:14px;font-weight:600">À vérifier à la main</h2>
      ${cases.map((x) => `<div class="ligne"><div style="width:16px;height:16px;border:1.5px solid var(--gris);border-radius:4px;flex-shrink:0;margin-top:2px"></div><div>${x}</div></div>`).join('')}</div>
    <div class="carte"><h2 style="font-size:14px;font-weight:600">Décisions prises à cette revue</h2>
      ${[1, 2, 3, 4].map(() => '<div style="height:30px;border-bottom:1px solid var(--bord)"></div>').join('')}</div>
  </div>`;
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
      ${reglageAvantRetraite(d)}
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
    accueil: () => `<div class="colonnes"><div>${ecranAccueil(d)}</div><div class="pile">${grandGraphique(d)}${commandes(d)}${probabilite(d)}${sensibilite(d)}</div></div>`,
    projection: () => `<div class="pile">${pageProjection(d)}${commandes(d)}</div>`,
    patrimoine: () => `<div class="colonnes"><div>${ecranPatrimoine(d)}</div><div class="pile">${tendances(d)}${trajectoire(d)}${historique(d)}</div></div>`,
    echeances: () => `<div class="colonnes"><div>${ecranEcheances(d)}</div><div class="pile">${budget(d) || '<div class="carte"><p class="sous">Budget non publié dans cet export.</p></div>'}${enReserve()}</div></div>`,
    revue: () => pageRevue(d),
  };
  racine.className = 'large';
  racine.innerHTML = teinter(`<aside class="cote">
      <div class="titre" style="font-size:22px;font-weight:700;color:var(--marine);padding:0 10px 14px">Horizon</div>
      <nav class="menu" aria-label="Navigation principale">${Object.keys(PAGES).map((e) => `<button type="button" data-aller="${e}" ${etat.ecran === e ? 'aria-current="page"' : ''}>
        <svg aria-hidden="true" style="width:20px;height:20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES_G[e]}</svg>${PAGES[e]}</button>`).join('')}</nav>
      <div style="flex:1"></div>
      <div style="padding:0 10px">${boutonTheme()}</div>
      <p class="petit" style="padding:0 10px">Relevé du ${esc(dateCourte(d.releve))}</p>
    </aside>
    <main class="contenu">${d.exemple ? '<div class="bandeau" style="border-radius:12px">Mode démonstration : chiffres inventés</div>' : ''}
      <h1 class="titre" style="font-size:28px;font-weight:700;color:var(--marine)">${PAGES[etat.ecran]}</h1>${corps[etat.ecran]()}</main>`);
}

function afficher() {
  const d = etat.donnees;
  graphe = null;
  if (grand.matches) return afficherGrand(d);
  if (etat.ecran === 'projection') etat.ecran = 'simuler';
  racine.className = '';
  racine.innerHTML = teinter(`${d.exemple ? '<div class="bandeau">Mode démonstration : chiffres inventés</div>' : ''}
    <main>${etat.ecran === 'revue' ? `<div class="entete"><h1>Revue annuelle</h1></div><div class="pad">${pageRevue(d)}</div>` : ECRANS[etat.ecran](d)}</main>
    <nav class="bas" aria-label="Navigation principale">${Object.keys(ECRANS).map((e) => `<button type="button" data-aller="${e}" ${etat.ecran === e ? 'aria-current="page"' : ''}>
      <svg aria-hidden="true" style="width:22px;height:22px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[e]}</svg>${NOMS[e]}</button>`).join('')}</nav>`);
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
  else if (b.dataset.vol) { etat.sim.vol = Number(b.dataset.vol); afficher(); }
  else if (b.dataset.themeSuivant) {
    appliquerTheme(b.dataset.themeSuivant);
    try { localStorage.setItem(CLE_THEME, b.dataset.themeSuivant); } catch { /* stockage indisponible */ }
    if (etat.donnees) afficher(); else verrou();
  }
  else if ('imprimer' in b.dataset) {
    const avant = document.documentElement.dataset.theme;
    appliquerTheme('clair'); afficher();
    window.print();
    appliquerTheme(avant); afficher();
  }
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
  if (c === 'depActuelles') etat.sim.epargnePlus = baseDepenses(etat.donnees) - Number(ev.target.value);
  else etat.sim[c] = Number(ev.target.value);
  const y = window.scrollY;
  afficher();
  const champ = document.getElementById(`r-${c}`);
  champ.focus({ preventScroll: true });
  window.scrollTo(0, y);
});

racine.addEventListener('toggle', (ev) => { if (ev.target.matches && ev.target.matches('details[data-calcul]')) etat.calcul = ev.target.open; }, true);
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
    ${boutonTheme()}
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
