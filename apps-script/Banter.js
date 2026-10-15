// One line is picked at random from each category every week. Add, remove or
// rewrite lines freely. {name} is replaced with the player's name.
const BANTER = {
  winner: [
    'Enjoy it, {name}. It won\'t last.',
    '{name} will be insufferable until at least Wednesday.',
    'Someone check {name}\'s search history for "world map quiz".',
    'Even a stopped clock is right twice a day, {name}.',
    'Fair play {name}. Said through gritted teeth.',
  ],
  woodenSpoon: [
    '{name}, have you tried looking at the map before tapping it?',
    'Genuinely impressive commitment to mediocrity from {name}.',
    '{name}\'s old geography teacher has been notified.',
    'The wooden spoon suits you, {name}. Pint\'s on you.',
    '{name} treats the map like a dartboard after ten pints.',
  ],
  highest: [
    'Screenshot it, {name}. It\'s not happening again.',
    '{name} has peaked. Downhill from here.',
    'Suspiciously good, {name}. We\'ll be requesting a drug test.',
  ],
  lowest: [
    '{name}, were you tapping with your elbows?',
    'Brave of {name} to actually submit that.',
    'Did {name} play with the phone upside down?',
    '{name} is fairly sure Australia is somewhere near Norway.',
  ],
  improved: [
    'Someone\'s been practising in secret. Get a life, {name}.',
    '{name} has discovered the map has labels. Well done.',
    'Big week from {name}. From a low base, mind.',
  ],
  dropped: [
    '{name}, everything alright at home?',
    '{name} has lost the plot. And the map.',
    'Steep decline from {name}. Much like their chat.',
  ],
  missed: [
    '{name}, the game takes two minutes. You\'ve got two minutes.',
    'Scared, {name}? Or just busy being bad at it?',
    'Zero points, zero excuses, {name}.',
    '{name} went missing. Much like their sense of direction.',
  ],
  stillToPlay: [
    'There\'s still time, {name}. Not much, but some.',
    'Clock\'s ticking, {name}. Late scores still count on the leaderboard, just not in here.',
  ],
};

// `random` is only passed in tests, to make the pick repeatable.
function banter_(category, vars, random) {
  const lines = BANTER[category];
  const line = lines[Math.floor((random || Math.random)() * lines.length)];
  return line.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}
