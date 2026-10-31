// Decides who gets the midnight penalty for a day. No Apps Script services in
// here, so it's tested under Node (see test/penalties.test.js).

// input: {
//   dayKey, startKey ('yyyy-MM-dd' or ''), players (Sheet1 names),
//   dayScores ({ name: score|null }, or null if the day has no row),
//   contacts: [{ name, pausedUntil ('yyyy-MM-dd' or null) }]
// }
// Returns { penalise: [names], exempt: [{ name, reason }], skip, alert }.
// `skip` means quietly do nothing; `alert` means email the owner and do nothing.
function planPenalties_(input) {
  const plan = { penalise: [], exempt: [], skip: null, alert: null };

  if (input.startKey && input.dayKey < input.startKey) {
    plan.skip = 'Penalties start on ' + formatDay_(input.startKey);
    return plan;
  }
  if (!input.dayScores) {
    plan.alert = 'There\'s no row for ' + formatDay_(input.dayKey) + ' in Sheet1, so no penalties ' +
      'were applied and nothing was locked.';
    return plan;
  }
  if (input.players.every(name => input.dayScores[name] === null)) {
    plan.alert = 'Nobody has a score for ' + formatDay_(input.dayKey) + '. That usually means something ' +
      'is wrong (sheet not updated, wrong row), so no penalties were applied and nothing was locked.';
    return plan;
  }

  const pausedUntil = {};
  input.contacts.forEach(contact => {
    if (contact.pausedUntil && contact.pausedUntil >= input.dayKey) pausedUntil[contact.name] = contact.pausedUntil;
  });
  input.players.forEach(name => {
    if (input.dayScores[name] !== null) return; // played, or already penalised
    if (pausedUntil[name]) {
      plan.exempt.push({ name: name, reason: 'paused until ' + formatDay_(pausedUntil[name]) });
      return;
    }
    plan.penalise.push(name);
  });
  return plan;
}
