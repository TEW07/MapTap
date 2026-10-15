// Web app the React form (src/App.jsx) talks to, deployed as
// "MapTap Score Updater". After changing this file, redeploy it: see README.md.
//
//   GET                                       -> { success, players }
//   POST { name, date: 'dd/mm/yyyy', score }  -> writes the score into Sheet1
//
// Deliberately self-contained, so the form keeps working whatever happens to
// the weekly summary files.

const SCORE_SHEET_NAME = 'Sheet1';

// Player names for the form's dropdown, so a new player only needs a new
// column in Sheet1.
function doGet() {
  try {
    const values = getScoreSheet_().getDataRange().getValues();
    return jsonResponse_({ success: true, players: readPlayers_(values) });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ success: false, error: String(error.message || error) });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    console.log('Submission: ' + e.postData.contents);

    const name = String(data.name || '').trim();
    const date = normaliseDate_(data.date);
    const score = Number(data.score);
    if (!date) return failure_('Date must look like dd/mm/yyyy, got "' + data.date + '".');
    if (!Number.isInteger(score) || score < 0) {
      return failure_('Score must be a whole number, got "' + data.score + '".');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getScoreSheet_();
    const values = sheet.getDataRange().getValues();

    const playerIndex = readPlayers_(values).indexOf(name);
    if (playerIndex === -1) return failure_('"' + name + '" isn\'t in the header row of ' + SCORE_SHEET_NAME + '.');
    const col = playerIndex + 2; // players start in column B

    const row = findDateRow_(values, date, ss.getSpreadsheetTimeZone());
    if (row === -1) {
      return failure_('There\'s no row for ' + date + ' in ' + SCORE_SHEET_NAME + ' yet. Add that month\'s dates to column A.');
    }

    // Never overwrite a different score: a wrong name in the dropdown would
    // otherwise silently replace someone else's. Resubmitting the same score is fine.
    const cell = sheet.getRange(row, col);
    const existing = cell.getValue();
    if (existing !== '' && Number(existing) !== score) {
      return failure_(name + ' already has ' + existing + ' for ' + date + '. If that\'s wrong, fix it in the sheet.');
    }

    cell.setValue(score);
    console.log('Wrote ' + score + ' for ' + name + ' at row ' + row + ', col ' + col);
    return jsonResponse_({ success: true, row: row, col: col });
  } catch (error) {
    console.error(error);
    return failure_(String(error.message || error));
  }
}

// Read-only check to run from the editor after changes: logs the players the
// form will show, and which rows today and this day last year map to.
function checkScoreUpdater() {
  const values = getScoreSheet_().getDataRange().getValues();
  const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  console.log('Players: ' + readPlayers_(values).join(', '));
  [today, lastYear].forEach(day => {
    const date = Utilities.formatDate(day, timezone, 'dd/MM/yyyy');
    const row = findDateRow_(values, date, timezone);
    console.log(date + ' -> ' + (row === -1 ? 'no row' : 'row ' + row));
  });
}

function getScoreSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCORE_SHEET_NAME);
  if (!sheet) throw new Error('Tab "' + SCORE_SHEET_NAME + '" not found.');
  return sheet;
}

// Names run from B1 rightwards until the first blank header.
function readPlayers_(values) {
  const players = [];
  for (let col = 1; col < values[0].length && String(values[0][col]).trim(); col++) {
    players.push(String(values[0][col]).trim());
  }
  return players;
}

// 1-based row whose column A date is exactly `date` (dd/mm/yyyy), or -1.
// Matching the year too stops a submission landing on last year's row.
function findDateRow_(values, date, timezone) {
  for (let i = 1; i < values.length; i++) {
    if (normaliseDate_(values[i][0], timezone) === date) return i + 1;
  }
  return -1;
}

// Date cells and 'd/m/yyyy' text both become 'dd/mm/yyyy'. Anything else -> null.
function normaliseDate_(value, timezone) {
  if (value instanceof Date) return Utilities.formatDate(value, timezone, 'dd/MM/yyyy');
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return match[1].padStart(2, '0') + '/' + match[2].padStart(2, '0') + '/' + match[3];
}

function failure_(error) {
  console.warn(error);
  return jsonResponse_({ success: false, error: error });
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
