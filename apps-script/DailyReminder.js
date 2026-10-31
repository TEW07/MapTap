// Daily reminder texts. See README.md for setup.
//
//   setupDailyReminder()    - run once (and after changing the time in Config.js):
//                             adds the Contacts columns, locks the tabs, creates
//                             the 8pm trigger
//   previewDailyReminders() - logs who would be texted right now and the exact
//                             texts. Sends nothing.
//   sendTestText()          - texts you only (the Contacts row with your email)
//   sendDailyReminders()    - the real thing. The trigger runs this.
//
// Twilio credentials are saved from the sheet: MapTap menu → Set Twilio credentials.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MapTap')
    .addItem('Set Twilio credentials…', 'setTwilioCredentials')
    .addSeparator()
    .addItem('Apply midnight penalty for a date…', 'applyPenaltyForDate')
    .addItem('Unlock a date\'s row…', 'unlockDate')
    .addToUi();
}

// Saved to your own user properties: not visible in Project Settings, and not
// readable by anyone else who opens the script.
function setTwilioCredentials() {
  const ui = SpreadsheetApp.getUi();
  const fields = [
    ['TWILIO_ACCOUNT_SID', 'Twilio Account SID (starts AC)'],
    ['TWILIO_API_KEY_SID', 'Twilio API key SID (starts SK)'],
    ['TWILIO_API_KEY_SECRET', 'Twilio API key secret'],
  ];
  const values = {};
  for (const [key, label] of fields) {
    const response = ui.prompt('MapTap reminders', label, ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;
    values[key] = response.getResponseText().trim();
  }
  PropertiesService.getUserProperties().setProperties(values);
  ui.alert('Saved. Only your Google account can read these.');
}

function setupDailyReminder() {
  ensureContactsSheet_();
  ensureContactColumns_();
  ensureLogSheet_();
  lockBroadcastTabs_();

  deleteTriggers_('sendDailyReminders');
  ScriptApp.newTrigger('sendDailyReminders')
    .timeBased()
    .everyDays(1)
    .atHour(MAPTAP.REMINDER_HOUR)
    .nearMinute(MAPTAP.REMINDER_MINUTE)
    .inTimezone(MAPTAP.TIMEZONE)
    .create();
  console.log('Reminders scheduled daily at about ' + MAPTAP.REMINDER_HOUR + ':' +
    String(MAPTAP.REMINDER_MINUTE).padStart(2, '0') + ' ' + MAPTAP.TIMEZONE +
    '. Contacts and Broadcast Log are now locked to you (tick boxes excepted).');
}

function sendDailyReminders() {
  runDailyReminders_(false);
}

function previewDailyReminders() {
  runDailyReminders_(true);
}

function sendTestText() {
  const me = Session.getEffectiveUser().getEmail();
  const contact = readReminderContacts_().filter(c => c.email.toLowerCase() === me.toLowerCase())[0];
  if (!contact) throw new Error('No Contacts row has your email (' + me + ').');
  const phone = normaliseUkMobile_(contact.phone);
  if (!phone) throw new Error('Your phone number on Contacts isn\'t a UK mobile: "' + contact.phone + '"');
  if (smsSentSoFar_(todayKey_()).thisMonth >= MAPTAP.MAX_TEXTS_PER_MONTH) {
    throw new Error('Monthly text limit already reached.');
  }
  const sid = sendSms_(phone, buildReminderText_(contact.name, MAPTAP.FORM_URL));
  logBroadcast_('Test Text', 'sms', [contact], 'SENT', sid + ' to ' + maskPhone_(phone));
  console.log('Sent to ' + maskPhone_(phone) + ' (' + sid + ')');
}

function runDailyReminders_(isPreview) {
  const broadcast = 'Daily Reminder';
  if (!MAPTAP.REMINDERS_ENABLED && !isPreview) {
    logBroadcast_(broadcast, 'sms', [], 'SKIPPED', 'Reminders are switched off in Config.js');
    return;
  }

  const today = todayKey_();
  const scores = readScores_();
  const sent = smsSentSoFar_(today);
  const plan = planReminders_({
    todayKey: today,
    players: scores.players,
    todayScores: scores.days[today] || null,
    contacts: readReminderContacts_(),
    remindedToday: sent.remindedToday,
    textsThisMonth: sent.thisMonth,
    maxPerRun: MAPTAP.MAX_TEXTS_PER_RUN,
    maxPerMonth: MAPTAP.MAX_TEXTS_PER_MONTH,
    formUrl: MAPTAP.FORM_URL,
  });
  const notes = plan.notes.map(n => n.name + ': ' + n.reason).join('; ');

  if (isPreview) {
    console.log('Texts this month so far: ' + sent.thisMonth + ' of ' + MAPTAP.MAX_TEXTS_PER_MONTH);
    plan.texts.forEach(t => console.log('Would text ' + t.name + ' (' + maskPhone_(t.phone) + '): ' + t.body));
    if (!plan.texts.length) console.log('Nobody would be texted right now.');
    if (notes) console.log('Not texted: ' + notes);
    if (plan.alert) console.log('Would email you: ' + plan.alert);
    return;
  }

  if (plan.alert) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'MapTap reminders need a look', plan.alert);
    logBroadcast_(broadcast, 'sms', [], 'ALERT', plan.alert);
  }
  if (notes || !plan.texts.length) {
    logBroadcast_(broadcast, 'sms', [], 'SKIPPED', notes || 'Everyone opted in has played today');
  }

  const failures = [];
  plan.texts.forEach(text => {
    try {
      const sid = sendSms_(text.phone, text.body);
      logBroadcast_(broadcast, 'sms', [text], 'SENT', sid + ' to ' + maskPhone_(text.phone));
    } catch (error) {
      failures.push(text.name + ': ' + error.message);
      logBroadcast_(broadcast, 'sms', [text], 'FAILED', error.message);
    }
  });
  if (failures.length) {
    throw new Error('Some reminders failed: ' + failures.join('; ')); // Google emails you about it
  }
}

function readReminderContacts_() {
  const values = getSheet_(MAPTAP.CONTACTS_SHEET).getDataRange().getValues();
  const headers = values[0].map(header => String(header).trim());
  const col = name => {
    const index = headers.indexOf(name);
    if (index === -1) throw new Error('No "' + name + '" column on Contacts. Run setupDailyReminder().');
    return index;
  };
  const [nameCol, emailCol, phoneCol, optInCol, pausedCol] =
    ['Name', 'Email', 'Phone', 'Daily Reminder', 'Paused Until'].map(col);
  const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  return values.slice(1)
    .filter(row => String(row[nameCol]).trim())
    .map(row => {
      const paused = row[pausedCol];
      return {
        name: String(row[nameCol]).trim(),
        email: String(row[emailCol]).trim(),
        phone: row[phoneCol],
        optedIn: row[optInCol] === true,
        pausedUntil: paused instanceof Date
          ? Utilities.formatDate(paused, timezone, 'yyyy-MM-dd')
          : parseDateText_(paused),
      };
    });
}
