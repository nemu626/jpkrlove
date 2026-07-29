# jpkrlove MVP 구현 로드맵

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 승인된 인증 기반 데일리 소개 MVP를 네 개의 독립적으로 검증 가능한 단계로 구현한다.

**아키텍처:** pnpm/Turborepo 모노레포 안에 Expo 모바일 앱, Next.js 운영 앱, 순수 TypeScript 도메인 패키지, Supabase/PostgreSQL 백엔드를 둔다. 각 단계는 이전 단계의 공개 인터페이스만 사용하며, 데이터베이스 RLS와 트랜잭션이 최종 권한 및 불변조건 경계가 된다.

**기술 스택:** Node.js 24 LTS, pnpm 11.17.0, Turborepo 2.10.7, TypeScript, Expo SDK 57, React Native 0.86, Next.js 16.2, Supabase CLI 2.110, Deno 2, PostgreSQL, Zod, TanStack Query, React Hook Form, Vitest/Jest/pgTAP/Maestro

## 전역 제약

- 일본어(`ja`)와 한국어(`ko`)를 첫 빌드부터 동일한 기능으로 제공한다.
- production 개인정보를 development 또는 preview로 복사하지 않는다.
- service-role 키와 공급자 비밀 값은 모바일 또는 브라우저 번들에 포함하지 않는다.
- `private`, `audit`, `analytics` schema는 Data API에 노출하지 않고 user/admin/internal 용도가 분리된 `app` RPC만 경계로 사용한다.
- Data API에 노출되는 모든 테이블은 기본 거부 RLS 정책과 pgTAP 테스트를 가진다.
- 중요한 뮤테이션은 `Idempotency-Key`를 받고 재실행 시 같은 결과를 반환한다.
- 본인 확인 전 프로필은 비공개이며 다른 프로필을 조회할 수 없다.
- 번역은 사용자가 특정 메시지에서 명시적으로 요청한 경우에만 실행한다.
- 한쪽의 관심 표시는 상호 결정 전까지 상대에게 공개하지 않는다.
- 기능 구현은 실패 테스트, 최소 구현, 통과 테스트 순서로 진행한다.
- 각 작업은 지정된 테스트를 통과한 뒤 별도 커밋한다.

---

## 계획 분할

| 순서 | 계획 | 독립적으로 확인 가능한 결과 |
| --- | --- | --- |
| 1 | [`2026-07-29-foundation-identity-profile.md`](./2026-07-29-foundation-identity-profile.md) | 초대 코드로 가입하고, 로컬 본인 확인을 완료하고, 프로필 심사를 거쳐 공개 상태가 된다. |
| 2 | [`2026-07-29-recommendation-matching.md`](./2026-07-29-recommendation-matching.md) | 적격 사용자에게 일일 추천을 만들고, 비공개 쌍방 의사로 하나의 매칭과 대화를 생성한다. |
| 3 | [`2026-07-29-messaging-translation-safety.md`](./2026-07-29-messaging-translation-safety.md) | 매칭 사용자가 원문 메시지와 요청형 번역을 사용하고, 즉시 차단하거나 증거를 신고한다. |
| 4 | [`2026-07-29-operations-analytics-release.md`](./2026-07-29-operations-analytics-release.md) | 운영 권한, 베타 지표, 계정 제어, 체험 권한, CI/CD와 출시 게이트를 완성한다. |

## 단계 의존성

```text
1. Foundation / Identity / Profile
   └─ 2. Recommendation / Matching
      └─ 3. Messaging / Translation / Safety
         └─ 4. Operations / Analytics / Release
```

각 계획은 앞 단계가 main 브랜치에 병합되고 전체 검증이 통과한 뒤 시작한다. 뒷 단계가 요구하는 인터페이스 변경은 앞 단계 구현을 직접 우회하지 않고 별도 호환 커밋으로 추가한다.

## 승인 설계 추적성

| 승인 설계 범위 | 구현 계획 |
| --- | --- |
| 2~3 제품 방향·타깃·참여 조건 | 1의 초대/신원/프로필 계약, 2의 상호 적격성 |
| 4 베타 모집·과금·사업 가설 | 4의 entitlement, 초대 cohort, 운영 dashboard와 provider gate |
| 5.1~5.3 등록·본인 확인·프로필 심사 | 1 전체 |
| 5.4~5.5 추천·매칭 | 2 전체 |
| 5.6 및 8 메시지·번역·연락처·알림 | 3의 메시지, 요청형 번역, generic push |
| 6 추천·결정 규칙 | 2의 순수 도메인 규칙, 생성기, 원자적 결정 RPC |
| 7 공개·비공개·매칭 전용 프로필 | 1의 schema/Storage/RLS, 2의 추천 read model |
| 9 안전·운영·계정 제어 | 3의 차단/신고/운영 조치, 4의 pause/export/delete |
| 10~11 모듈·데이터 흐름·오류 | 각 계획의 repository/provider 경계와 오류 테스트 |
| 12 측정·8주 베타 판정 | 4의 개인정보 최소 이벤트, E1 read model, 운영 dashboard |
| 13 테스트·출시 조건 | 각 단계 검증과 4의 CI/E2E/runbook |
| 14 MVP 제외 범위 | 네 계획의 전역 제약과 API/UI 부재 테스트 |
| 15~16 구현 분할·기준 문서 정합성 | 이 roadmap과 4의 문서 수정 작업 |

## 공급자 게이트

로컬 및 CI에서는 결정적인 fake adapter를 사용한다. 다음 production adapter는 계약, 법률, 데이터 처리, 일본·한국 지원 범위를 검토한 별도 ADR 승인 없이는 활성화하지 않는다.

- `IdentityProvider`
- `TranslationProvider`
- `EntitlementProvider`
- 푸시/이메일 공급자

production 빌드는 `PROVIDER_MODE=fake`이면 실패해야 한다. 클로즈드 베타를 실제 사용자에게 배포하기 전 공급자별 계약 테스트와 삭제·보존 절차를 추가한다.

## 완료 정의

- [ ] 네 개 계획의 모든 체크박스와 커밋이 완료되었다.
- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`가 루트에서 성공한다.
- [ ] `pnpm supabase db reset`, `pnpm supabase test db`, `deno task --config supabase/functions/deno.json test`가 성공한다.
- [ ] Maestro 핵심 흐름이 iOS와 Android의 일본어·한국어 조합에서 성공한다.
- [ ] 합성 사용자로 본인 확인 실패, 후보 0명, 동시 매칭, 번역 장애, 신고, 긴급 정지 리허설을 완료한다.
- [ ] 기존 `DESIGN.MD`, `FRONTEND.MD`, `BACKEND.MD`, `ARCHITECTURE.MD`, `docs/product-planning.md`가 승인 spec과 실제 구현에 일치한다.
- [ ] 실제 사용자 초대 전 개인정보·법률 검토, 백업 복원, 운영 담당자 지정이 완료된다.
