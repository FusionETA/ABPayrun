import { verifyCredentials, type AltomateUser } from "./altomate.service"

export type { AltomateUser } from "./altomate.service"

/**
 * Authenticate an ABPay login against AltomateHR. Thin service so routes
 * never reach into the integration layer directly
 * (routes → services → AltomateHR client).
 */
export async function login(
  email: string,
  password: string,
): Promise<AltomateUser | null> {
  return verifyCredentials(email, password)
}
