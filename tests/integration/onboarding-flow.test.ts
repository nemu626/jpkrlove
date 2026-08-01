import { describe, expect, it } from 'vitest';

import { createOnboardingFlow } from './onboarding-fixture.js';

describe('onboarding to published profile', () => {
  it('publishes only after invite, identity, and admin review', async () => {
    const flow = createOnboardingFlow();
    const member = await flow.createInvitedMember();

    await flow.redeemInvitation(member, 'JP-WOMEN-01');
    await flow.verifyIdentity(member);
    await flow.submitProfile(member, {
      displayName: 'Aiko',
      nationality: 'JP',
      regionCode: 'JP-13',
      introduction:
        'A profile introduction that is long enough for the contract.',
      photos: ['a.jpg', 'b.jpg'],
    });

    expect(flow.memberState(member)).toBe('profile_in_review');
    expect(flow.publicProfile(member)).toBeNull();

    await flow.approveProfile(member);

    expect(flow.memberState(member)).toBe('active');
    expect(flow.publicProfile(member)).toMatchObject({
      displayName: 'Aiko',
      nationality: 'JP',
      photos: ['a.jpg', 'b.jpg'],
    });
    expect(flow.publicProfile(member)).not.toHaveProperty('birthDate');
    expect(flow.publicProfile(member)).not.toHaveProperty('legalName');
  });

  it('does not expose a profile before invitation or identity verification', async () => {
    const flow = createOnboardingFlow();
    const member = await flow.createInvitedMember();

    expect(flow.memberState(member)).toBe('waiting');
    expect(flow.publicProfile(member)).toBeNull();

    await flow.redeemInvitation(member, 'JP-WOMEN-01');
    expect(flow.publicProfile(member)).toBeNull();
  });
});
