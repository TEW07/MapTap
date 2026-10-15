// Weekly summary email. See README.md for setup.
//
//   setupWeeklySummary()   - run once: creates the tabs and the Sunday trigger
//   previewWeeklySummary() - emails the summary to you only, any day
//   sendWeeklySummary()    - what the trigger runs, Sunday ~22:30 UK time

function setupWeeklySummary() {
  ensureContactsSheet_();
  ensureLogSheet_();

  // Replace any existing trigger so running setup twice doesn't double-send.
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'sendWeeklySummary')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('sendWeeklySummary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(22)
    .nearMinute(30)
    .inTimezone(MAPTAP.TIMEZONE)
    .create();
}

function sendWeeklySummary() {
  runWeeklySummary_(false);
}

function previewWeeklySummary() {
  runWeeklySummary_(true);
}

function runWeeklySummary_(isPreview) {
  const broadcast = isPreview ? 'Weekly Summary (preview)' : 'Weekly Summary';
  let recipients = [];
  try {
    // On Sunday this is the week ending today; any other day it's last week.
    const todayKey = Utilities.formatDate(new Date(), MAPTAP.TIMEZONE, 'yyyy-MM-dd');
    const stats = computeWeeklyStats_(readScores_(), weekEndingOnOrBefore_(todayKey), readPointsByRank_());
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
