import { z } from 'zod';

export const InvitationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(6)
  .max(32)
  .regex(/^[A-Z0-9-]+$/);

export type InvitationCode = z.infer<typeof InvitationCodeSchema>;
