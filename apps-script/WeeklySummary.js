// Weekly summary email. See README.md for setup.
//
//   setupWeeklySummary()    - run once (and after changing the time in Config.js):
//                             creates the tabs and the weekly trigger
//   previewWeeklySummary()  - emails you only: the last full Monday-Sunday week
//   previewThisWeekSoFar()  - emails you only: this week up to today, i.e. roughly
//                             what Sunday's email will look like
//   testScheduledPreview()  - runs previewWeeklySummary from a trigger in ~5 minutes,
//                             to check scheduling works without waiting for Sunday
//   sendWeeklySummary()     - the real thing, to everyone ticked on Contacts. The
//                             trigger runs this.

function setupWeeklySummary() {
  ensureContactsSheet_();
  ensureLogSheet_();

  // Replace any existing trigger so running setup twice doesn't double-send.
  deleteTriggers_('sendWeeklySummary');
  ScriptApp.newTrigger('sendWeeklySummary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay[MAPTAP.WEEKLY_SUMMARY_DAY])
    .atHour(MAPTAP.WEEKLY_SUMMARY_HOUR)
    .nearMinute(MAPTAP.WEEKLY_SUMMARY_MINUTE)
    .inTimezone(MAPTAP.TIMEZONE)
    .create();
  console.log('Weekly summary scheduled for ' + MAPTAP.WEEKLY_SUMMARY_DAY + 's at about ' +
    MAPTAP.WEEKLY_SUMMARY_HOUR + ':' + String(MAPTAP.WEEKLY_SUMMARY_MINUTE).padStart(2, '0') +
    ' ' + MAPTAP.TIMEZONE);
}

// On Sunday this is the week ending today; any other day it's last week.
function sendWeeklySummary() {
  runWeeklySummary_(false, weekEndingOnOrBefore_(todayKey_()));
}

function previewWeeklySummary() {
  runWeeklySummary_(true, weekEndingOnOrBefore_(todayKey_()));
}

function previewThisWeekSoFar() {
  const today = todayKey_();
  runWeeklySummary_(true, weekEndingOnOrBefore_(addDays_(today, 6)), today);
}

function testScheduledPreview() {
  deleteTriggers_('previewWeeklySummary'); // tidy up any earlier test
  ScriptApp.newTrigger('previewWeeklySummary').timeBased().after(5 * 60 * 1000).create();
  console.log('Preview email scheduled for about 5 minutes from now.');
}

function todayKey_() {
  return Utilities.formatDate(new Date(), MAPTAP.TIMEZONE, 'yyyy-MM-dd');
}

function deleteTriggers_(handler) {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function runWeeklySummary_(isPreview, weekEndKey, asOfKey) {
  const broadcast = isPreview ? 'Weekly Summary (preview)' : 'Weekly Summary';
  let recipients = [];
  try {
    const stats = computeWeeklyStats_(readScores_(), weekEndKey, readPointsByRank_(), asOfKey);
    if (!stats.hasScores) {
      logBroadcast_(broadcast, 'email', [], 'SKIPPED', 'No scores for week ending ' + stats.weekEndKey);
      return;
    }

    recipients = isPreview
      ? [{ name: 'You (preview)', email: Session.getEffectiveUser().getEmail() }]
      : getEmailRecipients_('Weekly Summary');
    if (!recipients.length) {
      logBroadcast_(broadcast, 'email', [], 'SKIPPED', 'Nobody on the Contacts tab has an email and Weekly Summary ticked');
      return;
    }

    const email = buildWeeklyEmail_(stats);
    if (isPreview) email.subject = '[PREVIEW] ' + email.subject;
    sendBroadcastEmail_(broadcast, recipients, email);
  } catch (error) {
    logBroadcast_(broadcast, 'email', recipients, 'FAILED', String(error));
    throw error; // so the run shows as failed and Google emails you about it
  }
}

function readScores_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const values = getSheet_(MAPTAP.SCORES_SHEET).getDataRange().getValues();
  const timezone = ss.getSpreadsheetTimeZone();

  // Player names run from B1 rightwards until the first blank header.
  const columns = [];
  for (let col = 1; col < values[0].length && String(values[0][col]).trim(); col++) {
    columns.push({ name: String(values[0][col]).trim(), index: col });
  }

  const days = {};
  values.slice(1).forEach(row => {
    const cell = row[0];
    const key = cell instanceof Date
      ? Utilities.formatDate(cell, timezone, 'yyyy-MM-dd')
      : parseDateText_(cell);
    if (!key) return;
    days[key] = {};
    columns.forEach(column => {
      days[key][column.name] = toScore_(row[column.index]);
    });
  });

  return { players: columns.map(column => column.name), days: days };
}

// Scoring System tab: Rank in column A, Score (points) in column B.
function readPointsByRank_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MAPTAP.SCORING_SHEET);
  if (!sheet) return MAPTAP.DEFAULT_POINTS_BY_RANK;

  const points = [];
  sheet.getDataRange().getValues().slice(1).forEach(row => {
    const rank = toScore_(row[0]);
    const value = toScore_(row[1]);
    if (rank !== null && value !== null) points[rank - 1] = value;
  });
  return points.length ? points : MAPTAP.DEFAULT_POINTS_BY_RANK;
}
