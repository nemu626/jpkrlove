import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOperatorContext, listReviewCases } from '../../lib/operator-role';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const operator = await getOperatorContext();
  if (!operator) redirect('/login');
  if (operator.aal !== 'aal2') redirect('/mfa');
  if (!operator.roles.includes('profile_reviewer')) {
    redirect('/login?error=forbidden');
  }
  const cases = await listReviewCases();
  return (
    <main>
      <h1>プロフィール審査</h1>
      <p>{cases.length}件の審査待ち</p>
      {cases.length === 0 ? <p>審査待ちのプロフィールはありません。</p> : null}
      <ul>
        {cases.map((reviewCase) => (
          <li key={reviewCase.caseId}>
            <Link href={`/reviews/${reviewCase.caseId}`}>
              {reviewCase.displayName} ({reviewCase.nationality})
            </Link>
            <span>
              {' '}
              写真{reviewCase.photoCount}枚 / {reviewCase.submittedAt}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
