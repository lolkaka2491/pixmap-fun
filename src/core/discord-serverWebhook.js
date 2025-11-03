const axios = require('axios');
const FormData = require('form-data');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');

const ecosystem = fs.readFileSync('../pixelplanet/deployment/example-ecosystem.yml', 'utf-8'); // Retrieve ecosystem
let DISCORD_HOOK_SLOG = ecosystem.match(/DISCORD_HOOK_SLOG:\s*'([^']+)'/); // Find all matches for this value
DISCORD_HOOK_SLOG = DISCORD_HOOK_SLOG ? DISCORD_HOOK_SLOG[1] : false; // Assign the value, or assign false if nothing was found
let DISCORD_HOOK_NOTIFY_ON_RESTART = ecosystem.match(/DISCORD_HOOK_NOTIFY_ON_RESTART:\s*'([^']+)'/); // Find all matches for this value
DISCORD_HOOK_NOTIFY_ON_RESTART = DISCORD_HOOK_NOTIFY_ON_RESTART ? DISCORD_HOOK_NOTIFY_ON_RESTART[1] : false; // Assign the value, or assign false if nothing was found
let DISCORD_LOGGING_ENABLED = ecosystem.match(/DISCORD_LOGGING_ENABLED:\s*'([^']+)'/); // Find all matches for this value
DISCORD_LOGGING_ENABLED = DISCORD_LOGGING_ENABLED ? DISCORD_LOGGING_ENABLED[1] : ''; // Assign the value, or assign '' if nothing was found

/** Custom colors for the Discord embed
 * 
 * **Key**: Color common name
 * 
 * **Value**: Color hexadecimal code
 * @type {Object<string, string>}
 * @example
 * console.log(Colors.RED); // '#cf0000'
 */
const Colors = {
  RED: '#cf0000',
  ORANGE: '#eb5d05',
  YELLOW: '#e8e40c',
  GREEN: '#02fa23',
  BLUE_LIGHT: '#07ddf5',
  BLUE_DARK: '#0f07f5',
  PURPLE: '#9a07f5',
  PINK: '#f507cd',
  LIME: '#87a832',
  BLACK: '#000000',
  WHITE: '#ffffff',
  GRAY: '#636363'
}

/** Capitalizes the first letter of a string
 * @param {string} string - The string to capitalize
 * @returns {string} The string with the first letter capitalized
 * @example
 * console.log(capitalizeFirstLetter('hello')); // 'Hello'
*/ 
function capitalizeFirstLetter(string) {
  return string // Calls the string (and returns a string later)
  .charAt(0) // Trims the string to just the first character
  .toUpperCase() // Converts the first character to uppercase
  + string.slice(1); // Appends the original string (excluding the first character)
}

/** Logs server commands/status to a Discord channel using a Webhook.
 * All parameters default to empty strings!
 * @param {string} command - The command/status that triggered this function
 * @param {*} [commandFile] - Any related image as a Buffer. Preferably a PNG Buffer
 * @param {string} [timestamp] - The time the command/status triggered
 */
async function logServerCommands({
  command = '',
  commandFile = null,
  timestamp = ''
} = {}) {
  
  // If the logging toggle value is NOT a string NOR 'true'...
  if (!(typeof DISCORD_LOGGING_ENABLED === 'string') || (DISCORD_LOGGING_ENABLED == 'false')) {
    console.log(`Server Logging is currently: DISABLED\nThis will not be reported.`)
    return; // The user has disabled logging. Kills itself
  }

  // If the secret of "Discord Webhook Server Log" is NOT a populated string...
  // Note: NOT string, NOR empty string
  if (!(typeof DISCORD_HOOK_SLOG === 'string') && !(DISCORD_HOOK_SLOG.length > 0)) {
    console.warn(`logServerCommands() was called, but the Webhook secret is empty or missing!`);
    return; // Kills itself
  }

  // Fail silently if any required parameters were not passed in
  if (command === '') {
    console.error(`logServerCommands() was called, but the "command" is not defined!`);
    return; // Kills itself
  }

  try {

    let color = Colors.BLACK; // Default color for the embed
    let message = `A server command was executed/triggered. We do not know what the command/trigger was...`; // Default message

    // Different messages based on the command executed
    // TODO: Eventually move this to where logModerationCommands() is called
    switch (command) {
      case 'build':
        color = Colors.WHITE;
        message = `The server is building!`;
        break;
      case 'public-build':
        color = Colors.GREEN;
        message = `The server is restarting!`;
        command = 'restarting';
        break;
    }

    // Constructs the embed
    const serverLogEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(capitalizeFirstLetter(command))
    .setDescription(message + (timestamp ? `\nThis occured at <t:${Math.floor(timestamp / 1000)}:f>.` : `We do not know when this occured.`))
    .setImage(commandFile ? 'attachment://image.png' : null);

    const form = new FormData(); // Creates a new FormData object for the request

    // Appends a file structure to the FormData only if commandFile has a Buffer
    // https://discordjs.guide/popular-topics/embeds.html#attaching-images
    if (commandFile) {form.append('file', Buffer.from(commandFile), 'image.png');}

    // Appends the JSON payload (of the embed) to the FormData
    form.append('payload_json', JSON.stringify({
      embeds: [serverLogEmbed.toJSON()]
    }));

    command = command == 'restarting' ? 'public-build' : command;

    if (command != 'public-build') {
      // POSTs the FormData to the Discord Webhook
      await axios.post(DISCORD_HOOK_SLOG, form, {
        headers: form.getHeaders(),
      })
      .then(res => console.log('Sent Webhook message successfully:', res.data))
      .catch(err => console.error('Error sending webhook:', err.response?.data || err.message));
    }

    // If the secret of "Discord Webhook Server Log" is a populated string...
    if ((command == 'public-build') && (typeof DISCORD_HOOK_NOTIFY_ON_RESTART === 'string') && (DISCORD_HOOK_NOTIFY_ON_RESTART.length > 0)) {
      
      // POST to the public notification Webhook
      await axios.post(DISCORD_HOOK_NOTIFY_ON_RESTART, form, {
        headers: form.getHeaders(),
      })
      .then(res => console.log('Sent Webhook message successfully:', res.data))
      .catch(err => console.error('Error sending webhook:', err.response?.data || err.message));
    }

  } catch (error) {
    console.error(`Error occured while logging a server command: ${error.message}\n${error.stack}`);
  }
}

module.exports = { logServerCommands };