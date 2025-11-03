/*
 * Creates json file of used licenses in a webpack bundle
 * 
 * Make sure that a licenses.json file is present in the same directory as
 * this plugin, you can get it from:
 * https://github.com/spdx/license-list-data/blob/main/json/licenses.json
 * 
 */

const path = require('path');
const fs = require('fs');
const spdxCorrect = require('spdx-correct');
const spdxParse = require('spdx-expression-parse');

const PLUGIN_NAME = 'LicenseListWebpackPlugin';

const licensesURLMapping = {
  'Apache-2.0': 'http://www.apache.org/licenses/LICENSE-2.0',
  'Artistic-2.0': 'http://www.perlfoundation.org/artistic_license_2_0',
  'BSL-1.0': 'http://www.boost.org/LICENSE_1_0.txt',
  'BSD-3-Clause': 'http://opensource.org/licenses/BSD-3-Clause',
  'CPAL-1.0': 'http://opensource.org/licenses/cpal_1.0',
  'CC0-1.0': 'http://creativecommons.org/publicdomain/zero/1.0/legalcode',
  'EPL-1.0': 'http://www.eclipse.org/legal/epl-v10.html',
  'MIT': 'http://www.jclark.com/xml/copying.txt',
  'BSD-2-Clause-FreeBSD': 'http://www.freebsd.org/copyright/freebsd-license.html',
  'GPL-2.0-only': 'http://www.gnu.org/licenses/gpl-2.0.html',
  'GPL-2.0-or-later': 'http://www.gnu.org/licenses/gpl-2.0.html',
  'GPL-2.0+': 'http://www.gnu.org/licenses/gpl-2.0.html',
  'GPL-2.0': 'http://www.gnu.org/licenses/gpl-2.0.html',
  'GPL-3.0-only': 'http://www.gnu.org/licenses/gpl-3.0.html',
  'GPL-3.0-or-later': 'http://www.gnu.org/licenses/gpl-3.0.html',
  'GPL-3.0+': 'http://www.gnu.org/licenses/gpl-3.0.html',
  'GPL-3.0': 'http://www.gnu.org/licenses/gpl-3.0.html',
  'LGPL-2.1-only': 'http://www.gnu.org/licenses/lgpl-2.1.html',
  'LGPL-2.1-or-later': 'http://www.gnu.org/licenses/lgpl-2.1.html',
  'LGPL-2.1+': 'http://www.gnu.org/licenses/lgpl-2.1.html',
  'LGPL-2.1': 'http://www.gnu.org/licenses/lgpl-2.1.html',
  'LGPL-3.0-only': 'http://www.gnu.org/licenses/lgpl-3.0.html',
  'LGPL-3.0-or-later': 'http://www.gnu.org/licenses/lgpl-3.0.html',
  'LGPL-3.0+': 'http://www.gnu.org/licenses/lgpl-3.0.html',
  'LGPL-3.0': 'http://www.gnu.org/licenses/lgpl-3.0.html',
  'AGPL-3.0-only': 'http://www.gnu.org/licenses/agpl-3.0.html',
  'AGPL-3.0-or-later': 'http://www.gnu.org/licenses/agpl-3.0.html',
  'AGPL-3.0+': 'http://www.gnu.org/licenses/agpl-3.0.html',
  'AGPL-3.0': 'http://www.gnu.org/licenses/agpl-3.0.html',
  'ISC': 'https://www.isc.org/downloads/software-support-policy/isc-license/',
  'MPL-2.0': 'http://www.mozilla.org/MPL/2.0',
  'UPL-1.0': 'https://oss.oracle.com/licenses/upl/',
  'WTFPL': 'http://www.wtfpl.net/txt/copying/',
  'Unlicense': 'http://unlicense.org/UNLICENSE',
  'X11 License': 'http://www.xfree86.org/3.3.6/COPYRIGHT2.html#3',
  'XFree86-1.1': 'http://www.xfree86.org/current/LICENSE4.html',
};

