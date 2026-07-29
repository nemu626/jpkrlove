# 추천·매칭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 적격 회원에게 매일 최대 5명을 공정하게 추천하고, 숨겨진 쌍방 의사로 정확히 하나의 매칭과 대화를 생성한다.

**아키텍처:** 추천 적격성과 순위 계산은 순수 도메인 함수와 PostgreSQL 읽기 모델로 분리한다. 일일 Edge Function이 버전이 지정된 추천 결과를 저장하며, 결정 제출 RPC가 관심 수명·넘김·동시 매칭 불변조건을 트랜잭션으로 보장한다.

**기술 스택:** TypeScript, Zod, PostgreSQL, Supabase Edge Functions/Cron, TanStack Query, Expo Router, Vitest, pgTAP

## 전역 제약

- 이 계획은 `2026-07-29-foundation-identity-profile.md` 완료 후 시작한다.
- 추천 대상은 `active` 회원만이며 차단, 제한, 기존 매칭, 과거 넘김을 제외한다.
- 인기도와 받은 관심 수를 순위 입력으로 사용하지 않는다.
- 오전 8시 Asia/Tokyo에 최대 5건을 추가하고 미확인 추천은 최대 10건이다.
- `interested` 결정은 30일, `passed` 결정은 무기한 유효하다.
- 한쪽 결정은 상호 일치 전까지 상대와 분석 화면에 공개하지 않는다.
- 운영 추천은 회원당 주 1건이며 필수 조건을 우회하지 않는다.

---

### Task 1: 추천·결정·매칭 도메인 계약

**파일:**
- Create: `packages/domain/src/recommendation.ts`
- Create: `packages/domain/src/matching.ts`
- Create: `packages/domain/src/recommendation.test.ts`
- Modify: `packages/domain/src/index.ts`

**인터페이스:**
- Consumes: `PublicProfile`, matching-only preferences.
- Consumes: `app.has_active_access(uuid)`의 결과를 포함한 eligibility context.
- Produces: `evaluateEligibility()`, `rankCandidate()`, `RecommendationDecisionSchema`, `InterestExpiresAt`.

- [ ] **Step 1: 적격성과 순위 실패 테스트를 작성한다**

```ts
it('rejects a candidate outside either age range', () => {
  expect(evaluateEligibility(memberA, memberB, context)).toEqual({
    eligible: false,
    reason: 'AGE_RANGE_MISMATCH',
  });
});

it('does not accept popularity as a rank input', () => {
  expect(() => rankCandidate({
    marriageTiming: 1,
    childrenPreference: 1,
    smokingPreference: 1,
    residencePlan: 1,
    languageLearning: 1,
    recentActivity: 1,
    exposureFairness: 1,
    popularity: 10,
  } as never)).toThrow();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/domain test -- recommendation.test.ts`

Expected: FAIL because recommendation contracts do not exist.

- [ ] **Step 3: 순수 도메인 함수를 구현한다**

```ts
export type RankFactors = Readonly<{
  marriageTiming: number;
  childrenPreference: number;
  smokingPreference: number;
  residencePlan: number;
  languageLearning: number;
  recentActivity: number;
  exposureFairness: number;
}>;

export function rankCandidate(factors: RankFactors): number {
  return (
    factors.marriageTiming * 30 +
    factors.childrenPreference * 20 +
    factors.smokingPreference * 15 +
    factors.residencePlan * 15 +
    factors.languageLearning * 10 +
    factors.recentActivity * 5 +
    factors.exposureFairness * 5
  );
}
```

`evaluateEligibility`는 양쪽의 active access, 상호 연령, 거주 계획, 하드 필터, 차단/제한/기존 관계를 구조화된 reason code로 반환한다.

- [ ] **Step 4: 모든 도메인 테스트를 통과시킨다**

Run: `pnpm --filter @jpkrlove/domain test`

