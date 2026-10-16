import { DomainError } from '../lib/errors.js';

export type PlateFormat = 'mercosul' | 'legacy';

export interface NormalizedPlate {
  value: string;
  format: PlateFormat;
}

const LETTERS = /^[A-Z]+$/;

/**
 * Normalize a Brazilian license plate.
 *
 * Accepts variants like: ABC1234, abc-1234, "abc 1234", ABC1D23, abc1d23
 * Returns the plate uppercase without punctuation and identifies the format:
 *   - "legacy":   3 letters + 4 digits  (ABC1234)
 *   - "mercosul": 3 letters + 1 digit + 1 letter + 2 digits (ABC1D23)
 *
 * Never invents a valid plate: throws DomainError with code INVALID_PLATE if
 * the input cannot be reduced to one of those two forms.
 */
export function normalizeBrazilianPlate(input: string): NormalizedPlate {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new DomainError({
      code: 'INVALID_PLATE',
      message: 'Plate must be a non-empty string.',
    });
  }
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 7) {
    throw new DomainError({
      code: 'INVALID_PLATE',
      message: `Plate must have 7 alphanumeric characters after normalization (got ${cleaned.length}).`,
      details: { input, cleaned },
    });
  }

  const s0 = cleaned[0]!;
  const s1 = cleaned[1]!;
  const s2 = cleaned[2]!;
  const s3 = cleaned[3]!;
  const s4 = cleaned[4]!;
  const s5 = cleaned[5]!;
  const s6 = cleaned[6]!;

  const first3AreLetters = LETTERS.test(s0 + s1 + s2);
  if (!first3AreLetters) {
    throw new DomainError({
      code: 'INVALID_PLATE',
      message: 'Plate must start with 3 letters.',
      details: { input, cleaned },
    });
  }

  // Legacy: ABC1234
  if (/^[0-9]{4}$/.test(s3 + s4 + s5 + s6)) {
    return { value: cleaned, format: 'legacy' };
  }
  // Mercosul: ABC1D23
  if (/^[0-9]$/.test(s3) && /^[A-Z]$/.test(s4) && /^[0-9]{2}$/.test(s5 + s6)) {
    return { value: cleaned, format: 'mercosul' };
  }
  throw new DomainError({
    code: 'INVALID_PLATE',
    message: 'Plate does not match legacy (ABC1234) or Mercosul (ABC1D23) pattern.',
    details: { input, cleaned },
  });
}

/**
 * Mask the plate for logs and error messages, keeping the first 3 letters
 * and hiding the rest: "ABC1D23" -> "ABC****".
 */
export function maskPlate(plate: string): string {
  const clean = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (clean.length !== 7) return '*******';
  return `${clean.slice(0, 3)}****`;
}
