export type TelemetryEvent =
  | 'user_signed_in'
  | 'account_deleted'
  | 'data_exported'
  | 'role_granted'
  | 'role_revoked'
  | 'calling_granted'
  | 'calling_revoked'
  | 'calling_catalog_saved'
  | 'org_chart_consent_changed'
  | 'org_chart_link_saved'
  | 'profile_phone_saved';

/** Only ids and the method: the type makes it impossible to pass an e-mail, code or name (RNF-04). */
export type TelemetryProps = {
  method?: 'email_otp';
  user_id?: string;
  membership_id?: string;
  calling_id?: string;
  /** org_chart_link_saved */
  kind?: 'high_council' | 'unit_org';
  /** org_chart_link_saved ('estaca' for high_council) */
  unit_id?: string;
  /** profile_phone_saved */
  shown?: boolean;
};

/** No Sentry yet: logs the event as JSON in development only; in production it does nothing. */
export function track(event: TelemetryEvent, props?: TelemetryProps): void {
  if (__DEV__) console.info(JSON.stringify({ event, ...props }));
}
