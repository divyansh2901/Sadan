import { HttpError } from '../middleware/errorHandler';

export function requiredString(value: unknown, field: string, maxLength = 191): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new HttpError(400, `${field} is too long`);
  }
  return result;
}

export function optionalString(value: unknown, field: string, maxLength = 191): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, field, maxLength);
}

export function positiveInt(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(result) || result <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return result;
}

export function nonNegativeInt(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(result) || result < 0) {
    throw new HttpError(400, `${field} must be a non-negative integer`);
  }
  return result;
}

export function positiveAmount(value: unknown, field = 'amount'): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result) || result <= 0 || Math.round(result * 100) !== result * 100) {
    throw new HttpError(400, `${field} must be a positive amount with at most two decimals`);
  }
  return result;
}

export function dateValue(value: unknown, field: string, required = true): Date | undefined {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, `${field} is required`);
  }
  const result = new Date(String(value));
  if (Number.isNaN(result.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`);
  }
  return result;
}

export function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpError(400, `${field} is invalid`);
  }
  return value as T;
}

export function idParam(value: unknown, field = 'id'): number {
  return positiveInt(value, field);
}

export function emailValue(value: unknown): string {
  const email = requiredString(value, 'email', 191).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new HttpError(400, 'email must be valid');
  }
  return email;
}

export function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new HttpError(400, 'password must be between 8 and 128 characters');
  }
  return value;
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be boolean`);
  return value;
}

export function normalizeAmenities(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => requiredString(item, 'amenity', 80)));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '[]';
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeAmenities(parsed);
    } catch {
      // Treat a legacy comma-separated value as the input format.
    }
    return JSON.stringify(trimmed.split(',').map((item) => item.trim()).filter(Boolean));
  }
  if (value === undefined || value === null) return '[]';
  throw new HttpError(400, 'amenities must be an array or comma-separated string');
}

export function parseAmenities(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // Fall through for old rows.
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
