import type { z } from 'zod';
import { Errors } from './errors.js';

/** Parse `data` with a zod schema, throwing a 422 ApiError on failure. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Errors.validation('Invalid request', result.error.flatten());
  }
  return result.data;
}
