/*
 * WebSocket Test Script
 * 
 * WARNING: This script is for testing purposes only.
 * Do not use this in production or to artificially inflate metrics.
 * 
 * This script creates multiple WebSocket connections to simulate
 * multiple users connecting to the server.
 */

const WebSocket = require('ws');
const readline = require('readline');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const SERVER_URL = 'ws://127.0.0.1:3000/ws'; // Main WebSocket endpoint
const NUM_CONNECTIONS = 92; // Number of connections to create
const CONNECTION_INTERVAL = 2000; // Time between connections in ms (increased to avoid rate limits)
const CANVAS_ID = 0; // Default canvas ID

// WebSocket opcodes
const REG_CANVAS_OP = 0x01;

// Track active connections
const connections = new Set();
let connectionCount = 0;

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to generate random string
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// Function to get latest captcha text from PM2 logs
async function getLatestCaptchaText() {
  return new Promise((resolve, reject) => {
    const logPath = '/root/.pm2/logs/ppfun-out.log';
    if (!fs.existsSync(logPath)) {
      reject(new Error('PM2 log file not found'));
      return;
    }

    // Read the last 100 lines of the log file
    const logContent = fs.readFileSync(logPath, 'utf8');
    const lines = logContent.split('\n').reverse();
    
    // Find the most recent captcha line for 127.0.0.1
    for (const line of lines) {
      if (line.includes('127.0.0.1 got captcha with text:')) {
        const match = line.match(/got captcha with text: ([a-zA-Z0-9]+)/);
        if (match) {
          resolve(match[1]);
          return;
        }
      }
    }
    
    reject(new Error('No recent captcha found in logs'));
  });
}

// Function to get captcha
async function getCaptcha() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/captcha.png',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/png'
      }
    };

    const req = http.request(options, (res) => {
      const captchaId = res.headers['captcha-id'];
      if (!captchaId) {
        reject(new Error('No captcha ID received'));
        return;
      }

      // Get the captcha text from PM2 logs
      getLatestCaptchaText()
        .then(text => {
          resolve({
            id: captchaId,
            text: text
          });
        })
        .catch(error => {
          reject(error);
        });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Function to solve captcha via WebSocket
async function solveCaptchaViaWebSocket(captchaId, solution) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL, {
      headers: {
        'Origin': 'http://127.0.0.1:3000'
      }
    });

    ws.on('open', () => {
      // Send captcha solution immediately
      ws.send(`cs,${JSON.stringify([solution, captchaId])}`);
    });

    ws.on('message', (data) => {
      if (data instanceof Buffer) {
        const opcode = data.readUInt8(0);
        if (opcode === 0xC6) { // CAPTCHA_RETURN_OP
          const retCode = data.readUInt8(1);
          ws.close();
          if (retCode === 0) {
            resolve(true);
          } else {
            reject(new Error(`Captcha failed with code ${retCode}`));
          }
        }
      }
    });

    ws.on('error', (error) => {
      reject(error);
    });

    // Set shorter timeout
    setTimeout(() => {
      ws.close();
      reject(new Error('Captcha solve timeout'));
    }, 5000);
  });
}

// Function to register a new user
async function registerUser() {
  const email = `${generateRandomString(8)}@gmail.com`;
  const name = generateRandomString(12);
  const password = generateRandomString(16);
  
  // Get captcha
  const captcha = await getCaptcha();
  console.log(`Got captcha ID: ${captcha.id}, Text: ${captcha.text}`);
  
  // Prepare registration data
  const postData = JSON.stringify({
    email,
    name,
    password,
    captcha: captcha.text,
    captchaid: captcha.id
  });

  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/register',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  // Create the request but don't send it yet
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        if (response.success) {
          resolve({ email, name, password });
        } else {
          reject(new Error(response.errors.join(', ')));
        }
      } catch (e) {
        reject(e);
      }
    });
  });

  req.on('error', (error) => {
    reject(error);
  });

  // Try to solve the captcha via WebSocket
  try {
    await solveCaptchaViaWebSocket(captcha.id, captcha.text);
    console.log('Captcha solved successfully');
    
    // Immediately send the registration request after captcha is solved
    req.write(postData);
    req.end();
  } catch (error) {
    console.error('Failed to solve captcha:', error);
    req.destroy();
    throw error;
  }
}

