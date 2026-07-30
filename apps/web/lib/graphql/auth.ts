import { gql } from '@apollo/client';

/**
 * Auth-screen READS (DUAL API RULE). Writes (signup, login, OTP request/verify)
 * are REST via lib/rest-api.ts. Mirrors
 * apps/api/src/notifications/notification-center.resolver.ts.
 */

export const PHONE_OTP_AVAILABLE_QUERY = gql`
  query OtpPhoneChannelAvailable {
    otpPhoneChannelAvailable
  }
`;

export interface OtpPhoneChannelAvailableQueryResult {
  otpPhoneChannelAvailable: boolean;
}
