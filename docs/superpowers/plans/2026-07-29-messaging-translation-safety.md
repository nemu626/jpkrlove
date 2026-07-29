# 메시지·번역·안전 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 활성 매칭 사용자가 비공개 원문 메시지를 안전하게 교환하고, 선택한 메시지만 번역하며, 즉시 차단하거나 증거를 신고할 수 있게 한다.

**아키텍처:** 메시지·번역·안전은 별도 모듈과 테이블을 사용한다. 메시지 RPC가 활성 매칭과 차단을 송신 직전에 검사하고, 명시적 번역 endpoint가 durable queue를 통해 provider adapter를 호출하며, 신고 시 사용자가 선택한 메시지만 증거 snapshot으로 복사한다.

**기술 스택:** TypeScript, PostgreSQL RLS, Supabase Realtime/Queues/Edge Functions, Expo Notifications, TanStack Query, Vitest, pgTAP, React Native Testing Library

## 전역 제약

- 이 계획은 recommendation/matching 계획 완료 후 시작한다.
- 메시지는 텍스트만 지원하고 최대 1,000자다.
- 읽음, 입력 중, 마지막 접속 시각, 메시지 편집, 상대 화면 삭제를 구현하지 않는다.
- 운영자는 일반 메시지를 조회할 수 없고 신고자가 제출한 증거만 역할에 따라 조회한다.
- 번역은 메시지별 사용자 요청으로만 실행하며 원문을 덮어쓰지 않는다.
- 번역 provider 장애가 원문 송수신을 막지 않는다.
- 차단은 성공 응답 전에 양방향으로 적용한다.
- 푸시 알림은 메시지 본문을 포함하지 않는다.

---

### 작업 1: 메시지·번역·안전 도메인 계약

**파일:**
- Create: `packages/domain/src/messaging.ts`
- Create: `packages/domain/src/translation.ts`
- Create: `packages/domain/src/safety.ts`
- Create: `packages/domain/src/messaging.test.ts`
- Modify: `packages/domain/src/index.ts`

**인터페이스:**
- Produces: `SendMessageSchema`, `TranslationRequestSchema`, `TranslationFeedbackSchema`, `ReportSchema`, `EndMatchSchema`, `AppealSchema`, `ModerationActionSchema`, `detectContactExchange()`.

- [ ] **Step 1: 길이와 신고 증거 실패 테스트를 작성한다**

```ts
it('rejects messages over 1000 characters', () => {
  expect(() => SendMessageSchema.parse({
    conversationId: crypto.randomUUID(),
    clientMessageId: crypto.randomUUID(),
    body: 'a'.repeat(1001),
  })).toThrow();
});

it('requires at least one selected message for a message report', () => {
  expect(() => ReportSchema.parse({
    category: 'harassment',
    messageIds: [],
    detail: '',
  })).toThrow();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/domain test -- messaging.test.ts`

Expected: FAIL because contracts are missing.

- [ ] **Step 3: 타입과 검증을 구현한다**

```ts
export const ReportCategorySchema = z.enum([
  'impersonation',
  'suspected_married',
  'money_request_or_scam',
  'harassment',
  'sexual_content',
  'discrimination_or_threat',
  'age_violation',
  'other',
]);
```

`detectContactExchange`는 전화번호, URL, LINE/Kakao 키워드를 client warning용 boolean으로만 반환하고 메시지를 차단하지 않는다.

- [ ] **Step 4: 도메인 테스트를 통과시킨다**

Run: `pnpm --filter @jpkrlove/domain test`

