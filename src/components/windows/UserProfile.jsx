import React, { useState, useEffect, useContext } from 'react';
import { t } from 'ttag';
import WindowContext from '../context/window';

const UserProfile = () => {
  const [profileData, setProfileData] = useState(null);
  const { args } = useContext(WindowContext);
  const { userId } = args;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        console.log('Fetching profile for user ID:', userId);
        const response = await fetch(`/api/user/${userId}`, {
          headers: {
            'Accept': 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }
        const data = await response.json();
        console.log('Received profile data:', data);
        setProfileData(data);
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    };

    if (userId) {
      fetchProfile();
    }
  }, [userId]);

  if (!profileData) {
    return <div>{t`Loading...`}</div>;
  }

  return (
    <div className="user-profile">
      <div className="avatar-container">
        <img 
          src={profileData.avatar ? `/public/avatars/${profileData.avatar}` : '/public/avatars/default-avatar.png'} 
          alt="User Avatar" 
          className="avatar"
        />
      </div>
      <img 
        src={`https://pixmap.fun/cf/${profileData.flag}.gif`} 
        alt={`${profileData.flag} flag`} 
        className="flag"
      />
      <table>
        <tbody>
          <tr><th>ID</th><td>{profileData.id}</td></tr>
          <tr><th>Name</th><td>{profileData.name}</td></tr>
          <tr><th>Last Login</th><td>{new Date(profileData.lastLogIn).toLocaleString()}</td></tr>
          <tr>
            <th>Bio</th>
            <td>{profileData.bio ?? 'No bio yet...'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default UserProfile; 