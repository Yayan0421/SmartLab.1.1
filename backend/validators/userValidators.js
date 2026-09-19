import { z } from 'zod';
import { emailField, passwordField } from './authValidators.js';

export const createUserSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter a full name.').max(120),
  email: emailField,
  password: passwordField,
  role: z.enum(['admin', 'faculty', 'student'], { errorMap: () => ({ message: 'Choose a valid role.' }) }),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  course: z.string().trim().max(120).optional().or(z.literal('')),
  id_number: z.string().trim().max(60).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
});

export const updateUserSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter a full name.').max(120).optional(),
    email: emailField.optional(),
    role: z.enum(['admin', 'faculty', 'student']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    department: z.string().trim().max(120).optional().or(z.literal('')),
    course: z.string().trim().max(120).optional().or(z.literal('')),
    id_number: z.string().trim().max(60).optional().or(z.literal('')),
    phone: z.string().trim().max(40).optional().or(z.literal('')),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update.' });

export const resetPasswordSchema = z.object({
  new_password: passwordField.optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'faculty', 'student']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  sort: z.enum(['created_at', 'full_name', 'last_login_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
