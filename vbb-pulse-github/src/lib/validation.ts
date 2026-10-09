import { z } from "zod";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(254),
  // bcrypt only uses the first 72 bytes – cap length to avoid silent truncation.
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(72, "Password must be at most 72 characters"),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

export const settingsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Please enter a valid email").max(254).optional(),
    delayThresholdMin: z.coerce.number().int().min(1).max(120),
    cooldownMinutes: z.coerce.number().int().min(5).max(24 * 60),
    quietHoursStart: z.union([z.string().regex(HHMM, "Use HH:MM"), z.literal(""), z.null()]).transform((v) => v || null),
    quietHoursEnd: z.union([z.string().regex(HHMM, "Use HH:MM"), z.literal(""), z.null()]).transform((v) => v || null),
    emailEnabled: z.boolean(),
    cityAlertsEnabled: z.boolean().optional(),
  })
  .refine((s) => (s.quietHoursStart === null) === (s.quietHoursEnd === null), {
    message: "Set both quiet-hours start and end, or neither",
    path: ["quietHoursEnd"],
  });
export type SettingsInput = z.infer<typeof settingsSchema>;

export const trackedLineSchema = z.object({
  lineName: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}( ?[A-Z0-9]{1,4})?$/, "Line like S7, RE1, U2, M10, X9"),
  stopId: z.string().trim().regex(/^[A-Za-z0-9:_-]{3,64}$/, "Invalid stop id"),
  stopName: z.string().trim().min(2).max(120),
  direction: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v ?? ""),
});
export type TrackedLineInput = z.infer<typeof trackedLineSchema>;

export const stationQuerySchema = z.object({
  q: z.string().trim().min(2).max(60),
});