// Function to login and get session cookie
async function loginAndGetCookie(username, password) {
  const postData = JSON.stringify({
    nameoremail: username,
    password: password
  });

  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/auth/local',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const cookies = res.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        resolve(cookies[0].split(';')[0]);
      } else {
        reject(new Error('No session cookie received after login'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Function to create registration message
function createRegCanvasMessage(canvasId) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt8(REG_CANVAS_OP, 0);
  buffer.writeUInt8(canvasId, 1);
  return buffer;
}

// Function to create a single WebSocket connection
async function createConnection() {
  try {
    // First register a new user
    const { email, name, password } = await registerUser();
    console.log(`Registered new user: ${name} (${email})`);
    
    // Then login to get session cookie
    const cookie = await loginAndGetCookie(name, password);
    const ws = new WebSocket(SERVER_URL, {
      headers: {
        'Origin': 'http://127.0.0.1:3000',
        'Cookie': cookie
      }
    });

    ws.on('open', () => {
      connectionCount++;
      console.log(`Connection ${connectionCount} established`);
      connections.add(ws);
      
      // Register with canvas using binary message
      const registerMsg = createRegCanvasMessage(CANVAS_ID);
      ws.send(registerMsg);
      console.log(`Sent registration for canvas ${CANVAS_ID}`);
    });

    ws.on('close', (code, reason) => {
      console.log(`Connection closed with code ${code} and reason: ${reason}`);
      connections.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('message', (data) => {
      try {
        if (data instanceof Buffer) {
          // Handle binary messages
          const opcode = data.readUInt8(0);
          if (opcode === 0xA7) { // ONLINE_COUNTER_OP
            const total = data.readUInt16BE(1);
            console.log(`Received online counter update: ${total} total users`);
          }
        } else {
          // Handle text messages
          const message = data.toString();
          if (message.startsWith('{')) {
            const json = JSON.parse(message);
            if (json.type === 'announcement') {
              console.log(`Received announcement: ${json.message}`);
            }
          }
        }
      } catch (e) {
        console.log('Error processing message:', e);
      }
    });

    return ws;
  } catch (error) {
    console.error('Failed to create connection:', error);
    return null;
  }
}

// Function to create multiple connections with exponential backoff
async function createMultipleConnections() {
  console.log(`Creating ${NUM_CONNECTIONS} connections...`);
  
  for (let i = 0; i < NUM_CONNECTIONS; i++) {
    await createConnection();
    // Exponential backoff to avoid rate limits
    const delay = CONNECTION_INTERVAL * Math.pow(1.1, i);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Function to close all connections
function closeAllConnections() {
  console.log('Closing all connections...');
  connections.forEach(ws => {
    ws.close();
  });
  connections.clear();
  connectionCount = 0;
}

// Main menu
function showMenu() {
  console.log('\nWebSocket Test Menu:');
  console.log('1. Create multiple connections');
  console.log('2. Close all connections');
  console.log('3. Exit');
}

// Handle user input
function handleInput(input) {
  switch (input.trim()) {
    case '1':
      createMultipleConnections();
      break;
    case '2':
      closeAllConnections();
      break;
    case '3':
      closeAllConnections();
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('Invalid option');
  }
}

// Start the program
console.log('WebSocket Test Script');
console.log('====================');
console.log('This script is for testing purposes only.');
console.log('Do not use this in production or to artificially inflate metrics.\n');

showMenu();
rl.on('line', (input) => {
  handleInput(input);
  showMenu();
});

// Handle cleanup on process exit
process.on('SIGINT', () => {
  closeAllConnections();
  rl.close();
  process.exit(0);
});