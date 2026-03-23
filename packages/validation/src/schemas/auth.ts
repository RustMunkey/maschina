import { z } from "zod";

// ─── Auth schemas ─────────────────────────────────────────────────────────────
// Used at the HTTP boundary: parse + validate incoming request bodies.
// z.infer<typeof Schema> gives the TypeScript type for free.

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(320, "Email too long"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  name: z.string().min(1, "Name is required").max(128, "Name too long").trim().optional(),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required").max(128),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

// ─── Magic link / OTP ─────────────────────────────────────────────────────────

export const SendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(320),
  name: z.string().min(1).max(128).trim().optional(), // present only on signup
});

export const VerifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z
    .string()
    .trim()
    .length(6, "Code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be digits"),
});

// ─── Device flow ──────────────────────────────────────────────────────────────

export const DeviceTokenSchema = z.object({
  deviceCode: z.string().min(1),
});

export const DeviceConfirmSchema = z.object({
  userCode: z.string().trim().toUpperCase().min(1).max(20),
});

// ─── OAuth ────────────────────────────────────────────────────────────────────

export const OAuthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type DeviceTokenInput = z.infer<typeof DeviceTokenSchema>;
export type DeviceConfirmInput = z.infer<typeof DeviceConfirmSchema>;
