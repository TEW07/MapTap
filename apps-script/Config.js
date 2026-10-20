// Shared settings for the MapTap Apps Script project.
const MAPTAP = {
  TIMEZONE: 'Europe/London',
  SCORES_SHEET: 'Sheet1',
  SCORING_SHEET: 'Scoring System',
  CONTACTS_SHEET: 'Contacts',
  LOG_SHEET: 'Broadcast Log',
  // Used if the Scoring System tab can't be read.
  DEFAULT_POINTS_BY_RANK: [10, 7, 5, 3, 2, 1, 0, 0],
  // When the weekly summary goes out, UK time. After changing these, run
  // setupWeeklySummary() again. Google sends within about 15 minutes of the
  // time, and the minute should be 0, 15, 30 or 45.
  WEEKLY_SUMMARY_DAY: 'SUNDAY',
  WEEKLY_SUMMARY_HOUR: 22,
  WEEKLY_SUMMARY_MINUTE: 30,
  // Daily reminder texts through Twilio. After changing the time, run
  // setupDailyReminder() again. Google sends within about 15 minutes.
  REMINDERS_ENABLED: true, // false stops all texts
  REMINDER_HOUR: 20,
  REMINDER_MINUTE: 0,
  SMS_SENDER_ID: 'MapTap', // who the text says it's from: letters/numbers, max 11
  FORM_URL: '', // optional link added to each text, e.g. 'https://yoursite.netlify.app'
  // Safety limits, on top of your Twilio balance (keep auto-recharge off).
  MAX_TEXTS_PER_RUN: 6,
  MAX_TEXTS_PER_MONTH: 40,
  SMS_VALIDITY_SECONDS: 7200, // undelivered after 2 hours? Give up rather than text at 3am.
  // Display name on outgoing emails. The address is whoever ran setupWeeklySummary().
  SENDER_NAME: 'MapTap Bot',
};
