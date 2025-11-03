# Scripts

Scripts needed for building pixelplanet

## build.js

Script for building pixelplanet. Allows parallelization of language builds and checks integrity of translation files.

## licenses.json

Download of the [SPDX License List](https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json).

## TtagPoLoader.js

Webpack Loader for `.po` files. Similar to [ttag](https://github.com/ttag-org/ttag-po-loader).

## TtagNonCachableLoader.js

Webpack loader that sets files that include ttag translations as non-cachable.

## LicenseListWebpackPlugin.js

Creates a list of used licenses of packages in a webpack bundle.

## minifyCss.js

Minifies CSS files
