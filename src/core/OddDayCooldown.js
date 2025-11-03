import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ChatProvider } from './ChatProvider';

const filePath = path.join(__dirname, '../dist/canvases.json');
const chatProvider = new ChatProvider();

async function checkAndApplyOddDayCooldown() {
    const currentDate = new Date();
    const dayOfMonth = currentDate.getDate();
    const currentHour = currentDate.getUTCHours();

    if (dayOfMonth % 2 !== 0 && currentHour === 20) {
        let canvasData;
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            canvasData = JSON.parse(data);
        } catch (error) {
            console.error('Error reading canvases.json:', error);
            return;
        }

        const cooldowns = canvasData['0'];
        const originalValues = {
            bcd: cooldowns.bcd,
            pcd: cooldowns.pcd,
        };

        cooldowns.bcd = Math.floor(originalValues.bcd / 2);
        cooldowns.pcd = Math.floor(originalValues.pcd / 2);

        try {
            fs.writeFileSync(filePath, JSON.stringify(canvasData, null, 2));
        } catch (error) {
            console.error('Error writing to canvases.json:', error);
            return;
        }

        chatProvider.broadcastChatMessage('info', 'Oddity started! Cooldown is halved for 2 hours.');

        exec('pm2 restart ppfun', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error restarting PM2 process: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`PM2 stderr: ${stderr}`);
                return;
            }
            console.log(`PM2 stdout: ${stdout}`);
        });

        const endTime = Date.now() + 7200000; // 2 hours in milliseconds
        fs.writeFileSync(path.join(__dirname, '../dist/oddityEndTime.json'), JSON.stringify({ endTime }));

        setInterval(async () => {
            const now = Date.now();
            const endData = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/oddityEndTime.json'), 'utf8'));
            if (now >= endData.endTime) {
                cooldowns.bcd = originalValues.bcd;
                cooldowns.pcd = originalValues.pcd;

                try {
                    fs.writeFileSync(filePath, JSON.stringify(canvasData, null, 2));
                } catch (error) {
                    console.error('Error writing to canvases.json:', error);
                    return;
                }

                chatProvider.broadcastChatMessage('info', 'Oddity ended, thanks for playing!');

                exec('pm2 restart ppfun', (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error restarting PM2 process: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        console.error(`PM2 stderr: ${stderr}`);
                        return;
                    }
                    console.log(`PM2 stdout: ${stdout}`);
                });

                fs.unlinkSync(path.join(__dirname, '../dist/oddityEndTime.json'));
            }
        }, 60000); // Check every minute
    }
}

// Call the function to check and apply the odd day cooldown
checkAndApplyOddDayCooldown();