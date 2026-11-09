let chalk = require('chalk');
let moment = require('moment');

let success = (m) => {
  let daystamp = chalk.hex('#10b981').bold(moment().format('DD/MM/YYYY'));
  let timestamp = chalk.hex('#ffffff').bold(moment().format('HH:MM:SS'));
  let message = chalk.hex('#22c55e').visible(m);

  console.log(`${daystamp} - ${timestamp} - ${message}`);
};

let warning = (m) => {
  let daystamp = chalk.hex('#10b981').bold(moment().format('DD/MM/YYYY'));
  let timestamp = chalk.hex('#ffffff').bold(moment().format('HH:MM:SS'));
  let message = chalk.hex('#eab308').visible(m);

  console.log(`${daystamp} - ${timestamp} - ${message}`);
};

let error = (m) => {
  let daystamp = chalk.hex('#10b981').bold(moment().format('DD/MM/YYYY'));
  let timestamp = chalk.hex('#ffffff').bold(moment().format('HH:MM:SS'));
  let message = chalk.hex('#ef4444').visible(m);

  console.log(`${daystamp} - ${timestamp} - ${message}`);
};

let info = (m) => {
  let daystamp = chalk.hex('#10b981').bold(moment().format('DD/MM/YYYY'));
  let timestamp = chalk.hex('#ffffff').bold(moment().format('HH:MM:SS'));
  let message = chalk.hex('#a3a3a3').visible(m);

  console.log(`${daystamp} - ${timestamp} - ${message}`);
};

module.exports = { success, warning, error, info };
