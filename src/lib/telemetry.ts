export type TelemetryEvent =
  'user_signed_in' | 'account_deleted' | 'data_exported' | 'role_granted' | 'role_revoked';

/** Only ids and the method: the type makes it impossible to pass an e-mail, code or name (RNF-04). */
export type TelemetryProps = { method?: 'email_otp'; user_id?: string; membership_id?: string };

/** No Sentry yet: logs the event as JSON in development only; in production it does nothing. */
export function track(event: TelemetryEvent, props?: TelemetryProps): void {
  if (__DEV__) console.info(JSON.stringify({ event, ...props }));
}
