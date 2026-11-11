// Chiffre un fichier de données en clair vers donnees.chiffre.json.
// Usage : PHRASE="..." node outils/chiffrer.mjs chemin/vers/donnees.json
// Le fichier en clair ne doit jamais être ajouté au dépôt.
import { readFile, writeFile } from 'node:fs/promises';
import { chiffrer, dechiffrer } from '../coffre.js';

const source = process.argv[2];
const phrase = process.env.PHRASE;
if (!source || !phrase) {
  console.error('Usage : PHRASE="..." node outils/chiffrer.mjs donnees.json');
  process.exit(1);
}
if (phrase.length < 12) {
  console.error('Phrase secrète trop courte (12 caractères au minimum).');
  process.exit(1);
}
const donnees = JSON.parse(await readFile(source, 'utf8'));
const coffre = await chiffrer(donnees, phrase);
const relu = await dechiffrer(coffre, phrase);
if (JSON.stringify(relu) !== JSON.stringify(donnees)) throw new Error('Relecture différente de la source');
const sortie = new URL('../donnees.chiffre.json', import.meta.url);
await writeFile(sortie, JSON.stringify(coffre) + '\n');
console.log('donnees.chiffre.json écrit et relu.');
