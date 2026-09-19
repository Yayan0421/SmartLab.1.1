import { z } from 'zod';

export const emailField = z
  .string({ required_error: 'Email is required.' })
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.')
  .max(255)
  .transform((value) => value.toLowerCase());

export const passwordField = z
  .string({ required_error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be 72 characters or fewer.');

export const loginSchema = z.object({
  email: emailField,
  password: z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.'),
  // Which sign-in page the request came from. The API keeps the two
  // portals separate so an administrator cannot be signed in from the
  // student page, or vice versa, even by posting directly.
  portal: z.enum(['public', 'admin']).default('public'),
});

/**
 * Administrator self-registration.
 * Only succeeds when the caller knows ADMIN_SIGNUP_CODE, so the public
 * admin portal cannot be used to mint administrators.
 */
export const registerAdminSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: emailField,
  password: passwordField,
  admin_code: z.string({ required_error: 'The administrator code is required.' })
    .min(1, 'The administrator code is required.'),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  id_number: z.string().trim().max(60).optional().or(z.literal('')),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: emailField,
  password: passwordField,
  // Self-registration can never create an admin. Admins are made by admins.
  role: z.enum(['faculty', 'student']).default('student'),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  id_number: z.string().trim().max(60).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password.'),
  new_password: passwordField,
});

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120).optional(),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  id_number: z.string().trim().max(60).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
});
