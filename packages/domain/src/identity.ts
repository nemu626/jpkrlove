import { z } from 'zod';

export const IdentityStatusSchema = z.enum([
  'not_started',
  'pending',
  'verified',
  'failed',
  'expired',
]);

const BirthDateSchema = z.string().refine(isCalendarDate, {
  message: 'Expected an ISO calendar date',
});

export const VerifiedIdentitySchema = z.strictObject({
  status: IdentityStatusSchema,
  legalName: z.string().trim().min(1).max(200),
  birthDate: BirthDateSchema,
  contact: z.strictObject({
    email: z.email(),
    phoneNumber: z.string().trim().min(1).max(32),
  }),
});

export type IdentityStatus = z.infer<typeof IdentityStatusSchema>;
export type VerifiedIdentity = z.infer<typeof VerifiedIdentitySchema>;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
