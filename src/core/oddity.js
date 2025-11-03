const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');

const canvasesFilePath = '/root/pixelplanet/dist/canvases.json';
const oddityFilePath = '/root/pixelplanet/dist/odditytime.json';

let maxTotal = 0; // Maximum player count for the next oddity event
let currentEventMax = 0; // Maximum player count during the current event
let oddityActive = false;

async function readCanvases() {
    return JSON.parse(fs.readFileSync(canvasesFilePath, 'utf8'));
}

async function writeCanvases(data) {
    fs.writeFileSync(canvasesFilePath, JSON.stringify(data, null, 2));
}

async function createOddityFile(startTime, endTime, bcd, pcd) {
    const oddityData = {
        startTime,
        endTime,
        bcd,
        pcd,
    };
    
    const dir = path.dirname(oddityFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(oddityFilePath, JSON.stringify(oddityData, null, 2));
}

async function fetchTotal(retries = 3) {
    try {
        const response = await axios.get('https://pixmap.fun/api/shards');
        let totalPlayers = 0;
        response.data.forEach(shard => {
            totalPlayers += shard[1].total;
        });
        totalPlayers = Math.min(totalPlayers, 500);
        return totalPlayers;
    } catch (error) {
        if (error.response) {
            console.error(`Error fetching total: ${error.response.status} - ${error.response.data}`);
        } else {
            console.error(`Error fetching total: ${error.message}`);
        }
        if (retries > 0) {
            console.log(`Retrying... (${3 - retries + 1})`);
            return fetchTotal(retries - 1);
        }
        return null;
    }
}

async function manageOddity() {
    console.log('Manage Oddity function started'); // Log when the function starts
    const currentDate = new Date();
    const currentHour = currentDate.getUTCHours();
    const currentMinute = currentDate.getUTCMinutes();
    const dayOfMonth = currentDate.getDate();

    let originalBcd, originalPcd; // Declare variables here

    if (dayOfMonth % 2 === 0) {
        console.log(`Today is an even day. No oddity event will occur.`);
        return;
    }

    if (currentHour === 16 && currentMinute === 59) {
        const canvases = await readCanvases();
        originalBcd = canvases[0].bcd; // Assign values here
        originalPcd = canvases[0].pcd;

        const startTime = new Date(currentDate);
        startTime.setUTCHours(17, 0, 0, 0);

        let durationHours = 2;

        if (currentEventMax >= 100 && currentEventMax < 300) {
            durationHours = 2;
        } else if (currentEventMax >= 300 && currentEventMax < 400) {
            durationHours = 3;
        } else if (currentEventMax >= 400 && currentEventMax < 500) {
            durationHours = 4;
        } else if (currentEventMax >= 500) {
            durationHours = 5;
        }

        const endTime = new Date(currentDate);
        endTime.setUTCHours(startTime.getUTCHours() + durationHours, 0, 0, 0);

        await createOddityFile(startTime.toISOString(), endTime.toISOString(), originalBcd, originalPcd);

        canvases[0].bcd = Math.floor(originalBcd / 2);
        canvases[0].pcd = Math.floor(originalPcd / 2);

        await writeCanvases(canvases);

        console.log(`Oddity started! New bcd: ${canvases[0].bcd}, New pcd: ${canvases[0].pcd}`);
        exec('pm2 restart ppfun', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error restarting PM2 process: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`PM2 stderr: ${stderr}`);
                return;
            }
        });

        const waitTime = durationHours * 3600000;
        console.log(`Waiting for oddity to end in ${durationHours} hours...`);
        oddityActive = true;
        currentEventMax = 0; // Reset current event max for the new event
        setTimeout(async () => {
            canvases[0].bcd = originalBcd;
            canvases[0].pcd = originalPcd;

            await writeCanvases(canvases);

            console.log(`Oddity ended! Reverted bcd: ${canvases[0].bcd}, Reverted pcd: ${canvases[0].pcd}`);
            exec('pm2 restart ppfun', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error restarting PM2 process: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`PM2 stderr: ${stderr}`);
                    return;
                }
            });

            maxTotal = Math.max(maxTotal, currentEventMax); // Update maxTotal for the next event
            oddityActive = false;
        }, waitTime);
    } else if (currentHour >= 17 && originalBcd === 1000 && originalPcd === 2000) {
        const canvases = await readCanvases();
        originalBcd = canvases[0].bcd; // Assign values here
        originalPcd = canvases[0].pcd;
        const elapsedTime = (currentHour - 17) * 60 + currentMinute; // Calculate elapsed time in minutes
        const additionalHours = Math.ceil(elapsedTime / 60); // Convert to hours

        const startTime = new Date(currentDate);
        startTime.setUTCHours(17, 0, 0, 0);
        const endTime = new Date(startTime);
        endTime.setUTCHours(endTime.getUTCHours() + additionalHours + 2); // Add 2 hours for the event duration

        await createOddityFile(startTime.toISOString(), endTime.toISOString(), originalBcd, originalPcd);

        canvases[0].bcd = Math.floor(originalBcd / 2);
        canvases[0].pcd = Math.floor(originalPcd / 2);

        await writeCanvases(canvases);

        console.log(`Oddity started due to missed start time! New bcd: ${canvases[0].bcd}, New pcd: ${canvases[0].pcd}`);
        exec('pm2 restart ppfun', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error restarting PM2 process: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`PM2 stderr: ${stderr}`);
                return;
            }
        });

        oddityActive = true;
    } else {
        const timeUntilOddity = (17 - currentHour) * 60 - currentMinute;
        if (timeUntilOddity > 0) {
            console.log(`Waiting for oddity, time until oddity: ${timeUntilOddity} minutes`);
        }
    }
}

// Log when the script starts
console.log('Oddity script started');

setInterval(async () => {
    if (oddityActive) {
        const total = await fetchTotal();
        if (total !== null) {
            currentEventMax = Math.max(currentEventMax, total);
        }
    }
}, 20000);

setInterval(() => {
    if (!oddityActive) {
        manageOddity();
    }
}, 60000);