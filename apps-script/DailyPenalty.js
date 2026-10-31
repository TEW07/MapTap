// Midnight penalty. See README.md for setup.
//
//   setupDailyPenalty()   - run once (and after changing the time in Config.js):
//                           creates the ~00:15 trigger
//   previewDailyPenalty() - logs what tonight's run would do. Changes nothing.
//   applyDailyPenalty()   - the real thing, for yesterday. The trigger runs this.
//
// MapTap menu (in the sheet), for testing and fixes:
//   Apply midnight penalty for a date…  - same as the trigger, for any date
//   Unlock a date's row…                - removes that day's lock
//   Test scheduled penalty for a date…  - the same, but from a timed trigger in
//                                         ~5 minutes, to prove scheduling works
//
// Needs the ScoreUpdater.js helpers (findDateRow_, readPlayers_, DAY_LOCK_PREFIX),
// which live in the same project.

function setupDailyPenalty() {
  ensureContactsSheet_();
  ensureContactColumns_();
  ensureLogSheet_();

  deleteTriggers_('applyDailyPenalty');
  ScriptApp.newTrigger('applyDailyPenalty')
    .timeBased()
    .everyDays(1)
    .atHour(MAPTAP.PENALTY_HOUR)
    .nearMinute(MAPTAP.PENALTY_MINUTE)
    .inTimezone(MAPTAP.TIMEZONE)
    .create();
  console.log('Penalty scheduled daily at about ' + MAPTAP.PENALTY_HOUR + ':' +
    String(MAPTAP.PENALTY_MINUTE).padStart(2, '0') + ' ' + MAPTAP.TIMEZONE +
    ' for the previous day, starting with ' + MAPTAP.PENALTIES_START);
}

// Runs just after midnight, so "yesterday" is the day that just ended.
function applyDailyPenalty() {
  runDailyPenalty_(addDays_(todayKey_(), -1), false);
}

// Run during the evening, so it previews today: what midnight would do if
// nobody else played.
function previewDailyPenalty() {
  runDailyPenalty_(todayKey_(), true);
}

function applyPenaltyForDate() {
  const dayKey = promptForDate_('Apply the midnight penalty to which date? (dd/mm/yyyy)');
  if (!dayKey) return;
  runDailyPenalty_(dayKey, false);
  SpreadsheetApp.getUi().alert('Done. The Broadcast Log says what happened.');
}

// Triggers can't take arguments, so the date waits in script properties.
function testScheduledPenalty() {
  const dayKey = promptForDate_('Penalise which date from a trigger in ~5 minutes? (dd/mm/yyyy)');
  if (!dayKey) return;
  PropertiesService.getScriptProperties().setProperty('TEST_PENALTY_DATE', dayKey);
  deleteTriggers_('runScheduledPenaltyTest');
  ScriptApp.newTrigger('runScheduledPenaltyTest').timeBased().after(5 * 60 * 1000).create();
  SpreadsheetApp.getUi().alert('Scheduled. In about 5-15 minutes, check ' + formatDay_(dayKey) +
    '\'s row and the Broadcast Log. Close the sheet if you like: it runs without you.');
}

function runScheduledPenaltyTest() {
  const props = PropertiesService.getScriptProperties();
  const dayKey = props.getProperty('TEST_PENALTY_DATE');
  props.deleteProperty('TEST_PENALTY_DATE');
  deleteTriggers_('runScheduledPenaltyTest'); // one-off: tidy up after itself
  if (dayKey) runDailyPenalty_(dayKey, false);
}

function unlockDate() {
  const dayKey = promptForDate_('Unlock which date\'s row? (dd/mm/yyyy)');
  if (!dayKey) return;
  const removed = removeDayLock_(dayKey);
  SpreadsheetApp.getUi().alert(removed
    ? formatDay_(dayKey) + ' is unlocked. Penalties already written stay until you delete them.'
    : formatDay_(dayKey) + ' wasn\'t locked.');
}

function promptForDate_(question) {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('MapTap', question, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return null;
  const dayKey = parseDateText_(response.getResponseText());
  if (!dayKey) ui.alert('Please use dd/mm/yyyy, e.g. 01/11/2026.');
  return dayKey;
}

function runDailyPenalty_(dayKey, isPreview) {
  const broadcast = 'Midnight Penalty';
  const day = formatDay_(dayKey);
  if (!MAPTAP.PENALTIES_ENABLED && !isPreview) {
    logBroadcast_(broadcast, 'sheet', [], 'SKIPPED', 'Penalties are switched off in Config.js');
    return;
  }

  const scores = readScores_();
  const plan = planPenalties_({
    dayKey: dayKey,
    startKey: MAPTAP.PENALTIES_START,
    players: scores.players,
    dayScores: scores.days[dayKey] || null,
    contacts: readReminderContacts_(),
  });
  const exempt = plan.exempt.map(e => e.name + ': ' + e.reason).join('; ');

  if (isPreview) {
    if (plan.skip) console.log(day + ': ' + plan.skip);
    else if (plan.alert) console.log('Would email you: ' + plan.alert);
    else {
      console.log('At midnight, ' + day + ' would be locked. ' + (plan.penalise.length
        ? 'Penalty of ' + MAPTAP.PENALTY_POINTS + ' for: ' + plan.penalise.join(', ')
        : 'Nobody would be penalised.'));
    }
    if (exempt) console.log('Exempt: ' + exempt);
    return;
  }

  if (plan.skip) {
    logBroadcast_(broadcast, 'sheet', [], 'SKIPPED', day + ': ' + plan.skip);
    return;
  }
  if (plan.alert) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'MapTap midnight penalty needs a look', plan.alert);
    logBroadcast_(broadcast, 'sheet', [], 'ALERT', plan.alert);
    return;
  }

  const sheet = getSheet_(MAPTAP.SCORES_SHEET);
  const values = sheet.getDataRange().getValues();
  const players = readPlayers_(values);
  const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const row = findDateRow_(values, dayKey.split('-').reverse().join('/'), timezone);

  const penalised = [];
  plan.penalise.forEach(name => {
    const cell = sheet.getRange(row, players.indexOf(name) + 2);
    if (cell.getValue() !== '') return; // someone filled it in since we read the sheet
    cell.setValue(MAPTAP.PENALTY_POINTS);
    penalised.push({ name: name });
  });
  lockDayRow_(sheet, row, dayKey, players.length + 1);

  const details = day + ' locked' + (exempt ? '. Exempt: ' + exempt : '');
  if (penalised.length) {
    logBroadcast_(broadcast, 'sheet', penalised, 'PENALISED', MAPTAP.PENALTY_POINTS + ' pts. ' + details);
  } else {
    logBroadcast_(broadcast, 'sheet', [], 'LOCKED', 'Nobody penalised. ' + details);
  }
}

// Only the owner can edit the day's row afterwards. Re-running replaces the
// earlier lock rather than stacking another.
function lockDayRow_(sheet, row, dayKey, lastCol) {
  removeDayLock_(dayKey);
  const protection = sheet.getRange(row, 1, 1, lastCol).protect().setDescription(DAY_LOCK_PREFIX + dayKey);
  protection.addEditor(Session.getEffectiveUser());
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function removeDayLock_(dayKey) {
  const locks = getSheet_(MAPTAP.SCORES_SHEET).getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(protection => protection.getDescription() === DAY_LOCK_PREFIX + dayKey);
  locks.forEach(protection => protection.remove());
  return locks.length > 0;
}
