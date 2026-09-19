/**
 * The user columns that are safe to return to a client.
 *
 * Defined once and imported everywhere a user is selected, so adding a
 * column (as happened with qr_code) cannot leave one endpoint returning it
 * and another silently omitting it. password_hash is deliberately absent.
 */
export const PUBLIC_FIELDS =
  'id, full_name, email, role, status, department, course, id_number, phone, avatar_url, qr_code, last_login_at, created_at';

export default PUBLIC_FIELDS;
