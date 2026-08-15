export class MlflowApiError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = 'MlflowApiError';
    this.status = status;
    this.body = body;
  }
}

export class MlflowAuthError extends MlflowApiError {
  constructor(status = 401, body?: string) {
    super('MLflow authentication failed', status, body);
    this.name = 'MlflowAuthError';
  }
}
