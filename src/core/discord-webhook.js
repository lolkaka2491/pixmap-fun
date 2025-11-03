/** Made by SwingTheVine :3
 * This file contains the functions required to send messages into Discord channels.
 * This is done using a Discord Webhook(s).
 * The functions work similar to a POST API endpoint.
 * For example, when you make a POST request, you pass in the needed information, and the API backend handles the rest.
 * These functions work in a similar manner.
 * @example
 * logModerationCommands({
 *  executorId: req.user.id,
 *  executorName: req.user.name,
 *  command: 'mute',
 *  timestamp: new Date()
 * }); // Logs a mute action
*/

// Import lines
import { DISCORD_HOOK_MLOG, DISCORD_HOOK_SLOG, DISCORD_LOGGING_ENABLED } from '../core/config';
import canvases from './canvases';
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { EmbedBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

/** File path to the log file used by discord-webhook.js */
const logFile = '../src/data/moderationLogging.txt';

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

/** Creates an image for the ReplaceColor Canvas Cleaner log
 * @param {*} sourceColorRGB Source Color RGB Array
 * @param {*} targetColorRGB Target Color RGB Array
 * @param {Number} canvasSize Size of the image in pixels. The image is a square
 * @returns PNG Buffer as a Buffer
 * @example
 * const pngBuffer = imageCreate_ReplaceColor([0,0,0], [255,255,255], 100); // '<Buffer 3f 01 3c ...'
 */
function imageCreate_ReplaceColor(sourceColorRGB, targetColorRGB, canvasSize) {
  const colorCanvas = createCanvas(canvasSize, canvasSize); // Creates the (square) canvas
  const colorCtx = colorCanvas.getContext('2d'); // Declares that the canvas is 2d
  colorCtx.font = `${canvasSize*0.2}px Arial`; // Font height is 20% of canvas size
  colorCtx.textAlign = 'center'; // Text X anchor is the center, as opposed to the left of the text
  colorCtx.textBaseline = 'middle'; // Text Y anchor is the middle, as opposed to the bottom of the text

  // Source Color Background
  colorCtx.fillStyle = `rgb(${sourceColorRGB[0]}, ${sourceColorRGB[1]}, ${sourceColorRGB[2]})`;
  colorCtx.fillRect(0, 0, canvasSize, canvasSize/2);

  // Target Color Background
  colorCtx.fillStyle = `rgb(${targetColorRGB[0]}, ${targetColorRGB[1]}, ${targetColorRGB[2]})`;
  colorCtx.fillRect(0, canvasSize/2, canvasSize, canvasSize/2); // Bottom half
  
  // Source Color Text
  colorCtx.fillStyle = ((299*sourceColorRGB[0] + 587*sourceColorRGB[1] + 114*sourceColorRGB[2])/1000 > 128) ? Colors.BLACK : Colors.WHITE; // Chooses black or white, whichever contrasts better
  colorCtx.fillText('Before', canvasSize/2, canvasSize/4);

  // Target Color Text
  colorCtx.fillStyle = ((299*targetColorRGB[0] + 587*targetColorRGB[1] + 114*targetColorRGB[2])/1000 > 128) ? Colors.BLACK : Colors.WHITE; // Chooses black or white, whichever contrasts better
  colorCtx.fillText('After', canvasSize/2, canvasSize*0.75);

  return colorCanvas.toBuffer('image/png'); // Returns a PNG Buffer
}

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

/** Converts a country code to a unicode flag.
 * This is done by converting each character in the country code into its corrosponding regional indicator
 * @param {string} code - The country code to convert
 * @returns Unicode flag as a string
 * @example
 * console.log(countryCodeToFlag('us')); // '🇺🇸'
 */
function countryCodeToFlag(code) {
  if (code == 'xx') {return '🛡️'}; // Custom flag for moderators
  return code // Call the code (later returns as a string)
  .toUpperCase() // Convert the code to uppercase
  .split('') // Split each character in the code into its own index
  .map(char => String.fromCodePoint(char.charCodeAt(0) + 0x1F1E6 - 0x41)) // Converts the latin script character into a regional indicator
  .join(''); // Un-splits each character in the code into a string
}

/** Retrieves data from the long-term storage file for discord-webhook.js
 * @param {string} path - The path to the storage file
 * @param {string} line - The line of the storage file to retrieve. Set to 'all' to retrieve the entire file as a string Array (each index is a line of the file). This value will be rounded.
 * @returns The line of the storage file as a string, OR the entire file as a string Array where each index is a line of the file. If the file does not exist, it will create the file, then return false.
 * @example
 * console.log(storageRetrieve('../src/data/moderationLogging.txt', '0')); // 'This file is generated by pixelplanet/src/core/discord-webhook.js'
 * @example
 * console.log(storageRetrieve('../src/data/moderationLogging.txt', 'all')); // ['This file is generated by pixelplanet/src/core/discord-webhook.js', '5e30dc6a-5c69-4e20-9e30-b81fe96fc44f']
 */
function storageRetrieve(path = '', line = '') {

  if (path === '') {throw new Error("storageRetrieve() was called in /pixelplanet/src/core/discord-webhook.js but the 'path' variable was undefined!")}
  
  // If the user wants the entire file, skip boilerplate code for making sure line is a whole number
  if (line.toLowerCase() != 'all') {

    // Abuses the fact that '0' is truthy to throw an error for '', undefined, null, etc.
    if (!line) {throw new Error("storageRetrieve() was called in /pixelplanet/src/core/discord-webhook.js but the 'line' variable was undefined!")}

    line = Math.round(parseInt(line)); // Turns line into an integer
  
    // line can ONLY be a whole number
    if (line < 0) {throw new Error("storageRetrieve() was called in /pixelplanet/src/core/discord-webhook.js but the 'line' variable was not a whole number!")}
  }
  
  // If the log file does not exist...
  if (!fs.existsSync(path)) {

    // ...create the log file
    fs.writeFileSync(path, 'This file is generated by pixelplanet/src/core/discord-webhook.js', 'utf8');

    return false; // We can't retrieve what the user wants (it does not exist), so return false
  } else {
    // ...the file exists

    const logFileLines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/); // Read the file and split the content of each line into an index in an Array
    
    if (line == 'all') {return logFileLines;} // Return the entire file if that is what the user wants
    
    //const logFileLines = logFileContent.split(/\r?\n/); // Splits the content into each line
    const requestedLine = logFileLines[line]?.replace(/\r?\n/g, '').trim() || false; // Retrieves the content of the line, if any, and trims it

    return requestedLine; // Returns the requested line, which is false if it does not exist
  }
}

