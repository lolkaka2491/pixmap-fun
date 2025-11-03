import React, { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { sendChatReaction } from '../store/actions';

const MessageReactions = ({ messageId, channelId }) => {
  const dispatch = useDispatch();
  const reactions = useSelector((state) => state.chat.reactions[messageId] || {});
  const currentUserId = useSelector((state) => state.user.id);
  const [hoveredEmoji, setHoveredEmoji] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Memoize reaction entries to prevent unnecessary re-calculations
  const reactionEntries = useMemo(() => Object.entries(reactions), [reactions]);

  // Memoize reaction click handler
  const handleReactionClick = useCallback((emoji) => {
    dispatch(sendChatReaction(messageId, emoji, channelId));
  }, [dispatch, messageId, channelId]);

  // Memoize mouse handlers to prevent recreation on each render
  const handleMouseEnter = useCallback((emoji, event) => {
    const rect = event.target.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
    
    const timeout = setTimeout(() => {
      setHoveredEmoji(emoji);
    }, 1000); // 1 second delay

    event.target._tooltipTimeout = timeout;
  }, []);

  const handleMouseLeave = useCallback((event) => {
    if (event.target._tooltipTimeout) {
      clearTimeout(event.target._tooltipTimeout);
      delete event.target._tooltipTimeout;
    }
    setHoveredEmoji(null);
  }, []);

  // Early return if no reactions
  if (reactionEntries.length === 0) {
    return null;
  }

  return (
    <>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        marginTop: '4px',
        animation: 'reactionsSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {reactionEntries.map(([emoji, users]) => {
          const hasUserReacted = users.some(user => user.userId === currentUserId);
          const count = users.length;
          
          return (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              count={count}
              hasUserReacted={hasUserReacted}
              onReactionClick={handleReactionClick}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}
      </div>

      {hoveredEmoji && reactions[hoveredEmoji] && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: 'translate(-50%, -100%)',
            background: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)',
            color: 'white',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 10000,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(10px)',
            animation: 'tooltipFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
          }}
        >
          {reactions[hoveredEmoji].map(user => user.userName).join(', ')}
          <div
            style={{
              position: 'absolute',
              bottom: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid #2c2c2c',
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes reactionsSlideIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes reactionButtonIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, -100%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -100%) scale(1);
          }
        }
      `}</style>
    </>
  );
};

// Separate component for individual reaction button to prevent unnecessary re-renders
const ReactionButton = React.memo(({ emoji, count, hasUserReacted, onReactionClick, onMouseEnter, onMouseLeave }) => {
  const handleClick = useCallback(() => {
    onReactionClick(emoji);
  }, [emoji, onReactionClick]);

  const handleMouseEnterLocal = useCallback((e) => {
    onMouseEnter(emoji, e);
    e.target.style.transform = 'scale(1.05)';
    e.target.style.borderColor = hasUserReacted ? 'rgba(88, 166, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)';
    e.target.style.background = hasUserReacted 
      ? 'linear-gradient(135deg, rgba(88, 166, 255, 0.3) 0%, rgba(88, 166, 255, 0.15) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
  }, [emoji, onMouseEnter, hasUserReacted]);

  const handleMouseLeaveLocal = useCallback((e) => {
    onMouseLeave(e);
    e.target.style.transform = 'scale(1)';
    e.target.style.borderColor = hasUserReacted ? 'rgba(88, 166, 255, 0.6)' : 'rgba(255, 255, 255, 0.2)';
    e.target.style.background = hasUserReacted 
      ? 'linear-gradient(135deg, rgba(88, 166, 255, 0.2) 0%, rgba(88, 166, 255, 0.1) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
  }, [onMouseLeave, hasUserReacted]);

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnterLocal}
      onMouseLeave={handleMouseLeaveLocal}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        fontSize: '12px',
        border: hasUserReacted 
          ? '1px solid rgba(88, 166, 255, 0.6)' 
          : '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        background: hasUserReacted 
          ? 'linear-gradient(135deg, rgba(88, 166, 255, 0.2) 0%, rgba(88, 166, 255, 0.1) 100%)'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
        color: hasUserReacted ? '#58a6ff' : 'rgba(255, 255, 255, 0.8)',
        cursor: 'pointer',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        animation: `reactionButtonIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) ${Math.random() * 0.1}s both`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <img 
        src={`/emojis/${emoji}.png`} 
        alt={emoji}
        style={{
          width: '14px',
          height: '14px',
          pointerEvents: 'none',
        }}
      />
      <span style={{ 
        fontWeight: hasUserReacted ? '600' : '500',
        pointerEvents: 'none',
      }}>
        {count}
      </span>
    </button>
  );
});

export default React.memo(MessageReactions); 