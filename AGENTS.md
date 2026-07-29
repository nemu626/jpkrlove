# Repository Guidelines

## 프로젝트 구조 및 모듈 구성

이 저장소는 pnpm과 Turborepo를 사용하는 모노레포입니다. 기존 workspace 경계를 유지해 파일을 추가하세요.

- `apps/mobile/`: Expo 모바일 애플리케이션.
- `apps/admin/`: Next.js 운영 콘솔.
- `packages/`: 공유 도메인, API 클라이언트, 설정 패키지.
- `tests/`: workspace 간 통합 테스트.
- `supabase/`: 로컬 Supabase 설정과 향후 마이그레이션.
- `docs/`: 기여자 문서나 아키텍처 문서.

생성된 결과물, 로컬 캐시, 의존성 디렉터리는 버전 관리에 포함하지 마세요.

## 빌드, 테스트 및 개발 명령

- `pnpm install`: workspace 의존성을 설치합니다.
- `pnpm dev`: 모든 애플리케이션 개발 작업을 시작합니다.
- `pnpm lint`: workspace 린트를 실행합니다.
- `pnpm typecheck`: TypeScript 타입 검사를 실행합니다.
- `pnpm test`: 자동화 테스트 스위트를 실행합니다.
- `pnpm build`: 프로덕션 빌드를 생성합니다.
- `pnpm supabase start`: 로컬 Supabase 서비스를 시작합니다.

## 코딩 스타일 및 명명 규칙

이 저장소에 추가되는 언어와 프레임워크의 관례를 따르세요. 모듈은 작고 집중된 단위로 유지하고, 역할이 드러나는 이름을 사용하세요. 디렉터리는 `src/components`, `tests/integration`처럼 소문자 이름을 사용하고, 파일명은 해당 언어의 표준 관례를 따릅니다.

포맷은 `pnpm format`, 검사만 수행할 때는 `pnpm format:check`를 사용하세요.

## 테스트 지침

테스트는 `tests/` 아래에 두거나, 사용하는 프레임워크가 권장하는 경우 소스 파일 옆에 배치하세요. 테스트 파일은 검증하는 동작을 기준으로 `user-auth.test.ts` 또는 `test_user_auth.py`처럼 이름 짓습니다.

모든 기능 변경에는 기대 동작과 중요한 경계 조건을 검증하는 테스트를 포함하세요. 버그 수정에는 수정 전 실패하는 회귀 테스트를 추가하세요.

## 커밋 및 풀 리퀘스트 지침

현재 작업 공간에서는 Git 히스토리를 확인할 수 없어 저장소 고유의 커밋 규칙을 추론할 수 없습니다. `Add login validation`, `Fix asset path resolution`처럼 간결한 명령형 커밋 메시지를 사용하세요.

풀 리퀘스트에는 짧은 요약, 테스트 결과, 관련 이슈 링크를 포함하세요. 사용자 인터페이스 변경에는 스크린샷도 첨부하세요.

## 에이전트 전용 지침

항상 저장소 로컬 지침을 먼저 따르세요. `AGENTS.md`가 이미 있는 경우 요청 없이 덮어쓰지 마세요. 변경 범위는 요청된 작업에 한정하고 관련 없는 파일은 수정하지 마세요.
