# 統合テストの位置づけ

`onboarding-flow.test.ts` は、画面遷移とドメイン状態の補助的なin-memory fixtureです。
認証、RLS、Storage、審査RPC、マイグレーションの契約は、Supabase CLIで実行する
`supabase test db`（CIの`database-contracts` job）が検証します。in-memory fixtureを
実DB契約の代替にしないでください。
