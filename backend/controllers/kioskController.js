import { randomBytes } from 'node:crypto';
import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { recordAudit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';
import { getSetting } from '../services/settingsService.js';
import { PUBLIC_FIELDS } from '../utils/userFields.js';
import { labToday, labMinutes } from '../utils/labTime.js';

const CHECKIN_BUCKET = 'checkins';
const MAX_PHOTO_BYTES = 900_000;

const todayISO = labToday;

/** Minutes since local midnight, for comparing against a `time` column. */
const nowMinutes = labMinutes;

function timeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Receipts are printed and handed over, so the number needs to be short
 * enough to read aloud and unique enough never to collide. Date plus six
 * random characters does both.
 */
function makeReceiptNumber() {
  const date = todayISO().replace(/-/g, '');
  return `SL-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

const BOOKING_SELECT = `
  id, user_id, computer_id, booking_date, start_time, end_time, purpose, subject, status,
  batch_id, checked_in_at, checked_out_at, receipt_no, check_in_photo_url,
  user:users!bookings_user_id_fkey ( id, full_name, email, role, department, course, id_number, avatar_url ),
  computer:computers ( id, name, computer_number, laboratory:laboratories ( name, room_number ) )
`;

const flatten = (row) => ({
  ...row,
  user: Array.isArray(row.user) ? row.user[0] : row.user,
  computer: Array.isArray(row.computer) ? row.computer[0] : row.computer,
});

/**
 * POST /api/kiosk/scan
 *
 * A card was presented. Resolves it to the holder and to what they are
 * entitled to do right now — which is the only question the kiosk asks.
 *
 * Deliberately returns *why* a booking cannot be used rather than a bare
 * refusal: somebody standing at a kiosk needs to know whether they are
 * early, late, or at the wrong machine.
 */
export const scan = asyncHandler(async (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!/^SL-[0-9A-F]{12}$/.test(code)) {
    throw ApiError.badRequest('That card was not recognised. Try scanning again.');
  }

  const { data: user, error } = await supabase
    .from(TABLES.users)
    .select(PUBLIC_FIELDS)
    .eq('qr_code', code)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!user) throw ApiError.notFound('That card is not registered. Please see the administrator.');
  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is not active. Please see the administrator.');
  }

  const policy = await getSetting('booking');
  const grace = policy.late_grace_minutes ?? 30;

  const { data: bookings } = await supabase
    .from(TABLES.bookings)
    .select(BOOKING_SELECT)
    .eq('user_id', user.id)
    .eq('booking_date', todayISO())
    .in('status', ['APPROVED', 'PENDING'])
    .order('start_time', { ascending: true });

  const minutes = nowMinutes();

  const sessions = (bookings ?? []).map((row) => {
    const booking = flatten(row);
    const start = timeToMinutes(booking.start_time);
    const end = timeToMinutes(booking.end_time);

    let state = 'ready';
    let reason = null;

    if (booking.checked_in_at) {
      state = 'active';
      reason = 'You are already checked in for this session.';
    } else if (booking.status === 'PENDING') {
      state = 'unapproved';
      reason = 'This booking is still waiting for approval.';
    } else if (minutes < start - 15) {
      state = 'early';
      reason = `Too early — check in from ${booking.start_time.slice(0, 5)}.`;
    } else if (minutes > start + grace) {
      state = 'late';
      reason = `Too late — check-in closed ${grace} minutes after ${booking.start_time.slice(0, 5)}.`;
    } else if (minutes > end) {
      state = 'over';
      reason = 'This session has already finished.';
    }

    return { ...booking, state, reason, can_check_in: state === 'ready' };
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        department: user.department,
        course: user.course,
        id_number: user.id_number,
        avatar_url: user.avatar_url,
      },
      sessions,
      grace_minutes: grace,
    },
  });
});

/**
 * POST /api/kiosk/check-in
 *
 * Confirms attendance: stores the verification photo, stamps the arrival
 * time, issues a receipt number and puts the workstation in use.
 *
 * Every rule is re-checked here. The kiosk screen already knows whether a
 * session is usable, but a kiosk is a device in a public room — it is not
 * the thing deciding who gets a computer.
 */
export const checkIn = asyncHandler(async (req, res) => {
  const bookingId = String(req.body?.booking_id ?? '');
  const batchId = String(req.body?.batch_id ?? '');
  if (!bookingId && !batchId) throw ApiError.badRequest('No session was selected.');

  /**
   * A class booking is one arrival, not twenty.
   *
   * When a member of staff reserves a set of machines for a laboratory
   * class the rows share a batch_id, and they present their card once. So
   * the whole batch is checked in together and issued a single receipt
   * listing every machine — handing somebody ten slips of paper for one
   * booking would be absurd, and a stack of receipt numbers is worse than
   * useless when the administrator has to reconcile them later.
   */
  const query = supabase.from(TABLES.bookings).select(BOOKING_SELECT);
  const { data: found, error } = batchId
    ? await query.eq('batch_id', batchId).order('start_time', { ascending: true })
    : await query.eq('id', bookingId);

  if (error) throw ApiError.internal();
  if (!found?.length) throw ApiError.notFound('That session could not be found.');

  const rows = found.map(flatten);

  // Everything in a batch belongs to one person at one time, so the first
  // row carries the details the rules and the receipt are built from.
  const booking = rows[0];

  if (rows.some((r) => r.user_id !== booking.user_id)) {
    throw ApiError.badRequest('Those sessions do not belong to the same person.');
  }

  const usable = rows.filter((r) => r.status === 'APPROVED' && !r.checked_in_at);

  if (!usable.length) {
    // Say which of the two it was, because the answer changes what the
    // person standing at the kiosk should do next.
    throw rows.some((r) => r.checked_in_at)
      ? ApiError.conflict('You are already checked in for this session.')
      : ApiError.conflict('That booking has not been approved.');
  }
  if (booking.booking_date !== todayISO()) {
    throw ApiError.conflict('That booking is not for today.');
  }

  const policy = await getSetting('booking');
  const grace = policy.late_grace_minutes ?? 30;
  const start = timeToMinutes(booking.start_time);
  const minutes = nowMinutes();

  if (minutes > start + grace) {
    throw ApiError.conflict(
      `Check-in closed ${grace} minutes after ${booking.start_time.slice(0, 5)}. This booking has expired.`
    );
  }
  if (minutes < start - 15) {
    throw ApiError.conflict(`Too early. Check in from ${booking.start_time.slice(0, 5)}.`);
  }

  // The camera shot is evidence the right person collected the machine.
  let photoUrl = null;
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(String(req.body?.photo ?? ''));
  if (match) {
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length && bytes.length <= MAX_PHOTO_BYTES) {
      const path = `${booking.user_id}/${booking.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(CHECKIN_BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

      if (!uploadError) {
        const { data: pub } = supabase.storage.from(CHECKIN_BUCKET).getPublicUrl(path);
        photoUrl = pub.publicUrl;
      } else {
        // A missing photo must not stop somebody using a machine they booked.
        console.error('[kiosk] photo upload failed:', uploadError.message);
      }
    }
  }

  const checkedInAt = new Date().toISOString();
  // One number for the whole arrival, so the paper and the administrator's
  // table agree about what happened.
  const receiptNo = makeReceiptNumber();

  const { data: updatedRows, error: updateError } = await supabase
    .from(TABLES.bookings)
    .update({
      checked_in_at: checkedInAt,
      check_in_photo_url: photoUrl,
      receipt_no: receiptNo,
    })
    .in(
      'id',
      usable.map((r) => r.id)
    )
    .is('checked_in_at', null) // two kiosks cannot check the same booking in
    .select(BOOKING_SELECT);

  if (updateError) {
    // A check-in that fails at the kiosk leaves somebody standing there, so
    // the reason belongs in the log rather than only in a generic 500.
    console.error('[kiosk] check-in failed:', updateError.message);
    throw ApiError.internal();
  }
  if (!updatedRows?.length) throw ApiError.conflict('That session was just checked in elsewhere.');

  const sessions = updatedRows
    .map(flatten)
    .sort((a, b) => (a.computer?.computer_number ?? 0) - (b.computer?.computer_number ?? 0));
  const session = sessions[0];
  const names = sessions.map((s) => s.computer?.name).filter(Boolean);

  // The machines are now occupied by this person.
  await supabase
    .from(TABLES.computers)
    .update({ status: 'IN_USE', current_user_id: booking.user_id })
    .in(
      'id',
      sessions.map((s) => s.computer_id)
    );

  req.user = { id: booking.user_id, email: booking.user?.email };
  await recordAudit(req, {
    action: 'kiosk.check_in',
    entity: 'bookings',
    entityId: session.id,
    details: {
      receipt_no: receiptNo,
      computer: names.join(', '),
      ...(names.length > 1 ? { count: names.length, batch_id: booking.batch_id } : {}),
    },
  });

  await notify(booking.user_id, {
    title: 'Session started',
    message:
      names.length > 1
        ? `You are checked in at ${names.length} workstations (${names.join(', ')}). Your session ends at ${session.end_time.slice(0, 5)}.`
        : `You are checked in at ${names[0]}. Your session ends at ${session.end_time.slice(0, 5)}.`,
    type: 'success',
  });

  res.status(201).json({
    success: true,
    data: {
      ...session,
      // Every row that was checked in, so the kiosk can show the set.
      sessions,
      // Everything the printed ticket needs, so the kiosk does no maths.
      receipt: {
        number: receiptNo,
        issued_at: checkedInAt,
        name: session.user?.full_name,
        id_number: session.user?.id_number,
        role: session.user?.role,
        program: session.user?.department,
        course: session.user?.course,
        // `computer` stays for a single booking; `computers` carries the
        // set, so the ticket can list a class without reprinting itself.
        computer: names.length === 1 ? names[0] : null,
        computers: names,
        room: session.computer?.laboratory?.room_number ?? null,
        laboratory: session.computer?.laboratory?.name ?? null,
        subject: session.subject,
        purpose: session.purpose,
        date: session.booking_date,
        start_time: session.start_time,
        end_time: session.end_time,
      },
    },
  });
});

