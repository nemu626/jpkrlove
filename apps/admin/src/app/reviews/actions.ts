import { z } from 'zod';

import type { OperatorContext } from '../../lib/operator-role';

export const ReviewDecisionSchema = z.enum([
  'approved',
  'changes_requested',
  'rejected',
]);

export const ReviewProfileInputSchema = z.object({
  // The database RPC performs the UUID cast. Keeping this boundary opaque also
  // lets the UI use a non-sensitive case reference if the identifier changes.
  caseId: z.string().trim().min(1).max(100),
  decision: ReviewDecisionSchema,
  reason: z.string().trim().max(2_000).optional(),
});

export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type ReviewProfileInput = z.infer<typeof ReviewProfileInputSchema>;

export type ReviewProfileErrorCode =
  | 'REVIEW_REASON_REQUIRED'
  | 'AUTHENTICATION_REQUIRED'
  | 'MFA_REQUIRED'
  | 'OPERATOR_ROLE_REQUIRED'
  | 'INVALID_REVIEW_INPUT'
  | 'REVIEW_RPC_FAILED';

export class ReviewProfileError extends Error {
  readonly code: ReviewProfileErrorCode;

  constructor(code: ReviewProfileErrorCode, message: string) {
    super(message);
    this.name = 'ReviewProfileError';
    this.code = code;
  }
}

export interface ReviewProfileDependencies {
  getOperatorContext: () => Promise<OperatorContext | null>;
  reviewProfile: (input: {
    caseId: string;
    decision: ReviewDecision;
    reason?: string;
  }) => Promise<{ status: ReviewDecision }>;
}

const productionDependencies: ReviewProfileDependencies = {
  getOperatorContext: async () => {
    const { getOperatorContext } = await import('../../lib/operator-role');
    return getOperatorContext();
  },
  reviewProfile: async (input) => {
    const { reviewProfileWithServerClient } =
      await import('../../lib/operator-role');
    return reviewProfileWithServerClient(input);
  },
};

export function createReviewProfileAction(
  dependencies: ReviewProfileDependencies = productionDependencies,
) {
  return async function runReviewProfile(
    rawInput: ReviewProfileInput,
  ): Promise<{ status: ReviewDecision }> {
    const parsed = ReviewProfileInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ReviewProfileError(
        'INVALID_REVIEW_INPUT',
        '審査対象または判定が不正です。',
      );
    }

    const reason = parsed.data.reason?.trim();
    if (
      (parsed.data.decision === 'changes_requested' ||
        parsed.data.decision === 'rejected') &&
      !reason
    ) {
      throw new ReviewProfileError(
        'REVIEW_REASON_REQUIRED',
        '差し戻し・却下には理由が必要です。',
      );
    }

    const context = await dependencies.getOperatorContext();
    if (!context) {
      throw new ReviewProfileError(
        'AUTHENTICATION_REQUIRED',
        '運営アカウントでログインしてください。',
      );
    }
    if (context.aal !== 'aal2') {
      throw new ReviewProfileError(
        'MFA_REQUIRED',
        '追加認証を完了してから審査してください。',
      );
    }
    if (!context.roles.includes('profile_reviewer')) {
      throw new ReviewProfileError(
        'OPERATOR_ROLE_REQUIRED',
        'プロフィール審査権限がありません。',
      );
    }

    try {
      return await dependencies.reviewProfile({
        caseId: parsed.data.caseId,
        decision: parsed.data.decision,
        ...(reason ? { reason } : {}),
      });
    } catch (error) {
      if (error instanceof ReviewProfileError) throw error;
      throw new ReviewProfileError(
        'REVIEW_RPC_FAILED',
        '審査を完了できませんでした。対象の状態を再確認してください。',
      );
    }
  };
}

export const reviewProfile = createReviewProfileAction();

export async function reviewProfileFromForm(
  caseId: string,
  formData: FormData,
): Promise<void> {
  'use server';
  const decision = formData.get('decision');
  const reason = formData.get('reason');
  const decisionValue =
    typeof decision === 'string' ? decision : 'invalid_decision';
  await reviewProfile({
    caseId,
    decision: decisionValue as ReviewDecision,
    reason: typeof reason === 'string' ? reason : undefined,
  });
}
