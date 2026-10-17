// Turns computeWeeklyStats_() output into the email subject, plain text and
// HTML. No Apps Script services in here either, so it's testable under Node.

function joinList_(items) {
  const unique = items.filter((item, i) => items.indexOf(item) === i);
  if (unique.length < 2) return unique.join('');
  return unique.slice(0, -1).join(', ') + ' & ' + unique[unique.length - 1];
}

function plural_(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

function formatChange_(change) {
  if (change === null) return '';
  const rounded = Math.round(change);
  if (rounded > 0) return '▲' + rounded;
  if (rounded < 0) return '▼' + -rounded;
  return '=';
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Each callout is a plain statement of fact plus a line of banter from Banter.js.
function weeklyCallouts_(stats, random) {
  const callouts = [];
  const add = (icon, fact, category, name) =>
    callouts.push({ icon: icon, fact: fact, banter: banter_(category, { name: name }, random) });
  const namesOf = items => joinList_(items.map(item => item.name));
  const describeScores = entries => namesOf(entries) + ' with ' + entries[0].score +
    ' (' + joinList_(entries.map(entry => formatDay_(entry.day))) + ')';

  const winners = namesOf(stats.winners);
  add('🏆', 'Winner: ' + winners + ' on ' + plural_(stats.winners[0].points, 'pt'), 'winner', winners);

  if (stats.woodenSpoons.length) {
    const spoons = namesOf(stats.woodenSpoons);
    add('🥄', 'Wooden spoon: ' + spoons + ' on ' + plural_(stats.woodenSpoons[0].points, 'pt'),
      'woodenSpoon', spoons);
  }

  add('🔥', 'Highest score: ' + describeScores(stats.highest), 'highest', namesOf(stats.highest));
  add('🧊', 'Lowest score: ' + describeScores(stats.lowest), 'lowest', namesOf(stats.lowest));

  if (stats.mostImproved) {
    const player = stats.mostImproved;
    add('📈', 'Most improved: ' + player.name + ', average up ' + Math.round(player.averageChange) +
      ' on last week', 'improved', player.name);
  }
  if (stats.biggestDrop) {
    const player = stats.biggestDrop;
    add('📉', 'Biggest drop: ' + player.name + ', average down ' + Math.round(-player.averageChange) +
      ' on last week', 'dropped', player.name);
  }

  stats.noShows.forEach(player => {
    add('🤡', 'Hall of shame: ' + player.name + ' forgot ' + joinList_(player.forgotten.map(formatDay_)),
      'missed', player.name);
  });

  if (stats.stillToPlay.length) {
    const names = namesOf(stats.stillToPlay);
    add('⏰', 'No score yet for ' + formatDay_(stats.lastDayKey) + ' from ' + names, 'stillToPlay', names);
  }
  return callouts;
}

// One clown per forgotten day, and an alarm clock for anyone yet to play
// the final day.
function badges_(player) {
  const clowns = player.forgotten.length;
  return (clowns > 3 ? ' 🤡×' + clowns : clowns ? ' ' + '🤡'.repeat(clowns) : '') +
    (player.stillToPlay ? ' ⏰' : '');
}

function formatMovement_(movement) {
  return movement === null ? '' : formatChange_(movement);
}

function monthTitle_(month) {
  return formatMonth_(month.monthKey) + ' leaderboard' +
    (month.isFinal ? ' (final)' : ' (up to ' + formatDay_(month.endKey) + ')');
}

// Subject names the week's winner and whoever's top of the month. A finished
// month (when the week crosses into a new one) takes priority.
function weeklySubject_(stats) {
  const weekWinners = stats.winners.map(player => player.name);
  const month = stats.months.filter(m => m.isFinal)[0] || stats.months[stats.months.length - 1];
  const leaders = month.standings.filter(player => player.position === 1).map(player => player.name);
  const monthName = formatMonth_(month.monthKey);
  const monthPart = month.isFinal
    ? (leaders.length > 1 ? ' share ' : ' wins ') + monthName
    : (leaders.length > 1 ? ' share the lead in ' : ' leads ') + monthName;
  return '🎯 MapTap weekly: ' + joinList_(weekWinners) +
    (weekWinners.length > 1 ? ' share the week' : ' wins the week') +
    ' · ' + joinList_(leaders) + monthPart;
}

function buildWeeklyEmail_(stats, random) {
  const range = formatDay_(stats.weekStartKey) + ' – ' + formatDay_(stats.weekEndKey) +
    (stats.lastDayKey < stats.weekEndKey ? ' (so far, up to ' + formatDay_(stats.lastDayKey) + ')' : '');
  const groupChange = formatChange_(stats.groupAverageChange);
  const groupLine = 'Group average: ' + Math.round(stats.groupAverage) +
    (groupChange ? ' (' + groupChange + ' on last week)' : '');
  const callouts = weeklyCallouts_(stats, random);

  const legend = [];
  const everyone = stats.standings.concat(...stats.months.map(month => month.standings));
  if (everyone.some(player => player.forgotten.length)) legend.push('🤡 = a day you forgot to play (0 pts)');
  if (stats.stillToPlay.length) legend.push('⏰ = no score yet for ' + formatDay_(stats.lastDayKey));
  const footer = (legend.length ? legend.join(' · ') + '. ' : '') +
    'Points use the Scoring System tab, same as the leaderboard. Averages only count days played.';

  const text = [
    'MapTap weekly summary: ' + range,
    groupLine,
    '',
    'THIS WEEK',
    ...stats.standings.map(player => player.position + '. ' + player.name + badges_(player) + ': ' +
      plural_(player.points, 'pt') + ' ' + formatChange_(player.pointsChange) +
      ', avg ' + (player.average === null ? '-' : Math.round(player.average) + ' ' +
      formatChange_(player.averageChange))),
    ...[].concat(...stats.months.map(month => [
      '',
      monthTitle_(month).toUpperCase(),
      ...month.standings.map(player => player.position + '. ' + player.name + badges_(player) + ': ' +
        plural_(player.points, 'pt') + ' ' + formatMovement_(player.movement)),
    ])),
    '',
    ...callouts.map(c => c.icon + ' ' + c.fact + '\n   ' + c.banter),
    '',
    footer,
  ].join('\n');

  const cell = 'padding:8px 6px;border-bottom:1px solid #e5e7eb;';
  const head = 'padding:8px 6px;border-bottom:2px solid #111827;text-align:left;font-size:12px;' +
    'color:#6b7280;text-transform:uppercase;';
  const heading = title => '<h2 style="font-size:16px;margin:24px 0 8px;">' + escapeHtml_(title) + '</h2>';
  const change = label => {
    if (!label) return '';
    const colour = label[0] === '▲' ? '#15803d' : label[0] === '▼' ? '#b91c1c' : '#6b7280';
    return ' <span style="font-size:12px;color:' + colour + ';">' + label + '</span>';
  };
  // columns: [header, player => cell html]
  const table = (players, columns) =>
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0;">' +
    '<tr>' + columns.map(c => '<th style="' + head + '">' + c[0] + '</th>').join('') + '</tr>' +
    players.map(player => {
      const top = player.position === 1;
      return '<tr' + (top ? ' style="background:#ecfdf5;"' : '') + '>' +
        columns.map((c, i) => '<td style="' + cell + (top && i === 1 ? 'font-weight:bold;' : '') + '">' +
          c[1](player) + '</td>').join('') +
        '</tr>';
    }).join('') +
    '</table>';
  const position = player => String(player.position);
  const name = player => escapeHtml_(player.name) + badges_(player);

  const weekTable = table(stats.standings, [
    ['#', position],
    ['Player', name],
    ['Pts', player => player.points + change(formatChange_(player.pointsChange))],
    ['Avg', player => (player.average === null ? '–' : Math.round(player.average)) +
      change(formatChange_(player.averageChange))],
  ]);
  const monthTables = stats.months.map(month => heading(monthTitle_(month)) + table(month.standings, [
    ['#', position],
    ['Player', name],
    ['Pts', player => String(player.points)],
    ['Move', player => change(formatMovement_(player.movement)) || '<span style="color:#9ca3af;">–</span>'],
  ])).join('');

  const calloutHtml = callouts.map(c =>
    '<p style="margin:0 0 14px;">' +
    '<strong>' + c.icon + ' ' + escapeHtml_(c.fact) + '</strong><br>' +
    '<em style="color:#4b5563;">' + escapeHtml_(c.banter) + '</em></p>').join('');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:560px;margin:0 auto;">' +
    '<h1 style="font-size:22px;margin:0 0 4px;">🎯 MapTap weekly summary</h1>' +
    '<p style="margin:0 0 4px;color:#6b7280;">' + escapeHtml_(range) + '</p>' +
    '<p style="margin:0;color:#6b7280;">' + escapeHtml_(groupLine) + '</p>' +
    heading('This week') + weekTable +
    monthTables +
    heading('Honours & humiliations') + calloutHtml +
    '<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">' + escapeHtml_(footer) + '</p>' +
    '</div>';

  return { subject: weeklySubject_(stats), text: text, html: html };
}
