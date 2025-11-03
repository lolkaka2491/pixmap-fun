import React from 'react';
import { useSelector } from 'react-redux';
import { setBrightness } from '../core/utils';

import { MdMention } from './MdMention';
import { MdLink } from './MdLink';
import { MdCanvasLink } from './MdCanvasLink';

const MarkdownParagraph = ({
  pArray,
  preserveFormatting,
}) => {
  const isDarkMode = useSelector((state) => state.gui.style.indexOf('dark') !== -1);

  return (
    <>
      {pArray.map((p, i) => {
        if (p.type === 'TEXT') {
          return (
            <span
              key={i}
              style={{
                color: setBrightness(p.color, isDarkMode),
                whiteSpace: preserveFormatting ? 'pre' : 'normal',
              }}
            >
              {p.text}
            </span>
          );
        }
        if (p.type === 'MENTION') {
          return (
            <MdMention
              key={i}
              name={p.name}
              uid={p.uid}
            />
          );
        }
        if (p.type === 'LINK') {
          return (
            <MdLink
              key={i}
              url={p.url}
              text={p.text}
            />
          );
        }
        if (p.type === 'CANVASLINK') {
          return (
            <MdCanvasLink
              key={i}
              x={p.x}
              y={p.y}
              text={p.text}
            />
          );
        }
        if (p.type === 'EMOJI') {
          return (
            <img
              key={i}
              src={`/api/emojis/${p.name}.png`}
              alt={`:${p.name}:`}
              className="chat-emoji"
              width="16"
              height="16"
              style={{ verticalAlign: 'middle' }}
            />
          );
        }
        return null;
      })}
    </>
  );
};

export default React.memo(MarkdownParagraph); 