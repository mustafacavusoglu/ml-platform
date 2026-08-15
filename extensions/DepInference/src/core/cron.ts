export interface CronValidation {
  valid: boolean;
  error?: string;
}

const FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week'] as const;
const FIELD_RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOW_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NAMED_SCHEDULES = new Set([
  '@yearly',
  '@annually',
  '@monthly',
  '@weekly',
  '@daily',
  '@hourly',
]);

/**
 * Validates a 5-field cron expression (or @-shorthand) as accepted by a
 * Kubernetes CronJob. Day-of-week allows 0-7 where both 0 and 7 mean Sunday.
 */
export function validateCron(expression: string): CronValidation {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { valid: false, error: 'Cron schedule is required.' };
  }

  if (trimmed.startsWith('@')) {
    if (NAMED_SCHEDULES.has(trimmed.toLowerCase())) {
      return { valid: true };
    }
    return { valid: false, error: `"${trimmed}" is not a supported schedule shorthand.` };
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return { valid: false, error: `Expected 5 fields, found ${fields.length}.` };
  }

  for (let index = 0; index < fields.length; index += 1) {
    const error = validateField(fields[index], index);
    if (error) {
      return { valid: false, error: `Invalid ${FIELD_NAMES[index]}: ${error}` };
    }
  }

  return { valid: true };
}

function validateField(field: string, fieldIndex: number): string | undefined {
  for (const part of field.split(',')) {
    if (!part) {
      return 'empty list item.';
    }

    const [valuePart, stepPart, ...extra] = part.split('/');
    if (extra.length > 0) {
      return `"${part}" is malformed.`;
    }

    const rangeError = validateRange(valuePart, fieldIndex);
    if (rangeError) {
      return rangeError;
    }

    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) {
        return `step "${stepPart}" must be a positive number.`;
      }
    } else if (valuePart === '*' && part.includes('/')) {
      return `"${part}" is malformed.`;
    }
  }
  return undefined;
}

function validateRange(value: string, fieldIndex: number): string | undefined {
  if (value === '*') {
    return undefined;
  }

  const [min, max] = FIELD_RANGES[fieldIndex];
  if (value.includes('-')) {
    const [start, end] = value.split('-');
    const startValue = parseValue(start, fieldIndex);
    const endValue = parseValue(end, fieldIndex);
    if (startValue === undefined || endValue === undefined) {
      return `"${value}" is not a valid range.`;
    }
    if (startValue < min || endValue > max || startValue > endValue) {
      return `"${value}" is out of range ${min}-${max}.`;
    }
    return undefined;
  }

  const parsed = parseValue(value, fieldIndex);
  if (parsed === undefined) {
    return `"${value}" is not a valid value.`;
  }
  // Day-of-week 7 is an alias for Sunday (0).
  if (parsed < min || parsed > max || (fieldIndex === 4 && parsed === 7 && min > 0)) {
    if (parsed < min || parsed > max) {
      return `"${value}" is out of range ${min}-${max}.`;
    }
  }
  return undefined;
}

function parseValue(value: string, fieldIndex: number): number | undefined {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const names = fieldIndex === 3 ? MONTH_NAMES : fieldIndex === 4 ? DOW_NAMES : undefined;
  if (names) {
    const index = names.indexOf(value.toLowerCase());
    if (index >= 0) {
      return fieldIndex === 3 ? index + 1 : index;
    }
  }
  return undefined;
}
