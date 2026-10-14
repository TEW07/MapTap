// Contacts and the broadcast log, shared by every automated message (the
// weekly summary now, the 9pm reminder next).
//
// Contacts tab: one row per person, plus one tick-box column per broadcast.
// A new broadcast only needs a new column here, e.g. 'Daily Reminder'.
// Broadcast Log tab: one row per send (or skip, or failure).

const CONTACT_HEADERS_ = ['Name', 'Email', 'Phone', 'Weekly Summary', 'Daily Reminder'];
const LOG_HEADERS_ = ['Time', 'Broadcast', 'Channel', 'Status', 'Recipients', 'Details'];

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Tab "' + name + '" not found. Run setupWeeklySummary() first.');
  return sheet;
}

// People with an email address and the broadcast's box ticked.
function getEmailRecipients_(broadcastColumn) {
  const values = getSheet_(MAPTAP.CONTACTS_SHEET).getDataRange().getValues();
  const headers = values[0].map(header => String(header).trim());
  const nameCol = headers.indexOf('Name');
  const emailCol = headers.indexOf('Email');
  const optInCol = headers.indexOf(broadcastColumn);
  if (optInCol === -1) {
    throw new Error('No "' + broadcastColumn + '" column on the ' + MAPTAP.CONTACTS_SHEET + ' tab.');
  }
  return values.slice(1)
    .filter(row => row[optInCol] === true && String(row[emailCol]).trim())
    .map(row => ({ name: String(row[nameCol]).trim(), email: String(row[emailCol]).trim() }));
}

// One email to everyone, so reply-all arguments are possible.
function sendBroadcastEmail_(broadcast, recipients, email) {
  MailApp.sendEmail({
    to: recipients.map(recipient => recipient.email).join(','),
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
    name: MAPTAP.SENDER_NAME,
  });
  logBroadcast_(broadcast, 'email', recipients, 'SENT',
    'Email quota left today: ' + MailApp.getRemainingDailyQuota());
}

function logBroadcast_(broadcast, channel, recipients, status, details) {
  getSheet_(MAPTAP.LOG_SHEET).appendRow([
    new Date(),
    broadcast,
    channel,
    status,
    recipients.map(recipient => recipient.name).join(', '),
    details || '',
  ]);
}

function ensureContactsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(MAPTAP.CONTACTS_SHEET)) return;

  const sheet = ss.insertSheet(MAPTAP.CONTACTS_SHEET);
  sheet.appendRow(CONTACT_HEADERS_);
  sheet.getRange(1, 1, 1, CONTACT_HEADERS_.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Start with everyone from Sheet1's header row: weekly summary on, reminder off.
  const players = readScores_().players;
  if (!players.length) return;
  sheet.getRange(2, 1, players.length, 1).setValues(players.map(name => [name]));
  const weeklyCol = CONTACT_HEADERS_.indexOf('Weekly Summary') + 1;
  const reminderCol = CONTACT_HEADERS_.indexOf('Daily Reminder') + 1;
  sheet.getRange(2, weeklyCol, players.length, 1).insertCheckboxes().check();
  sheet.getRange(2, reminderCol, players.length, 1).insertCheckboxes();
}

function ensureLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(MAPTAP.LOG_SHEET)) return;

  const sheet = ss.insertSheet(MAPTAP.LOG_SHEET);
  sheet.appendRow(LOG_HEADERS_);
  sheet.getRange(1, 1, 1, LOG_HEADERS_.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}
