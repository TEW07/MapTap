// Decides who gets tonight's reminder text. No Apps Script services in here,
// so it's tested under Node (see test/reminders.test.js).

// UK mobiles, however they were typed: '07700 900123', '+44 7700 900123',
// '447700900123', or 7700900123 (a number cell that dropped the 0).
// Returns '+447700900123', or null for anything else. 070 (personal numbering)
// and 076 (pagers) are refused: they aren't real mobiles and can cost more.
function normaliseUkMobile_(value) {
  let digits = String(value === null || value === undefined ? '' : value).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = '44' + digits.slice(1);
  else if (/^7\d{9}$/.test(digits)) digits = '44' + digits;
  return /^447[1-57-9]\d{8}$/.test(digits) ? '+' + digits : null;
}

// For the log: +447700900123 -> +447******123
function maskPhone_(phone) {
  return phone.slice(0, 4) + '*'.repeat(phone.length - 7) + phone.slice(-3);
}

// One SMS is 160 plain characters. An emoji or curly quote switches the whole
// text to a 70-character format and can double the cost, so stick to these.
const GSM_CHARACTERS_ = /^[A-Za-z0-9 \n@£$¥!"#%&'()*+,\-.\/:;<=>?_¡¿§ÄÖÑÜäöñüàèéùìòÇØøÅåÆæßÉ]*$/;

function fitsOneSms_(text) {
  return text.length <= 160 && GSM_CHARACTERS_.test(text);
}

// The banter line is dropped if it would push the text over one SMS.
function buildReminderText_(name, formUrl, random) {
  const base = 'MapTap reminder: no score from you yet today.';
  const link = formUrl ? ' ' + formUrl : '';
  const withBanter = base + ' ' + banter_('reminder', { name: name }, random) + link;
  return fitsOneSms_(withBanter) ? withBanter : base + link;
}

// input: {
//   todayKey, players (Sheet1 names), todayScores ({ name: score|null }, or null if no row),
//   contacts: [{ name, phone, optedIn, pausedUntil ('yyyy-MM-dd' or null) }],
//   remindedToday: [names], textsThisMonth, maxPerRun, maxPerMonth, formUrl, random
// }
// Returns { texts: [{ name, phone, body }], notes: [{ name, reason }], alert }.
// `alert` means something looks wrong and the owner should be emailed.
function planReminders_(input) {
  const plan = { texts: [], notes: [], alert: null };

  if (!input.todayScores) {
    plan.alert = 'There\'s no row for ' + formatDay_(input.todayKey) + ' in Sheet1, so nobody was ' +
      'reminded. Add this month\'s dates to column A.';
    return plan;
  }
  if (input.players.every(name => input.todayScores[name] === null)) {
    plan.alert = 'Nobody has a score for ' + formatDay_(input.todayKey) + ' yet. That usually means ' +
      'something is wrong (sheet not updated, wrong row), so no texts went out.';
    return plan;
  }

  const planned = [];
  input.contacts.forEach(contact => {
    if (!contact.optedIn) return;
    const note = reason => plan.notes.push({ name: contact.name, reason: reason });
    if (input.players.indexOf(contact.name) === -1) return note('not a player in Sheet1');
    if (input.todayScores[contact.name] !== null) return; // already played
    if (contact.pausedUntil && contact.pausedUntil >= input.todayKey) {
      return note('paused until ' + formatDay_(contact.pausedUntil));
    }
    if (input.remindedToday.indexOf(contact.name) !== -1) return note('already reminded today');
    if (planned.indexOf(contact.name) !== -1) return note('listed twice on Contacts');
    const phone = normaliseUkMobile_(contact.phone);
    if (!phone) return note('phone number isn\'t a UK mobile');
    planned.push(contact.name);
    plan.texts.push({
      name: contact.name,
      phone: phone,
      body: buildReminderText_(contact.name, input.formUrl, input.random),
    });
  });

  // More people than the limit means something's off (or Contacts has grown):
  // send nothing rather than guess.
  if (plan.texts.length > input.maxPerRun) {
    plan.alert = plan.texts.length + ' people need a reminder, more than MAX_TEXTS_PER_RUN (' +
      input.maxPerRun + '), so none were sent.';
    plan.texts = [];
    return plan;
  }

  const allowance = Math.max(0, input.maxPerMonth - input.textsThisMonth);
  if (plan.texts.length > allowance) {
    plan.texts.slice(allowance).forEach(text => plan.notes.push({ name: text.name, reason: 'monthly text limit reached' }));
    plan.texts = plan.texts.slice(0, allowance);
    plan.alert = 'This month\'s limit of ' + input.maxPerMonth + ' texts has been reached, so some ' +
      'reminders weren\'t sent. Raise MAX_TEXTS_PER_MONTH in Config.js if that\'s expected.';
  }
  return plan;
}
