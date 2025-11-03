/*
 * We got so many locals that building them all in one go can lead to out-of-memory error
 * Lets split that here
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');
const webpack = require('webpack');
const validate = require("ttag-cli/dist/src/commands/validate").default;

const minifyCss = require('./minifyCss');
const zipDir = require('./zipDirectory');
const serverConfig = require('../webpack.config.server.js');
const clientConfig = require('../webpack.config.client.js');

const discordWebhook = require('../src/core/discord-serverWebhook.js');

let langs = 'all';
let doBuildServer = false;
let doBuildClient = false;
let parallel = true;
let recursion = false;
let onlyValidate = false;
for (let i = 0; i < process.argv.length; i += 1) {
  switch (process.argv[i]) {
    case '--langs': {
      const newLangs = process.argv[++i];
      if (newLangs) langs = newLangs;
      break;
    }
    case '--client':
      doBuildClient = true;
      break;
    case `--server`:
      doBuildServer = true;
      break;
    case '--parallel':
      parallel = true;
      break;
    case '--recursion':
      recursion = true;
      break;
    case '--validate':
      onlyValidate = true;
      break;
    default:
      // nothing
  }
}
if (!doBuildServer && !doBuildClient) {
  doBuildServer = true;
  doBuildClient = true;
}

/*
 * get available locals based on the files available in ../i18n
 */
function getAllAvailableLocals() {
  const langDir = path.resolve(__dirname, '..', 'i18n');
  const langs = fs.readdirSync(langDir)
    .filter((e) => (e.endsWith('.po') && !e.startsWith('ssr')))
    .map((l) => l.slice(0, -3));
  langs.unshift('en');
  return langs;
}

/*
 * get amount of msgid and msgstr of po file
 */
function getPoFileStats(file) {
  return new Promise((resolve) => {
    const fileStream = fs.createReadStream(file);
    const lineReader = readline.createInterface({ 
      input: fileStream,
      crlfDelay: Infinity,
    });

    let msgid = 0;
    let msgstr = 0;

    lineReader.on('line', (l) => {
      l = l.trim();
      if (l.endsWith('""')) {
        return;
      }
      let seperator = l.indexOf(' ');
      if (seperator === -1) {
        seperator = l.indexOf('\t');
      }
      if (seperator === -1) {
        return;
      }
      const tag = l.substring(0, seperator);
      if (tag === 'msgid') {
        msgid += 1;
      } else if (tag === 'msgstr') {
        msgstr += 1;
      }
    });

    lineReader.on('close', (l) => {
      resolve({ msgid, msgstr });
    });
  });
}

async function filterLackingLocals(langs, percentage) {
  langs = langs.filter((l) => l !== 'en');
  const promises = [];
  const { msgid, msgstr } = await getPoFileStats(path.resolve(
    __dirname, '..', 'i18n', `template.pot`,
  ));

  const langStats = await Promise.all(langs
    .map((l) => getPoFileStats(
      path.resolve(__dirname, '..', 'i18n', `${l}.po`),
    )));
  const goodLangs = [ 'en' ];
  const badLangs = [];
  for (let i = 0; i < langs.length; i += 1) {
    const lang = langs[i];
    const stats = langStats[i];
    const percent = Math.floor(stats.msgstr / msgid * 100);
    if (percent >= percentage) {
      goodLangs.push(lang);
    } else {
      console.log(`Lang ${lang} completion:`, percent, '%');
      badLangs.push(lang);
    }
  }
  return {
    goodLangs,
    badLangs,
  };
}

/*
 * check if language files contain errors
 */
function validateLangs(langs) {
  console.log('Validating language files...');
  const langDir = path.resolve(__dirname, '..', 'i18n');
  const brokenLangs = [];
  for (const lang of langs) {
    const langFiles = [`${lang}.po`, `ssr-${lang}.po`];
    for (const langFile of langFiles) {
      if (process.stdout.clearLine) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
      }
      process.stdout.write(`i18n/${langFile} `);
      const filePath = path.join(langDir, langFile);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      try {
        validate(filePath);
      } catch {
        brokenLangs.push(langFile);
      }
    }
  }
  if (process.stdout.clearLine) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  }
  console.log(''); // Add newline
  return brokenLangs;
}

