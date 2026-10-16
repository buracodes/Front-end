import { HttpErrorResponse } from '@angular/common/http';

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly raw: unknown;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; fieldErrors?: Record<string, string[]>; raw?: unknown }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options?.code;
    this.fieldErrors = options?.fieldErrors;
    this.raw = options?.raw;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new ApiError(0, 'Unable to reach the server. Please check your connection and try again.', { raw: error });
    }

    const body = error.error;
    if (body && typeof body === 'object') {
      const pd = body as ProblemDetails;
      if (pd.title || pd.detail) {
        return new ApiError(error.status, pd.detail || pd.title || `Request failed (${error.status})`, {
          code: pd.code,
          fieldErrors: pd.errors,
          raw: error,
        });
      }

      const envelope = body as { message?: string; errors?: string[] };
      if (envelope.message) {
        const message = envelope.errors?.length
          ? `${envelope.message}: ${envelope.errors.join(', ')}`
          : envelope.message;
        return new ApiError(error.status, message, { raw: error });
      }
    }

    return new ApiError(error.status, error.statusText || `Request failed (${error.status})`, { raw: error });
  }

  if (error instanceof Error) {
    return new ApiError(0, error.message, { raw: error });
  }

  return new ApiError(0, 'An unexpected error occurred.', { raw: error });
}
