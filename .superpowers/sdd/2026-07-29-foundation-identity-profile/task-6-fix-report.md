# Task 6 レビュー修正レポート

## Status

Complete.

## Commit

- `934edf5` `fix: close profile review boundaries and add db ci`

## 対応内容

### 1. reviewerのprivate media署名境界

- `getReviewCase()` がserver Supabase clientでAAL2と`profile_reviewer` roleを再確認してから、
  審査RPCの結果を取得するようにした。
- Storageのowner-only policyを迂回する署名は、server-only moduleの
  `SUPABASE_SERVICE_ROLE_KEY`で作成したclientだけが短いTTL（300秒）で実行する。
- service-role clientはclient packageや画面モデルへ公開せず、reviewer JWTのStorage直接読取は
  pgTAPで拒否されることを固定した。
- unit testで非owner reviewerがservice-only signerを使い、指定pathに300秒TTLで署名することを
  検証した。

### 2. stale review caseの拒否

- `admin_review_profile()` は対象userの`submitted` caseを`created_at desc, id desc`で選び、
  引数case IDが最新行と一致しない場合はmutation前に拒否する。
- 最新行をrow lock下で確認し、差し戻し後の再提出で古いcase IDから最新profileを操作できない
  回帰をpgTAPへ追加した。

### 3. DB契約をCIへ追加

- GitHub Actionsに独立した`database-contracts` jobを追加した。
- Supabase CLI固定版で`supabase start`、`supabase db reset --local`、`supabase test db`、
  `supabase db lint --local`を実行し、migration、RLS、Storage、RPC境界をPRで検証する。
- in-memory onboarding fixtureは補助テストであり、実DB契約の代替ではないことをREADMEへ明記した。

## TDD / 検証

レビュー前は、reviewer JWTのStorage owner policyにより非owner mediaを署名できない状態、
stale case IDがmutationへ到達できる状態、CIでpgTAPを実行していない状態だった。

修正後の結果:

- admin unit: 8/8
- admin typecheck / lint: PASS
- pgTAP foundation: 47/47
- pgTAP security: 37/37
- pgTAP identity: 40/40
- pgTAP mobile profile: 22/22
- pgTAP admin review: 23/23

## 環境制約

- この環境ではSupabase CLIが`~/.supabase/telemetry.json`を書けないため、ローカルCLIの
  `db lint`は実行できなかった。host-networkのPostgreSQL 17.6 containerへmigrationを適用し、
  同じDBで上記pgTAPを実行した。
- admin Next buildはGoogle Fonts取得がネットワーク制限で失敗した。今回の変更によるTypeScript、
  lint、unit testの失敗ではない。
