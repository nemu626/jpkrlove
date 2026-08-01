# Task 6 最終再レビュー

## 判定

**APPROVED**

前回再レビューの Important 1件と Minor 1件が、`cb1bb8f` の差分で解消されたことを確認した。追加のCritical/Important/Minor指摘はない。

## 修正確認

### 1. サービスロール署名前のメディア所有境界

`supabase/migrations/20260729000160_admin_profile_review.sql` の `app.profile_media` insert/update RLS は、`user_id = auth.uid()` に加えて、`object_path` が会員UUID prefixであること、`storage.objects.bucket_id = 'profile-media'`、`name = object_path`、`owner_id = auth.uid()::text` を検証する。通常の直接Data API書き込みで別会員のStorage pathを登録できず、server-only service-role signerへ不正なpathを渡す経路は閉じている。正規の profile workflow RPC も同じ所有者/path制約を検証する。

`apps/admin/src/lib/operator-role.ts` は、審査詳細取得時に通常JWTでAAL2と `profile_reviewer` roleを再確認した後、`server-only` の `createServiceRoleSupabaseClient()` を使い、署名URLの有効期間を300秒に制限する。service-role keyは `SUPABASE_SERVICE_ROLE_KEY` からのみ読み込まれ、ブラウザへ露出しない。

### 2. 最新submitted caseの一意性

一覧RPCとmutation RPCの双方が `created_at desc, id desc` で最新caseを選択する。同一timestampのcaseでも一覧表示と承認操作の対象が一致し、stale caseは `review case is not current` で拒否される。

### 3. AAL2/roleとCI

admin RPCはDB側で認証、AAL2、`profile_reviewer` roleを再確認する。AAL1、roleなし、未認証は拒否される。CIにはSupabase CLIの `start`、`db reset --local`、pgTAP実行、`db lint --local`、停止処理を含む独立database-contracts jobがある。

## 検証

- 実DB `02_foundation_review_security.test.sql`: **39/39 PASS**
- 実DB `04_admin_profile_review.test.sql`: **23/23 PASS**
- 前回確認済み admin unit/typecheck/lint/build: PASS（Next middleware deprecation warningのみ）
- Node v26.5.0は宣言範囲 `>=24 <25` 外のため、pnpm実行時にengine warningが出るが判定を妨げない。

## 結論

Task 6のDB境界、server-only運営アクション、審査UI、統合テスト、CI契約は要求を満たしている。**APPROVED**。