/**
 * POST /api/kiosk/check-out
 * Ends a session early and frees the workstation.
 */
export const checkOut = asyncHandler(async (req, res) => {
  const bookingId = String(req.body?.booking_id ?? '');

  const { data: row } = await supabase
    .from(TABLES.bookings)
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (!row) throw ApiError.notFound('That session could not be found.');
  const booking = flatten(row);

  if (!booking.checked_in_at) throw ApiError.conflict('That session was never started.');
  if (booking.checked_out_at) throw ApiError.conflict('That session is already finished.');

  const { data: updated, error } = await supabase
    .from(TABLES.bookings)
    .update({ checked_out_at: new Date().toISOString(), status: 'COMPLETED' })
    .eq('id', booking.id)
    .select(BOOKING_SELECT)
    .single();

  if (error) throw ApiError.internal();

  await supabase
    .from(TABLES.computers)
    .update({ status: 'AVAILABLE', current_user_id: null })
    .eq('id', booking.computer_id);

  req.user = { id: booking.user_id, email: booking.user?.email };
  await recordAudit(req, { action: 'kiosk.check_out', entity: 'bookings', entityId: booking.id });

  res.json({ success: true, data: flatten(updated) });
});

/**
 * GET /api/kiosk/receipts — administrator view of kiosk activity.
 */
