import { describe, expect, it } from 'vitest';
import {
  applyPreprodReviewTitleLabel,
  getPreprodReviewTitlePrefix,
} from './preprod-calendar';

describe('preprod review title label', () => {
  it('builds the review prefix from artist and album', () => {
    expect(getPreprodReviewTitlePrefix({ artist: 'Test Band', album: 'Test Album' }))
      .toBe('Resenha: Test Band - Test Album ');
  });

  it('adds and removes the prefix without duplicating it', () => {
    const prefix = 'Resenha: Test Band - Test Album ';
    const title = 'Um disco direto e pesado';
    const labeled = applyPreprodReviewTitleLabel(title, prefix, true);

    expect(labeled).toBe(`${prefix}${title}`);
    expect(applyPreprodReviewTitleLabel(labeled, prefix, true)).toBe(labeled);
    expect(applyPreprodReviewTitleLabel(labeled, prefix, false)).toBe(title);
  });
});
