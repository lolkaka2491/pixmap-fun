import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, shallowEqual, useDispatch } from 'react-redux';
import { t } from 'ttag';

import UserMessages from './UserMessages';
import ChangePassword from './ChangePassword';
import ChangeName from './ChangeName';
import ChangeMail from './ChangeMail';
import DeleteAccount from './DeleteAccount';
import SocialSettings from './SocialSettings';
import { logoutUser } from '../store/actions';
import { requestLogOut } from '../store/actions/fetch';

import { numberToString } from '../core/utils';

const AREAS = {
  CHANGE_NAME: ChangeName,
  CHANGE_MAIL: ChangeMail,
  CHANGE_PASSWORD: ChangePassword,
  DELETE_ACCOUNT: DeleteAccount,
  SOCIAL_SETTINGS: SocialSettings,
};

const PixelStatsTooltip = ({ dailyPixels, totalPixels, canvasId }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [canvasStats, setCanvasStats] = useState(null);
  const id = useSelector((state) => state.user.id);

  useEffect(() => {
    const fetchCanvasStats = async () => {
      try {
        const response = await fetch(`/api/user/${id}/canvas/${canvasId}/stats`);
        if (response.ok) {
          const data = await response.json();
          setCanvasStats(data);
        }
      } catch (error) {
        console.error('Error fetching canvas stats:', error);
      }
    };

    if (isVisible && canvasId) {
      fetchCanvasStats();
    }
  }, [isVisible, canvasId, id]);

  const handleMouseMove = (e) => {
    setPosition({ x: e.clientX + 10, y: e.clientY + 10 });
  };

  return (
    <div
      className="pixel-stats-tooltip"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onMouseMove={handleMouseMove}
    >
      {isVisible && (
        <div
          className="tooltip-content"
          style={{ position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, zIndex: 1000 }}
        >
          <div className="tooltip-row">
            <span className="tooltip-label">{t`Daily Pixels:`}</span>
            <span className="tooltip-value">{numberToString(dailyPixels)}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">{t`Total Pixels:`}</span>
            <span className="tooltip-value">{numberToString(totalPixels)}</span>
          </div>
          {canvasStats && (
            <>
              <div className="tooltip-divider" />
              <div className="tooltip-row">
                <span className="tooltip-label">{t`Canvas ${canvasId} Daily:`}</span>
                <span className="tooltip-value">{numberToString(canvasStats.dailyPixels)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">{t`Canvas ${canvasId} Total:`}</span>
                <span className="tooltip-value">{numberToString(canvasStats.totalPixels)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Stat = ({ text, value, rank, dailyPixels, totalPixels, canvasId }) => (
  <p className="stat-container">
    <span className="stattext">{(rank) ? `${text}: #` : `${text}: `}</span>
    &nbsp;
    <span className="statvalue">
      {numberToString(value)}
      {!rank && <PixelStatsTooltip dailyPixels={dailyPixels} totalPixels={totalPixels} canvasId={canvasId} />}
    </span>
  </p>
);

const isNullAffectedName = (name) => {
  if (!name) return false;
  // Matches 'null' followed by numbers (e.g., null12345678)
  if (/^null\d+$/i.test(name)) return true;
  // Matches 'nullX names' (case-insensitive, optional spaces)
  if (/^nullx\s*names$/i.test(name)) return true;
  // Matches exactly 'null' (case-insensitive)
  if (/^null$/i.test(name)) return true;
  return false;
};

const UserAreaContent = () => {
  const [area, setArea] = useState('NONE');
  const [profileData, setProfileData] = useState(null);
  const [charCount, setCharCount] = useState(200);
  const [error, setError] = useState(null);
  const [lastChangeTime, setLastChangeTime] = useState(0);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [tempBio, setTempBio] = useState('');

  const dispatch = useDispatch();
  const logout = useCallback(async () => {
    const ret = await requestLogOut();
    if (ret) {
      dispatch(logoutUser());
    }
  }, [dispatch]);

  const mailreg = useSelector((state) => state.user.mailreg);
  const name = useSelector((state) => state.user.name);
  const id = useSelector((state) => state.user.id);
  const stats = useSelector((state) => ({
    totalPixels: state.ranks.totalPixels,
    dailyTotalPixels: state.ranks.dailyTotalPixels,
    ranking: state.ranks.ranking,
    dailyRanking: state.ranks.dailyRanking,
  }), shallowEqual);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/user/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }
        const data = await response.json();
        setProfileData(data);
        if (data.bio) {
          setCharCount(200 - data.bio.length);
        }
      } catch (error) {
        setError(error.message);
        console.error('Error fetching profile:', error);
      }
    };

    if (id) {
      fetchProfile();
    }
  }, [id]);

  const handleEditClick = () => {
    if (profileData) {
      setTempBio(profileData.bio || '');
      setCharCount(200 - (profileData.bio ? profileData.bio.length : 0));
      setError(null);
      setIsEditingBio(true);
    }
  };

  const handleBioChange = (e) => {
    const value = e.target.value;
    setTempBio(value);
    setCharCount(200 - value.length);
  };

  const handleBioSave = async () => {
    const currentTime = Date.now();
    if (currentTime - lastChangeTime < 5 * 60 * 1000) {
      setError('You can only change your bio every 5 minutes.');
      return;
    }
    const bio = tempBio.trim();
    if (!bio) {
      setError('Bio cannot be empty');
      return;
    }
    try {
      const response = await fetch(`/api/user/${id}/bio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio, id }),
      });
      const data = await response.json();
      if (response.ok) {
        const updatedProfile = await fetch(`/api/user/${id}`);
        const newProfile = await updatedProfile.json();
        setProfileData(newProfile);
        setError(null);
        setLastChangeTime(currentTime);
        setIsEditingBio(false);
      } else {
        setError(data.error || 'Failed to update bio');
      }
    } catch (error) {
      setError('Error updating bio');
      console.error('Error:', error);
    }
  };

  const handleBioCancel = () => {
    setIsEditingBio(false);
    setError(null);
    if (profileData && profileData.bio) {
      setCharCount(200 - profileData.bio.length);
    } else {
      setCharCount(200);
    }
  };

  const handleAvatarChange = async (e) => {
    e.preventDefault();
    const currentTime = Date.now();
    if (currentTime - lastChangeTime < 5 * 60 * 1000) {
      setError('You can only change your avatar every 5 minutes.');
      return;
    }
    const file = e.target.avatarInput.files[0];
    if (!file) {
      setError('Please select a file');
      return;
    }
    if (file.size > 1024 * 1024) {
      setError('File size must be less than 1MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, and GIF files are allowed');
      return;
    }
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((resolve) => {
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        if (img.width > 512 || img.height > 512) {
          setError('Image will be resized to maximum 512x512');
        }
        resolve();
      };
    });
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('id', id);
    try {
      const response = await fetch(`/api/user/${id}/avatar`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        const updatedProfile = await fetch(`/api/user/${id}`);
        const profileData = await updatedProfile.json();
        setProfileData(profileData);
        setError(null);
        e.target.reset();
        setLastChangeTime(currentTime);
      } else {
        setError(data.error || 'Failed to update avatar');
      }
    } catch (error) {
      setError('Error updating avatar');
      console.error('Error:', error);
    }
  };

  const Area = AREAS[area];

  return (
    <div className="content">
      <UserMessages />
      {error && <div className="error-message">{error}</div>}
      {profileData && (
        <div className="user-profile">
          {isNullAffectedName(name) && (
            <div style={{
              background: '#fffbe6',
              color: '#b8860b',
              border: '1px solid #ffe58f',
              borderRadius: 4,
              padding: '10px 16px',
              marginBottom: 16,
              fontWeight: 500,
              fontSize: 15,
              textAlign: 'center',
            }}>
              Your username was apart of a SQL issue. We resolved this but it caused some usernames to be changed to <b>nulluserid</b>. Please change your name back to normal.
            </div>
          )}
          <div className="avatar-container">
            <img
              src={profileData.avatar ? `/public/avatars/${profileData.avatar}` : '/public/avatars/default-avatar.png'}
              alt="User Avatar"
              className="avatar"
            />
            <form onSubmit={handleAvatarChange} className="file-input-container">
              <input type="file" id="avatarInput" accept=".jpg,.jpeg,.png,.gif" />
              <p className="upload-info">
                Allowed: .jpg, .png, .gif (max 1MB, will be resized to max 512x512)
              </p>
              <button type="submit">Update Avatar</button>
            </form>
          </div>
          <img
            src={`https://pixmap.fun/cf/${profileData.flag}.gif`}
            alt={`${profileData.flag} flag`}
            className="flag"
          />
          <div className="profile-info">
            <div className="info-row">
              <span className="label">ID:</span>
              <span className="value">{profileData.id}</span>
            </div>
            <div className="info-row">
              <span className="label">Name:</span>
              <span className="value">{name}</span>
            </div>
            <div className="info-row">
              <span className="label">Last Login:</span>
              <span className="value">
                {new Date(profileData.lastLogIn).toLocaleString()}
              </span>
            </div>
            <div className="info-row bio-row">
              <span className="label">Bio:</span>
              <div className="value">
                {!isEditingBio ? (
                  <>
                    {profileData.bio || t`No bio yet...`}
                    <button
                      type="button"
                      onClick={handleEditClick}
                      style={{ background: 'transparent', border: 0}}
                      aria-label={t`Edit Bio`}
                      className="edit-bio-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M12.146.854a.5.5 0 0 1 .708 0l2.292 2.292a.5.5 0 0 1 0 .708l-9.439 9.439a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l9.439-9.439zM11.207 2L2 11.207V13h1.793L14 3.793 11.207 2z"/>
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="edit-bio-container">
                    <textarea
                      value={tempBio}
                      maxLength={200}
                      onChange={handleBioChange}
                      className="bio-input"
                    />
                    <div className={`char-counter ${charCount < 20 ? 'warning' : ''}`}>{charCount} {t`characters remaining`}</div>
                    <button type="button" onClick={handleBioSave}>{t`Save`}</button>
                    <button type="button" onClick={handleBioCancel}>{t`Cancel`}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <Stat
        text={t`Today Placed Pixels`}
        value={stats.dailyTotalPixels}
        dailyPixels={stats.dailyTotalPixels}
        totalPixels={stats.totalPixels}
      />
      <Stat
        text={t`Daily Rank`}
        value={stats.dailyRanking}
        rank
      />
      <Stat
        text={t`Placed Pixels`}
        value={stats.totalPixels}
        dailyPixels={stats.dailyTotalPixels}
        totalPixels={stats.totalPixels}
      />
      <Stat
        text={t`Total Rank`}
        value={stats.ranking}
        rank
      />
      <div>
        <p>{t`Your name is: ${name}`}</p>
        <span role="button" tabIndex={-1} className="modallink" onClick={logout}> {t`Log out`}</span>
        <span className="hdivider" />
        <span role="button" tabIndex={-1} className="modallink" onClick={() => setArea('CHANGE_NAME')}> {t`Change Username`}</span>
        <span className="hdivider" />
        {(mailreg) && (
          <React.Fragment key="mc">
            <span role="button" tabIndex={-1} className="modallink" onClick={() => setArea('CHANGE_MAIL')}> {t`Change Mail`}</span>
            <span className="hdivider" />
          </React.Fragment>
        )}
        <span role="button" tabIndex={-1} className="modallink" onClick={() => setArea('CHANGE_PASSWORD')}> {t`Change Password`}</span>
        <span className="hdivider" />
        <span role="button" tabIndex={-1} className="modallink" onClick={() => setArea('DELETE_ACCOUNT')}> {t`Delete Account`}</span> )
        <br />(
        <span role="button" tabIndex={-1} className="modallink" onClick={() => setArea('SOCIAL_SETTINGS')}> {t`Social Settings`}</span> )
      </div>
      {(Area) && <Area done={() => setArea(null)} />}
    </div>
  );
};

export default React.memo(UserAreaContent);