/** Stores data in the long-term storage file for discord-webhook.js
 * @param {string} path - The path to the storage file
 * @param {string} line - The line of the storage file to override. Set to 'all' to override the entire file with a string Array (each index is a line of the file)
 * @param {*} content - The content to override with. This can be a string, or an array of strings (if overriding the entire file)
 * @example
 * console.log(storageRetrieve('../src/data/moderationLogging.txt', '0')); // 'This file is generated by pixelplanet/src/core/discord-webhook.js'
 * storageOverride('../src/data/moderationLogging.txt', '0', 'Display text'); // Overrides the first line
 * console.log(storageRetrieve('../src/data/moderationLogging.txt', '0')); // 'Display text'
 * @example
 * console.log(storageRetrieve('../src/data/moderationLogging.txt', 'all')); // ['This file is generated by pixelplanet/src/core/discord-webhook.js', '5e30dc6a-5c69-4e20-9e30-b81fe96fc44f']
 * storageOverride('../src/data/moderationLogging.txt', 'all', ['Display', 'foobar']); // Overrides the entire file
 * console.log(storageRetrieve('../src/data/moderationLogging.txt', 'all')); // ['Display', 'foobar']
 */
function storageOverride(path = '', line = '', content = '') {

  // If the user wants the entire file, skip boilerplate code for making sure line is a whole number
  if (line.toLowerCase() != 'all') {

    // Abuses the fact that '0' is truthy to throw an error for '', undefined, null, etc.
    if (!line) {throw new Error("storageOverride() was called in /pixelplanet/src/core/discord-webhook.js but the 'line' variable was undefined!")}

    line = Math.round(parseInt(line)); // Turns line into an integer
  
    // line can ONLY be a whole number
    if (line < 0) {throw new Error("storageOverride() was called in /pixelplanet/src/core/discord-webhook.js but the 'line' variable was not a whole number!")}
  }

  let logFileLines = storageRetrieve(path, 'all'); // Retrieves the entire file

  // If the user wants to override the entire file...
  if (line === 'all') {

    logFileLines = content; // Override the local copy of the file (that will eventually override the actual file)
  } else if (logFileLines.length >= (line + 1)) {
    // ...ELSE IF the file contains the line to override...

    logFileLines[line] = content; // Overrides the specific line
  } else {
    console.warn("storageOverride() was called in /pixelplanet/src/core/discord-webhook.js but it is attempting to override/store data on a line that does not exist! This will quietly fail!");
  }

  // Overrides the entire file, OR just the specific line, OR does nothing if the line does not exist
  fs.writeFileSync(logFile, logFileLines.join('\n'), 'utf8'); // Un-splits the file, and overrides the file
}