Expected: PASS for 1/1000/1001 chars, empty evidence, all report categories, translation feedback, match end, appeal reason, contact warning patterns.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/domain
git commit -m "feat: define messaging and safety contracts"
```

### 작업 2: 메시지·번역·신고 데이터 모델과 RLS

**파일:**
- Create: `supabase/migrations/202607290003_messaging_translation_safety.sql`
- Create: `supabase/tests/03_messaging_safety.test.sql`

**인터페이스:**
- Produces: `app.messages`, `app.message_translations`, `app.message_visibility`, `app.translation_feedback`, `app.blocks`, `app.match_terminations`, `app.reports`, `app.appeals`, `private.report_evidence`, `private.moderation_actions`, `private.message_rate_windows`.

- [ ] **Step 1: 비회원·운영자 메시지 접근 거부 테스트를 작성한다**

```sql
select is_empty(
  $$ select * from app.messages where conversation_id = '00000000-0000-0000-0000-000000000001' $$,
  'non-member cannot read conversation messages'
);
select is_empty(
  $$ select * from app.messages $$,
  'operator role does not receive blanket message access'
);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm supabase test db`

Expected: FAIL because message and safety tables do not exist.

- [ ] **Step 3: 테이블, 인덱스, RLS를 구현한다**

```sql
create table app.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app.conversations(id),
  sender_id uuid not null references app.members(user_id),
  client_message_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (sender_id, client_message_id)
);
```

`app.message_visibility`는 `(message_id, member_id)`별 `hidden_at`을 저장해 본인의 화면에만 영향을 준다. translation은 `(message_id, target_locale, provider_version)` 고유 키를 가진다. translation feedback은 요청자와 번역 ID만 공개하고 상세 내용은 운영 역할로 제한한다. report evidence는 제출 시점의 message ID, sender, body, timestamp snapshot을 private schema에 저장한다. block은 정렬된 양방향 pair를 고유 키로 저장한다. match termination은 match 상태와 conversation 쓰기 권한을 함께 종료한다. appeal은 조치 대상 본인만 제출·조회하고 원 조치 담당자가 단독 승인할 수 없게 한다.

- [ ] **Step 4: 정책 테스트를 통과시킨다**

Run:

```bash
pnpm supabase db reset
pnpm supabase test db
pnpm supabase db lint --local
```

Expected: PASS for conversation membership, per-member hidden state, translation visibility/feedback, block bidirectionality, match termination, report receipt, evidence privacy, appeal ownership.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase
git commit -m "feat: add messaging and safety policies"
```

### 작업 3: 멱등 메시지 송신과 일반 푸시

**파일:**
- Create: `supabase/functions/send-message/index.ts`
- Create: `supabase/functions/hide-message-for-self/index.ts`
- Create: `supabase/functions/_shared/notification-provider.ts`
- Create: `supabase/functions/_shared/fake-notification-provider.ts`
- Create: `supabase/functions/tests/send-message.test.ts`
- Create: `supabase/functions/process-notifications/index.ts`

**인터페이스:**
- Produces: RPC `app.send_message(...)`/`app.hide_message_for_self(...)`, endpoint `sendMessage({ conversationId, clientMessageId, body }) -> Message`, `hideMessageForSelf(messageId)`, queue `send-notification`.

- [ ] **Step 1: 차단 직후 송신과 재시도 실패 테스트를 작성한다**

