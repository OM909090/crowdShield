import type { AccountLanguage, UserRole } from "@crowdshield/config";

/**
 * A user as `/auth/me` and `/auth/login` return them.
 *
 * Note what is absent: no password, and no location history. A user record is
 * never joined to the position stream — the aggregator works off an anonymous
 * device hash precisely so that this type cannot be correlated with a person's
 * movements.
 */
export interface User {
  readonly _id: string;
  readonly name: string;
  readonly mobile: string;
  readonly email: string;
  readonly age: number;
  readonly gender: "Male" | "Female" | "Other";
  readonly emergencyContact: string;
  readonly language: AccountLanguage;
  readonly role: UserRole;
  /** Present for authority accounts only. */
  readonly organizationId?: string;
  /**
   * Authority accounts start false and are approved by an admin. Defaults true
   * for citizens and admins, for whom the concept does not apply.
   */
  readonly isVerifiedAuthority: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What `/auth/login`, `/auth/signup` and `/auth/me` actually return.
 *
 * Note there is no token in the body — deliberately. The session lives entirely
 * in two httpOnly cookies (`accessToken`, 15 min; `refreshToken`, 7 days) set by
 * the server. That is the verified behaviour of the existing backend and the
 * mobile app adapts to it rather than the reverse: see the `SessionAdapter` in
 * `@crowdshield/api-client`, which captures and replays those cookies on a
 * platform that has no browser cookie jar.
 */
export interface AuthResponse {
  readonly message: string;
  readonly user: User;
}
