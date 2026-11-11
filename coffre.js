// Chiffrement des données : AES-GCM 256, clé dérivée de la phrase secrète
// par PBKDF2-SHA256. Même code dans le navigateur et dans Node (outil d'export).

const ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function cle(phrase, sel, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(phrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function chiffrer(objet, phrase) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await cle(phrase, sel, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(objet)));
  return { v: 1, iterations: ITERATIONS, sel: b64(sel), iv: b64(iv), donnees: b64(ct) };
}

// Lève une erreur si la phrase est fausse ou le fichier altéré.
export async function dechiffrer(coffre, phrase) {
  const k = await cle(phrase, unb64(coffre.sel), coffre.iterations);
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(coffre.iv) }, k, unb64(coffre.donnees));
  return JSON.parse(dec.decode(clair));
}
