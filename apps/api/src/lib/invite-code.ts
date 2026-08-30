import { randomInt } from 'node:crypto';

// Sin I, O, 0, 1 para evitar confusiones al dictar el codigo en clase.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
