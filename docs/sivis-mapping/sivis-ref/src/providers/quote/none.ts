import { DomainError } from '../../lib/errors.js';
import type { QuickQuoteInput, QuickQuoteResult, QuoteProvider } from './types.js';

export class NoneQuoteProvider implements QuoteProvider {
  readonly name = 'none';
  async createQuickQuote(_input: QuickQuoteInput): Promise<QuickQuoteResult> {
    throw new DomainError({
      code: 'QUOTE_PROVIDER_UNAVAILABLE',
      message: 'No quote provider is configured (QUOTE_PROVIDER=none).',
    });
  }
}
