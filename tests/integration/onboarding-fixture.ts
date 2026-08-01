type FlowMemberState =
  | 'waiting'
  | 'identity_pending'
  | 'profile_draft'
  | 'profile_in_review'
  | 'active';

interface ProfileInput {
  displayName: string;
  nationality: 'JP' | 'KR';
  regionCode: string;
  introduction: string;
  photos: string[];
}

interface MemberRecord {
  id: string;
  invited: boolean;
  identityVerified: boolean;
  state: FlowMemberState;
  profile: ProfileInput | null;
  birthDate: string;
  legalName: string;
}

export function createOnboardingFlow() {
  const members = new Map<string, MemberRecord>();
  let nextId = 1;

  return {
    async createInvitedMember() {
      const id = `member-${nextId++}`;
      members.set(id, {
        id,
        invited: false,
        identityVerified: false,
        state: 'waiting',
        profile: null,
        // These values stand in for the private identity provider result.
        birthDate: '1990-01-02',
        legalName: 'Private Identity Name',
      });
      return id;
    },

    async redeemInvitation(memberId: string, code: string) {
      const member = getMember(members, memberId);
      if (code !== 'JP-WOMEN-01') throw new Error('invalid invitation');
      member.invited = true;
      member.state = 'identity_pending';
    },

    async verifyIdentity(memberId: string) {
      const member = getMember(members, memberId);
      if (!member.invited) throw new Error('invitation required');
      member.identityVerified = true;
      member.state = 'profile_draft';
    },

    async submitProfile(memberId: string, profile: ProfileInput) {
      const member = getMember(members, memberId);
      if (!member.identityVerified) throw new Error('identity required');
      if (profile.photos.length < 2 || profile.photos.length > 6) {
        throw new Error('profile requires 2 to 6 photos');
      }
      if (profile.introduction.trim().length < 40) {
        throw new Error('introduction is too short');
      }
      member.profile = { ...profile, photos: [...profile.photos] };
      member.state = 'profile_in_review';
    },

    async approveProfile(memberId: string) {
      const member = getMember(members, memberId);
      if (!member.identityVerified || member.state !== 'profile_in_review') {
        throw new Error('profile is not reviewable');
      }
      member.state = 'active';
    },

    memberState(memberId: string) {
      return getMember(members, memberId).state;
    },

    publicProfile(memberId: string) {
      const member = getMember(members, memberId);
      if (member.state !== 'active' || !member.profile) return null;
      return { ...member.profile, photos: [...member.profile.photos] };
    },
  };
}

function getMember(
  members: Map<string, MemberRecord>,
  memberId: string,
): MemberRecord {
  const member = members.get(memberId);
  if (!member) throw new Error('member not found');
  return member;
}
