# 운영·분석·출시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 100명 클로즈드 베타를 운영하고 E1을 측정하며, 계정 제어·체험 권한·관측성·CI/CD·출시 게이트를 완성한다.

**아키텍처:** 운영 앱은 server-only adapter와 역할별 API를 사용한다. 제품 이벤트는 메시지 본문과 신원정보 없이 append-only analytics 테이블에 기록하고 SQL read model로 베타 지표를 계산한다. Membership은 내부 entitlement ledger를 진실 공급원으로 사용하고 외부 결제 provider는 승인된 adapter 뒤에 둔다.

**기술 스택:** Next.js, Supabase/PostgreSQL/Cron/Queues, Expo/EAS, Sentry, Maestro 2.4.0, GitHub Actions, pgTAP, Vitest

## 전역 제약

- 이 계획은 messaging/translation/safety 계획 완료 후 시작한다.
- 베타는 무료이며 `beta_access` entitlement를 사용한다.
- 정식 모델은 본인 확인·심사 후 14일 체험과 월 구독이다.
- 일본과 한국의 기능 차이는 허용하지 않고 현지 가격만 조정한다.
- analytics 이벤트에 메시지·번역문·신분증·정확한 생년월일을 넣지 않는다.
- production 데이터는 비프로덕션으로 복사하지 않는다.
- 실제 사용자 확대는 권한, 백업, 운영, 지표 검증 게이트 통과 후에만 가능하다.

---

### 작업 1: 멤버십과 계정 상태 계약

**파일:**
- Create: `packages/domain/src/membership.ts`
- Create: `packages/domain/src/account-control.ts`
- Create: `packages/domain/src/membership.test.ts`
- Modify: `packages/domain/src/index.ts`

**인터페이스:**
- Produces: `EntitlementSchema`, `deriveAccessState()`, `AccountDeletionRequestSchema`.

- [ ] **Step 1: beta, trial, expired 상태 실패 테스트를 작성한다**

```ts
it.each([
  [{ kind: 'beta_access', endsAt: null }, 'active'],
  [{ kind: 'trial', endsAt: '2026-08-12T00:00:00Z' }, 'active'],
  [{ kind: 'trial', endsAt: '2026-07-28T00:00:00Z' }, 'expired'],
])('derives access state', (entitlement, expected) => {
  expect(deriveAccessState(entitlement, new Date('2026-07-29T00:00:00Z')))
    .toBe(expected);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/domain test -- membership.test.ts`

Expected: FAIL because membership contracts are missing.

- [ ] **Step 3: 계약을 구현한다**

```ts
export type EntitlementKind = 'beta_access' | 'trial' | 'subscription';
export type AccessState = 'active' | 'expired' | 'revoked';

export interface EntitlementProvider {
  getStatus(userId: string): Promise<{
    externalCustomerId: string;
    activeUntil: string | null;
    willRenew: boolean;
  }>;
}
```

pause는 신규 추천/관심만 중지하고 기존 conversation을 유지한다. deletion request는 `requested|processing|completed|failed` 상태를 가진다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run: `pnpm --filter @jpkrlove/domain test`

