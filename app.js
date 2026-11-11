import { projeter } from './moteur.js';
import { dechiffrer } from './coffre.js';

const racine = document.getElementById('app');
const CLE_PHRASE = 'horizon.phrase';
const etat = { donnees: null, ecran: 'accueil', scenario: 'central', sim: null };

// ---------- outils ----------
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const euro = (x) => `${nf.format(Math.round(x))} €`;
const signe = (x) => `${x >= 0 ? '+' : '−'} ${nf.format(Math.abs(Math.round(x)))} €`;
const pct = (x) => `${nf.format(Math.round(x * 100))} %`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLongue = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateCourte = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const POSTES = [
  ['comptes', 'Comptes courants', '#1F3864'],
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
const couleurCouv = (c) => (c >= 1 ? 'var(--vert)' : 'var(--ambre)');

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
  return { epargnePlus: 0, depenses: d.hyp.depenses, aide: d.hyp.aide, scenario: 'central', choc: 0 };
}

function ecranSimuler(d) {
  if (!etat.sim) etat.sim = simParDefaut(d);
  const s = etat.sim, h = d.hyp;
  const ref = projeter(h, { rendement: h.rdtPeaCentral });
  const p = projeter(h, { rendement: rendement(s.scenario), epargnePlus: s.epargnePlus, depenses: s.depenses, aide: s.aide, choc: s.choc });
  const dpts = Math.round((p.couvert - ref.couvert) * 100);
  const L = 320, H = 110;
  const capRef = ref.serie.map((x) => x.pea + Math.max(0, x.pont));
  const cap = p.serie.map((x, i) => (i === p.serie.length - 1 ? x.pea * (1 - s.choc) : x.pea) + Math.max(0, x.pont));
  const max = Math.max(...capRef, ...cap) || 1;
  const trace = (v) => v.map((y, i) => `${((i / (v.length - 1)) * L).toFixed(1)},${(H - 4 - (y / max) * (H - 12)).toFixed(1)}`).join(' ');
  const xDepart = ((h.ageDepart - h.age) / (h.ageComplement - h.age)) * L;
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
      <div class="rangee petit" style="color:var(--clair)"><span>${h.age} ans</span><span style="color:var(--or);font-weight:600">départ ${h.ageDepart} ans</span><span>${h.ageComplement} ans</span></div>
      <div class="petit" style="color:var(--clair)">${euro(p.revenu)} soutenables pour ${euro(p.besoin)} visés par mois · réserve ${h.ageDepart}-${h.ageComplement} ans : ${p.pontCouvert ? 'couverte' : `manque ${euro(-p.pontMin)}`}</div>
    </div>
    <div class="carte" style="gap:16px;padding:16px 18px">
      ${reglage('epargnePlus', 'Épargne en plus chaque mois', s.epargnePlus, 0, 1500, 25, (v) => `+ ${euro(v)}`)}
      ${reglage('depenses', 'Dépenses à la retraite', s.depenses, depMin, Math.round((h.depenses * 1.4) / 50) * 50, 50, (v) => `${euro(v)}/mois`)}
      ${reglage('aide', `Aide et adaptation après ${h.ageComplement} ans`, s.aide, 0, 3000, 50, (v) => `${euro(v)}/mois`)}
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
      <p class="petit">Les rendements sont des hypothèses, pas des prévisions. L'âge de départ n'est pas réglable : la pension n'est connue que pour un départ à ${h.ageDepart} ans.</p>
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
    <button type="button" class="lien" data-oublier>Verrouiller l'application sur cet appareil</button>
  </div>`;
}

const ECRANS = { accueil: ecranAccueil, simuler: ecranSimuler, patrimoine: ecranPatrimoine, echeances: ecranEcheances };

function afficher() {
  const d = etat.donnees;
  racine.innerHTML = `${d.exemple ? '<div class="bandeau">Mode démonstration : chiffres inventés</div>' : ''}
    <main>${ECRANS[etat.ecran](d)}</main>
    <nav aria-label="Navigation principale">${Object.keys(ECRANS).map((e) => `<button type="button" data-aller="${e}" ${etat.ecran === e ? 'aria-current="page"' : ''}>
      <svg aria-hidden="true" style="width:22px;height:22px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[e]}</svg>${NOMS[e]}</button>`).join('')}</nav>`;
}

// ---------- interactions ----------
racine.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.aller) { etat.ecran = b.dataset.aller; afficher(); window.scrollTo(0, 0); }
  else if (b.dataset.scenario) { etat.scenario = b.dataset.scenario; afficher(); }
  else if (b.dataset.simScenario) { etat.sim.scenario = b.dataset.simScenario; afficher(); }
  else if (b.dataset.choc !== undefined) { etat.sim.choc = Number(b.dataset.choc); afficher(); }
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
