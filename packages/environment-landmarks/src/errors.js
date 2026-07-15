import { MaterializationError } from '@rus/materialization';

export class EnvironmentFeatureError extends MaterializationError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'EnvironmentFeatureError';
  }
}
