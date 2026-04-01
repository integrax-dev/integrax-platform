export class IntegrationEngineError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'IntegrationEngineError';
  }
}
