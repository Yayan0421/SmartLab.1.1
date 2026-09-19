import { z } from 'zod';

export const BOOKING_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'];

/** YYYY-MM-DD, and a real calendar date (rejects 2026-02-31). */
const dateField = z
  .string({ required_error: 'Choose a date.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return (
      parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
    );
  }, 'That is not a valid calendar date.');

/** HH:MM or HH:MM:SS, normalised to HH:MM:SS for Postgres `time`. */
const timeField = z
  .string({ required_error: 'Choose a time.' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must be in HH:MM format.')
  .transform((value) => (value.length === 5 ? `${value}:00` : value));

export const createBookingSchema = z
  .object({
    computer_id: z.string().uuid('Choose a computer.'),
    booking_date: dateField,
    start_time: timeField,
    end_time: timeField,
    purpose: z.string().trim().min(3, 'Describe the purpose briefly.').max(500),
    // The laboratory subject the session is for.
    subject: z.string().trim().min(2, 'Choose a subject.').max(120),
  })
  .refine((data) => data.start_time < data.end_time, {
    message: 'The end time must be after the start time.',
    path: ['end_time'],
  });

/**
 * Reserving several workstations for one session (a class, or group work).
 * Every machine is validated separately on the server before anything is
 * written, so a partial booking can never happen.
 */
export const createBulkBookingSchema = z
  .object({
    computer_ids: z
      .array(z.string().uuid())
      .min(1, 'Choose at least one computer.')
      .max(30, 'You cannot reserve more than 30 computers at once.'),
    booking_date: dateField,
    start_time: timeField,
    end_time: timeField,
    purpose: z.string().trim().min(3, 'Describe the purpose briefly.').max(500),
    subject: z.string().trim().min(2, 'Choose a subject.').max(120),
  })
  .refine((data) => data.start_time < data.end_time, {
    message: 'The end time must be after the start time.',
    path: ['end_time'],
  });

export const decisionSchema = z.object({
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(BOOKING_STATES).optional(),
  computer_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(120).optional(),
  scope: z.enum(['upcoming', 'past', 'active']).optional(),
  sort: z.enum(['created_at', 'booking_date']).default('booking_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
