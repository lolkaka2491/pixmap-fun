/*
 * class for string iterations
 * that is used by MarkdownParser.js
 */

export default class MString {
  constructor(text, start) {
    this.txt = text;
    this.iter = start || 0;
  }

  done() {
    return (this.iter >= this.txt.length);
  }

  moveForward() {
    this.iter += 1;
    return (this.iter < this.txt.length);
  }

  setIter(iter) {
    this.iter = iter;
  }

  getChar() {
    return this.txt[this.iter];
  }

  slice(start, end) {
    return this.txt.slice(start, end || this.iter);
  }

  has(str) {
    return this.txt.startsWith(str, this.iter);
  }

  move(cnt) {
    this.iter += cnt;
    return (this.iter < this.txt.length);
  }

  skipSpaces(skipNewlines = false) {
    for (;this.iter < this.txt.length; this.iter += 1) {
      const chr = this.txt[this.iter];
      if (chr !== ' ' && chr !== '\t' && (!skipNewlines || chr !== '\n')) {
        break;
      }
    }
  }

  countRepeatingCharacters() {
    const chr = this.getChar();
    let newIter = this.iter + 1;
    for (;newIter < this.txt.length && this.txt[newIter] === chr;
      newIter += 1
    );
    return newIter - this.iter;
  }

  moveToNextLine() {
    const lineEnd = this.txt.indexOf('\n', this.iter);
    if (lineEnd === -1) {
      this.iter = this.txt.length;
    } else {
      this.iter = lineEnd + 1;
    }
  }

  getLine() {
    const startLine = this.iter;
    this.moveToNextLine();
    return this.txt.slice(startLine, this.iter);
  }

  getIndent(tabWidth) {
    let indent = 0;
    while (this.iter < this.txt.length) {
      const chr = this.getChar();
      if (chr === '\t') {
        indent += tabWidth;
      } else if (chr === ' ') {
        indent += 1;
      } else {
        break;
      }
      this.iter += 1;
    }
    return indent;
  }

  goToCharInLine(chr) {
    let { iter } = this;
    for (;
      iter < this.txt.length && this.txt[iter] !== '\n'
        && this.txt[iter] !== chr;
      iter += 1
    );
    if (this.txt[iter] === chr) {
      this.iter = iter;
      return iter;
    }
    return false;
  }

  static isWhiteSpace(chr) {
    return (chr === ' ' || chr === '\t' || chr === '\n');
  }

  /*
   * check if the current '[' is part of a [y](z) enclosure
   * returns [y, z] if it is enclosure, null otherwise
   * moves iter to last closing braked if it is enclosure
   */
  checkIfEnclosure(zIsLink) {
    let yStart = this.iter + 1;

    let yEnd = yStart;
    const escapePositions = [];
    while (this.txt[yEnd] !== ']') {
      const chr = this.txt[yEnd];
      if (chr === '\\') {
        // escape character
        escapePositions.push(yEnd);
        yEnd += 2;
        continue;
      }
      if (yEnd >= this.txt.length
        || chr === '\n'
      ) {
        return null;
      }
      yEnd += 1;
    }

    let zStart = yEnd + 1;
    if (this.txt[zStart] !== '(') {
      return null;
    }
    zStart += 1;

    let zEnd = zStart;
    let z = null;
    while (this.txt[zEnd] !== ')') {
      const chr = this.txt[zEnd];
      if (zEnd >= this.txt.length
        || chr === '\n'
        || chr === '['
        || chr === '('
      ) {
        return null;
      }
      if (zIsLink && chr === ':') {
        // set this.iter temporarily to be able to use thischeckIfLink
        const oldIter = this.iter;
        this.iter = zEnd;
        z = this.checkIfLink(true);
        zEnd = this.iter;
        this.iter = oldIter;
        if (z === null) {
          return null;
        }
        continue;
      }
      zEnd += 1;
    }
    if (zEnd < zStart + 1 || (!z && zIsLink)) {
      return null;
    }

    if (!zIsLink) {
      z = this.txt.slice(zStart, zEnd);
    }

    let y = '';
    // remove escape characters
    for (let iter = 0; iter < escapePositions.length; iter += 1) {
      const escapePosition = escapePositions[iter];
      y += this.txt.slice(yStart, escapePosition);
      yStart = escapePosition + 1;
    }
    if (yStart < yEnd) {
      y += this.txt.slice(yStart, yEnd);
    }

    this.iter = zEnd;
    return [y, z];
  }

  /*
   * Check if current text is a coordinate or link
   * Returns null if not a valid format
   */
  checkIfCoords() {
    // First check if it's a full URL to pixmap.fun
    if (this.txt.slice(this.iter).match(/^https?:\/\/pixmap\.fun\/#([a-z]+),[-\d,]+/i)) {
      const match = this.txt.slice(this.iter).match(/^(https?:\/\/pixmap\.fun\/#([a-z]+),[-\d,]+)/i)[0];
      this.iter += match.length;
      return match.substring(match.indexOf('#') + 1);
    }

    // Then check for direct coordinate format
    let cIter = this.iter;
    // Skip the # if present
    if (this.txt[cIter] === '#') {
      cIter++;
    }
    // Check for multi-letter canvas identifier
    let idStart = cIter;
    while (cIter < this.txt.length && /[a-z]/i.test(this.txt[cIter])) {
      cIter++;
    }
    if (cIter === idStart) {
      return null;
    }
    // Must have comma after identifier
    if (this.txt[cIter] !== ',') {
      return null;
    }
    cIter++;
    // Parse the numbers
    let commaCount = 0;
    let hasDigit = false;
    const start = this.iter;
    while (cIter < this.txt.length && !MString.isWhiteSpace(this.txt[cIter])) {
      const chr = this.txt[cIter];
      if (chr === ',') {
        if (!hasDigit) return null;
        commaCount++;
        hasDigit = false;
      } else if (chr === '-' && !hasDigit) {
        // Allow minus sign at start of number
      } else if (!isNaN(parseInt(chr, 10))) {
        hasDigit = true;
      } else {
        return null;
      }
      cIter++;
    }
    // Must have final number after last comma
    if (!hasDigit) return null;
    // Must have 2 or 3 commas (3 or 4 numbers total)
    if (commaCount < 2 || commaCount > 3) return null;
    const coords = this.txt.slice(start, cIter);
    this.iter = cIter;
    return coords;
  }

  /*
   * Check if current text is a link
   */
  checkIfLink() {
    // check for pixmap.fun links with a more permissive pattern
    const pixmapMatch = this.txt.slice(this.iter).match(/^(https?:\/\/pixmap\.fun\/#[^\s]+)/i);
    if (pixmapMatch) {
      const match = pixmapMatch[0];
      this.iter += match.length;
      return match;
    }

    // then check for other links
    const linkMatch = this.txt.slice(this.iter).match(/^(https?:\/\/[^\s]+)/i);
    if (linkMatch) {
      const match = linkMatch[0];
      this.iter += match.length;
      return match;
    }

    return null;
  }
}
