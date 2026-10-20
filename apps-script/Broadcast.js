// Contacts, the broadcast log, and sending (email and SMS), shared by the
// weekly summary and the daily reminder.
//
// Contacts tab: one row per person, plus one tick-box column per broadcast.
// A new broadcast only needs a new column here, e.g. 'Daily Reminder'.
// Broadcast Log tab: one row per send (or skip, or failure).

const CONTACT_HEADERS_ = ['Name', 'Email', 'Phone', 'Weekly Summary', 'Daily Reminder', 'Paused Until'];
// Everyone can tick these on the otherwise-locked Contacts tab.
const OPT_IN_HEADERS_ = ['Weekly Summary', 'Daily Reminder'];
const LOG_HEADERS_ = ['Time', 'Broadcast', 'Channel', 'Status', 'Recipients', 'Details'];

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Tab "' + name + '" not found. Run setupWeeklySummary() or setupDailyReminder() first.');
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

// Texts one UK number through Twilio. Returns Twilio's message SID. Uses the
// credentials saved with MapTap → Set Twilio credentials, which only the
// account that saved them can read.
function sendSms_(to, body) {
  const props = PropertiesService.getUserProperties();
  const accountSid = props.getProperty('TWILIO_ACCOUNT_SID');
  const keySid = props.getProperty('TWILIO_API_KEY_SID');
  const keySecret = props.getProperty('TWILIO_API_KEY_SECRET');
  if (!accountSid || !keySid || !keySecret) {
    throw new Error('Twilio credentials not set. In the sheet, use MapTap → Set Twilio credentials.');
  }
  const response = UrlFetchApp.fetch(
    'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(accountSid) + '/Messages.json', {
      method: 'post',
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(keySid + ':' + keySecret) },
      payload: {
        To: to,
        From: MAPTAP.SMS_SENDER_ID,
        Body: body,
        ValidityPeriod: String(MAPTAP.SMS_VALIDITY_SECONDS),
      },
      muteHttpExceptions: true,
    });
  const result = JSON.parse(response.getContentText());
  if (response.getResponseCode() >= 300) {
    throw new Error('Twilio error ' + result.code + ': ' + result.message);
  }
  return result.sid;
}

// Texts sent so far, from the log: how many this month (any broadcast) and
// who has already had today's reminder.
function smsSentSoFar_(todayKey) {
  const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const sent = { thisMonth: 0, remindedToday: [] };
  getSheet_(MAPTAP.LOG_SHEET).getDataRange().getValues().slice(1).forEach(row => {
    const [time, broadcast, channel, status, recipients] = row;
    if (channel !== 'sms' || status !== 'SENT' || !(time instanceof Date)) return;
    const day = Utilities.formatDate(time, timezone, 'yyyy-MM-dd');
    if (day.slice(0, 7) === todayKey.slice(0, 7)) sent.thisMonth++;
    if (day === todayKey && broadcast === 'Daily Reminder') sent.remindedToday.push(String(recipients));
  });
  return sent;
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

// Adds any missing columns to an existing Contacts tab, and makes Phone plain
// text so Sheets keeps the leading 0 of 07... numbers.
function ensureContactColumns_() {
  const sheet = getSheet_(MAPTAP.CONTACTS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const rows = Math.max(sheet.getLastRow() - 1, 1);
  CONTACT_HEADERS_.forEach(header => {
    if (headers.indexOf(header) !== -1) return;
    headers.push(header);
    const col = headers.length;
    sheet.getRange(1, col).setValue(header).setFontWeight('bold');
    if (OPT_IN_HEADERS_.indexOf(header) !== -1) sheet.getRange(2, col, rows, 1).insertCheckboxes();
  });
  sheet.getRange(2, headers.indexOf('Phone') + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  sheet.getRange(2, headers.indexOf('Paused Until') + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
}

// Only the owner can edit Contacts (apart from the opt-in tick boxes) and the
// Broadcast Log. Safe to run again: it replaces its own earlier protection.
function lockBroadcastTabs_() {
  const contacts = getSheet_(MAPTAP.CONTACTS_SHEET);
  const headers = contacts.getRange(1, 1, 1, contacts.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const tickBoxes = OPT_IN_HEADERS_
    .map(header => headers.indexOf(header) + 1)
    .filter(col => col > 0)
    .map(col => contacts.getRange(2, col, contacts.getMaxRows() - 1, 1));
  lockSheet_(contacts, tickBoxes);
  lockSheet_(getSheet_(MAPTAP.LOG_SHEET), []);
}

function lockSheet_(sheet, editableRanges) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  const protection = sheet.protect().setDescription('MapTap: only the owner can edit this tab');
  protection.setUnprotectedRanges(editableRanges);
  // Google's documented pattern: add yourself first, then remove everyone else.
  // The spreadsheet owner can never be removed.
  protection.addEditor(Session.getEffectiveUser());
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}
