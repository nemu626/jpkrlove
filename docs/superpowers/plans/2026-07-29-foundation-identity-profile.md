# 기반·본인 확인·프로필 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 초대 코드 등록부터 본인 확인, 프로필 작성, 운영 심사, 공개 상태까지의 첫 번째 작동 가능한 수직 흐름을 구현한다.

**아키텍처:** Expo 모바일과 Next.js 운영 앱은 공용 `domain` 계약과 `api-client` 저장소를 사용한다. Supabase Auth가 계정을 식별하고 PostgreSQL 함수가 초대 사용과 상태 전이를 원자적으로 처리하며, RLS가 미인증·미승인 프로필 노출을 차단한다.

**기술 스택:** Node.js 24 LTS, pnpm 11.17.0, Turborepo 2.10.7, Expo SDK 57.0.8, Next.js 16.2.12, Supabase CLI 2.110.0, Deno 2, TypeScript, Zod 4.4.3, Supabase JS 2.111.0, Vitest 4.1.10, Jest Expo 57.0.2, pgTAP

## 전역 제약

- Expo 앱은 `default@sdk-57` 템플릿과 development build를 사용한다.
- 모바일과 운영 앱은 Supabase 클라이언트를 화면에서 직접 호출하지 않는다.
- Data API는 `public`, `app`, `storage`, `graphql_public`만 노출하고 `private`, `audit`, `analytics`는 노출하지 않는다.
- 운영 action은 사용자 session으로 AAL2와 operator role을 DB에서 다시 확인하는 좁은 `app.admin_*` RPC만 호출한다.
- Edge Function worker는 authenticated 실행 권한을 revoke한 `app.internal_*` RPC로만 비공개 상태를 읽거나 변경한다.
- 법적 이름, 생년월일, 신분증, 얼굴 대조 결과는 `private` 스키마 또는 비공개 Storage에만 둔다.
- 공개 프로필은 본인 확인 `verified`와 프로필 심사 `approved`가 모두 필요하다.
- 회원 로그인은 Supabase Auth 이메일 6자리 OTP만 사용하며 이메일 등록 여부를 오류 문구로 노출하지 않는다.
- 운영자 계정은 관리자가 사전 발급하고 이메일 OTP 뒤 TOTP MFA로 AAL2를 만족해야 한다.
- 초기 성별은 자기 설정값이며 본인 확인 배지가 법적 성별을 보증하지 않는다.
- profile-media, identity-documents 버킷은 비공개이고 짧은 서명 URL만 사용한다.
- production 환경에서 fake 본인 확인 공급자를 사용할 수 없다.

---

### 작업 1: 워크스페이스와 검증 명령