Expected: PASS for every eligibility reason and deterministic tie-break.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/domain
git commit -m "feat: define recommendation domain rules"
```

### Task 2: 추천·결정·매칭 데이터 모델과 정책

**파일:**
- Create: `supabase/migrations/202607290002_recommendation_matching.sql`
- Create: `supabase/tests/02_recommendation_matching.test.sql`
- Modify: `supabase/seed.sql`

**인터페이스:**
- Produces: `app.recommendation_batches`, `app.recommendation_items`, `private.recommendation_decisions`, `app.matches`, `app.conversations`, `private.operator_recommendations`.

- [ ] **Step 1: 비공개 결정과 매칭 RLS 테스트를 작성한다**

```sql
select throws_ok(
  $$ select * from private.recommendation_decisions $$,
  '42501',
  null,
  'members cannot read one-sided decisions'
);
select results_eq(
  $$ select count(*) from app.matches where member_a = tests.get_supabase_uid('member_a') $$,
  array[0::bigint],
  'one-sided interest does not create a match'
);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm supabase test db`

Expected: FAIL because recommendation tables are missing.

- [ ] **Step 3: 테이블과 제약조건을 구현한다**

```sql
create table app.recommendation_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references app.recommendation_batches(id) on delete cascade,
  member_id uuid not null references app.members(user_id),
  candidate_id uuid not null references app.members(user_id),
  rule_version text not null,
  rank_score integer not null,
  reason_codes text[] not null,
  source text not null check (source in ('algorithm', 'operator')),
  shown_at timestamptz,
  expires_at timestamptz not null,
  unique (member_id, candidate_id, batch_id),
  check (member_id <> candidate_id)
);
```

`private.recommendation_decisions`는 `interested|passed`, `expires_at`, idempotency key를 저장한다. `app.matches`는 정렬된 사용자 쌍 고유 키로 중복을 차단하고 `app.conversations`와 일대일 관계를 가진다.

- [ ] **Step 4: RLS와 제약 테스트를 통과시킨다**

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
pnpm supabase db lint --local
```

Expected: PASS, no policy or lint errors.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase
git commit -m "feat: add recommendation and match schema"
```

### Task 3: 일일 추천 생성기

**파일:**
- Create: `supabase/functions/_shared/recommendation-engine.ts`
- Create: `supabase/functions/generate-daily-recommendations/index.ts`
- Create: `supabase/functions/tests/recommendation-engine.test.ts`
- Modify: `supabase/migrations/202607290002_recommendation_matching.sql`
- Modify: `supabase/config.toml`

**인터페이스:**
- Consumes: `app.internal_recommendation_candidates(member_id, as_of)` RPC and `rankCandidate`.
- Produces: `generateForMember({ memberId, asOf, ruleVersion }): RecommendationItem[]`.

- [ ] **Step 1: 후보 0명과 최대치 실패 테스트를 작성한다**

```ts
Deno.test('returns zero instead of relaxing hard constraints', async () => {
  const result = await engine.generateForMember({
    memberId: 'member-a',
    asOf: new Date('2026-07-29T23:00:00Z'),
    ruleVersion: 'v1',
  });
  assertEquals(result, []);
});