/** Handles the formatting for a link to an area on the canvas.
 * @param {string} targetCanvas - The canvas to link to. This *should* be the letter version. I.e. 'd'
 * @param {string} x - The top left X coordinate of the area
 * @param {string} y - The top left Y coordinate of the area
 * @param {string} width - The width of the area
 * @param {string} height - The height of the area
 * @param {string} [zoom='16'] - The zoom for the link. Default is '16' (Optional)
 * @returns Formatted string with link to top left corner and center of area
 * @example
 * // Markdown makes all examples look like this -> "Link to top left corner ----- Link to center"
 * console.log('d', '0', '14', '100', '200'); // "[Link to top left corner](https://pixmap.fun/#d,0,14,16) ----- [Link to center](https://pixmap.fun/#d,50,107,16)"
 * @example
 * console.log('d', '0', '14', '100', '200', '64'); // "[Link to top left corner](https://pixmap.fun/#d,0,14,64) ----- [Link to center](https://pixmap.fun/#d,50,107,64)"
 */
function linkToCanvas(targetCanvas = '', x = '', y = '', width = '', height = '', zoom = '16') {
  
  // Throws error if any required parameters were not passed in
  if (targetCanvas === '' || x === '' || y === '' || width === '' || height === '') {
    throw new Error(`linkToCanvas() in /pixelplanet/src/core/discord-webhook.js was called, but ${targetCanvas === '' ? `targetCanvas` : x === '' ? `x` : y === '' ? `y` : width === '' ? `width` : `height`} is not defined!`);
  }

  return `[Link to top left corner](https://pixmap.fun/#${targetCanvas},${x},${y},${zoom}) ----- [Link to center](https://pixmap.fun/#${targetCanvas},${x + Math.round(width/2)},${y + Math.round(height/2)},${zoom})`;
}

/** Logs moderations commands to a Discord channel using a Webhook.
 * All parameters default to empty strings!
 * @param {string} executorId - The ID of the user who executed the command
 * @param {string} executorName - The name of the user who executed the command
 * @param {string} command - The command that was executed
 * @param {string} [targetName] - The name of the target user/canvas (Optional)
 * @param {string} [targetId] - The ID of the target user/canvas (Optional)
 * @param {string} [coordinates] - The coordinates affected by the command (Optional)
 * @param {string} [consequenceLength] - The length of time the command will have an effect (Optional)
 * @param {string} [commandDescription] - Any comment provided by the executor of the command. This can be a reason for executing the command, or data (Optional)
 * @param {*} [commandFile] - Any related file buffer (Optional)
 * @param {number} [timestamp] - The time the command was executed (Optional)
 * @example
 * logModerationCommands({
 *  executorId: req.user.id,
 *  executorName: req.user.name,
 *  command: 'mute',
 *  timestamp: new Date()
 * }); // Logs a mute action
 */