Expected: PASS for beta, trial day 14 boundary, subscription cancellation, pause, deletion transitions.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/domain
git commit -m "feat: define membership and account controls"
```

### 작업 2: 권한 원장과 계정 제어 워크플로

**파일:**
- Create: `supabase/migrations/202607290004_membership_account_control.sql`
- Create: `supabase/tests/04_membership_account.test.sql`
- Create: `supabase/functions/pause-profile/index.ts`
- Create: `supabase/functions/request-data-export/index.ts`
- Create: `supabase/functions/request-account-deletion/index.ts`
- Create: `supabase/functions/process-account-deletions/index.ts`
- Create: `supabase/functions/tests/account-control.test.ts`

**인터페이스:**
- Produces: `app.entitlements`, `private.purchase_events`, `private.data_requests`, pause/export/delete endpoints.

- [ ] **Step 1: 만료 시 비공개와 삭제 재시도 실패 테스트를 작성한다**

```sql
select is(
  app.can_be_recommended(tests.get_supabase_uid('expired_member')),
  false,
  'expired member is not recommendable'
);
```

```ts
Deno.test('retries provider deletion without duplicating the request', async () => {
  const first = await requestDeletion(memberId, 'delete-key');
  const second = await requestDeletion(memberId, 'delete-key');
  assertEquals(first.requestId, second.requestId);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run:

```bash
pnpm supabase test db
deno task --config supabase/functions/deno.json test
```

Expected: FAIL because membership tables and functions are missing.

- [ ] **Step 3: ledger와 상태 전이를 구현한다**

beta seed는 각 승인 회원에게 `beta_access`를 부여한다. 정식 trial은 profile approval 시 한 번만 14일 entitlement를 만든다. 이 migration은 기존 호출자를 바꾸지 않고 `app.has_active_access(uuid)` 본문을 entitlement ledger 기준으로 교체한다. access 만료는 profile을 비공개로 전환하고 기존 conversation을 read-only로 유지한다.

pause, export, deletion은 idempotency key를 사용한다. 삭제 worker는 외부 공급자 정리, storage 삭제, 개인 데이터 익명화를 단계별로 기록하고 법적 보존 대상은 별도 hold reason으로 남긴다.

- [ ] **Step 4: 정책과 함수 테스트를 통과시킨다**

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
deno task --config supabase/functions/deno.json test
```

Expected: PASS for beta entitlement, trial creation once, expiration, pause/resume, export ownership, deletion retry, legal hold.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase
git commit -m "feat: add membership and account control"
```

### 작업 3: 개인정보 최소 분석과 E1 읽기 모델

**파일:**
- Create: `packages/domain/src/analytics.ts`
- Create: `packages/domain/src/analytics.test.ts`
- Create: `supabase/migrations/202607290005_analytics.sql`
- Create: `supabase/tests/05_analytics.test.sql`
- Create: `supabase/functions/record-product-event/index.ts`
- Create: `supabase/functions/submit-price-research/index.ts`
- Create: `supabase/functions/tests/analytics-flow.test.ts`

**인터페이스:**
- Produces: `ProductEventSchema`, `private.product_events`, `private.price_research_responses`, `private.operator_work_logs`, `analytics.beta_funnel_daily`, `analytics.meaningful_conversation_rate`, `analytics.beta_scorecard`.

- [ ] **Step 1: 금지 payload 실패 테스트를 작성한다**

```ts
it.each(['messageBody', 'translatedText', 'birthDate', 'documentUrl'])(
  'rejects forbidden analytics key %s',
  (key) => {
    expect(() => ProductEventSchema.parse({
      name: 'message_sent',
      actorId: crypto.randomUUID(),
      properties: { [key]: 'secret' },
    })).toThrow();
  },
);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/domain test -- analytics.test.ts`

Expected: FAIL because event schema is missing.

- [ ] **Step 3: 허용 이벤트와 append-only 저장을 구현한다**

```ts
export const ProductEventNameSchema = z.enum([
  'invitation_accepted',
  'identity_verified',
  'profile_published',
  'recommendation_shown',
  'decision_submitted',
  'match_created',
  'first_message_sent',
  'reciprocal_three_messages_reached',
  'conversation_active_day_7',
  'price_research_submitted',
]);
```

DB trigger 또는 workflow transaction이 핵심 event를 기록한다. client가 임의 actor ID나 funnel 완료 event를 만들 수 없게 server-only endpoint로 제한한다. event별 property allowlist를 두고 `decision_submitted`에는 interested/passed 값이나 상대 ID를 저장하지 않는다. 가격 조사 응답은 `displayed_monthly_price`, `currency`, `willing_to_pay`만 저장하고 자유문은 수집하지 않는다. 심사·운영 추천·신고 처리 action은 시작/종료 시각과 작업 종류를 `operator_work_logs`에 남겨 활동 회원당 월간 수동 운영 시간을 계산한다.

- [ ] **Step 4: E1 SQL을 구현하고 fixture로 검증한다**

E1 denominator는 identity verified 시점의 회원이고 numerator는 14일 안에 같은 conversation에서 양쪽 각각 3통 이상 전송한 회원이다. 일본 여성과 한국 남성을 별도 행으로 계산하고 두 비율 차이를 함께 반환한다. `beta_scorecard`는 본인 확인 60%, 프로필 공개 80%, 주간 추천 확인 70%, 양쪽 E1 25%, E1 격차 10%p 이내, 7일 대화 지속 30%, 월 2,000~3,500엔 상당 지불 의사 30%, 활동 회원당 월 20분 이하를 각각 분리된 numerator/denominator와 함께 반환한다.

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
pnpm --filter @jpkrlove/domain test
```

Expected: fixture의 JP women `25.0`, KR men `25.0`, gap `0.0`; 모든 목표의 numerator/denominator와 pass/fail이 결정적으로 계산되고 forbidden columns가 없다.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/domain supabase
git commit -m "feat: add privacy-safe beta analytics"
```

### 작업 4: 운영 대시보드와 역할 감사

**파일:**
- Create: `apps/admin/src/app/dashboard/page.tsx`
- Create: `apps/admin/src/app/invitations/page.tsx`
- Create: `apps/admin/src/app/members/[memberId]/page.tsx`
- Create: `apps/admin/src/components/metric-table.tsx`
- Create: `apps/admin/src/components/audit-timeline.tsx`
- Create: `apps/admin/src/app/dashboard/page.test.tsx`
- Modify: `apps/admin/src/lib/operator-role.ts`

**인터페이스:**
- Consumes: role-checked `app.admin_beta_scorecard(...)`, `app.admin_invitation_cohorts()`, `app.admin_member_summary(...)`, `app.admin_audit_events(...)` RPC.
- Produces: country/gender-separated funnel, invitation cohort controls, member state view.

- [ ] **Step 1: 집계 혼합 방지와 역할 실패 테스트를 작성한다**

```tsx
it('renders both sides separately and never only a blended E1', async () => {
  render(await DashboardPage());
  expect(screen.getByText('일본 여성')).toBeInTheDocument();
  expect(screen.getByText('한국 남성')).toBeInTheDocument();
  expect(screen.getByText('격차')).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/admin test -- page.test.tsx`

Expected: FAIL because dashboard is missing.

- [ ] **Step 3: server-rendered 운영 화면을 구현한다**

대시보드는 초대→인증→공개→추천 확인→E1→7일 지속, 가격 조사, 수동 운영 시간을 양쪽과 beta week별로 표시한다. 한쪽만 목표를 달성하면 전체 성공으로 합치지 않는다. invitation manager는 일본 여성 50명/한국 남성 50명의 그룹별 capacity와 used count만 변경한다. member detail은 역할별 파생 정보와 감사 기록만 표시하며 일반 메시지를 조회하지 않는다.

- [ ] **Step 4: 접근성·권한 테스트를 통과시킨다**

Run:

```bash
pnpm --filter @jpkrlove/admin test
pnpm --filter @jpkrlove/admin typecheck
pnpm --filter @jpkrlove/admin build
```

Expected: PASS for viewer/reviewer/moderator/admin permissions and table semantics.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/admin
git commit -m "feat: add beta operations dashboard"
```

### 작업 5: 모바일 계정 제어·권한 게이트·가격 조사

**파일:**
- Create: `packages/api-client/src/membership-repository.ts`
- Create: `packages/api-client/src/supabase-membership-repository.ts`
- Create: `apps/mobile/src/features/account/screens/membership-screen.tsx`
- Create: `apps/mobile/src/features/account/screens/privacy-controls-screen.tsx`
- Create: `apps/mobile/src/features/research/screens/pricing-research-screen.tsx`
- Create: `apps/mobile/src/features/account/account-control.test.tsx`
- Create: `apps/mobile/src/app/profile/membership.tsx`
- Create: `apps/mobile/src/app/profile/privacy.tsx`
- Create: `apps/mobile/src/app/research/pricing.tsx`

**인터페이스:**
- Consumes: entitlement, pause, export, delete, price-research endpoints.
- Produces: `MembershipGate`, pause/resume, export, delete confirmation, week-7 randomized local-price display and willingness response.

- [ ] **Step 1: 만료·일시정지 UI 실패 테스트를 작성한다**

```tsx
it('hides an expired profile without deleting existing conversations', async () => {
  render(<MembershipGate state="expired" conversationCount={2} />);
  expect(screen.getByText('プロフィールは非公開です')).toBeOnTheScreen();
  expect(screen.getByText('2件の過去の会話')).toBeOnTheScreen();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/mobile test -- account-control.test.tsx`

Expected: FAIL because membership UI is missing.

- [ ] **Step 3: 화면과 repository adapter를 구현한다**

beta에서는 과금 UI 대신 beta access 상태를 표시한다. trial/subscription 상태 모델은 구현하되 production provider가 승인되기 전 purchase button을 feature flag로 숨긴다. week-7 cohort에만 서버가 배정한 2,000~3,500엔 상당의 현지 가격과 비구매형 지불 의사 조사를 한 번 표시한다. 배정 가격은 client가 바꿀 수 없고 응답은 멱등하다. 삭제는 결과와 법적 보존 예외를 설명하는 이중 확인을 사용한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run:

```bash
pnpm --filter @jpkrlove/mobile test
pnpm --filter @jpkrlove/mobile typecheck
```

Expected: PASS for beta, trial, expired, paused, export pending/completed, delete request, week-7 eligibility, assigned-price integrity, duplicate survey response.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/mobile packages/api-client
git commit -m "feat: add membership and privacy controls"
```

### 작업 6: 관측성, CI/CD, E2E, 문서 정합성

**파일:**
- Create: `packages/config/src/redact-pii.ts`
- Create: `packages/config/src/redact-pii.test.ts`
- Create: `.java-version`
- Create: `.maestro-version`
- Create: `.github/workflows/mobile-preview.yml`
- Create: `.github/workflows/mobile-e2e.yml`
- Create: `.github/workflows/supabase-preview.yml`
- Create: `apps/mobile/eas.json`
- Create: `apps/mobile/src/lib/observability.ts`
- Create: `apps/admin/src/instrumentation.ts`
- Create: `apps/admin/src/instrumentation-client.ts`
- Create: `apps/admin/sentry.server.config.ts`
- Create: `apps/admin/sentry.edge.config.ts`
- Create: `tests/e2e/maestro/ja-critical-flow.yaml`
- Create: `tests/e2e/maestro/ko-critical-flow.yaml`
- Create: `docs/runbooks/identity-provider-outage.md`
- Create: `docs/runbooks/translation-provider-outage.md`
- Create: `docs/runbooks/safety-incident.md`
- Create: `docs/runbooks/restore.md`
- Create: `docs/runbooks/beta-weekly-operations.md`
- Modify: `DESIGN.MD`
- Modify: `FRONTEND.MD`
- Modify: `BACKEND.MD`
- Modify: `ARCHITECTURE.MD`
- Modify: `docs/product-planning.md`

**인터페이스:**
- Produces: PII-redacted telemetry, preview deployment gates, critical E2E, approved-doc consistency.

- [ ] **Step 1: PII redaction 실패 테스트를 작성한다**

```ts
it('redacts message and identity fields recursively', () => {
  expect(redactPii({
    messageBody: 'secret',
    nested: { documentUrl: 'signed-url', requestId: 'req-1' },
  })).toEqual({
    messageBody: '[REDACTED]',
    nested: { documentUrl: '[REDACTED]', requestId: 'req-1' },
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/config test -- redact-pii.test.ts`

Expected: FAIL because redaction helper is missing.

- [ ] **Step 3: redaction, Sentry 초기화, CI workflow를 구현한다**

먼저 `pnpm --filter @jpkrlove/mobile add @sentry/react-native@8.20.0`과 `pnpm --filter @jpkrlove/admin add @sentry/nextjs@10.68.0`을 실행한다. 양쪽 SDK의 `beforeSend`와 structured logger가 `redactPii`를 통과하게 하고 메시지·번역·신원·서명 URL을 breadcrumb와 replay에서 제외한다. CI는 `format:check`/lint/typecheck/unit, `supabase db reset`, pgTAP, function tests, build를 순서대로 실행한다. preview mobile build는 같은 commit의 preview backend가 성공한 뒤 생성한다. production job은 `PROVIDER_MODE=fake`를 거부한다.

- [ ] **Step 4: Maestro 핵심 흐름과 운영 runbook을 작성한다**

`.java-version`은 `17`, `.maestro-version`은 `2.4.0`으로 고정하고 CI가 설치 후 `maestro --version`을 검증한다. 각 언어 흐름은 초대, fake identity, profile approval fixture, 추천, 상호 매칭, 원문 메시지, 요청형 번역, 차단을 iOS와 Android에서 실행한다. runbook은 owner, 탐지 신호, 즉시 조치, 사용자 공지, 복구 확인을 구체적으로 포함한다. beta 운영 runbook은 1~2주 온보딩, 3~6주 사용, 7주 가격 조사, 8주 인터뷰와 go/iterate/stop 판정을 명시한다.

- [ ] **Step 5: 기존 문서를 승인 spec과 맞춘다**

`DESIGN.MD`는 사진 2장, 받은 관심 메뉴 제거, 초대제 타깃을 반영한다. `FRONTEND.MD`는 실제 workspace, route, 상태 관리, i18n, 테스트와 build 명령을 반영한다. `BACKEND.MD`와 `ARCHITECTURE.MD`는 자동 번역 enqueue를 명시적 요청으로 바꾼다. product planning은 무료 탐색과 프리미엄 상담을 장기 가설로 표시한다.

- [ ] **Step 6: 전체 출시 전 검증을 실행한다**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm supabase db reset
pnpm supabase test db
deno task --config supabase/functions/deno.json test
maestro test tests/e2e/maestro/ja-critical-flow.yaml
maestro test tests/e2e/maestro/ko-critical-flow.yaml
```

Expected: all commands exit 0; Maestro CLI is `2.4.0`; no test contains production personal data; 합성 사용자로 identity 실패, 후보 0명, 잘못 승인한 profile 회수, 신고, 긴급 정지, 번역 장애, backup restore를 재현한 기록이 남는다.

- [ ] **Step 7: 커밋한다**

```bash
git add package.json pnpm-lock.yaml packages/config .github .java-version .maestro-version apps/mobile apps/admin tests/e2e docs DESIGN.MD FRONTEND.MD BACKEND.MD ARCHITECTURE.MD
git commit -m "chore: add beta release gates"
```