/*
 * load json file
 * @param filepath
 * @return parsed json object or null if failed
 */
function readJSONFile(filepath) {
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath).toString('utf8'));
  }
  return null;
}

/*
 * resolve %{variable} in string templates
 * @param template
 * @param values values to fill in { variable: value,... }
 */
function resolveStringTemplate(template, values) {
  let text = '';
  let pStart = 0;
  let isInside = 0;
  for (let i = 0; i < template.length; i += 1) {
    const char = template[i];
    if (isInside === 2) {
      if (char === '}') {
        isInside = 0;
        text += values[template.slice(pStart, i)];
        pStart = i + 1;
      }
    } else if (char === '%') {
      isInside = 1;
    } else if (isInside === 1) {
      if (char === '{') {
        isInside = 2;
        text += template.slice(pStart, i - 1);
        pStart = i + 1;
      } else {
        isInside = 0;
      }
    }
  }
  text += template.slice(pStart);
  return text;
}

/*
 * deep merge two objects
 */
function deepMerge(obj1, obj2) {
  for (let key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (obj2[key] instanceof Object && obj1[key] instanceof Object) {
        obj1[key] = deepMerge(obj1[key], obj2[key]);
      } else {
        obj1[key] = obj2[key];
      }
    }
  }
  return obj1;
}

class LicenseListWebpackPlugin {
  chunkIdToName = {};
  chunkNameToJsAsset = {};
  packageJsonCache = {};
  packageTextFiles = {};
  copiedFiles = new Map();
  spdxLicenses = {};
  logger = console;
  exclude = [];
  override = {};
  srcReplace;
  outputDir;
  outputPath;
  sourcesOutputDir;
  sourcesOutputPath;
  sourcesPublicPath;
  outputFile;
  sourceTemplates;
  output = {};
  includeLicenseFiles;
  includeSourceFiles;
  publicPathOverride;
  processOutput;
  sourcesDir = 'sources';
  static srcExtsRegexp = new RegExp('^.*.([js,ts,jsx,coffee,lua])$');
  static filesToCopy = ['license', 'copying', 'authors', 'code_of_conduct'];
  static filePathCleanUpRegEx = /^([.\/]*node_modules|\.)\//;
  static modulePathCleanUpRegEx = /^([.\/]*node_modules\/[^\/]*|\.)\//;

