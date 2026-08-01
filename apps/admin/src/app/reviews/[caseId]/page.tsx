import Link from 'next/link';
import { redirect } from 'next/navigation';
import { reviewProfileFromForm } from '../actions';
import { getOperatorContext, getReviewCase } from '../../../lib/operator-role';

export const dynamic = 'force-dynamic';

export default async function ReviewCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const operator = await getOperatorContext();
  if (!operator) redirect('/login');
  if (operator.aal !== 'aal2') redirect('/mfa');
  if (!operator.roles.includes('profile_reviewer')) {
    redirect('/login?error=forbidden');
  }
  const { caseId } = await params;
  const reviewCase = await getReviewCase(caseId);
  if (!reviewCase)
    return (
      <main>
        <h1>審査対象が見つかりません</h1>
        <Link href="/reviews">一覧へ戻る</Link>
      </main>
    );
  return (
    <main>
      <Link href="/reviews">審査一覧</Link>
      <h1>{reviewCase.displayName}</h1>
      <p>
        {reviewCase.nationality} / {reviewCase.regionCode}
      </p>
      <p>{reviewCase.introduction}</p>
      <p>本人確認: {reviewCase.identityVerified ? 'verified' : '未確認'}</p>
      <ul>
        {reviewCase.photos.map((photo) => (
          <li key={photo.id}>
            <a href={photo.signedUrl} target="_blank" rel="noreferrer">
              写真 {photo.position}
            </a>
          </li>
        ))}
      </ul>
      <form action={reviewProfileFromForm.bind(null, caseId)}>
        <label htmlFor="reason">理由（差し戻し・却下では必須）</label>
        <textarea id="reason" name="reason" maxLength={2000} />
        <button name="decision" value="approved" type="submit">
          承認
        </button>
        <button name="decision" value="changes_requested" type="submit">
          修正依頼
        </button>
        <button name="decision" value="rejected" type="submit">
          却下
        </button>
      </form>
    </main>
  );
}
