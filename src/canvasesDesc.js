/*
 * Create canvases.json with localized translated
 * descriptions.
 * Killroy was here
 * 
 */

import assetWatcher from './core/fsWatcher';
import { getCanvases } from './core/canvases';
import ttag from './core/ttag';


/* eslint-disable max-len */

function getCanvasesWithTitles(t) {
  /*
   * add descriptions and titles of canvases here
   * Use the t tag and right `backquotes`
   */
  const canvasTitles = {
    0: t`Earth`,
    1: t`Moon`,
    2: t`3D Canvas`,
    7: t`1bit`,
    8: t`Top10`,
   10: t`Mini Map`,
    15: t`MiddleEarth`,
    17: t`MiniMap`,
    18: t`R/Place Clone`,
    19: t`Art Canvas`,
    20: t`Christmas Canvas`,
    21: t`Grind Canvas`,
    22: t`Real Earth`,
    23: t`Refugee Minimap`,
    24: t`Shield Canvas`
  };
  const canvasDesc = {
    0: t`Our main canvas, a huge map of the world. Place everywhere you like`,
    1: t`Moon canvas. Safe space for art. No flags or large text (unless part of art) or art larger than 1.5k x 1.5k pixels.`,
    2: t`Place Voxels on a 3D canvas with others`,
    7: t`Black and White canvas`,
   8: t`A canvas for the most active players from the the previous day. Daily ranking updates at 00:00 UTC.`,
   10: t`Map canvas but in a minimized version for those who want more fun!`,
    15: t`Join the battle between good and evil, men, elves, orcs, hobbits, dwarves, Error, Rohan, Angmar, Mordor! Come make your mark and build empires on Middle Earth! https://discord.com/invite/Mdp9Fyb8tm`,
    17: t`The MiniMap canvas but 4x smaller than the main map!`,
    18: t`R/Place like canvas but with MUCH lower cooldown`,
    19: t`Art Canvas to draw arts, No more than 1000x1000 arts allowed or any griefing`,
    20: t`Christmas Canvas! No Griefing allowed`,
    21: t`Grinding Canvas for Grinding only`,
    22: t`Real Earth Canvas, only real countries allowed`,
    23: t`Minimap for PixUniverse Players`,
    24: t`A canvas designed for teams. No shields or team builds larger than 2k x 2k pixels. Requires 100k pixels to access.`
  };
  /*
   * no edit below here needed when adding/removing canvas
   */

  const localizedCanvases = {};
  const canvasKeys = Object.keys(getCanvases());

  for (let i = 0; i < canvasKeys.length; i += 1) {
    const key = canvasKeys[i];
    localizedCanvases[key] = { ...getCanvases()[key] };
    localizedCanvases[key].desc = canvasDesc[key]
      || getCanvases()[key].desc
      || `Canvas ${key}`;
    localizedCanvases[key].title = canvasTitles[key]
      || getCanvases()[key].title
      || `Canvas ${key}`;
  }

  return localizedCanvases;
}

function translateCanvases() {
  const parsedCanvases = {};
  const langs = Object.keys(ttag);
  langs.forEach((lang) => {
    parsedCanvases[lang] = getCanvasesWithTitles(ttag[lang].t);
  });
  return parsedCanvases;
}

let lCanvases = translateCanvases();
// reload on asset change
assetWatcher.onChange(() => {
  lCanvases = translateCanvases();
});

/**
 * Reload localized canvases when canvas configuration is updated
 * Called from admin tools after canvas config changes
 */
export function reloadLocalizedCanvases() {
  lCanvases = translateCanvases();
  console.log('Localized canvases reloaded successfully');
}

export default function getLocalizedCanvases(lang = 'en') {
  return lCanvases[lang] || lCanvases.en;
}
