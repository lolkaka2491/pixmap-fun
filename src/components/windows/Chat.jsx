/**
 *
 */

import React, {
  useRef, useLayoutEffect, useState, useEffect, useCallback, useContext,
} from 'react';
import useStayScrolled from 'react-stay-scrolled';
import { useSelector, useDispatch } from 'react-redux';
import { t } from 'ttag';

import WindowContext from '../context/window';
import useLink from '../hooks/link';
import ContextMenu from '../contextmenus';
import ChatMessage from '../ChatMessage';
import ChannelDropDown from '../contextmenus/ChannelDropDown';

import {
  markChannelAsRead,
  sendChatMessage,
  startTyping,
  stopTyping,
} from '../../store/actions';
import {
  fetchChatMessages,
} from '../../store/actions/thunks';

const Chat = () => {
  const listRef = useRef();
  const targetRef = useRef();
  const inputRef = useRef();

  const [blockedIds, setBlockedIds] = useState([]);
  const [btnSize, setBtnSize] = useState(20);
  const [cmArgs, setCmArgs] = useState({});
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [isTyping, setIsTyping] = useState(false);

  const dispatch = useDispatch();

  const ownName = useSelector((state) => state.user.name);
  const fetching = useSelector((state) => state.fetching.fetchingChat);
  const { channels, messages, blocked, typing } = useSelector((state) => state.chat);
  const user = useSelector((state) => state.user);

  const {
    args,
    setArgs,
    setTitle,
  } = useContext(WindowContext);

  const {
    chatChannel = 1,
  } = args;

  const link = useLink();

  const setChannel = useCallback((cid) => {
    dispatch(markChannelAsRead(cid));
    setArgs({
      chatChannel: Number(cid),
    });
  }, [dispatch, setArgs]);

  const addToInput = useCallback((msg) => {
    const inputElem = inputRef.current;
    if (!inputElem) {
      return;
    }
    let newInputMessage = inputElem.value;
    if (newInputMessage.slice(-1) !== ' ') {
      newInputMessage += ' ';
    }
    newInputMessage += `${msg} `;
    inputElem.value = newInputMessage;
    inputRef.current.focus();
  }, []);

  const closeCm = useCallback(() => {
    setCmArgs({});
  }, []);

  const openUserCm = useCallback((x, y, name, uid) => {
    setCmArgs({
      type: 'USER',
      x,
      y,
      args: {
        name,
        uid,
        setChannel,
        addToInput,
      },
    });
  }, [setChannel, addToInput]);

  // Typing indicator functions
  const handleTypingStart = useCallback((channelId) => {
    if (!isTyping) {
      setIsTyping(true);
      dispatch(startTyping(channelId));
    }
    
    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Set new timeout to stop typing after 1 second of inactivity
    const timeout = setTimeout(() => {
      setIsTyping(false);
      dispatch(stopTyping(channelId));
    }, 1000);
    
    setTypingTimeout(timeout);
  }, [dispatch, isTyping, typingTimeout]);

  const handleTypingStop = useCallback((channelId) => {
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
    if (isTyping) {
      setIsTyping(false);
      dispatch(stopTyping(channelId));
    }
  }, [dispatch, isTyping, typingTimeout]);

  // Handle input changes for typing indicators
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    if (value.trim() && ownName) {
      handleTypingStart(chatChannel);
    }
  }, [chatChannel, ownName, handleTypingStart]);

  // Handle input key events
  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTypingStop(chatChannel);
      // The form submission will be handled by the form's onSubmit
      e.target.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }, [chatChannel, handleTypingStop]);

  const { stayScrolled } = useStayScrolled(listRef, {
    initialScroll: Infinity,
    inaccuracy: 10,
  });

  const channelMessages = messages[chatChannel] || [];
  useEffect(() => {
    if (channels[chatChannel] && !messages[chatChannel] && !fetching) {
      dispatch(fetchChatMessages(chatChannel));
    }
  }, [channels, messages, chatChannel, dispatch, fetching]);

  // Add effect to handle chat refreshes
  useEffect(() => {
    const handleChatRefresh = () => {
      if (channels[chatChannel]) {
        dispatch(fetchChatMessages(chatChannel));
      }
    };

    // Listen for chat refresh events
    window.addEventListener('chatRefresh', handleChatRefresh);
    return () => {
      window.removeEventListener('chatRefresh', handleChatRefresh);
    };
  }, [channels, chatChannel, dispatch]);

  useEffect(() => {
    if (channels[chatChannel]) {
      const channelName = channels[chatChannel][0];
      setTitle(`Chan: ${channelName}`);
    }
  }, [chatChannel]);

  useLayoutEffect(() => {
    stayScrolled();
  }, [channelMessages.length]);

  useEffect(() => {
    setTimeout(() => {
      const fontSize = Math.round(targetRef.current.offsetHeight / 10);
      setBtnSize(Math.min(28, fontSize));
    }, 330);
  }, [targetRef]);

  useEffect(() => {
    const bl = [];
    for (let i = 0; i < blocked.length; i += 1) {
      bl.push(blocked[i][0]);
    }
    setBlockedIds(bl);
  }, [blocked.length]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [typingTimeout]);

  // Create typing indicator text
  const getTypingIndicatorText = useCallback(() => {
    const typingUsers = typing[chatChannel] || [];
    const filteredUsers = typingUsers.filter(user => user !== ownName);
    
    if (filteredUsers.length === 0) {
      return '';
    } else if (filteredUsers.length === 1) {
      return `${filteredUsers[0]} is typing...`;
    } else if (filteredUsers.length === 2) {
      return `${filteredUsers[0]} and ${filteredUsers[1]} are typing...`;
    } else {
      return `${filteredUsers[0]} and others are typing...`;
    }
  }, [typing, chatChannel, ownName]);

  function handleSubmit(evt) {
    evt.preventDefault();
    const inptMsg = inputRef.current.value.trim();
    if (!inptMsg) return;
    
    // Stop typing indicator
    handleTypingStop(chatChannel);
    
    // send message via websocket
    dispatch(sendChatMessage(inptMsg, chatChannel));
    inputRef.current.value = '';
  }

  /*
   * if selected channel isn't in channel list anymore
   * for whatever reason (left faction etc.)
   * set channel to first available one
   */
  useEffect(() => {
    if (!chatChannel || !channels[chatChannel]) {
      const cids = Object.keys(channels);
      if (cids.length) {
        setChannel(cids[0]);
      }
    }
  }, [channels, chatChannel, setChannel]);

  return (
    <div
      ref={targetRef}
      className="chat-container"
    >
      <ContextMenu
        type={cmArgs.type}
        x={cmArgs.x}
        y={cmArgs.y}
        args={cmArgs.args}
        close={closeCm}
        align={cmArgs.align}
      />
      <ul
        className="chatarea"
        ref={listRef}
        style={{ flexGrow: 1 }}
        role="presentation"
      >
        {
          (!channelMessages.length)
          && (
          <ChatMessage
            uid={0}
            name="info"
            country="xx"
            msg={t`Start chatting here`}
            ownName={ownName}
          />
          )
        }
        {
          channelMessages.map((message, index) => ((blockedIds.includes(message[3]))
            ? null : (
              <ChatMessage
                name={message[0]}
                msg={message[1]}
                country={message[2]}
                uid={message[3]}
                ts={message[4]}
                factionTag={message[5]}
                key={message[6] ? `msg-${message[6]}` : `temp-${index}-${message[4]}`}
                messageId={message[6]}
                channelId={chatChannel}
                openCm={openUserCm}
                ownName={ownName}
              />
            )))
        }
      </ul>
      {getTypingIndicatorText() && (
        <div
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            color: '#999',
            fontStyle: 'italic',
            minHeight: '16px',
          }}
        >
          {getTypingIndicatorText()}
        </div>
      )}
      <form
        className="chatinput"
        onSubmit={(e) => handleSubmit(e)}
        style={{
          display: 'flex',
          position: 'relative',
        }}
      >
        {(ownName) ? (
          <React.Fragment key="chtipt">
            <input
              key="chat-input"
              style={{
                flexGrow: 1,
                minWidth: 40,
              }}
              ref={inputRef}
              autoComplete="off"
              maxLength="200"
              type="text"
              placeholder={t`Type here...`}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
            />
            <button
              key="send-button"
              id="sendbtn"
              style={{ flexGrow: 0 }}
              type="submit"
            >
              {t`Send`}
            </button>
          </React.Fragment>
        ) : (
          <div
            className="modallink"
            key="nlipt"
            onClick={(evt) => {
              evt.stopPropagation();
              link('USERAREA', { target: 'fullscreen' });
            }}
            style={{
              textAlign: 'center',
              fontSize: 13,
              flexGrow: 1,
            }}
            role="button"
            tabIndex={0}
          >
            {t`You must be logged in to chat`}
          </div>
        )}
        <ChannelDropDown
          key="cdd"
          setChatChannel={setChannel}
          chatChannel={chatChannel}
        />
      </form>
      <div
        className="chatlink"
        style={{
          fontSize: btnSize,
        }}
      >
        <span
          onClick={(event) => {
            const {
              clientX: x,
              clientY: y,
            } = event;
            setCmArgs({
              type: 'CHANNEL',
              x,
              y,
              args: { cid: chatChannel },
              align: 'tr',
            });
          }}
          role="button"
          title={t`Channel settings`}
          tabIndex={-1}
        >⚙</span>
      </div>
    </div>
  );
};

export default Chat;
