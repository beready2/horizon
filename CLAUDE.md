# Règles du dépôt Horizon

Ce dépôt est PUBLIC. Il sert une app de finances personnelles dont les données sont chiffrées.

## Interdits
- Ne jamais ajouter au dépôt une donnée réelle en clair : montant, pension, hypothèse du foyer,
  nom, établissement précis. Cela vaut pour le code, les tests, les commentaires, les messages
  de commit et `exemple.json` (chiffres inventés uniquement).
- Ne jamais écrire la phrase secrète dans un fichier, un message de commit ou un journal.
- Ne jamais committer `donnees.json`, `prive/` ou tout fichier `*.clair.json`.

## Source des données
La feuille Google « finance » du projet BE READY fait foi. L'app n'a pas de données propres :
`donnees.chiffre.json` est un export chiffré de la feuille, refait à chaque relevé.
La phrase secrète est lue dans la feuille (onglet Lisez-moi, ligne « Phrase secrète de l'app »).

## Export (à chaque relevé)
1. Construire `prive/donnees.json` au format de `exemple.json` (mêmes clés), depuis la feuille,
   en suivant la table de correspondance de `outils/export.md`.
2. `PHRASE="…" node outils/chiffrer.mjs prive/donnees.json`
3. `npm test` puis committer uniquement `donnees.chiffre.json`.

## Moteur
`moteur.js` reprend les formules de la feuille (Projection, Résultats, Stress). Toute
modification du modèle se fait des deux côtés ou pas du tout ; l'app affiche un avertissement
si son résultat central s'écarte de `feuille.couvertCentral`.

## Affichage
Une seule page, deux dispositions : téléphone (quatre écrans, l'essentiel) et grand écran à partir
de 960 px (menu latéral, grand graphique, revenus par âge, réserve, tableau année par année,
sensibilité, trajectoire du PEA, historique des relevés, budget, scénarios enregistrés).
Pas de seconde page ni de redirection : tout nouveau contenu se place dans l'une ou l'autre
disposition du même code.

## Simulateur
Une dépense ponctuelle est prise sur la réserve (livrets), jamais sur le PEA. Pour un départ plus
tardif que l'âge de référence, la pension reste celle de l'âge de référence tant qu'aucune
simulation officielle n'est fournie : l'app le dit à l'écran. Les scénarios enregistrés restent
sur l'appareil (stockage local), ils ne sont jamais publiés.

## Style
JavaScript natif en modules, sans dépendance ni étape de construction. Français dans
l'interface et les identifiants. Cibles tactiles d'au moins 44 px, contrastes AA.
