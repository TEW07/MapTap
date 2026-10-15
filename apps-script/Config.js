// Shared settings for the MapTap Apps Script project.
const MAPTAP = {
  TIMEZONE: 'Europe/London',
  SCORES_SHEET: 'Sheet1',
  SCORING_SHEET: 'Scoring System',
  CONTACTS_SHEET: 'Contacts',
  LOG_SHEET: 'Broadcast Log',
  // Used if the Scoring System tab can't be read.
  DEFAULT_POINTS_BY_RANK: [10, 7, 5, 3, 2, 1, 0, 0],
  // Display name on outgoing emails. The address is whoever ran setupWeeklySummary().
  SENDER_NAME: 'MapTap Bot',
};
