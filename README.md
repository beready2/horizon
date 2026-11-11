# Horizon

Application web statique (GitHub Pages) de suivi et de simulation pour un foyer.
Les données publiées sont chiffrées (`donnees.chiffre.json`) : sans la phrase secrète,
l'application n'affiche que la démonstration (`exemple.json`, chiffres inventés).

- `moteur.js` : calcul de projection, sans dépendance.
- `coffre.js` : chiffrement AES-GCM, clé dérivée par PBKDF2.
- `outils/chiffrer.mjs` : produit `donnees.chiffre.json` à partir d'un fichier en clair.
- `tests/` : `npm test`
