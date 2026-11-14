# Export des données vers l'app

Le fichier en clair `prive/donnees.json` (jamais commité) reprend les clés de `exemple.json`.
Ce document dit où lire chaque clé dans la feuille Google « finance ». Il ne contient aucune
valeur : les libellés et les montants viennent de la feuille au moment de l'export.

| Clé | Source dans la feuille |
|---|---|
| `releve` | Date du jour, AAAA-MM-JJ |
| `debutModele` | Date de la première ligne de l'onglet Suivi (A5), AAAA-MM-JJ |
| `hyp` | Onglet Hypothèses, valeurs numériques brutes (pourcentages en décimal) : age B4, ageDepart B5, ageComplement B6, annee B7, inflation B8, pension B9, peaInitial B10, versPea1 B11, dureePhase1 B12, versPea2 B13, versPont B14, scpi B15, scpiActif B16, rdtPont B17, rdtPeaPrudent B18, rdtPeaCentral B19, rdtPeaOptimiste B20, ps B21, plafondPea B22, nbPea B23, fpciMontant B24, fpciAnnee B25, fpciGain B26, fpciActif B27, fpciPartPont B28, dureeConso B29, rdtReel B30, pontInitial B32 (0 si vide ou tiret), depenses C35, aide C36, scpiApres B40, taxeScpiApres B41 |
| `feuille.couvertCentral` | Résultats!C19, en décimal |
| `suivi` | Une entrée par ligne de l'onglet Suivi, dans l'ordre : date ISO (A), comptes (B), livrets (C), btc (D), pea (E), scpi (F), av (G), parts (H), fpci (J), dette (K) |
| `comptes` | Onglet Comptes, lignes A4:G16 (ignorer les lignes vides). `lignes` : `libelle` A, `groupe` B en minuscules (`comptes` ou `livrets`), `etablissement` C, `montant` D, `source` E en minuscules (`finary` ou `saisie`), `maj` F en AAAA-MM-JJ, `cellule` : adresse de la cellule du montant (`D` suivi du numéro de ligne), `aConfirmer` : `true` si la note G contient « À CONFIRMER ». `lien` : adresse de la feuille terminée par `#gid=<identifiant de l'onglet Comptes>&range=` (elle n'est publiée que chiffrée ; ne jamais l'écrire ailleurs dans le dépôt). Les totaux des deux groupes doivent égaler les colonnes B et C du dernier relevé du Suivi |
| `epargne` | Onglet Patrimoine, lignes 29 et 30 : `depuis` = date de début du modèle ; `lignes` : `libelle` (A, en bref), `verse` C, `prevu` D |
| `btc` | `verse` : total versé de l'onglet JournalBTC ; `seuilVente` : seuil de la règle BTC de l'onglet Plan |
| `matelasMois` | Patrimoine, ligne « Mois de dépenses couverts après versement » (C26) |
| `ecartEpargne` | Budget!B12 |
| `budget` | Onglet Budget, colonne B (mensuel). `source` : période du relevé (A2, en bref). `lignes` : libellés de la colonne A et montants B4, B5 en négatif, B6, B7. `consommation` B5 (positif : réglage « dépenses mensuelles avant la retraite » du simulateur), `excedent` B10, `epargneVisee` B11, `ecart` B12. `note` : une phrase donnant l'excédent hors revenus variables (B9) et l'excédent au niveau constaté sur 12 mois (B14) |
| `engagements` | Onglet Patrimoine : `liquidites` C20 ; `lignes` : libellés de la colonne A et montants C21 et C23 ; `reste` C24 ; `note` : une phrase donnant le nombre de mois de dépenses couverts (C26) et la cible |
| `horloges` | Onglet Plan, tableau « Horloge fiscale » (A24:C25) : `libelle` A, `debut` B en AAAA-MM-JJ, `dureeAns` C |
| `tendances` | Onglet Cours. `btc.quantite` : B5 ; `btc.serie` : historique A15:B, **un point par semaine** (le dernier cours disponible de chaque semaine), sous la forme `["AAAA-MM-JJ", cours]`. `gpea.parts` : B8 ; `gpea.verse` : total versé de l'onglet JournalGPEA ; `gpea.serie` : historique F15:G, un point par semaine, même forme. Ne jamais exporter les cours quotidiens |
| `echeances` | Onglet Plan, lignes datées (A4:C14) : date ISO, titre court, note. Une date approximative devient le premier jour de la période (« Mai 2027 » → 2027-05-01, « ≈ 2034 » → 2034-07-01) |
| `regles` | Onglet Plan, règles (A17:C21) : titre, texte ; `"jauge": "btc"` pour la règle BTC, `"jauge": "matelas"` pour la réserve |
| `alertes` | Au plus quatre lignes `{niveau: "attention" ou "info", texte}` : points de vigilance de l'onglet Accueil (B13:B16) qui ne sont pas au vert, et faits utiles du relevé (compte en erreur de synchronisation, compte manuel non mis à jour depuis plus de 30 jours) |

Une clé absente n'empêche pas l'app de fonctionner : le bloc correspondant ne s'affiche pas.
