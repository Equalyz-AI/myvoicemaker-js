export interface ApiErrorIssue {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: string;
  detail: string;
  requestId?: string;
  issues?: ApiErrorIssue[];
}

export class VoiceMakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceMakerError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VoiceMakerAPIError extends VoiceMakerError {
  readonly status: number;
  readonly error: string;
  readonly detail: string;
  readonly requestId: string | undefined;
  readonly issues: ApiErrorIssue[] | undefined;

  constructor(
    status: number,
    body: ApiErrorBody,
    message?: string,
  ) {
    super(message ?? body.detail ?? body.error);
    this.name = "VoiceMakerAPIError";
    this.status = status;
    this.error = body.error;
    this.detail = body.detail;
    this.requestId = body.requestId;
    this.issues = body.issues;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(401, body);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InsufficientCreditsError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(402, body);
    this.name = "InsufficientCreditsError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PermissionError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(403, body);
    this.name = "PermissionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(404, body);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FileSizeLimitError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(413, body);
    this.name = "FileSizeLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnsupportedMediaTypeError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(415, body);
    this.name = "UnsupportedMediaTypeError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody) {
    super(422, body);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RateLimitError extends VoiceMakerAPIError {
  readonly retryAfter: number | undefined;

  constructor(body: ApiErrorBody, retryAfter?: number) {
    super(429, body);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ServerError extends VoiceMakerAPIError {
  constructor(status: number, body: ApiErrorBody) {
    super(status, body);
    this.name = "ServerError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TimeoutError extends VoiceMakerError {
  readonly jobId: string;
  readonly timeoutMs: number;

  constructor(jobId: string, timeoutMs: number) {
    super(
      `Job '${jobId}' did not complete within ${timeoutMs}ms`,
    );
    this.name = "TimeoutError";
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createApiError(
  status: number,
  body: ApiErrorBody,
  retryAfterHeader?: string | null,
): VoiceMakerAPIError {
  const retryAfter = retryAfterHeader != null
    ? Number(retryAfterHeader)
    : undefined;

  switch (status) {
    case 401:
      return new AuthenticationError(body);
    case 402:
      return new InsufficientCreditsError(body);
    case 403:
      return new PermissionError(body);
    case 404:
      return new NotFoundError(body);
    case 413:
      return new FileSizeLimitError(body);
    case 415:
      return new UnsupportedMediaTypeError(body);
    case 422:
      return new ValidationError(body);
    case 429:
      return new RateLimitError(body, retryAfter);
    default:
      return new ServerError(status, body);
  }
}
