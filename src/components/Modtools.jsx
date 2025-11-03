/*
 * Modtools
 */

import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { t } from 'ttag';
import { openWindow } from '../store/actions/windows';

import Canvastools from './ModCanvastools';
import Admintools from './Admintools';
import Watchtools from './ModWatchtools';
import IIDTools from './ModIIDtools';
import ModIntelTools from './ModIntelTools';
import UserChecker from './UserChecker';

const CONTENT = {
  Canvas: Canvastools,
  Admin: Admintools,
  Watch: Watchtools,
  IID: IIDTools,
  Intel: ModIntelTools,
  'User Checker': UserChecker,
};

function Modtools() {
  const [selectedPart, selectPart] = useState('Canvas');
  const userlvl = useSelector((state) => state.user.userlvl);
  const Content = CONTENT[selectedPart];
  const parts = Object.keys(CONTENT)
    .filter((part) => part !== 'Admin' || userlvl === 1);

  return (
    <>
      <div className="content" style={{ overflowWrap: 'anywhere' }}>
        {parts.map((part, ind) => (
          <React.Fragment key={part}>
            <span
              role="button"
              tabIndex={-1}
              className={
                (selectedPart === part) ? 'modallink selected' : 'modallink'
              }
              onClick={() => selectPart(part)}
            >{part}</span>
            {(ind !== parts.length - 1)
              && <span className="hdivider" />}
          </React.Fragment>
        ))}
        <div className="modaldivider" />
      </div>
      {Content && <Content />}
    </>
  );
}

export default React.memo(Modtools);
