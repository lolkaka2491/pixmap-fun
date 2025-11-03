/*
 * Renders a markdown link
 * Also provides previews
 * Links are assumed to start with protocol (http:// etc.)
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { HiArrowsExpand, HiStop } from 'react-icons/hi';

import { getLinkDesc } from '../core/utils';
import EMBEDS from './embeds';
import { isPopUp } from './windows/popUpAvailable';

const titleAllowed = [
  'odysee',
  'twitter',
  'matrix.pixelplanet.fun',
  'youtube',
  'youtu.be',
  't.me',
];

const MdLink = ({ href, title, refEmbed }) => {
  const [showEmbed, setShowEmbed] = useState(false);

  const desc = getLinkDesc(href);

  let parsedTitle;
  try {
    // Support any subdomain of pixmap.fun
    const urlObj = new URL(href);
    const host = urlObj.hostname;

    const isCurrentHost = host === window.location.hostname;
    const isPixmapHost = host === 'pixmap.fun' || host.endsWith('.pixmap.fun');
    const hasHashPath = href.includes('/#');

    // handle pixelplanet and pixmap links differently
    if ((isCurrentHost || isPixmapHost) && hasHashPath) {
      // If href is already a full URL, use it as-is
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return (
          <a
            href={href}
            style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}
            onClick={(e) => {
              e.preventDefault();
              window.location.href = href;
            }}
          >
            {title || href}
          </a>
        );
      }
      // grab everything after the # since we need the full path
      const path = href.substring(href.indexOf('#'));
      // if it's a pixmap subdomain, use our current origin instead
      const linkPath = isPixmapHost
        ? `${window.location.origin}${path}`
        : path;
      return (
        <a
          href={linkPath}
          style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}
          onClick={(e) => {
            e.preventDefault();
            window.location.href = linkPath;
          }}
        >
          {title || href}
        </a>
      );
    }
  } catch (e) {
    // invalid URL, fall back to default handling
    console.warn('MdLink: invalid URL', href);
  }

  const embedObj = EMBEDS[desc];
  const embedAvailable = embedObj && embedObj[1](href);
  const Embed = embedObj && embedObj[0];

  if (title && titleAllowed.includes(desc)) {
    parsedTitle = title;
  } else if (embedAvailable && embedObj[2]) {
    parsedTitle = embedObj[2](href);
  } else {
    parsedTitle = href;
  }

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {parsedTitle}
      </a>
      {embedAvailable && (
        <>
          &nbsp;
          {embedObj[3] && (
            <img
              style={{
                width: '1em',
                height: '1em',
                verticalAlign: 'middle',
              }}
              src={embedObj[3]}
              alt={`${desc}-icon`}
            />
          )}
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => setShowEmbed(!showEmbed)}
          >
            {showEmbed ? (
              <HiStop className="ebcl" />
            ) : (
              <HiArrowsExpand className="ebex" />
            )}
          </span>
        </>
      )}
      {showEmbed && embedAvailable && (
        refEmbed && refEmbed.current ?
          ReactDOM.createPortal(<Embed url={href} />, refEmbed.current) :
          <Embed url={href} />
      )}
    </>
  );
};

export default React.memo(MdLink);
