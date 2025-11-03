/*
 * worker thread for creating captchas
 */

/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import ppfunCaptcha from 'ppfun-captcha';
import { isMainThread, parentPort } from 'worker_threads';
import { createCanvas, loadImage } from 'canvas';
import generateCaptcha from 'captcha-eisenrose';

import { getRandomString } from '../core/utils';

const FONT_FOLDER = 'captchaFonts';

const useSwingCaptcha = true; // Set to false if you want to use ppfun-captcha

if (isMainThread) {
  throw new Error(
    'Tilewriter is run as a worker thread, not as own process',
  );
}

const font = fs.readdirSync(path.resolve(__dirname, '..', FONT_FOLDER))
  .filter((e) => e.endsWith('.ttf') || e.endsWith('.otf'))
  .map((e) => ppfunCaptcha.loadFont(
    path.resolve(__dirname, '..', FONT_FOLDER, e),
  ));

async function createCaptcha() {
  // Generate captcha with SVG
  const captcha = ppfunCaptcha.create({
    width: 510,
    height: 320,
    fontSize: 190,
    stroke: '#FFFFFF', // Brighter white for better contrast
    fill: 'none',
    nodeDeviation: 2.5,
    connectionPathDeviation: 10.0,
    style: 'stroke-width: 4;',
    background: '#EFEFEF',
    font,
  });

  // Create canvas and draw the SVG content
  const canvas = createCanvas(510, 320);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = '#EFEFEF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw the SVG content
  const svgData = `data:image/svg+xml;base64,${Buffer.from(captcha.data).toString('base64')}`;
  const img = await loadImage(svgData);
  ctx.drawImage(img, 0, 0);

  // Convert to PNG buffer
  const pngBuffer = canvas.toBuffer('image/png');

  return {
    text: captcha.text,
    data: pngBuffer
  };
}

parentPort.on('message', async (msg) => {
  try {

    let captcha;
    let captchaid;

    if (msg === 'createCaptcha') {

      if (useSwingCaptcha) {
        try {
          captcha = await generateCaptcha({
            imageSizeX: 300, imageSizeY: 180,
            fonts: ["Arial", "Consolas", "Courier New", "Times New Roman"],
            textX: 300*0.2, textY: 180*0.6,
            textCoordDeviation: 0.3,
            letterOffScreenMaxLimit: 0.33,
            offsetLetterWidthDeviation: 0.2,
            noiseAlpha: 0.25,
            textHueDeviation: 30,
            captchaLength: 5+Math.round(Math.random()),
            captchaChars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
            fontFolderDir: path.resolve(__dirname, '..', 'core', 'CAPTCHA-Eisenrose-Fonts'),
            enableLogs: false
          });

          //console.log(`SwingCaptcha generated: buffer length: ${captcha.bufferImage.length}; text: ${captcha.captchaText}`);

          const text = captcha.captchaText;
          const data = captcha.bufferImage;
          captcha = { text, data };

          captchaid = getRandomString();
          //console.log(`SwingCaptcha generated with id & text: ${captchaid} - ${text}`);
        } catch (error) {
          console.warn(`Exception in SwingCaptcha: ${error}`);
        }
      } else {
        captcha = await createCaptcha();
        captchaid = getRandomString();
      }
      
      parentPort.postMessage([
        null,
        captcha.text,
        captcha.data,
        captchaid,
      ]);
    }
  } catch (error) {
    console.warn(
      `Captchas: Error on createCaptcha: ${error.message}`,
    );
    parentPort.postMessage(['Failure!']);
  }
});
