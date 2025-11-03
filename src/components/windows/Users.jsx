import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { t } from 'ttag';
import { openWindow } from '../../store/actions/windows';
import { FaSearch } from 'react-icons/fa';

const Users = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();

  const searchUsers = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/user/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      setError(t`Failed to search users`);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchUsers();
    }
  };

  const handleUserClick = (userId) => {
    dispatch(openWindow('USER_PROFILE', t`User Profile`, { userId }));
  };

  return (
    <div className="users-window">
      <div className="search-container">
        <div className="search-input-wrapper">
          <FaSearch className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t`Search by username or ID...`}
            className="search-input"
          />
        </div>
        {isLoading && <div className="loading">{t`Loading...`}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="search-results">
        {searchResults.map((user) => (
          <div
            key={user.id}
            className="user-result"
            onClick={() => handleUserClick(user.id)}
            role="button"
            tabIndex={0}
          >
            <span className="username">{user.name}</span>
            <span className="user-id">#{user.id}</span>
          </div>
        ))}
        {searchResults.length === 0 && searchQuery && !isLoading && !error && (
          <div className="no-results">{t`No users found`}</div>
        )}
      </div>
    </div>
  );
};

export default Users;