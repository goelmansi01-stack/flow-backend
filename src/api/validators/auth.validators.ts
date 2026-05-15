import { z } from 'zod';

export const signupSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Name is required' }).min(2, 'Name must be at least 2 characters').trim(),
    email: z
      .string({ required_error: 'Email is required' })
      .email('Must be a valid email address')
      .toLowerCase()
      .trim(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Must be a valid email address')
      .toLowerCase()
      .trim(),
    password: z.string({ required_error: 'Password is required' }).min(1),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string({ required_error: 'Refresh token is required' }).min(1),
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
