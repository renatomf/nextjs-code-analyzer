import { z } from "zod";

// Single source of truth for auth input rules. The server always enforces
// these; forms may reuse them for UX only.

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// bcrypt only uses the first 72 bytes; the cap also prevents hashing huge inputs.
export const passwordSchema = z
  .string()
  .min(8)
  .refine((value) => new TextEncoder().encode(value).length <= 72);

const nameSchema = z.string().trim().min(1).max(40);

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