/*
 * clean up before build and copy files
 */
function cleanUpBeforeBuild(doBuildServer, doBuildClient) {
  const parentDir = path.resolve(__dirname, '..');
  const distDir = path.resolve(__dirname, '..', 'dist');
  // remove files we need to regenerate
  const webpackCachePath = path.join(parentDir, 'node_modules', '.cache', 'webpack');
  fs.rmSync(webpackCachePath, { recursive: true, force: true });
  if (doBuildClient && doBuildServer) {
    const assetPath = path.join(distDir, 'public', 'assets');
    fs.rmSync(assetPath, { recursive: true, force: true });
    const legalPath = path.join(distDir, 'public', 'legal');
    fs.rmSync(legalPath, { recursive: true, force: true });
  }
  // copy necessary files
  if (doBuildServer) {
    // copy files to dist directory
    [
      'LICENSE',
      'COPYING',
      'CODE_OF_CONDUCT.md',
      'AUTHORS',
      path.join('src', 'canvases.json'),
    ].forEach((f) => {
      fs.copyFileSync(
        path.join(parentDir, f),
        path.join(distDir, path.basename(f)),
      );
    });
    // copy folder to dist directory
    [
      'public',
      path.join('deployment', 'captchaFonts'),
    ].forEach((d) => {
      fs.cpSync(
        path.join(parentDir, d),
        path.join(distDir, path.basename(d)),
        { recursive: true },
      );
    });
    // copy stuff we have to rename
    fs.cpSync(
      path.join(parentDir, 'src', 'data', 'redis', 'lua'),
      path.join(distDir, 'workers', 'lua'),
      { recursive: true },
    );
    fs.copyFileSync(
      path.join(parentDir, 'deployment', 'example-ecosystem.yml'),
      path.join(distDir, 'ecosystem.yml'),
    );
    fs.copyFileSync(
      path.join(parentDir, 'deployment', 'example-ecosystem-backup.yml'),
      path.join(distDir, 'ecosystem-backup.yml'),
    );
    /*
     * overrides exist to deploy our own files
     * that are not part of the repository, like logo.svg
     */
    const overrideDir = path.join(parentDir, 'overrides');
    if (fs.existsSync(overrideDir)) {
      fs.cpSync(
        overrideDir,
        path.join(distDir),
        { dereference: true, recursive: true },
      );
    }
  }
}

/*
 * clean up after build
 */
function cleanUpAfterBuild(builtServer, builtClient) {
  if (builtServer && builtClient) {
    const assetPath = path.resolve(__dirname, '..', 'dist', 'public', 'assets');
    fs.readdirSync(assetPath)
      .filter((e) => e.endsWith('.LICENSE.txt'))
      .forEach((l) => fs.rmSync(path.join(assetPath, l)));
  }
}


function compile(webpackConfig) {
  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (err, stats) => {
      if (err) {
        return reject(err);
      }
      const statsConfig = (webpackConfig.length) ? webpackConfig[0].stats : webpackConfig.stats;
      console.log(stats.toString(statsConfig))
      return resolve();
    });
  });
}

function buildServer() {

  console.log('-----------------------------');
  console.log(`Build server...`);
  console.log('-----------------------------');
  const ts = Date.now();

  return new Promise((resolve, reject) => {
    const argsc = (langs === 'all')
      ? ['webpack', '--env', 'extract', '--config', './webpack.config.server.js']
      : ['webpack', '--config', './webpack.config.server.js']
    const serverCompile = spawn('npx', argsc, {
      shell: process.platform == 'win32',
    });
    serverCompile.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    serverCompile.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    serverCompile.on('close', (code) => {
      if (code) {
        reject(new Error('Server compilation failed!'));
      } else {
        console.log('---------------------------------------');
        console.log(`Server Compilation finished in ${Math.floor((Date.now() - ts) / 1000)}s`);
        console.log('---------------------------------------');
        resolve();
      }
    });
  });
}