**파일:**
- Create: `.nvmrc`
- Create: `README.md`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.prettierignore`
- Create: `prettier.config.mjs`
- Create: `apps/mobile/**` via Expo SDK 57 template
- Create: `apps/admin/**` via Next.js 16 App Router template
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/smoke.test.ts`
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `tests/package.json`
- Create: `tests/vitest.config.ts`
- Create: `supabase/config.toml`
- Modify: `AGENTS.md`

**인터페이스:**
- Consumes: 승인 spec과 기존 `FRONTEND.MD`의 workspace 구조.
- Produces: 루트 명령 `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm supabase`.

- [ ] **Step 1: Node와 workspace 메타데이터를 작성한다**

```json
{
  "name": "jpkrlove",
  "private": true,
  "packageManager": "pnpm@11.17.0",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "dev": "turbo dev",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "build": "turbo build",
    "supabase": "supabase"
  },
  "devDependencies": {
    "prettier": "3.9.6",
    "supabase": "2.110.0",
    "turbo": "2.10.7",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

`.nvmrc`는 `24`로 고정하고 workspace에는 `apps/*`, `packages/*`, `tests`를 등록한다. 생성된 앱 package 이름은 `@jpkrlove/mobile`, `@jpkrlove/admin`, 통합 테스트 package 이름은 `@jpkrlove/integration-tests`로 바꾼다.

- [ ] **Step 2: 앱과 패키지를 scaffold한다**

Run:

```bash
pnpm dlx create-expo-app@latest apps/mobile --template default@sdk-57
pnpm create next-app@latest apps/admin --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-pnpm
pnpm supabase init
pnpm --filter @jpkrlove/domain add zod@4.4.3
pnpm --filter @jpkrlove/domain add --save-dev vitest@4.1.10
pnpm --filter @jpkrlove/api-client add @supabase/supabase-js@2.111.0 '@jpkrlove/domain@workspace:*'
pnpm --filter @jpkrlove/mobile add @supabase/supabase-js@2.111.0 @tanstack/react-query@5.101.4 zod@4.4.3 zustand@5.0.14 react-hook-form@7.83.0 @hookform/resolvers@5.5.7 i18next@26.3.6 react-i18next@17.0.11 '@jpkrlove/domain@workspace:*' '@jpkrlove/api-client@workspace:*'
pnpm --filter @jpkrlove/mobile add --save-dev jest-expo@57.0.2 @testing-library/react-native@14.0.1
pnpm --filter @jpkrlove/mobile exec expo install expo-secure-store
pnpm --filter @jpkrlove/admin add @supabase/supabase-js@2.111.0 zod@4.4.3 @jpkrlove/domain@workspace:*
pnpm --filter @jpkrlove/admin add --save-dev vitest@4.1.10 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.0 jsdom@30.0.1
pnpm --filter @jpkrlove/integration-tests add --save-dev vitest@4.1.10 @supabase/supabase-js@2.111.0
```

Expected: Expo SDK 57 앱, Next.js App Router 앱, 공용 package와 `supabase/config.toml`이 생성되고 lockfile에 정확한 의존성이 기록된다. Expo route는 `apps/mobile/src/app`으로 옮기고 `expo-router`가 해당 경로를 사용하도록 설정한다.

- [ ] **Step 3: 실패하는 workspace smoke test를 작성한다**

```ts
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from './index';

describe('domain package', () => {
  it('exports the product name', () => {
    expect(PRODUCT_NAME).toBe('jpkrlove');
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/domain test`

Expected: FAIL because `PRODUCT_NAME` is not exported.

- [ ] **Step 5: 최소 package 구현과 Turbo 파이프라인을 추가한다**

```ts
export const PRODUCT_NAME = 'jpkrlove' as const;
```

각 package에 `lint`, `typecheck`, `test`, `build` 스크립트를 정의하고 Turbo task가 같은 이름을 실행하도록 한다. `README.md`에 필수 도구, 환경 변수 이름, 로컬 Supabase, 앱/운영 화면 실행, 검증 명령을 기록하고 `AGENTS.md`의 명령 섹션도 실제 pnpm 명령으로 갱신한다.

- [ ] **Step 6: 루트 검증을 실행한다**

Run:

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm supabase --version
```

Expected: 모든 명령 exit 0, Supabase CLI `2.110.0`.

- [ ] **Step 7: 커밋한다**

```bash
git add .nvmrc README.md package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .gitignore .prettierignore prettier.config.mjs apps packages supabase AGENTS.md
git commit -m "build: scaffold jpkrlove workspace"
```

### 작업 2: 초대·신원·프로필 도메인 계약

**파일:**
- Create: `packages/domain/src/errors.ts`
- Create: `packages/domain/src/invitation.ts`
- Create: `packages/domain/src/identity.ts`
- Create: `packages/domain/src/profile.ts`
- Create: `packages/domain/src/member-state.ts`
- Create: `packages/domain/src/onboarding.test.ts`
- Modify: `packages/domain/src/index.ts`

**인터페이스:**
- Consumes: Zod 4.4.3.
- Produces: `InvitationCodeSchema`, `IdentityStatusSchema`, `ProfileDraftSchema`, `PublicProfileSchema`, `deriveMemberState()`, `DomainErrorCode`.

- [ ] **Step 1: 상태 전이 실패 테스트를 작성한다**

```ts
import { describe, expect, it } from 'vitest';
import { deriveMemberState } from './member-state';

describe('deriveMemberState', () => {
  it('keeps an unverified profile private', () => {
    expect(deriveMemberState({
      invitation: 'accepted',
      identity: 'pending',
      profileReview: 'approved',
      paused: false,
      restriction: 'none',
    })).toBe('identity_pending');
  });

  it('publishes only verified and approved members', () => {
    expect(deriveMemberState({
      invitation: 'accepted',
      identity: 'verified',
      profileReview: 'approved',
      paused: false,
      restriction: 'none',
    })).toBe('active');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/domain test -- onboarding.test.ts`

Expected: FAIL because schemas and `deriveMemberState` do not exist.

- [ ] **Step 3: 계약을 구현한다**

```ts
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

export function deriveMemberState(input: {
  invitation: 'waiting' | 'accepted';
  identity: 'not_started' | 'pending' | 'verified' | 'failed' | 'expired';
  profileReview: 'draft' | 'submitted' | 'changes_requested' | 'approved' | 'rejected';
  paused: boolean;
  restriction: 'none' | 'temporary_hidden' | 'suspended' | 'banned';
}): MemberState {
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
```

`ProfileDraftSchema`는 성별 자기 설정값, 국적, 지역, 사진 2~6장, 자기소개, 결혼 시기, 거주 계획, 자녀, 흡연, 언어 수준을 검증한다. 생년월일은 본인 확인 결과만 사용하며 profile form에서 다시 받지 않는다. 공개 매퍼는 나이만 계산하고 법적 이름, 생년월일, 연락처를 반환할 수 없게 별도 타입으로 만든다.

- [ ] **Step 4: 경계값 테스트를 추가하고 통과시킨다**

Run: `pnpm --filter @jpkrlove/domain test`

Expected: PASS for 1/2/6/7 photos, underage, missing locale, invalid state transitions.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/domain
git commit -m "feat: define onboarding domain contracts"
```

### 작업 3: 데이터베이스 스키마와 RLS

**파일:**
- Create: `supabase/migrations/202607290001_foundation_identity_profile.sql`
- Create: `supabase/tests/000_helpers.sql`
- Create: `supabase/tests/01_foundation_rls.test.sql`
- Create: `supabase/seed.sql`

**인터페이스:**
- Consumes: Supabase `auth.users`.
- Produces: `app.members`, `app.profiles`, `app.profile_media`, `app.profile_preferences`, `private.invitation_codes`, `private.invitation_redemptions`, `private.identity_cases`, `private.profile_reviews`, `private.operator_roles`, `audit.events`, 비공개 Storage bucket, RPC `app.redeem_invitation(text)`, 안정 인터페이스 `app.has_active_access(uuid)`.

- [ ] **Step 1: pgTAP 인증 helper를 작성한다**

```sql
create schema if not exists tests;

create or replace function tests.get_supabase_uid(identifier text)
returns uuid language sql stable as $$
  select id from auth.users where raw_user_meta_data->>'identifier' = identifier
$$;

create or replace function tests.create_supabase_user(identifier text)
returns uuid language plpgsql as $$
declare new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (
    new_id,
    'authenticated',
    'authenticated',
    identifier || '@example.test',
    jsonb_build_object('identifier', identifier)
  );
  return new_id;
end
$$;

create or replace function tests.authenticate_as(identifier text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', tests.get_supabase_uid(identifier),
    'role', 'authenticated'
  )::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;
```

- [ ] **Step 2: 거부 우선 pgTAP 테스트를 작성한다**

```sql
begin;
select plan(4);
select tests.create_supabase_user('member_a');
select tests.create_supabase_user('member_b');
select tests.authenticate_as('member_a');
select is_empty(
  $$ select * from app.profiles where user_id = tests.get_supabase_uid('member_b') $$,
  'unapproved profile is not readable'
);
select throws_ok(
  $$ select * from private.identity_cases $$,
  '42501',
  null,
  'member cannot read identity cases'
);
select lives_ok(
  $$ select * from app.profiles where user_id = tests.get_supabase_uid('member_a') $$,
  'member can read own profile draft'
);
select is_empty(
  $$ select * from storage.objects where bucket_id = 'profile-media' $$,
  'members cannot list private profile media objects'
);
select * from finish();
rollback;
```

- [ ] **Step 3: 실패를 확인한다**

Run:

```bash
pnpm supabase start
pnpm supabase db reset
pnpm supabase test db
```

Expected: FAIL because schemas and tables do not exist.

- [ ] **Step 4: 스키마, 제약조건, 상태 전이 RPC를 구현한다**

```sql
create schema if not exists app;
create schema if not exists private;
create schema if not exists audit;

create table app.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null check (locale in ('ja', 'ko')),
  self_identified_gender text not null check (self_identified_gender in ('woman', 'man')),
  member_state text not null default 'waiting',
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.profiles (
  user_id uuid primary key references app.members(user_id) on delete cascade,
  display_name text not null,
  nationality text not null check (nationality in ('JP', 'KR')),
  region_code text not null,
  introduction text not null check (char_length(introduction) between 40 and 1000),
  review_status text not null default 'draft',
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table app.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(user_id) on delete cascade,
  object_path text not null unique,
  position smallint not null check (position between 1 and 6),
  moderation_status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (user_id, position)
);
```

`app.profiles`에는 `marriage_timing`, `residence_country`, `willing_to_relocate`, `children_preference`, `smoking_status`, `ja_level`, `ko_level`, `willing_to_learn_partner_language`, nullable `occupation_category`를 추가한다. `app.profile_preferences`에는 `min_age`, `max_age`, `allowed_residence_countries`, 네 공개 조건별 `*_is_required`를 둔다. `private.identity_cases`에는 `provider_case_id`, `verified_birth_date`, `verified_nationality`, `document_status`, `face_match_status`, `liveness_status`, `status`, `verified_at`, `retention_until`을 둔다. 법적 이름과 신분증 원문은 기본 provider-session 흐름에서 jpkrlove DB에 저장하지 않는다. invitation은 code hash, `jp_women|kr_men` cohort, capacity, used count, expiry를 저장하고 원문 code는 저장하지 않는다. operator role은 `support`, `profile_reviewer`, `identity_reviewer`, `recommender`, `moderator`, `admin`으로 제한한다.

migration은 `profile-media`와 `identity-documents` private bucket을 만들고, `{userId}/{mediaId}` 경로만 소유자가 쓰게 한다. `profile-media` 읽기는 본인 또는 양쪽 모두 `active`인 회원에게만 허용하고 목록 조회는 막는다. `identity-documents`는 production provider가 직접 보관하지 못하는 예외 흐름에서만 background worker가 사용하며 회원 정책을 만들지 않는다. `app.redeem_invitation(code)`는 `auth.uid()`를 내부에서 사용하고 고정 `search_path`를 가진 SECURITY DEFINER 함수로 만든다. `app.has_active_access(user_id)`는 이 단계에서 승인된 beta invitation을 확인하고, 4단계에서 entitlement ledger를 읽도록 본문만 교체한다. 모든 Data API 테이블에 RLS를 활성화하고, `active` 프로필만 적격 회원이 읽도록 한다.

- [ ] **Step 5: 로컬 DB를 재구축하고 테스트한다**

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
pnpm supabase db lint --local
```

Expected: pgTAP PASS, database lint has no errors, 두 bucket은 public이 아니며 draft 이미지와 신원 자료를 다른 회원이 읽을 수 없다.

- [ ] **Step 6: 커밋한다**

```bash
git add supabase
git commit -m "feat: add onboarding database policies"
```

### 작업 4: 초대 사용과 본인 확인 공급자 경계

**파일:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/identity-provider.ts`
- Create: `supabase/functions/_shared/fake-identity-provider.ts`
- Create: `supabase/functions/redeem-invitation/index.ts`
- Create: `supabase/functions/create-identity-session/index.ts`
- Create: `supabase/functions/identity-webhook/index.ts`
- Create: `supabase/functions/tests/identity-flow.test.ts`
- Create: `supabase/functions/deno.json`

**인터페이스:**
- Consumes: authenticated user JWT, invitation code, `IdentityProvider`.
- Produces: `app.internal_create_identity_case(...)`, `app.internal_apply_identity_result(...)` RPC.
- Produces:

```ts
export interface IdentityProvider {
  createSession(input: {
    userId: string;
    callbackUrl: string;
  }): Promise<{ providerCaseId: string; redirectUrl: string }>;
  verifyWebhook(request: Request): Promise<{
    providerCaseId: string;
    status: 'verified' | 'failed';
    verifiedBirthDate: string;
    verifiedNationality: 'JP' | 'KR';
  }>;
}
```

- [ ] **Step 1: fake provider와 webhook 실패 테스트를 작성한다**

```ts
Deno.test('rejects an unsigned identity webhook', async () => {
  const response = await handleIdentityWebhook(
    new Request('http://local/identity-webhook', {
      method: 'POST',
      body: JSON.stringify({ providerCaseId: 'case-1', status: 'verified' }),
    }),
    fakeProvider,
  );
  assertEquals(response.status, 401);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: FAIL because provider and handlers are missing.

- [ ] **Step 3: 초대와 본인 확인 함수를 구현한다**

`redeem-invitation`은 JWT 사용자 ID와 코드만 받아 DB RPC를 호출한다. `create-identity-session`은 accepted invitation을 확인한 뒤 provider session을 만들고 `private.identity_cases`를 `pending`으로 저장한다. webhook은 서명을 검증한 뒤 provider case ID로 한 번만 상태를 전이하며, 검증 시점의 생년월일 기준 18세 미만 또는 초대 그룹과 다른 국적은 `failed`로 처리한다.

- [ ] **Step 4: production fake 방지 테스트를 추가한다**

```ts
Deno.test('refuses fake provider in production', () => {
  assertThrows(
    () => selectIdentityProvider({ environment: 'production', mode: 'fake' }),
    Error,
    'FAKE_PROVIDER_FORBIDDEN',
  );
});
```

- [ ] **Step 5: 함수 테스트를 통과시킨다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: PASS for valid invite, exhausted invite, duplicate redemption, signed webhook, replayed webhook, underage, nationality mismatch, production fake rejection.

- [ ] **Step 6: 커밋한다**

```bash
git add supabase/functions
git commit -m "feat: add invitation and identity workflows"
```

### 작업 5: 모바일 온보딩과 프로필 제출

**파일:**
- Create: `packages/api-client/src/auth-repository.ts`
- Create: `packages/api-client/src/supabase-auth-repository.ts`
- Create: `packages/api-client/src/onboarding-repository.ts`
- Create: `packages/api-client/src/supabase-onboarding-repository.ts`
- Create: `apps/mobile/src/features/auth/screens/email-otp-screen.tsx`
- Create: `apps/mobile/src/features/auth/model/use-auth-session.ts`
- Create: `apps/mobile/src/features/onboarding/model/use-onboarding.ts`
- Create: `apps/mobile/src/features/onboarding/screens/invitation-screen.tsx`
- Create: `apps/mobile/src/features/onboarding/screens/identity-screen.tsx`
- Create: `apps/mobile/src/features/profile/screens/profile-editor-screen.tsx`
- Create: `apps/mobile/src/features/profile/components/photo-field.tsx`
- Create: `apps/mobile/src/app/(onboarding)/invite.tsx`
- Create: `apps/mobile/src/app/(auth)/login.tsx`
- Create: `apps/mobile/src/app/(onboarding)/identity.tsx`
- Create: `apps/mobile/src/app/(onboarding)/profile.tsx`
- Create: `apps/mobile/src/i18n/index.ts`
- Create: `apps/mobile/src/i18n/locales/ja.json`
- Create: `apps/mobile/src/i18n/locales/ko.json`
- Create: `apps/mobile/src/features/onboarding/onboarding-flow.test.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`

**인터페이스:**
- Consumes: Supabase Auth email OTP, `ProfileDraftSchema`, Edge Functions from Task 4.
- Produces: `AuthRepository` methods `requestEmailOtp`, `verifyEmailOtp`, `signOut`; `OnboardingRepository` methods `redeemInvitation`, `createIdentitySession`, `uploadProfileMedia`, `reorderProfileMedia`, `deleteProfileMedia`, `saveProfileDraft`, `submitProfile`.

- [ ] **Step 1: 라우팅 실패 테스트를 작성한다**

```tsx
it('does not route a pending identity to discovery', async () => {
  const repository = createFakeOnboardingRepository({
    memberState: 'identity_pending',
  });
  render(<OnboardingGate repository={repository} />);
  expect(await screen.findByText('본인 확인을 완료해 주세요')).toBeOnTheScreen();
  expect(screen.queryByText('오늘의 소개')).not.toBeOnTheScreen();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/mobile test -- onboarding-flow.test.tsx`

Expected: FAIL because screens and gate are missing.

- [ ] **Step 3: 저장소와 화면을 최소 구현한다**

세션은 `expo-secure-store` 기반 adapter에만 저장하고 이메일 요청 결과는 계정 존재 여부와 무관한 같은 문구를 반환한다. 인증 후 초대, 신원, 프로필 상태에 따라 Expo Router route를 결정한다. 폼은 React Hook Form과 Zod resolver를 사용하고, repository가 소유자 경로에 사진을 업로드한 뒤 `app.profile_media`의 위치를 원자적으로 갱신한다. 사진은 2장 미만 또는 6장 초과일 때 제출을 막고, 삭제·재정렬·업로드 실패 재시도를 제공한다. 법적 이름과 생년월일은 공개 preview 모델에 포함하지 않는다.

- [ ] **Step 4: 일본어·한국어와 접근성 테스트를 추가한다**

Run:

```bash
pnpm --filter @jpkrlove/mobile test
pnpm --filter @jpkrlove/mobile typecheck
```

Expected: PASS for OTP request/verify/expiry/logout, account-enumeration-safe errors, invalid invite, waiting list, identity pending/failed/verified, 2~6 photos, upload retry/reorder/delete, signed URL expiry, long Japanese/Korean copy, accessible labels.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/mobile packages/api-client
git commit -m "feat: add mobile onboarding flow"
```

### 작업 6: 운영 프로필 심사와 수직 통합 테스트

**파일:**
- Create: `apps/admin/src/lib/supabase/server.ts`
- Create: `apps/admin/src/lib/operator-role.ts`
- Create: `apps/admin/src/middleware.ts`
- Create: `apps/admin/src/app/login/page.tsx`
- Create: `apps/admin/src/app/mfa/page.tsx`
- Create: `apps/admin/src/app/reviews/page.tsx`
- Create: `apps/admin/src/app/reviews/[caseId]/page.tsx`
- Create: `apps/admin/src/app/reviews/actions.ts`
- Create: `apps/admin/src/app/reviews/actions.test.ts`
- Create: `tests/integration/onboarding-flow.test.ts`
- Create: `.github/workflows/ci.yml`

**인터페이스:**
- Consumes: provisioned operator account, Supabase Auth AAL2, role-checked `app.admin_profile_review_cases()`/`app.admin_review_profile(...)` RPC, profile state transitions.
- Produces: `reviewProfile({ caseId, decision, reason })`, published active profile, CI baseline.

- [ ] **Step 1: 권한과 상태 전이 실패 테스트를 작성한다**

```ts
it('requires a reason when requesting profile changes', async () => {
  await expect(reviewProfile({
    actor: { role: 'profile_reviewer' },
    caseId: 'review-1',
    decision: 'changes_requested',
    reason: '',
  })).rejects.toMatchObject({ code: 'REVIEW_REASON_REQUIRED' });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/admin test -- actions.test.ts`

Expected: FAIL because review action does not exist.

- [ ] **Step 3: server-only 심사 action과 페이지를 구현한다**

middleware는 미인증 사용자를 login으로, AAL2 미만 운영자를 MFA challenge로 보낸다. self-signup은 제공하지 않고 `private.operator_roles`가 없는 계정을 거부한다. 브라우저에는 case ID와 심사용 파생 데이터만 전달한다. 승인 시 DB 함수가 identity `verified`, review `approved`를 다시 확인하고 `member_state='active'`, `published_at=now()`를 한 트랜잭션으로 적용한다. 변경 요청과 거부는 이유를 감사 로그에 기록한다.

- [ ] **Step 4: 전체 수직 흐름 테스트를 작성한다**

```ts
it('publishes only after invite, identity, and review', async () => {
  const member = await fixtures.createInvitedMember();
  await api.redeemInvitation(member);
  await fakeIdentity.verify(member);
  await api.submitProfile(member, validProfile);
  await admin.approveProfile(member);
  expect(await api.getMemberState(member)).toBe('active');
  expect(await api.getPublicProfile(member)).not.toHaveProperty('birthDate');
});
```

- [ ] **Step 5: 전체 검증을 실행한다**

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit 0; AAL1 운영자는 review action을 실행할 수 없고 AAL2 역할 보유자만 허용된다.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/admin tests .github
git commit -m "feat: add profile review workflow"
```
