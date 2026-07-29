export type MemberState =
  | 'waiting'
  | 'identity_pending'
  | 'identity_failed'
  | 'identity_expired'
  | 'profile_draft'
  | 'profile_in_review'
  | 'changes_requested'
  | 'active'
  | 'paused'
  | 'restricted';

export interface MemberStateInput {
  invitation: 'waiting' | 'accepted';
  identity: 'not_started' | 'pending' | 'verified' | 'failed' | 'expired';
  profileReview:
    'draft' | 'submitted' | 'changes_requested' | 'approved' | 'rejected';
  paused: boolean;
  restriction: 'none' | 'temporary_hidden' | 'suspended' | 'banned';
}

export function deriveMemberState(input: MemberStateInput): MemberState {
  if (input.invitation === 'waiting') return 'waiting';
  if (input.restriction !== 'none' || input.profileReview === 'rejected') {
    return 'restricted';
  }
  if (input.identity === 'failed') return 'identity_failed';
  if (input.identity === 'expired') return 'identity_expired';
  if (input.identity !== 'verified') return 'identity_pending';
  if (input.paused) return 'paused';
  if (input.profileReview === 'approved') return 'active';
  if (input.profileReview === 'changes_requested') return 'changes_requested';
  if (input.profileReview === 'submitted') return 'profile_in_review';
  return 'profile_draft';
}
