const axios = require('axios');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const ROLE_ID = process.env.DISCORD_ROLE_ID || '1363901980837281802';
const MESSAGE = `<@&${ROLE_ID}> Oddity started! Enjoy: https://pixmap.fun`;

function getUTCTime() {
    return new Date(new Date().toUTCString());
}

function isOddDay() {
    const date = getUTCTime();
    return date.getUTCDate() % 2 === 1;
}

let alreadySent = false;

async function sendOddityNotification() {
    const date = getUTCTime();
    if (isOddDay()) {
        try {
            if (!WEBHOOK_URL) {
                console.error('🚨 Missing DISCORD_WEBHOOK_URL environment variable');
                return;
            }
            const response = await axios.post(WEBHOOK_URL, { content: MESSAGE });
            if (response.status === 204) {
                console.log(`✅ Message sent at ${date.toISOString()}`);
                alreadySent = true;
            } else {
                console.log(`❌ Failed to send message. Status code: ${response.status}`);
                console.log(response.data);
            }
        } catch (error) {
            console.error(`🚨 Error occurred:`, error.message);
        }
    } else {
        console.log(`🕒 Today (${date.getUTCDate()}) is not an odd UTC day.`);
    }
}

function runAt5PMUTC() {
    const now = getUTCTime();
    if (
        now.getUTCHours() === 17 &&
        now.getUTCMinutes() === 0 &&
        now.getUTCSeconds() === 0 &&
        !alreadySent
    ) {
        sendOddityNotification();
    }

    if (now.getUTCMinutes() !== 0 || now.getUTCHours() !== 17) {
        alreadySent = false;
    }
}

console.log('🤖 Bot started!');
console.log(`🕓 Current UTC time: ${getUTCTime().toISOString()}`);
console.log('🧠 Will check every second for 5PM UTC and odd day...');

setInterval(runAt5PMUTC, 1000);
