import { describe, expect, it, vi } from 'vitest';

import {
  ReviewProfileError,
  createReviewProfileAction,
  type ReviewProfileDependencies,
} from './actions.js';

function dependencies(
  overrides: Partial<ReviewProfileDependencies> = {},
): ReviewProfileDependencies {
  return {
    getOperatorContext: vi.fn().mockResolvedValue({
      userId: 'operator-1',
      aal: 'aal2',
      roles: ['profile_reviewer'],
    }),
    reviewProfile: vi.fn().mockResolvedValue({ status: 'approved' }),
    ...overrides,
  };
}

describe('reviewProfile', () => {
  it('requires a reason when requesting profile changes', async () => {
    const action = createReviewProfileAction(dependencies());

    await expect(
      action({
        caseId: 'review-1',
        decision: 'changes_requested',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_REASON_REQUIRED' });
  });

  it('requires a reason when rejecting a profile', async () => {
    const action = createReviewProfileAction(dependencies());

    await expect(
      action({ caseId: 'review-1', decision: 'rejected', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'REVIEW_REASON_REQUIRED' });
  });

  it('rejects anonymous operators', async () => {
    const action = createReviewProfileAction(
      dependencies({ getOperatorContext: vi.fn().mockResolvedValue(null) }),
    );

    await expect(
      action({ caseId: 'review-1', decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('requires an AAL2 session', async () => {
    const action = createReviewProfileAction(
      dependencies({
        getOperatorContext: vi.fn().mockResolvedValue({
          userId: 'operator-1',
          aal: 'aal1',
          roles: ['profile_reviewer'],
        }),
      }),
    );

    await expect(
      action({ caseId: 'review-1', decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'MFA_REQUIRED' });
  });

  it('requires the profile reviewer role', async () => {
    const action = createReviewProfileAction(
      dependencies({
        getOperatorContext: vi.fn().mockResolvedValue({
          userId: 'operator-1',
          aal: 'aal2',
          roles: ['support'],
        }),
      }),
    );

    await expect(
      action({ caseId: 'review-1', decision: 'approved' }),
    ).rejects.toMatchObject({ code: 'OPERATOR_ROLE_REQUIRED' });
  });

  it('passes only the review contract to the role-checked RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ status: 'approved' });
    const action = createReviewProfileAction(
      dependencies({ reviewProfile: rpc }),
    );

    await expect(
      action({
        caseId: 'review-1',
        decision: 'approved',
        reason: 'Looks good',
      }),
    ).resolves.toEqual({ status: 'approved' });
    expect(rpc).toHaveBeenCalledWith({
      caseId: 'review-1',
      decision: 'approved',
      reason: 'Looks good',
    });
    expect(rpc.mock.calls[0]?.[0]).not.toHaveProperty('birthDate');
  });

  it('exposes a stable typed error for downstream RPC failures', async () => {
    const action = createReviewProfileAction(
      dependencies({
        reviewProfile: vi.fn().mockRejectedValue(new Error('not ready')),
      }),
    );

    await expect(
      action({ caseId: 'review-1', decision: 'approved' }),
    ).rejects.toBeInstanceOf(ReviewProfileError);
  });
});
