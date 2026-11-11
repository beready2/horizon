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
1. Construire `prive/donnees.json` au format de `exemple.json` (mêmes clés), depuis la feuille :
   Hypothèses → `hyp`, Suivi → `suivi` (une entrée par relevé, dates ISO), Plan → `echeances`
   et `regles`, Résultats!C19 → `feuille.couvertCentral`, Patrimoine → `matelasMois`,
   Budget → `ecartEpargne` et `budget` (lignes mensuelles signées, excédent avec revenus variables,
   épargne visée, écart, une phrase de note).
2. `PHRASE="…" node outils/chiffrer.mjs prive/donnees.json`
3. `npm test` puis committer uniquement `donnees.chiffre.json`.

## Moteur
`moteur.js` reprend les formules de la feuille (Projection, Résultats, Stress). Toute
modification du modèle se fait des deux côtés ou pas du tout ; l'app affiche un avertissement
si son résultat central s'écarte de `feuille.couvertCentral`.

## Affichage
Une seule page, deux dispositions : téléphone (quatre écrans, l'essentiel) et grand écran à partir
de 960 px (menu latéral, grand graphique, tableau année par année, historique des relevés, budget).
Pas de seconde page ni de redirection : tout nouveau contenu se place dans l'une ou l'autre
disposition du même code.

## Style
JavaScript natif en modules, sans dépendance ni étape de construction. Français dans
l'interface et les identifiants. Cibles tactiles d'au moins 44 px, contrastes AA.