```ts
Deno.test('rejects send after a block is committed', async () => {
  await safety.block({ actorId: memberA, targetId: memberB });
  const response = await sendMessage(requestFrom(memberA, validMessage));
  assertEquals(response.status, 403);
  assertEquals(await db.messageCount(), 0);
});

Deno.test('returns the same message for the same client id', async () => {
  const first = await api.send(validMessage);
  const second = await api.send(validMessage);
  assertEquals(first.id, second.id);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: FAIL because send function is missing.

- [ ] **Step 3: 송신 RPC와 endpoint를 구현한다**

DB transaction이 conversation membership, active match, current block, account state, rate window를 검사하고 message를 insert한다. commit 후 recipient ID와 conversation ID만 notification queue에 넣는다.

- [ ] **Step 4: generic notification payload를 구현한다**

```ts
const payload = {
  title: locale === 'ja' ? '新しいメッセージ' : '새 메시지',
  body: locale === 'ja' ? '新しいメッセージがあります' : '새 메시지가 있습니다',
  data: { route: `/messages/${conversationId}` },
};
```

- [ ] **Step 5: 함수 테스트를 통과시킨다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: PASS for active/inactive match, block race, 1000 chars, duplicate client ID, own-view hide, other-member visibility unchanged, rate limit, repeated-contact metadata limit, body-free push.

- [ ] **Step 6: 커밋한다**

```bash
git add supabase/functions
git commit -m "feat: add safe message delivery"
```

### 작업 4: 명시적 요청형 번역

**파일:**
- Create: `supabase/functions/_shared/translation-provider.ts`
- Create: `supabase/functions/_shared/fake-translation-provider.ts`
- Create: `supabase/functions/request-translation/index.ts`
- Create: `supabase/functions/process-translations/index.ts`
- Create: `supabase/functions/report-translation/index.ts`
- Create: `supabase/functions/tests/translation-flow.test.ts`

**인터페이스:**
- Produces:

```ts
export interface TranslationProvider {
  translate(input: {
    text: string;
    sourceLocale: 'ja' | 'ko';
    targetLocale: 'ja' | 'ko';
  }): Promise<{ text: string; providerVersion: string }>;
}
```

- [ ] **Step 1: 자동 번역 금지와 cache 실패 테스트를 작성한다**

```ts
Deno.test('sending a message does not enqueue translation', async () => {
  await messages.send(validMessage);
  assertEquals(await queues.count('translate-message'), 0);
});

