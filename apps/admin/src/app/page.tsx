import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>jpkrlove 運営</h1>
      <p>本人確認済みプロフィールを審査します。</p>
      <Link href="/reviews">プロフィール審査へ</Link>
    </main>
  );
}
