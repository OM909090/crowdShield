import { z } from "zod";
export declare const signupSchema: z.ZodObject<{
    name: z.ZodString;
    mobile: z.ZodString;
    email: z.ZodPipe<z.ZodString, z.ZodEmail>;
    age: z.ZodCoercedNumber<unknown>;
    gender: z.ZodEnum<{
        Male: "Male";
        Female: "Female";
        Other: "Other";
    }>;
    emergencyContact: z.ZodString;
    language: z.ZodEnum<{
        Other: "Other";
        English: "English";
        Hindi: "Hindi";
        Odia: "Odia";
    }>;
    password: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<{
        citizen: "citizen";
        authority: "authority";
    }>>;
    organizationId: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodObject<{
        latitude: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        longitude: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SignupInput = z.infer<typeof signupSchema>;
/**
 * Login takes `identifier`, not `email` — it accepts either a mobile number or
 * an email address. Getting this wrong produces a 422 that reads like a server
 * fault ("Email or mobile number is required") when it is a client bug; it cost
 * a debugging cycle during testing, hence the emphasis.
 */
export declare const loginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
    rememberMe: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof loginSchema>;