export const listReceipts = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = getPagination(req.query);

  let query = supabase
    .from(TABLES.bookings)
    .select(BOOKING_SELECT, { count: 'exact' })
    .not('checked_in_at', 'is', null);

  if (req.query.date) query = query.eq('booking_date', req.query.date);
  if (req.query.search) {
    const term = `%${String(req.query.search).replace(/[%_]/g, '')}%`;
    query = query.ilike('receipt_no', term);
  }

  const { data, count, error } = await query
    .order('checked_in_at', { ascending: false })
    .range(from, to);

  if (error) throw ApiError.internal();

  res.json({ success: true, ...paginated((data ?? []).map(flatten), count, { page, limit }) });
});

/**
 * Expires approved bookings nobody turned up for.
 *
 * Runs on the server timer rather than at scan time: a machine must be
 * released for the rest of the day even if nobody ever touches the kiosk.
 */
export async function expireNoShows() {
  const policy = await getSetting('booking');
  const grace = policy.late_grace_minutes ?? 30;

  const cutoff = nowMinutes() - grace;
  if (cutoff < 0) return;

  const pad = (n) => String(n).padStart(2, '0');
  const cutoffTime = `${pad(Math.floor(cutoff / 60))}:${pad(cutoff % 60)}:00`;

  const { data: expired, error } = await supabase
    .from(TABLES.bookings)
    .update({ status: 'EXPIRED' })
    .eq('booking_date', todayISO())
    .eq('status', 'APPROVED')
    .is('checked_in_at', null)
    .lt('start_time', cutoffTime)
    .select('id, user_id, computer_id, start_time, computer:computers ( name )');

  if (error) {
    console.error('[kiosk] no-show sweep failed:', error.message);
    return;
  }

  for (const booking of expired ?? []) {
    const computer = Array.isArray(booking.computer) ? booking.computer[0] : booking.computer;

    // Release the machine for the rest of the day.
    await supabase
      .from(TABLES.computers)
      .update({ status: 'AVAILABLE', current_user_id: null })
      .eq('id', booking.computer_id)
      .neq('status', 'MAINTENANCE');

    await notify(booking.user_id, {
      title: 'Booking expired',
      message:
        `You did not check in within ${grace} minutes of ${booking.start_time.slice(0, 5)}, ` +
        `so ${computer?.name ?? 'the computer'} has been released.`,
      type: 'warning',
    });
  }

  if (expired?.length) {
    console.log(`[kiosk] expired ${expired.length} no-show booking(s)`);
  }
}