  /*
   * @param options {
   *   outputDir,
   *   filename,
   *   append,
   *   exclude: [],
   *   srcReplace: {},
   *   override: {},
   *   includeLicenseFiles: boolean,
   *   includeSourceFiles: boolean,
   *   souces: {},
   *   processOutput: function,
   * }
   */
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'dist';
    this.sourcesOutputDir = path.join(options.outputDir, this.sourcesDir);
    this.outputFilename = options.filename || 'licenses.json';
    this.sourceTemplates = options.sources || {};
    this.publicPathOverride = options.publicPath;
    this.includeLicenseFiles = options.includeLicenseFiles;
    this.includeSourceFiles = options.includeSourceFiles;
    this.srcReplace = options.srcReplace || {};
    this.processOutput = options.processOutput;
    // populate module prefix patterns to exclude
    if (Array.isArray(options.exclude)) {
      this.options['exclude'].forEach(toExclude => {
        if (!toExclude.startsWith('.')) {
          this.exclude.push('./' + path.join('node_modules', toExclude));
        } else {
          this.exclude.push(toExclude);
        }
      });
    }
    // populate license Override
    if (options.override) {
      for (const [srcFilePrefixKey, moduleOverride] of Object.entries(
        options.override,
      )) {
        const srcFilePrefix = (srcFilePrefixKey.startsWith('.'))
          ? srcFilePrefixKey
          : './' + path.join('node_modules', srcFilePrefixKey);
        if (moduleOverride.license) {
          const parsedSpdxLicenses = this.parseSpdxLicenseExpression(
            moduleOverride.license, `file ${srcFilePrefixKey}`,
          );
          moduleOverride.licenses = this.spdxToWebLabelsLicenses(
            parsedSpdxLicenses,
          );
        }
        this.override[srcFilePrefix] = moduleOverride;
      }
    }
    // spdx licenses informations
    const spdxLicenseFile = readJSONFile(
      path.resolve(__dirname, 'licenses.json'),
    );
    if (spdxLicenseFile?.licenses) {
      spdxLicenseFile.licenses.forEach((l) => {
        if (licensesURLMapping[l.licenseId]) {
          l.reference = licensesURLMapping[l.licenseId];
        }
        this.spdxLicenses[l.licenseId] = l;
      });
    }
  }

  static findPackageJsonPath(srcFilePath) {
    const pathSplit = srcFilePath.split('/');
    let packageJsonPath;
    for (let i = 3; i < pathSplit.length; ++i) {
      packageJsonPath = path.join(...pathSplit.slice(0, i), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        break;
      }
    }
    return packageJsonPath;
  }

  /*
   * parse output object to HTML
   */
  static generateHTML(output) {
    let columns = [];
    for (const [key, value] of Object.entries(output)) {
      
    }
  }

  findTextFile(packageJsonDir, name) {
    let packageTextFiles = this.packageTextFiles[name];
    if (!packageTextFiles) {
      packageTextFiles = {};
      this.packageTextFiles[name] = packageTextFiles;
    }
    if (!packageTextFiles.hasOwnProperty(packageJsonDir)) {
      let foundTextFile;
      fs.readdirSync(packageJsonDir).forEach(file => {
        if (foundTextFile) {
          return;
        }
        if (file.toLowerCase().startsWith(name)) {
          foundTextFile = path.join(packageJsonDir, file);
        }
      });
      packageTextFiles[packageJsonDir] = foundTextFile;
    }
    return packageTextFiles[packageJsonDir];
  }

  copyTextFile(textFilePath) {
    if (!textFilePath) return '';
    const ext = (textFilePath.indexOf('.') === -1) ? '.txt' : '';
    return this.copyFileToOutputPath(textFilePath, ext);
  }
  
  parsePackageJson(packageJsonPath) {
    if (!this.packageJsonCache.hasOwnProperty(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString('utf8'));

      packageJson.licenses = this.extractLicenseInformation(packageJson);
      const licenseDir = path.join(...packageJsonPath.split('/').slice(0, -1));
      if (this.includeLicenseFiles) {
        packageJson.files = LicenseListWebpackPlugin.filesToCopy.map(
          (filename) => this.findTextFile(licenseDir, filename),
        ).filter((f) => f);
      } else {
        delete packageJson.files;
      }
      const repositoryUrl = packageJson.repository?.url;
      if (repositoryUrl) packageJson.repository = repositoryUrl;
      this.packageJsonCache[packageJsonPath] = packageJson;
    }
    return this.packageJsonCache[packageJsonPath];
  }
  
  parseSpdxLicenseExpression(spdxLicenseExpression, context) {
    let parsedLicense;
    try {
      parsedLicense = spdxParse(spdxCorrect(spdxLicenseExpression));
      if (spdxLicenseExpression.indexOf('AND') !== -1) {
        this.logger.warn(`The SPDX license expression '${spdxLicenseExpression}' associated to ${context} ` +
        'contains an AND operator, this is currently not properly handled and erroneous ' +
        'licenses information may be provided to LibreJS');
      }
    } catch (e) {
      this.logger.warn(`Unable to parse the SPDX license expression '${spdxLicenseExpression}' associated to ${context}.`);
      this.logger.warn('Some generated JavaScript assets may be blocked by LibreJS due to missing license information.');
      parsedLicense = {'license': spdxLicenseExpression};
    }
    return parsedLicense;
  }
  
  spdxToWebLabelsLicense(spdxLicenceId) {
    const licenseInfo = this.spdxLicenses[spdxLicenceId];
    if (licenseInfo) {
      if (!licenseInfo.isFsfLibre) {
        this.logger.info(`License '${spdxLicenceId}' is not a Free license according to the FSF.`);
      }
      return {
        name: spdxLicenceId,
        url: licenseInfo.reference,
      };
    }
    this.logger.warn(`Unable to associate the SPDX license identifier '${spdxLicenceId}' to a LibreJS supported license.`);
    this.logger.warn('Some generated JavaScript assets may be blocked by LibreJS due to missing license information.');
    return {
      'name': spdxLicenceId,
      'url': '',
    };
  }
  
  spdxToWebLabelsLicenses(spdxLicenses) {
    // This method simply extracts all referenced licenses in the SPDX expression
    // regardless of their combinations.
    // TODO: Handle licenses combination properly once LibreJS has a spec for it.
    let ret = [];
    if (spdxLicenses.hasOwnProperty('license')) {
      ret.push(this.spdxToWebLabelsLicense(spdxLicenses['license']));
    } else if (spdxLicenses.hasOwnProperty('left')) {
      if (spdxLicenses['left'].hasOwnProperty('license')) {
        const licenseData = this.spdxToWebLabelsLicense(spdxLicenses['left']['license']);
        ret.push(licenseData);
      } else {
        ret = ret.concat(this.spdxToWebLabelsLicenses(spdxLicenses['left']));
      }
      ret = ret.concat(this.spdxToWebLabelsLicenses(spdxLicenses['right']));
    }
    return ret;
  }

  extractLicenseInformation(packageJson) {
    let spdxLicenseExpression;
    if (packageJson.hasOwnProperty('license')) {
      spdxLicenseExpression = packageJson['license'];
    } else if (packageJson.hasOwnProperty('licenses')) {
      // for node packages using deprecated licenses property
      const licenses = packageJson['licenses'];
      if (Array.isArray(licenses)) {
        const l = [];
        licenses.forEach(license => {
          l.push(license['type']);
        });
        spdxLicenseExpression = l.join(' OR ');
      } else {
        spdxLicenseExpression = licenses['type'];
      }
    }
    const parsedSpdxLicenses = this.parseSpdxLicenseExpression(spdxLicenseExpression,
                                                               `module ${packageJson['name']}`);
    return this.spdxToWebLabelsLicenses(parsedSpdxLicenses);
  }

  /*
   * copy source or license file to output directory
   * @param srcFilePath full path to file
   * @param ext file extionsion to append (dot included like '.txt')
   * @return public path if successful, null if not
   */
  copyFileToOutputPath(srcFilePath, ext = '') {
    let publicFilePath = this.copiedFiles.get(srcFilePath);
    if (publicFilePath) {
      return publicFilePath;
    }
    if (srcFilePath.indexOf('://') !== -1 || !fs.existsSync(srcFilePath)) {
      return null;
    }

    // determine output bath based on folder within package
    let destPath = srcFilePath.replace(
      LicenseListWebpackPlugin.filePathCleanUpRegEx,
      '',
    ) + ext;

    publicFilePath = path.join(this.sourcesPublicPath, destPath);
    const destDir = path.join(this.sourcesOutputPath, ...destPath.split('/').slice(0, -1));
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(
      srcFilePath, path.join(this.sourcesOutputPath, destPath),
    );
    this.copiedFiles.set(srcFilePath, publicFilePath);
    return publicFilePath;
  }
  
  getPackageInformation(srcFilePath) {
    let name;
    let version;
    let licenses;
    let repository;
    let files;
    let homepage;
    let sources;
    
    // find and parse the corresponding package.json file
    let packageJsonPath;
    const nodeModule = srcFilePath.startsWith('./node_modules/');
    if (nodeModule) {
      packageJsonPath = LicenseListWebpackPlugin.findPackageJsonPath(srcFilePath);
    } else {
      packageJsonPath = './package.json';
    }
    ({
      name,
      version,
      homepage,
      licenses,
      repository,
      files,
    } = this.parsePackageJson(packageJsonPath));
    
    // custom overrides
    for (const srcFilePrefix in this.override) {
      if (srcFilePath.startsWith(srcFilePrefix)) {
        const moduleOverride = this.override[srcFilePrefix];
        if (moduleOverride.replace) {
          name = undefined;
          version = undefined;
          homepage = undefined,
          licenses = undefined;
          repository = undefined;
          files = undefined;
        }
        const {
          name: overridename,
          version: overrideVersion,
          homepage: overrideHomepage,
          repository: overrideRepository,
          files: overrideFiles,
          licenses: overrideLicenses,
        } = moduleOverride;
        if (overridename) name = overridename;
        if (overrideVersion) version = overrideVersion;
        if (overrideHomepage) version = overrideHomepage;
        if (overrideRepository) repository = overrideRepository;
        if (overrideLicenses) {
          if (!Array.isArray(licenses)) licenses = [];
          licenses = licenses.concat(overrideLicenses);
        }
        if (overrideFiles) {
          if (!Array.isArray(licenses)) files = [];
          files = files.concat(overrideFiles);
        }
      }
    }

    if (this.includeSourceFiles) {
      let replaceTemplate = this.srcReplace[name];
      if (replaceTemplate) {
        if (!Array.isArray(replaceTemplate)) {
          replaceTemplate = [replaceTemplate];
        }
        sources = replaceTemplate.map(
          (t) => resolveStringTemplate(t, { name, version }),
        );
      }
    }

    return {
      name,
      version,
      homepage,
      licenses,
      repository,
      files,
      sources,
    };
  }
  
  addModuleToOutput(srcFilePath, chunkJsAsset, packageInformation) {
    const {
      name,
      version,
      homepage,
      licenses,
      repository,
      sources,
      files,
    } = packageInformation;
    // init the chunk to source files mapping if needed
    if (!this.output.hasOwnProperty(chunkJsAsset)) {
      this.output[chunkJsAsset] = [];
    }
    
    const assetOutput = this.output[chunkJsAsset];
    let packageOutput = assetOutput.find(
      (m) => m.name === name,
    );
    
    if (!packageOutput) {
      let parsedFiles = [];
      if (Array.isArray(files)) {
        for (let i = 0; i < files.length; i += 1) {
          const filePath = files[i];
          if (filePath.id) {
            parsedFiles.push(filePath);
          } else if (typeof filePath === 'string') {
            parsedFiles.push({
              id: path.parse(filePath).name.toUpperCase(),
              url: this.copyTextFile(filePath),
            });
          }
        }
      }
      
      packageOutput = {
        name,
        url: homepage,
        version,
        licenses,
      };
      if (sources) {
        packageOutput.sources = sources;
      } else if (this.includeSourceFiles) {
        packageOutput.sources = [];
      }
      if (!this.includeSourceFiles || this.srcReplace[name]) {
        packageOutput.modules = [];
      }
      if (parsedFiles.length) packageOutput.files = parsedFiles;
      if (repository) packageOutput.repository = repository;
      assetOutput.push(packageOutput);
    }

    const id = srcFilePath.replace(
      LicenseListWebpackPlugin.modulePathCleanUpRegEx,
      '',
    );
    const module = { name: id };
    let moduleAddArray;
    if (!this.includeSourceFiles || this.srcReplace[name]) {
      moduleAddArray = packageOutput.modules;
    } else {
      moduleAddArray = packageOutput.sources;
      module.url = this.copyFileToOutputPath(srcFilePath);
    }

    if (!moduleAddArray.some((m) => m.id === id)) {
      moduleAddArray.push(module);
    }
  }
  
  apply(compiler) {
    this.logger = compiler.getInfrastructureLogger(PLUGIN_NAME);

    compiler.hooks.done.tapAsync(PLUGIN_NAME, (statsObj, callback)  => {
      // https://webpack.js.org/api/stats/
      const stats = statsObj.toJson();
      this.outputPath = path.join(stats.outputPath, this.outputDir);
      const publicPath = this.publicPathOverride || stats.publicPath;
      this.sourcesOutputPath = path.join(stats.outputPath, this.sourcesOutputDir);
      this.sourcesPublicPath = path.join(publicPath, this.sourcesOutputDir);

      if (!fs.existsSync(this.outputPath)) {
        fs.mkdirSync(this.outputPath, { recursive: true });
      }
  
      stats.assets.forEach(asset => {
        for (let i = 0; i < asset.chunks.length; ++i) {
          this.chunkIdToName[asset.chunks[i]] = asset.chunkNames[i];
        }
      });
      
      // map each generated webpack chunk to its js asset
      Object.keys(stats.assetsByChunkName).forEach((chunkName, i) => {
        if (Array.isArray(stats.assetsByChunkName[chunkName])) {
          for (const asset of stats.assetsByChunkName[chunkName]) {
            if (asset.endsWith('.js')) {
              this.chunkNameToJsAsset[chunkName] = asset;
              this.chunkNameToJsAsset[i] = asset;
              break;
            }
          }
        } else if (stats.assetsByChunkName[chunkName].endsWith('.js')) {
          this.chunkNameToJsAsset[chunkName] = stats.assetsByChunkName[chunkName];
          this.chunkNameToJsAsset[i] = stats.assetsByChunkName[chunkName];
        }
      });

      // iterate on all bundled webpack modules
      stats.modules.forEach((mod) => {
        let srcFilePath = mod.name;
        const size = mod.size;

        // do not process non js related modules
        if (!LicenseListWebpackPlugin.srcExtsRegexp.test(srcFilePath)) {
          return;
        }

        // do not process modules unrelated to a source file
        if (!srcFilePath.startsWith('./')) {
          return;
        }

        // do not process modules in the exclusion list
        for (const toExclude of this.exclude) {
          if (srcFilePath.startsWith(toExclude)) {
            return;
          }
        }

        // remove webpack loader call if any
        const loaderEndPos = srcFilePath.indexOf('!');
        if (loaderEndPos !== -1) {
          srcFilePath = srcFilePath.slice(loaderEndPos + 1);
        }

        // check if the source file needs to be replaces
        if (this.srcReplace.hasOwnProperty(srcFilePath)) {
          srcFilePath = this.srcReplace[srcFilePath];
        }

        const packageInformation = this.getPackageInformation(srcFilePath);
  
        // iterate on all chunks containing the module
        mod.chunks.forEach(chunk => {
          const chunkName = this.chunkIdToName[chunk];
          const chunkJsAsset = publicPath + this.chunkNameToJsAsset[chunkName];
          this.addModuleToOutput(srcFilePath, chunkJsAsset, packageInformation);
        });
      });

      for (const assetOutput of Object.values(this.output)) {
        for (const packageOutput of Object.values(assetOutput)) {
          if (packageOutput.modules) {
            packageOutput.modules.sort((a, b) => a.name.localeCompare(b.name));
          }
          if (packageOutput.sources) {
            packageOutput.sources.sort((a, b) => a.name.localeCompare(b.name));
          }
        }
      }

      // generate the output file
      if (this.processOutput) {
        this.output = this.processOutput(this.output);
      }
      if (typeof this.output !== 'string') {
        this.output = JSON.stringify(this.output);
      }
      const weblabelsJsonFile = path.join(this.outputPath, this.outputFilename);
      fs.writeFileSync(weblabelsJsonFile, this.output);
      
      callback();
    });
  }
}

module.exports = LicenseListWebpackPlugin;
