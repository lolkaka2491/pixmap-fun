import React, { useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { sendChatReaction } from '../store/actions';

const EmojiPicker = ({ messageId, channelId, onClose, position }) => {
  const dispatch = useDispatch();

  // Memoize the emoji list to prevent recreation
  const emojis = useMemo(() => [
    'check', 'clock', 'cross', 'crown', 'exclamation', 'fire', 'flag',
    'heart', 'laugh', 'paint', 'pixel', 'planet', 'question', 'shield',
    'smile', 'star', 'sword', 'thumbsdown', 'thumbsup', 'wink'
  ], []);

  // Memoize handlers to prevent recreation on each render
  const handleEmojiClick = useCallback((emoji) => {
    dispatch(sendChatReaction(messageId, emoji, channelId));
    onClose();
  }, [dispatch, messageId, channelId, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        pointerEvents: 'auto'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          background: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)',
          border: '1px solid #444',
          borderRadius: '12px',
          padding: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '4px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          animation: 'emojiPickerFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'top left',
          minWidth: '200px',
          maxWidth: '250px',
        }}
      >
        {emojis.map((emoji, index) => (
          <EmojiButton
            key={emoji}
            emoji={emoji}
            index={index}
            onEmojiClick={handleEmojiClick}
          />
        ))}
        <style jsx>{`
          @keyframes emojiPickerFadeIn {
            from {
              opacity: 0;
              transform: scale(0.9) translateY(-4px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          
          @keyframes emojiButtonSlideIn {
            from {
              opacity: 0;
              transform: scale(0.8) translateY(8px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
        `}</style>
      </div>
    </div>
  );
};

// Separate component for individual emoji buttons to prevent unnecessary re-renders
const EmojiButton = React.memo(({ emoji, index, onEmojiClick }) => {
  const handleClick = useCallback(() => {
    onEmojiClick(emoji);
  }, [emoji, onEmojiClick]);

  const handleMouseEnter = useCallback((e) => {
    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
    e.target.style.transform = 'scale(1.1)';
  }, []);

  const handleMouseLeave = useCallback((e) => {
    e.target.style.background = 'transparent';
    e.target.style.transform = 'scale(1)';
  }, []);

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '32px',
        height: '32px',
        border: 'none',
        borderRadius: '8px',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        animation: `emojiButtonSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.02}s both`,
      }}
    >
      <img 
        src={`/emojis/${emoji}.png`} 
        alt={emoji}
        style={{
          width: '20px',
          height: '20px',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
});

export default React.memo(EmojiPicker); 