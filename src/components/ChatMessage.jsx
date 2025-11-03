import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { MarkdownParagraph } from './Markdown';
import MessageReactions from './MessageReactions';
import EmojiPicker from './EmojiPicker';
import {
  colorFromText,
  setBrightness,
  getDateTimeString,
} from '../core/utils';
import { selectIsDarkMode } from '../store/selectors/gui';
import { parseParagraph } from '../core/MarkdownParser';

const ChatMessage = React.memo(function ChatMessage({
  name,
  ownName,
  uid,
  country,
  msg,
  ts,
  openCm,
  factionTag,
  channelId,
  messageId,
}) {
  const isDarkMode = useSelector(selectIsDarkMode);
  const userId = useSelector((state) => state.user.id);
  const isRegistered = Boolean(userId); // User is registered if they have an ID
  const refEmbed = useRef();
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 });
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Memoize className to prevent re-computation on every render
  const className = useMemo(() => {
    let cls = 'msg'; // This is a message, so add the 'msg' class

    // Add classes based on who sent the message
    if (name === 'info') {
      cls += ' info';
    } else if (name === 'event') {
      cls += ' event';
    } else if (name == ownName) {
      cls += ' chat-author';
    }

    // Add classes based on the first character of the message
    if (msg.charAt(0) === '>') {
      cls += ' greentext';
    } else if (msg.charAt(0) === '<') {
      cls += ' redtext';
    }

    // Add classes based on the country of the message
    if (country == 'zz') {
      cls += ' chat-mod';
    }

    return cls;
  }, [name, ownName, msg, country]);

  // Check if this message is eligible for reactions
  const isEligibleForReactions = useMemo(() => {
    return isRegistered && 
           messageId && 
           !className.includes('info') && 
           !className.includes('event');
  }, [isRegistered, messageId, className]);

  // Only show faction tag if it's a non-empty, non-whitespace string
  const hasFactionTag = useMemo(() => Boolean(
    typeof factionTag === 'string' && factionTag.trim().length > 0
  ), [factionTag]);

  // Memoize parsed paragraph to prevent re-parsing on every render
  const pArray = useMemo(() => parseParagraph(msg, {
    preserveFormatting: true,
    handleCanvasLinks: true,
    handleMentions: true
  }), [msg]);

  // Memoize color calculation
  const nameColor = useMemo(() => setBrightness(colorFromText(name), isDarkMode), [name, isDarkMode]);

  // Memoize event handlers to prevent recreation on each render
  const handleMouseEnter = useCallback((e) => {
    if (!isEligibleForReactions) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setPickerPosition({
      x: rect.right - 50,
      y: rect.top,
    });

    setIsHovering(true);
  }, [isEligibleForReactions]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  const handleEmojiPickerClose = useCallback(() => {
    setShowEmojiPicker(false);
  }, []);

  const handleNameClick = useCallback((event) => {
    openCm(event.clientX, event.clientY, name, uid);
  }, [openCm, name, uid]);

  // Handle keyboard events for Shift detection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Show/hide emoji picker based on Shift+hover state
  useEffect(() => {
    if (isEligibleForReactions && isShiftPressed && isHovering) {
      setShowEmojiPicker(true);
    } else {
      setShowEmojiPicker(false);
    }
  }, [isEligibleForReactions, isShiftPressed, isHovering]);

  return (
    <li 
      className="chatmsg" 
      ref={refEmbed}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="msgcont">
        <span className={className}>
          {(!className.includes('info') && !className.includes('event')) && (
            <React.Fragment key="name">
              <img
                className="chatflag"
                alt=""
                title={country}
                src={`/cf/${country}.gif`}
              />
              {hasFactionTag && (
                <span
                  className="faction-tag"
                  style={{
                    color: '#FF6B35',
                    fontWeight: 'bold',
                    marginRight: '4px',
                    fontSize: '0.9em',
                  }}
                  title={`Faction: ${factionTag}`}
                >
                  [{factionTag}]
                </span>
              )}
              <span
                className="chatname"
                style={{
                  color: nameColor,
                  cursor: 'pointer',
                }}
                role="button"
                title={name}
                tabIndex={-1}
                onClick={handleNameClick}
              >
                {name}
              </span>
              {': '}
            </React.Fragment>
          )}
          <MarkdownParagraph 
            refEmbed={refEmbed} 
            pArray={pArray}
            preserveFormatting={true}
          />
        </span>
        <span className="chatts">
          {getDateTimeString(ts)}
        </span>
      </div>
      {messageId && <MessageReactions messageId={messageId} channelId={channelId} />}
      {showEmojiPicker && messageId && (
        <EmojiPicker
          messageId={messageId}
          channelId={channelId}
          onClose={handleEmojiPickerClose}
          position={pickerPosition}
        />
      )}
    </li>
  );
});

export default ChatMessage;
