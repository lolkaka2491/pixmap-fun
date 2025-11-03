import React from 'react';
import { FaUsers } from 'react-icons/fa';
import { t } from 'ttag';

import useLink from '../hooks/link';

const UsersButton = () => {
  const link = useLink();

  return (
    <div
      id="usersbutton"
      className="actionbuttons"
      onClick={() => link('USERS', { target: 'fullscreen' })}
      role="button"
      title={t`Users`}
      tabIndex={-1}
    >
      <FaUsers />
    </div>
  );
};

export default React.memo(UsersButton); 