/**
 * Releases workstations whose session has finished.
 *
 * Check-in marks a machine IN_USE; only an explicit check-out cleared it.
 * People do not check out — they finish and walk away — so a machine
 * stayed occupied for ever, and after a few days a laboratory reads as
 * fully booked while standing empty.
 *
 * This closes the session at its own end time rather than inventing one:
 * the booking said when it finished, and that is the honest record.
 */
export async function releaseFinishedSessions() {
  const today = todayISO();
  const pad = (n) => String(n).padStart(2, '0');
  const minutes = nowMinutes();
  const clock = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;

  const { data: finished, error } = await supabase
    .from(TABLES.bookings)
    .select('id, user_id, computer_id, booking_date, end_time')
    .not('checked_in_at', 'is', null)
    .is('checked_out_at', null)
    .or(`booking_date.lt.${today},and(booking_date.eq.${today},end_time.lte.${clock})`);

  if (error) {
    console.error('[kiosk] release sweep failed:', error.message);
    return;
  }
  if (!finished?.length) return;

  // Closed at the end time the booking itself gave, in laboratory time.
  for (const booking of finished) {
    await supabase
      .from(TABLES.bookings)
      .update({ checked_out_at: `${booking.booking_date}T${booking.end_time}` })
      .eq('id', booking.id)
      .is('checked_out_at', null);
  }

  // A machine is only freed if nothing else currently holds it, and a
  // machine under maintenance stays under maintenance.
  const ids = [...new Set(finished.map((b) => b.computer_id))];
  const { data: stillBusy } = await supabase
    .from(TABLES.bookings)
    .select('computer_id')
    .in('computer_id', ids)
    .not('checked_in_at', 'is', null)
    .is('checked_out_at', null);

  const held = new Set((stillBusy ?? []).map((b) => b.computer_id));
  const free = ids.filter((id) => !held.has(id));

  if (free.length) {
    await supabase
      .from(TABLES.computers)
      .update({ status: 'AVAILABLE', current_user_id: null })
      .in('id', free)
      .neq('status', 'MAINTENANCE');

    console.log(`[kiosk] released ${free.length} workstation(s) after their sessions ended`);
  }
}
