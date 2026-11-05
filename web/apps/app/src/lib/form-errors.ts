import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api/client';

/**
 * Puts an API error where the person can see it: field errors go under their
 * fields, and the message comes back for a form-level alert. Anything that is
 * not an ApiError (a dropped connection) gets a plain retry message.
 */
export function showApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>
): string {
  if (!(error instanceof ApiError)) {
    return 'We could not reach the server. Check your connection and try again.';
  }

  for (const [field, message] of Object.entries(error.fields ?? {})) {
    setError(field as Path<T>, { message });
  }

  return error.message;
}
