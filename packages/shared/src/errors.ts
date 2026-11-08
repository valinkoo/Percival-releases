export const ERROR_CODES = [
  'invalid_request',
  'invalid_credentials',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Body of every error response from the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** Technical message in English. The client maps `code` to a French message. */
    message: string;
  };
}
