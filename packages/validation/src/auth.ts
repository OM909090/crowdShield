import { z } from "zod";
import { ACCOUNT_LANGUAGES } from "@crowdshield/config";

/**
 * Mirrors `backend/validators/auth.validator.js` field for field.
 *
 * The point is not to replace server validation — the server still validates
 * everything, and it is the authority. The point is that a phone on a patchy
 * connection should not spend a round trip to learn a mobile number was 9 digits.
 * Where these disagree with the backend, the backend wins and this is the bug.
 */

/** Exactly ten digits, same as the backend's /^[0-9]{10}$/. */
const TEN_DIGITS = /^[0-9]{10}$/;

const mobileField = z
  .string()
  .trim()
  .regex(TEN_DIGITS, "Mobile number must be a valid 10-digit number");

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    mobile: mobileField,
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    age: z.coerce.number().int("Enter a valid age").min(1, "Enter a valid age").max(120, "Enter a valid age"),
    gender: z.enum(["Male", "Female", "Other"], { message: "Select a valid gender" }),
    emergencyContact: z
      .string()
      .trim()
      .regex(TEN_DIGITS, "Emergency contact must be a valid 10-digit number"),
    language: z.enum(ACCOUNT_LANGUAGES, { message: "Select a valid language" }),
    password: z.string().min(6, "Password must be at least 6 characters"),
    /**
     * The mobile app only ever creates citizens — an authority account needs an
     * organisation ID and a human admin's approval, which is a desk job, not
     * something to do on a phone in a crowd.
     */
    role: z.enum(["citizen", "authority"]).optional(),
    organizationId: z.string().trim().optional(),
    location: z
      .object({
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
      })
      .optional(),
  })
  .refine((data) => data.role !== "authority" || !!data.organizationId?.trim(), {
    message: "Organization / Badge ID is required for authority accounts",
    path: ["organizationId"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Login takes `identifier`, not `email` — it accepts either a mobile number or
 * an email address. Getting this wrong produces a 422 that reads like a server
 * fault ("Email or mobile number is required") when it is a client bug; it cost
 * a debugging cycle during testing, hence the emphasis.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email or mobile number is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