Deno.test('reuses a completed translation', async () => {
  const first = await translations.request(messageId, 'ko');
  const second = await translations.request(messageId, 'ko');
  assertEquals(first.translationId, second.translationId);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: FAIL because translation functions are missing.

- [ ] **Step 3: request endpoint와 queue consumer를 구현한다**

요청자는 conversation member여야 한다. 기존 완료 translation이 있으면 즉시 반환하고, 없으면 `pending` row와 queue message를 한 번만 만든다. consumer는 timeout과 제한 재시도를 적용하고 실패 상태가 원문 message를 변경하지 않게 한다. `report-translation`은 번역을 실제로 조회할 수 있는 회원만 오역 사유를 제출하게 하고 원문이나 번역문을 analytics에 복사하지 않는다.

- [ ] **Step 4: production fake 방지와 장애 테스트를 추가한다**

Run: `deno task --config supabase/functions/deno.json test`

Expected: PASS for explicit request, cache, provider timeout, retry exhaustion, source/target locale, translation feedback ownership, production fake rejection.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase/functions
git commit -m "feat: add on-demand translation"
```

### 작업 5: 차단·신고·매칭 해제·운영 증거 접근

**파일:**
- Create: `supabase/functions/block-member/index.ts`
- Create: `supabase/functions/end-match/index.ts`
- Create: `supabase/functions/report-member/index.ts`
- Create: `supabase/functions/submit-appeal/index.ts`
- Create: `supabase/functions/tests/safety-flow.test.ts`
- Create: `apps/admin/src/app/safety/reports/page.tsx`
- Create: `apps/admin/src/app/safety/reports/[reportId]/page.tsx`
- Create: `apps/admin/src/app/safety/actions.ts`
- Create: `apps/admin/src/app/safety/actions.test.ts`

**인터페이스:**
- Produces: `blockMember(targetId)`, `endMatch({ matchId, reason })`, `reportMember({ targetId, category, messageIds, detail })`, `submitAppeal({ actionId, reason })`, role-checked RPC `app.admin_report_evidence(reportId)`/`app.admin_apply_moderation_action(...)`, server action `applyModerationAction()`.

- [ ] **Step 1: 즉시 차단과 증거 최소화 실패 테스트를 작성한다**

```ts
it('copies only messages selected by the reporter', async () => {
  const report = await api.reportMember({
    targetId: memberB,
    category: 'harassment',
    messageIds: [message2.id],
    detail: '반복적인 모욕',
  });
  expect(await admin.getEvidence(report.id)).toEqual([
    expect.objectContaining({ messageId: message2.id }),
  ]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/integration-tests test -- safety-flow.test.ts`

Expected: FAIL because safety functions are missing.

- [ ] **Step 3: block/report transaction과 moderation action을 구현한다**

block은 pair를 insert한 뒤 현재 추천과 신규 송신을 같은 transaction 경계에서 무효화한다. match end는 양쪽 대화를 read-only로 바꾸되 block이나 report를 자동 생성하지 않는다. report는 reporter가 실제로 볼 수 있는 선택 message만 snapshot한다. 영구 정지는 두 번째 승인자 ID가 필요하고 모든 action은 audit event를 남긴다. 사용자 통지에는 조치 종류, 허용된 사유 요약, appeal route를 포함하고 원 조치 담당자는 자신의 appeal을 단독 처리할 수 없다.

- [ ] **Step 4: 권한과 상태 테스트를 통과시킨다**

Run:

```bash
pnpm supabase test db
deno task --config supabase/functions/deno.json test
pnpm --filter @jpkrlove/admin test
```

Expected: PASS for block without report, unmatch without block, selected evidence only, support role denial, moderator access, emergency suspension, permanent-ban second approval, appeal ownership/separation of duty.

- [ ] **Step 5: 커밋한다**

```bash
git add supabase apps/admin
git commit -m "feat: add blocking and moderation workflows"
```

### 작업 6: 모바일 대화·번역·신고 흐름과 전체 검증

**파일:**
- Create: `packages/api-client/src/messaging-repository.ts`
- Create: `packages/api-client/src/supabase-messaging-repository.ts`
- Create: `apps/mobile/src/features/messaging/screens/conversation-screen.tsx`
- Create: `apps/mobile/src/features/messaging/components/message-bubble.tsx`
- Create: `apps/mobile/src/features/messaging/components/translation-panel.tsx`
- Create: `apps/mobile/src/features/safety/components/report-sheet.tsx`
- Create: `apps/mobile/src/features/safety/components/match-actions-sheet.tsx`
- Create: `apps/mobile/src/features/safety/screens/appeal-screen.tsx`
- Create: `apps/mobile/src/features/messaging/conversation-screen.test.tsx`
- Create: `apps/mobile/src/app/messages/[conversationId].tsx`
- Create: `apps/mobile/src/app/safety/appeal/[actionId].tsx`
- Create: `tests/integration/messaging-safety-flow.test.ts`

**인터페이스:**
- Consumes: message, translation/feedback, hide, block, end-match, report, appeal endpoints and Realtime changes.
- Produces: text chat UI, on-demand translation, own-view hide, contact warning, match action/report sheet, appeal form.

- [ ] **Step 1: 원문 우선과 번역 장애 UI 실패 테스트를 작성한다**

```tsx
it('keeps the original visible when translation fails', async () => {
  render(<ConversationScreen repository={repositoryWithTranslationFailure} />);
  expect(await screen.findByText('안녕하세요')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: '翻訳する' }));
  expect(await screen.findByText('翻訳できませんでした')).toBeOnTheScreen();
  expect(screen.getByText('안녕하세요')).toBeOnTheScreen();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jpkrlove/mobile test -- conversation-screen.test.tsx`

Expected: FAIL because conversation UI is missing.

- [ ] **Step 3: message list, send state, translation, safety UI를 구현한다**

pending/sent/failed를 명확히 표시하고 failed만 동일 client ID로 재시도한다. 화면 진입 시 conversation별 Supabase Realtime channel을 구독하고 중복 이벤트를 message ID로 제거하며 화면 이탈 시 해제한다. 첫 번역에 provider 전송 안내를 표시하고 오역 신고 command를 제공한다. 연락처 감지는 경고만 표시한다. 자신의 화면에서 숨기기와 상대 화면 삭제가 다름을 상태 모델로 보장한다. block 또는 match end 이벤트를 받으면 즉시 conversation을 read-only로 전환한다.

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
git add apps/mobile packages/api-client tests
git commit -m "feat: add private messaging experience"
```