export async function logModerationCommands({
  executorId = '', executorName = '',
  command = '',
  targetName = '', targetId = '',
  coordinates = '',
  consequenceLength = '',
  commandDescription = '',
  commandFile = null,
  timestamp = ''
} = {}) {

  // Do not log if the user has disabled logging
  if (DISCORD_LOGGING_ENABLED == 'false' || DISCORD_LOGGING_ENABLED == '') {return;}

  // If the secret of "Discord Webhook Moderation Log" is NOT a populated string...
  // Note: NOT string, NOR empty string
  if (!(typeof DISCORD_HOOK_MLOG === 'string') && !(DISCORD_HOOK_MLOG.length > 0)) {
    console.warn(`logModerationCommands() was called, but the Webhook secret is empty or missing!`);
    return; // Kills itself
  }

  // Fail silently if any required parameters were not passed in
  if (executorId === '') {
    console.error(`logModerationCommands() was called, but the "executorId" is not defined!`);
    return; // Kills itself
  } else if (executorName === '') {
    console.error(`logModerationCommands() was called, but the "executorName" is not defined!`);
    return; // Kills itself
  } else if (command === '') {
    console.error(`logModerationCommands() was called, but the "command" is not defined!`);
    return; // Kills itself
  }

  try {

    let color = Colors.BLACK; // Default color for the embed
    let message = `A moderation command was executed by **\`${executorName}\`** (${executorId}). We do not know what the command was...`; // Default message

    // Different messages based on the command executed
    // TODO: Eventually move this to where logModerationCommands() is called
    switch (command) {

      // ---------- FORBIDDEN ----------
      case 'forbidden': { // THIS CASE IS BLOCK-SCOPED!!! All variables declared in here are local
        color = Colors.RED;

        // If the stored IID equals the executor's IID...
        if (storageRetrieve(logFile, '1') == executorName) {

          return; // The last IID is the same, so discord-webhook.js should kill itself
        } else {
          // ...ELSE the last IID is different, so we should log and report

          storageOverride(logFile, '1', executorName); // Overrides the IID in the storage file
        }

        message = `**\`${executorName}\`**${commandDescription === 'userlvl' ? ` (${executorId}) ` : ` `}tried to access the Moderator Tools, but they ${commandDescription === 'userlvl' ? 'are don\'t have permission' : 'are not logged in'}!`;
        break;
      }
      
      // ---------- MUTE ----------
      case 'mute':
        if (consequenceLength && (consequenceLength < 1439)) {return;} // Does not log mutes shorter than 1 day, but ensures that infinite mutes (0) are logged
        color = Colors.ORANGE;
        message = `**\`${targetName}\`** (${targetId}) was muted by **\`${executorName}\`** (${executorId}) for **${consequenceLength ? `${consequenceLength} minutes` : `forever`}**.\nThe mute will end ${consequenceLength ? `<t:${Math.floor(parseInt((timestamp)/1000) + (parseInt(consequenceLength)*60))}:R>` : `**never**`}.`;
        break;
      case 'mutec':
        color = Colors.ORANGE;
        message = `Country **${targetId}** was muted by **\`${executorName}\`** (${executorId}).`;
        command = `Mute Country ${countryCodeToFlag(targetId)}`; // Custom command name + flag
        break;
      
      // ---------- UNMUTE ----------
      case 'unmute':
        color = Colors.GREEN;
        message = `**\`${targetName}\`** (${targetId}) was unmuted by **\`${executorName}\`** (${executorId}).`;
        break;
      case 'unmutec':
        // Note: targetId is falsey when all countries are unmuted (because no country was specified in the command)
        color = Colors.GREEN;
        message = `${targetId ? `Country **${targetId}** has` : `**All countries** have`} been unmuted by **\`${executorName}\`** (${executorId}).`;
        command = `Unmute Countr${targetId ? `y ${countryCodeToFlag(targetId)}` : `ies`}`; // Custom command name + flag
        break;

      // ---------- BAN ----------
      case 'ban':
        color = Colors.RED;
        message = `**\`${targetName}\`** was banned by **\`${executorName}\`** (${executorId}) for **${parseInt(consequenceLength) ? `${Math.floor((consequenceLength - new Date()) / 60000)} minutes` : `forever`}**.\n${commandDescription ? `**\`${targetName}\`** was banned because: ${commandDescription}` : `No reason was provided.`}\nThe ban will end ${parseInt(consequenceLength) ? `<t:${(parseInt(Math.floor((consequenceLength - new Date()) / 1000))) + parseInt(timestamp/1000)}:R>` : `**never**`}.`;
        break;
      case 'banid':
        color = Colors.RED;
        message = `**\`${targetName}\`** (${targetId}) was banned by **\`${executorName}\`** (${executorId}) for **${parseInt(consequenceLength) ? `${Math.floor((consequenceLength - new Date()) / 60000)} minutes` : `forever`}**.\n${commandDescription ? `**\`${targetName}\`** (${targetId}) was banned because: ${commandDescription}` : `No reason was provided.`}\nThe ban will end ${parseInt(consequenceLength) ? `<t:${(parseInt(Math.floor((consequenceLength - new Date()) / 1000))) + parseInt(timestamp/1000)}:R>` : `**never**`}.`;
        break;
      case 'updateban':
        color = Colors.YELLOW;
        message = `The ban of **\`${targetName}\`** has been updated.\nBan Length: **${parseInt(consequenceLength) ? Math.floor((consequenceLength - new Date()) / 60000) + ' minutes' : 'forever'}**.\n${commandDescription ? `**\`${targetName}\`** was banned because: ${commandDescription}` : `No reason was provided.`}\nThe ban will end ${parseInt(consequenceLength) ? `<t:${(parseInt(Math.floor((consequenceLength - new Date()) / 1000))) + parseInt(timestamp/1000)}:R>` : `**never**`}.`;
        command = `Update Ban`; // Custom command name
        break;

      // ---------- UNBAN ----------
      case 'unban':
        color = Colors.GREEN;
        message = `**\`${targetName}\`** was unbanned by **\`${executorName}\`** (${executorId})`;
        break;
      case 'unbanid':
        color = Colors.GREEN;
        message = `**\`${targetName}\`** (${targetId}) was unbanned by **\`${executorName}\`** (${executorId})${commandDescription ? ` for the reason: ${commandDescription}` : `.`}`;
        break;

      // ---------- CHAT MANIPULATION ----------
      case 'purge': { // THIS CASE IS BLOCK-SCOPED!!! All variables declared in here are local
        color = Colors.PINK;
        const [purgeType, purgeCount] = commandDescription.split(','); // Retrieve data from commandDescription
        message = `**\`${executorName}\`** (${executorId}) has purged ${purgeType == 'all' ? `**all ${purgeCount}**` : `${purgeType}`} message${purgeCount == '1' ? `` : `s`} from **\`${targetName}\`** (${targetId}).`;
        break;
      }
      case 'chatcd':
        color = Colors.ORANGE;
        message = `**\`${executorName}\`** (${executorId}) set chat cooldown to **${consequenceLength} second${consequenceLength == '1' ? `` : `s`}**.`;
        command = `Chat Cooldown`; // Custom command name
        break;
      
      // ---------- CAPTCHA ----------
      case 'givecaptcha':
        color = Colors.YELLOW;
        message = `**\`${executorName}\`** (${executorId}) has forced a CAPTCHA on **\`${targetName}\`**`;
        command = `Give CAPTCHA`; // Custom command name
        break;

      // ---------- (UN)WHITELIST ----------
      case 'whitelist': // "Falls" into the next case below
      case 'unwhitelist':
        color = command == 'whitelist' ? Colors.GREEN : Colors.RED;
        message = `**\`${executorName}\`** (${executorId}) has ${command == 'whitelist' ? `` : `un`}whitelisted **\`${targetName}\`**`;
        break;

      // ---------- IMAGE UPLOAD ----------
      case 'build': // "Falls" into the next case below
      case 'protect': // "Falls" into the next case below
      case 'wipe': { // THIS CASE IS BLOCK-SCOPED!!! All variables declared in here are local
        const flavor = command === 'build' ? 'non-virgin pixels' : command === 'protect' ? 'non-virgin protected pixels' : 'virgin pixels'; // Text that discriminates between the three image upload options
        command = `Image Upload (${capitalizeFirstLetter(command)})`; // Custom command name
        color = Colors.LIME;
        const [width, height] = commandDescription.split(','); // Retrieve data from commandDescription
        const x = parseInt(coordinates.substring(0, coordinates.indexOf('_'))); // Canvas top left X coordinate
        const y = parseInt(coordinates.substring(coordinates.indexOf('_') + 1)); // Canvas top left Y coordinate
        message = `**\`${executorName}\`** (${executorId}) uploaded (with ${flavor}) an image to the **${targetId}** canvas.\nThe image has a width of **${width}** pixels, a height of **${height}** pixels, and is **${width*height}** total pixels.\n${linkToCanvas(targetId, x, y, width, height)}`;
        break;
      }
      
      // ---------- PIXEL PROTECTION ----------
      case 'Pixel Protect': // "Falls" into the next case below
      case 'unprotect': { // THIS CASE IS BLOCK-SCOPED!!! All variables declared in here are local
        color = command == 'unprotect' ? Colors.GREEN : Colors.ORANGE; // Unprotect is green, otherwise orange.
        const isProtect = command != 'unprotect'; // (BOOLEAN) True if anything other than "unprotect"
        command = command == 'unprotect' ? 'Pixel Unprotect' : command; // Custom command name
        const [width, height] = commandDescription.split(','); // Retrieve data from commandDescription
        const x = parseInt(coordinates.substring(0, coordinates.indexOf('_'))); // Canvas top left X coordinate
        const y = parseInt(coordinates.substring(coordinates.indexOf('_') + 1)); // Canvas top left Y coordinate
        message = `**\`${executorName}\`** (${executorId}) has ${command.substring(command.indexOf(' ') + 1).toLowerCase()}ed an area on the **${targetId}** canvas between (**${x}**, **${y}**) and (**${x + parseInt(width)}**, **${y + parseInt(height)}**).\nThe area has a width of **${width}** pixels, a height of **${height}** pixels, and is **${width*height}** total pixels.\n${linkToCanvas(targetId, x, y, width, height)}`;
        break;
      }

      // ---------- CANVAS CLEANER ----------
      case 'spare': // "Falls" into the next case below
      case 'spareext': // "Falls" into the next case below
      case 'spareextu': // "Falls" into the next case below
      case 'makenull': // "Falls" into the next case below
      case 'makeblank': { // THIS CASE IS BLOCK-SCOPED!!! All variables declared in here are local
        color = Colors.BLUE_LIGHT;
        const [width, height] = commandDescription.split(','); // Retrieve data from commandDescription. Ignores all data after the first two CSV
        const x = parseInt(coordinates.substring(0, coordinates.indexOf('_'))); // Canvas top left X coordinate
        const y = parseInt(coordinates.substring(coordinates.indexOf('_') + 1)); // Canvas top left Y coordinate
        message = `**\`${executorName}\`** (${executorId}) has activated the **${command}** canvas cleaner on the **${canvases[targetId].ident}** canvas.\n The canvas cleaner is running between (**${x}**, **${y}**) and (**${x + parseInt(width)}**, **${y + parseInt(height)}**).\nThe area has a width of **${width}** pixels, a height of **${height}** pixels, and is **${width*height}** total pixels.\n${linkToCanvas(canvases[targetId].ident, x, y, width, height)}`;
        command = `Canvas Cleaner (${capitalizeFirstLetter(command)})`; // Custom command name
        break;
      }
      case 'replacecolor': { // THIS IS BLOCK-SCOPED!!! All variables declared in here are local
        color = Colors.BLUE_LIGHT;
        const [width, height, sourceColor, targetColor] = commandDescription.split(','); // Retrieve data from commandDescription
        const sourceColorRGB = canvases[targetId].colors[sourceColor]; // Source Color Array RGB
        const targetColorRGB = canvases[targetId].colors[targetColor]; // Target Color Array RGB
        const x = parseInt(coordinates.substring(0, coordinates.indexOf('_'))); // Canvas top left X coordinate
        const y = parseInt(coordinates.substring(coordinates.indexOf('_') + 1)); // Canvas top left Y coordinate
        message = `**\`${executorName}\`** (${executorId}) replaced the RGB color **${sourceColorRGB}** (#${sourceColor}) with **${targetColorRGB}** (#${targetColor}) between (**${x}**, **${y}**) and (**${x + parseInt(width)}**, **${y + parseInt(height)}**) on the **${canvases[targetId].ident}** canvas.\nThe area has a width of **${width}** pixels, a height of **${height}** pixels, and is **${width*height}** total pixels.\n${linkToCanvas(canvases[targetId].ident, x, y, width, height)}`;
        command = `Canvas Cleaner (Replace Color)`;  // Custom command name
        commandFile = imageCreate_ReplaceColor(sourceColorRGB, targetColorRGB, 100); // Creates the image for "Replace Color"
        break;
      }

      // ---------- ROLLBACK ----------
      case 'rollback': { // THIS IS BLOCK-SCOPED!!! All variables declared in here are local
        color = Colors.RED;
        const [width, height, date, time] = commandDescription.split(','); // Retrieve data from commandDescription
        const x = parseInt(coordinates.substring(0, coordinates.indexOf('_'))); // Canvas top left X coordinate
        const y = parseInt(coordinates.substring(coordinates.indexOf('_') + 1)); // Canvas top left Y coordinate
        const timestamp = Date.UTC(date.slice(0, 4), date.slice(4, 6)-1, date.slice(6, 8), time.slice(0, 2), time.slice(2, 4)) / 1000; // UTC Timestamp in seconds
        message = `**\`${executorName}\`** (${executorId}) rolledback the area between (**${x}**, **${y}**) and (**${x + parseInt(width)}**, **${y + parseInt(height)}**) on the **${canvases[targetId].ident}** canvas.\nThe area was rolledback to <t:${timestamp}:f>.\nThe area has a width of **${width}** pixels, a height of **${height}** pixels, and is **${width*height}** total pixels.\n${linkToCanvas(canvases[targetId].ident, x, y, width, height)}`;
        break;
      }

      // ---------- MODERATION PERMISSION ----------
      case 'makemod':
        color = Colors.PURPLE;
        message = `**\`${executorName}\`** (${executorId}) has made **\`${targetName}\`** (${targetId}) a moderator.`;
        command = `Make Moderator`; // Custom command name
        break;
      case 'revmod':
        color = Colors.RED;
        message = `**\`${executorName}\`** (${executorId}) has removed moderator permissions from **\`${targetName}\`** (${targetId})!`;
        command = `Remove Moderator`; // Custom command name
        break;
      
      // ---------- ANNOUNCEMENT ----------
      case 'popup': // "Falls" into the next case below
      case 'banner':
        color = Colors.YELLOW;
        message = `**\`${executorName}\`** (${executorId}) has made an announcement.\nMessage: ${commandDescription}`;
        command = `Announcement (${capitalizeFirstLetter(command)})`;
        break;
    }

    // Constructs the embed
    const modLogEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(capitalizeFirstLetter(command))
    .setDescription(message + (timestamp ? `\n**\`${executorName}\`** sent this command at <t:${Math.floor(timestamp / 1000)}:f>.` : `We do not know when **\`${executorName}\`** sent this command.`))
    .setImage(commandFile ? 'attachment://image.png' : null);

    const form = new FormData(); // Creates a new FormData object for the request

    // Appends a file structure to the FormData only if commandFile has a Buffer
    // https://discordjs.guide/popular-topics/embeds.html#attaching-images
    if (commandFile) {form.append('file', Buffer.from(commandFile), 'image.png');}

    // Appends the JSON payload (of the embed) to the FormData
    form.append('payload_json', JSON.stringify({
      embeds: [modLogEmbed.toJSON()]
    }));

    // POSTs the FormData to the Discord Webhook
    axios.post(DISCORD_HOOK_MLOG, form, {
      headers: form.getHeaders(),
    })
    .then(res => console.log('Sent Webhook message successfully:', res?.data?.embeds?.[0]?.title ?? 'in the #mod-logs channel'))
    .catch(err => console.error('Error sending webhook:', err.response?.data || err.message));

  } catch (error) {
    console.error(`Error occured while logging a moderation command: ${error.message}\n${error.stack}`);
  }
}