Deno.test('never keeps more than ten unopened items', async () => {
  const result = await engine.generateForMember(inputWithEightOpenItems);
  assertEquals(result.length, 2);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: FAIL because recommendation engine is missing.

- [ ] **Step 3: 결정적 생성기를 구현한다**

활성 회원, 상호 선호, 차단/제한, 과거 결정, 기존 매칭을 한 쿼리의 읽기 모델로 가져온다. 순위는 도메인 함수로 계산하고 같은 점수는 노출 횟수, candidate UUID 순으로 정렬한다. 생성 결과와 `rule_version='v1'`을 저장한다.

- [ ] **Step 4: Cron과 재실행 안전성을 추가한다**

migration에서 `pg_cron`, `pg_net`, Vault를 활성화하고 `0 23 * * *` UTC에 `generate-daily-recommendations`를 호출한다. 배포 절차는 Vault의 `project_url`과 `function_service_token` 존재 여부를 먼저 검증하며, 토큰을 migration이나 로그에 기록하지 않는다. 함수는 내부 service token만 허용한다. 같은 `Asia/Tokyo` 날짜·회원·rule version의 batch가 있으면 기존 batch ID를 반환하고 중복 생성하지 않는다.

- [ ] **Step 5: 함수 테스트를 통과시킨다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: PASS for 0/2/5 candidates, open-item cap, blocked candidate, passed candidate, expired interest re-entry, exposure tie-break, repeated invocation, unauthenticated schedule call rejection.

- [ ] **Step 6: 커밋한다**

```bash
git add supabase/functions supabase/config.toml
git commit -m "feat: generate daily recommendations"
```

### Task 4: 결정 제출과 원자적 매칭

**파일:**
- Modify: `supabase/migrations/202607290002_recommendation_matching.sql`
- Create: `supabase/functions/submit-recommendation-decision/index.ts`
- Create: `supabase/functions/tests/matching-concurrency.test.ts`

**인터페이스:**
- Produces: RPC `app.submit_recommendation_decision(...)`, endpoint `submitDecision({ recommendationId, decision, idempotencyKey }) -> { status: 'recorded' | 'matched'; matchId?: string }`.

- [ ] **Step 1: 쌍방 동시 결정 실패 테스트를 작성한다**

```ts
it('creates one match for concurrent reciprocal interests', async () => {
  const [a, b] = await Promise.all([
    apiA.submitDecision(itemA.id, 'interested', 'key-a'),
    apiB.submitDecision(itemB.id, 'interested', 'key-b'),
  ]);
  expect([a.status, b.status]).toContain('matched');
  expect(await db.countMatches(pair)).toBe(1);
  expect(await db.countConversations(pair)).toBe(1);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/integration-tests test -- matching-concurrency.test.ts`

Expected: FAIL because submit endpoint and RPC do not exist.

- [ ] **Step 3: SECURITY DEFINER RPC와 얇은 endpoint를 구현한다**

RPC는 추천 소유권, 만료, 현재 적격성, idempotency key를 확인한다. `interested` 반대 결정이 유효하면 정렬된 pair key로 match를 upsert하고 conversation을 같은 트랜잭션에서 만든다. `passed`는 만료 없이 저장한다.

- [ ] **Step 4: 동시성과 재실행 테스트를 통과시킨다**

Run:

```bash
pnpm supabase db reset
pnpm --filter @jpkrlove/integration-tests test -- matching-concurrency.test.ts
pnpm supabase test db
```

Expected: 100 concurrent retries still produce one decision result, match, conversation.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase
git commit -m "feat: add atomic match decisions"
```

### Task 5: 모바일 오늘의 소개와 매칭 화면

**파일:**
- Create: `packages/api-client/src/recommendation-repository.ts`
- Create: `packages/api-client/src/supabase-recommendation-repository.ts`
- Create: `apps/mobile/src/features/recommendation/screens/today-screen.tsx`
- Create: `apps/mobile/src/features/recommendation/components/profile-card.tsx`
- Create: `apps/mobile/src/features/recommendation/components/empty-recommendation.tsx`
- Create: `apps/mobile/src/features/matching/screens/matches-screen.tsx`
- Create: `apps/mobile/src/features/recommendation/today-screen.test.tsx`
- Create: `apps/mobile/src/app/(tabs)/today.tsx`
- Create: `apps/mobile/src/app/(tabs)/matches.tsx`

**인터페이스:**
- Consumes: recommendation list and `submitDecision`.
- Produces: Today UI, match list, TanStack Query keys `recommendations.today()` and `matches.list()`.

- [ ] **Step 1: 숨겨진 관심과 후보 0명 UI 테스트를 작성한다**

```tsx
it('shows a neutral empty state without widening constraints', async () => {
  render(<TodayScreen repository={fakeRepository.withItems([])} />);
  expect(await screen.findByText('오늘 소개는 여기까지예요')).toBeOnTheScreen();
  expect(screen.queryByText('조건을 자동으로 넓혔어요')).not.toBeOnTheScreen();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/mobile test -- today-screen.test.tsx`

Expected: FAIL because feature screens are missing.

- [ ] **Step 3: 화면과 저장소 adapter를 구현한다**

`interested`와 `passed`는 명시적 버튼으로 제공하고, 처리 중 중복 탭을 막는다. 한쪽 관심 상태와 받은 관심 목록은 UI 모델에 존재하지 않는다. match가 생성되면 matches query만 invalidate하고 상대 결정 정보는 표시하지 않는다.

- [ ] **Step 4: 로케일·접근성·오류 테스트를 통과시킨다**

Run:

```bash
pnpm --filter @jpkrlove/mobile test
pnpm --filter @jpkrlove/mobile typecheck
```

Expected: PASS for 0/1/5 items, expired item, offline mutation, matched response, Japanese/Korean long text.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/mobile packages/api-client
git commit -m "feat: add daily recommendation experience"
```

### Task 6: 운영 추천과 단계 전체 검증

**파일:**
- Create: `apps/admin/src/app/recommendations/page.tsx`
- Create: `apps/admin/src/app/recommendations/actions.ts`
- Create: `apps/admin/src/app/recommendations/actions.test.ts`
- Create: `tests/integration/recommendation-matching-flow.test.ts`

**인터페이스:**
- Produces: role-checked RPC `app.admin_create_operator_recommendation(...)`, server action `createOperatorRecommendation({ memberId, candidateId, reason })`.

- [ ] **Step 1: 필수 조건 우회와 주간 제한 실패 테스트를 작성한다**

```ts
it('rejects a second operator recommendation in the same week', async () => {
  await createOperatorRecommendation(first);
  await expect(createOperatorRecommendation(second)).rejects.toMatchObject({
    code: 'OPERATOR_RECOMMENDATION_WEEKLY_LIMIT',
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/admin test -- actions.test.ts`

Expected: FAIL because action is missing.

- [ ] **Step 3: server-only action과 감사 기록을 구현한다**

운영자는 적격성 결과를 확인할 수 있지만 private message와 한쪽 결정을 볼 수 없다. 추천 이유는 일본어·한국어 운영 번역을 별도 입력하고 감사 이벤트를 남긴다.

- [ ] **Step 4: 단계 전체 검증을 실행한다**

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
deno task --config supabase/functions/deno.json test
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/admin tests
git commit -m "feat: add operator recommendations"
```
