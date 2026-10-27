/**
 * Criptografia AES-256-GCM pras credenciais SIVIS do consultor.
 *
 * - Chave de 32 bytes em env SIVIS_ENC_KEY (base64 ou hex)
 * - Formato de saida: base64("iv" + "ciphertext" + "tag") onde iv=12B, tag=16B
 * - GCM: autenticado, deteccao de tampering automatica no decrypt
 *
 * Decrypt so em memoria no server (worker de sync). Nunca retorna via API.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.SIVIS_ENC_KEY?.trim();
  if (!raw) {
    throw new Error("SIVIS_ENC_KEY nao configurado. Rode: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" e seta na env.");
  }
  // Aceita base64 ou hex (64 chars = 32 bytes hex)
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`SIVIS_ENC_KEY precisa ter exatamente 32 bytes (hex=64 chars OU base64 que decodifique pra 32B). Decodificou ${key.length}.`);
  }
  return key;
}

/** Criptografa uma string, retorna base64 compacto. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Formato: iv (12) || tag (16) || ciphertext
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Descriptografa — joga se tag inválido (tampering). */
export function decrypt(packedBase64: string): string {
  const key = getKey();
  const packed = Buffer.from(packedBase64, "base64");
  if (packed.length < IV_LEN + TAG_LEN + 1) throw new Error("payload corrompido");
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Helper pra o setup: gera uma chave nova pra colocar no .env. */
export function generateKey(): string {
  return randomBytes(32).toString("base64");
}
