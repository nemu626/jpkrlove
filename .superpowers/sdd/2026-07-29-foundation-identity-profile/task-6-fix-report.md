# Task 6 修正レポート

## Status

Complete.

## Commit

- `934edf5` `fix: close profile review boundaries and add db ci`
- `cb1bb8f` `fix: enforce profile media storage ownership`

## 修正内容

- reviewer JWTでは対象者のStorage owner policyを通過できないため、審査対象のRPCをAAL2+`profile_reviewer`で再確認した後、server-only service-role signerで300秒のsigned URLを発行する。service keyはNext client bundleへ渡さない。
- `admin_review_profile`はuserごとの最新submitted review case（`created_at desc, id desc`）だけを受け付け、差し戻し・再提出後の古いcase IDを拒否する。
- pgTAPにreviewerの直接Storage拒否、stale case拒否を追加した。
- CIにSupabase CLIのstart、db reset、pgTAP、db lint jobを追加した。in-memory integration fixtureは画面状態の補助であり、DB契約の代替にしないことをREADMEへ明記した。
- `app.profile_media`のauthenticated直接INSERT/UPDATEポリシーに、会員IDのパス接頭辞と`storage.objects.owner_id`一致を追加した。これにより別会員のStorageオブジェクトパスをメタデータへ差し替えても、service-role署名器へ到達しない。
- 審査一覧の最新submittedケース選択を`created_at`のみの比較から`created_at desc, id desc`へ変更し、同一タイムスタンプの重複ケースを排除した。

## 検証

- Admin unit: 8/8
- Admin typecheck/lint: PASS
- Admin build: PASS（Next 16 middleware deprecation warningのみ）
- pgTAP: foundation 47/47、security 39/39、identity 40/40、mobile 22/22、admin 23/23
- Root verificationはTask6実装時点のformat/lint/typecheck/test/build全PASSを維持（Node 26.5.0でengine warning）。

## 残存制約

- CIのSupabase jobはDocker利用可能なGitHub runnerを前提とする。
- 実機での運営OTP/TOTP、Supabase SSR cookie、service-role signed URLの表示は未実施。
- Nextの`middleware`命名は現行ビルドで動作するが、Next 16では将来`proxy`へ移行するdeprecation warningがある。
