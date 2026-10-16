export interface FiscalPeriodIdentifier {
  type: 'ytd' | 'quarter' | 'month' | 'year';
  value: string;
}

export class FiscalPeriodIdentifierFactory {
  private static readonly VALID_TYPES = new Set([
    'ytd', 'quarter', 'month', 'year',
  ]);

  create(type: string, value: string): FiscalPeriodIdentifier {
    if (!FiscalPeriodIdentifierFactory.VALID_TYPES.has(type)) {
      throw new Error(`Invalid period type: ${type}`);
    }
    if (!value) {
      throw new Error('Value cannot be empty');
    }
    return { type: type.toLowerCase() as FiscalPeriodIdentifier['type'], value };
  }

  parse(input: string): FiscalPeriodIdentifier {
    if (!input) {
      throw new Error('Input cannot be empty');
    }
    const parts = input.split(':');
    if (parts.length !== 2) {
      throw new Error(`Invalid period identifier format: ${input}. Expected 'type:value'`);
    }
    return this.create(parts[0], parts[1]);
  }
}