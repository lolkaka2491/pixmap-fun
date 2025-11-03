/** Converts Markdown into elements.
 * This should not be used for user data, as JS can be executed through this!
 */

import React from 'react';

/** Basic engine for formatting Markdown strings into React Elements.
 * Currently, it only supports:
 * * Unordered lists (`- Foobar`)
 * * Links (`[foo]('https://bar.com/')` OR `[foo]('./bar.html'){attribte='bleh'}`)
 * * New lines (`foo\nbar`)
 * 
 * Note: Links will default to `target='_blank' rel='noopener noreferrer'` unless specified otherwise
 * @param {string} text - The text string to be formatted
 * @param {string} [enableFirstParagraph=false] - (Optional) When true, returns all elements as children of a `<p>` element (e.g. `<><p><a>child anchor</a></p></>`). False by default
 * @returns React Fragment with children elements
 * @example
 * // Hyperlink example:
 * <h2><MarkdownFormatter text={'Check out [Google](https://google.com/)!'}/></h2>
 * // Returns:
 * <h2>Check out <a href="https://google.com/" target='_blank' rel='noopener noreferrer'>Google</a>!</h2>
 * @example
 * // Hyperlink example:
 * <p><MarkdownFormatter text={"[Foo]('./bar.html'){target='_self' rel=''}"}/></p>
 * // Returns:
 * <p>
 *  <a href='./bar.html' target='_self'>Foo</a>
 * </p>
 * @example
 * // Unordered list example:
 * <div><MarkdownFormatter text={'Shopping List:\n- Apple\n- Banana'} enableFirstParagraph={true}/></div>
 * // Returns:
 * <div>
 *  <p>Shopping List</p>
 *  <ul>
 *   <li>Apple</li>
 *   <li>Banana</li>
 *  </ul>
 * </div>
 * @example
 * // Line break example:
 * <h1><MarkdownFormatter text={'Two\nLines'}/></h1>
 * // Returns:
 * <h1>Two<br/>Lines</h1>
 */
export default function MarkdownFormatter({ text, enableFirstParagraph=false }) {

  if (!text) return null; // The user did not pass in any text

  const textLines = text.split('\n'); // Splits the text into indexes in an array
  const elements = []; // Will hold our final elements
  let listItemStorage = []; // Will store any <li> we need to format
  let paragraphLineStorage = []; // Will store any <p> we need to format
  let isFirstParagraph = true; // Tracks the highest <p> element

  // NOTE: This is called recursively
  // This handles special formatting inside of a line
  const processLine = (line, index) => {

    // Link formatting: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)(\{([^}]+)\})?/g; // Matches []() or [](){}
    const parts = []; // Will contain all links (assumes there are multiple in this line)
    let lastIndex = 0; // Last link match index
    let match; // All link matches

    while ((match = linkRegex.exec(line)) !== null) {

      // Undoes the array (Entire link, display name, link, attribute block, attributes)
      const [fullMatch, linkText, linkHref, , attributeBlock] = match;
      
      const start = match.index;

      if (start > lastIndex) {
        parts.push(line.slice(lastIndex, start));
      }

      const attributes = {}; // Holds the attributes found

      // If there is attributes...
      if (attributeBlock) {

        // ...matches all key-value pairs in the attribute block
        attributeBlock.replace(/(\w+)='([^']+)'/g, (_, key, value) => {
          attributes[key] = value; // Creates a key-value pair for each attribute
        });
      }

      parts.push(
        <a 
          key={`${index}-link-${start}`}
          href={linkHref || './404.html'}
          target={attributes.target || '_blank'}
          rel={attributes.rel || 'noopener noreferrer'}
          className={attributes.class || attributes.className}
        >
          {linkText}
        </a>
      );

      lastIndex = start + fullMatch.length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [line];
  };

  // Creates and deploys a new paragraph element
  const pushParagraph = (index) => {

    // If there are paragraph lines stored...
    if (paragraphLineStorage.length > 0) {

      // Insert <br /> between lines in the paragraph
      const content = paragraphLineStorage.flatMap((line, i) => 
        i === 0 ? processLine(line, index + '-' + i) : [<br key={`br-${index}-${i}`} />, ...processLine(line, index + '-' + i)]
      );

      // IF the user does NOT want the first <p> AND this is the first <p>...
      if (!enableFirstParagraph && isFirstParagraph) {

        // ...push a React Fragment instead of a paragraph element
        elements.push(
        <React.Fragment key={`frag-${index}`}>{content}</React.Fragment>
      );
      } else {
        // ELSE the user wants the first <p>

        // ...push the new paragraph element
        elements.push(
          <p key={`p-${index}`}>{content}</p>
        );
      }

      paragraphLineStorage = []; // We deployed the paragraph, so we need to clear out storage
      isFirstParagraph = false; // We finished the first paragraph, so now we disable running this again
    }
  };

  // Creates and deploys a new unordered list element
  const pushUnorderedList = (index) => {

    // IF there are list items elements stored...
    if (listItemStorage.length > 0) {

    // ...push the list items as an unordered list element
    elements.push(<ul key={`ul-${index}`}>{listItemStorage}</ul>);
    listItemStorage = []; // We published the list items, so clear storage
  }
  }

  // For each line in the string...
  textLines.forEach((line, index) => {

    line = line.trim(); // Store the trimmed version of the string

    // IF the line starts with a bullet...
    if (line.startsWith('- ')) {

      pushParagraph(index); // ...we need to close whatever paragraph we were just in

      // Push a list item to the list item array
      // also, recursively format whatever is in the list item
      listItemStorage.push(
        <li key={`li-${index}`}>{processLine(line.slice(2), index)}</li>
      );
    } else if (line.length === 0) {
      // ...the line contains no content...

      pushParagraph(index); // ...this is the end of any paragraph we are in. Deploy if in a paragraph
      pushUnorderedList(index); // This is the end of any list we are in. Deploy if in a list
    } else {
      //...this is a normal paragraph line with text

      pushUnorderedList(index); // This is the end of any list we are in. Deploy if in a list

      paragraphLineStorage.push(line); // Add the normal paragraph line to storage
    }
  });

  pushParagraph('final'); // No matter what, any paragraph we are in is complete at this point
  pushUnorderedList('final'); // No matter what, any list we are in is complete at this point

  // Return our collection of elements
  return <>{elements}</>;
}