async function build() {
  const st = Date.now();

  // cleanup old files
  cleanUpBeforeBuild(doBuildServer, doBuildClient);

  // decide which languages to build
  let avlangs = getAllAvailableLocals();
  if (langs !== 'all') {
    avlangs = langs.split(',').map((l) => l.trim())
      .filter((l) => avlangs.includes(l));
  } else {
    let badLangs;
    ({ goodLangs: avlangs, badLangs } = await filterLackingLocals(avlangs, 50));
    if (badLangs.length) {
      console.log(
        'Skipping',
        badLangs.length,
        'locals because of low completion:',
        badLangs,
      );
    }
  }
  if (!avlangs.length) {
    console.error(`ERROR: language ${langs} not available`);
    process.exit(1);
    return;
  }
  console.log('Building', avlangs.length, 'locales:', avlangs);

  const brokenLangs = validateLangs(avlangs);
  if (brokenLangs.length) {
    console.error('ERROR: Translation files', brokenLangs, 'contain errors.');
    process.exit(2);
    return;
  }
  if (onlyValidate) {
    console.log('Validation complete, everything is fine.');
    process.exit(0);
    return;
  }

  if (doBuildServer) {
    await buildServer();
  }

  if (doBuildClient) {
    // Separate English from other languages
    const englishLang = 'en';
    const otherLangs = avlangs.filter(lang => lang !== englishLang);
    
    // Build English first
    if (avlangs.includes(englishLang)) {
      console.log('-----------------------------');
      console.log(`Building English (${englishLang}) first...`);
      console.log('-----------------------------');
      await compile(clientConfig({
        development: false,
        analyze: false,
        extract: false,
        locale: englishLang,
        readonly: false,
        clean: true,
      }));
      
      // Minify CSS after English build
      console.log('-----------------------------');
      console.log(`Minify CSS assets after English build...`);
      console.log('-----------------------------');
      await minifyCss();
    }
    
    // Build other languages with limited concurrency to prevent memory issues
    if (otherLangs.length > 0) {
      console.log('-----------------------------');
      console.log(`Building ${otherLangs.length} other languages with limited concurrency...`);
      console.log('-----------------------------');
      
      // Use lower concurrency to prevent memory issues and process killing
      const concurrency = Math.min(3, otherLangs.length); // Reduced from 8 to 3
      let active = 0;
      let idx = 0;
      
      async function runNext() {
        if (idx >= otherLangs.length) return;
        const myIdx = idx++;
        const lang = otherLangs[myIdx];
        active++;
        
        console.log(`Building client for locale ${lang}... (${active}/${concurrency} active)`);
        
        try {
          await compile(clientConfig({
            development: false,
            analyze: false,
            extract: false,
            locale: lang,
            readonly: false,
            clean: false, // Don't clean after English build
          }));
        } catch (error) {
          console.error(`Error building ${lang}:`, error.message);
          throw error;
        }
        
        active--;
        console.log(`Finished building ${lang} (${active}/${concurrency} active)`);
        
        // Add a small delay between builds to reduce memory pressure
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await runNext();
      }
      
      const runners = [];
      for (let i = 0; i < concurrency && i < otherLangs.length; i++) {
        runners.push(runNext());
      }
      await Promise.all(runners);
    }
    
    if (doBuildServer) {
      /*
       * server copies files into ./dist/public
       */
      console.log('-----------------------------');
    }
  }

  cleanUpAfterBuild(doBuildServer, doBuildClient);
  console.log(`Finished building in ${(Date.now() - st) / 1000}s`);
}

// Private log
discordWebhook.logServerCommands({
  command: 'build',
  timestamp: new Date()
});

// Public log
discordWebhook.logServerCommands({
  command: 'public-build',
  timestamp: new Date()
});

build();
