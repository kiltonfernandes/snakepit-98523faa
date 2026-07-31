import { describe, expect, it } from 'vitest';
import { isRivaldoStandaloneMaterial } from './rivaldo-episodes';

describe('isRivaldoStandaloneMaterial', () => {
  it('places every Pré-produção mirror in Avulso even when the legacy flag is absent', () => {
    expect(isRivaldoStandaloneMaterial({ is_standalone: false, preprod_pauta_id: 'preprod-1' })).toBe(true);
  });

  it('keeps weekly materials in Série', () => {
    expect(isRivaldoStandaloneMaterial({ is_standalone: false, preprod_pauta_id: null })).toBe(false);
  });
});
