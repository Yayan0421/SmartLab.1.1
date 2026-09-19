import { z } from 'zod';

export const COMPUTER_STATES = ['AVAILABLE', 'IN_USE', 'OFFLINE', 'MAINTENANCE', 'RESERVED'];

const ipField = z
  .string()
  .trim()
  .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Enter a valid IPv4 address.')
  .optional()
  .or(z.literal(''));

export const createComputerSchema = z.object({
  computer_number: z.coerce.number().int().min(1, 'Computer number must be 1 or higher.').max(9999),
  name: z.string().trim().min(1, 'Enter a computer name.').max(80),
  laboratory_id: z.string().uuid('Choose a laboratory.'),
  ip_address: ipField,
  operating_system: z.string().trim().max(120).optional().or(z.literal('')),
  specs: z.string().trim().max(500).optional().or(z.literal('')),
  status: z.enum(COMPUTER_STATES).default('AVAILABLE'),
  is_bookable: z.coerce.boolean().default(true),
});

export const updateComputerSchema = z
  .object({
    computer_number: z.coerce.number().int().min(1).max(9999).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    laboratory_id: z.string().uuid().optional(),
    ip_address: ipField,
    operating_system: z.string().trim().max(120).optional().or(z.literal('')),
    specs: z.string().trim().max(500).optional().or(z.literal('')),
    status: z.enum(COMPUTER_STATES).optional(),
    is_bookable: z.coerce.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update.' });

export const listComputersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
  status: z.enum(COMPUTER_STATES).optional(),
  laboratory_id: z.string().uuid().optional(),
  bookable_only: z.coerce.boolean().optional(),
});

export const heartbeatSchema = z.object({
  computer_id: z.string().uuid().optional(),
  ip_address: z.string().trim().optional(),
  name: z.string().trim().max(80).optional(),
  cpu_usage: z.coerce.number().min(0).max(100).default(0),
  ram_usage: z.coerce.number().min(0).max(100).default(0),
  disk_usage: z.coerce.number().min(0).max(100).default(0),
  temperature: z.coerce.number().min(-20).max(150).default(0),
  uptime_seconds: z.coerce.number().int().min(0).default(0),
  power_watt: z.coerce.number().min(0).max(2000).optional(),
  voltage: z.coerce.number().min(0).max(500).optional(),
  current_amp: z.coerce.number().min(0).max(100).optional(),
}).refine((data) => data.computer_id || data.ip_address || data.name, {
  message: 'Identify the computer by computer_id, ip_address or name.',
});
