/*
 * Settings for minimap / overlay
 */

/* eslint-disable react/no-array-index-key */

import React, { useState, useCallback, useRef } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import fileDownload from 'js-file-download';
import { c, t } from 'ttag';

import TemplateItem from './TemplateItem';
import TemplateItemEdit from './TemplateItemEdit';
import SettingsItem from './SettingsItem';
import templateLoader from '../ui/templateLoader';
import {
  toggleOVEnabled,
  toggleSmallPxls,
  setOvOpacity,
  setKeyBinding,
  toggleTemplateMoveMode,
} from '../store/actions/templates';


const TemplateSettings = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [
    list,
    oVEnabled,
    oSmallPxls,
    oOpacity,
    keyBindings,
    isOnMobile,
    templateMoveMode,
  ] = useSelector((state) => [
    state.templates.list,
    state.templates.ovEnabled,
    state.templates.oSmallPxls,
    state.templates.oOpacity,
    state.templates.keyBindings,
    state.user.isOnMobile,
    state.templates.templateMoveMode,
  ], shallowEqual);
  const [editingIndices, setEditingIndices] = useState([]);
  const close = useCallback(() => setShowAdd(false), []);
  const importRef = useRef();
  const dispatch = useDispatch();

  const toggleEditing = useCallback((title) => {
    const index = list.findIndex((z) => z.title === title);
    const ind = editingIndices.indexOf(index);
    setEditingIndices((ind === -1)
      ? [...editingIndices, index]
      : editingIndices.toSpliced(ind, 1),
    );
  }, [list, editingIndices]);

  return (
    <>
      <h2>{t`Templates`}</h2>
      <p>
        {
          // eslint-disable-next-line max-len
          t`Tired of always spaming one single color? Want to create art instead, but you have to count pixels from some other image? Templates can help you with that! Templates can show as overlay and you can draw over them. One pixel on the template, should be one pixel on the canvas.`
        }
      </p>
      <SettingsItem
        title={t`Enable Overlay`}
        keyBind={c('keybinds').t`T`}
        value={oVEnabled}
        onToggle={() => dispatch(toggleOVEnabled())}
      >
        {t`Show templates as overlays ingame.`}
      </SettingsItem>
      <SettingsItem
        title={t`Enable Template Movement`}
        keyBind={c('keybinds').t`K`}
        value={templateMoveMode}
        onToggle={() => dispatch(toggleTemplateMoveMode())}
      >
        {t`Enable template movement mode. Press K to toggle, then click a template to move it.`}
      </SettingsItem>
      <SettingsItem
        title={t`Small Pixels When Zoomed`}
        value={oSmallPxls}
        onToggle={() => dispatch(toggleSmallPxls())}
      >
        {
          t`Show overlay as small individual pixels on high zoomlevels.`
        }
      </SettingsItem>

      <div className="setitem">
        <div className="setrow">
          <h3 className="settitle">
            {t`Overlay Opacity`}
          </h3>
          <div style={{ textAlign: 'right' }}>
            <input
              type="number"
              value={oOpacity}
              style={{ maxWidth: '6em' }}
              step="1"
              min="10"
              max="100"
              onChange={(evt) => dispatch(setOvOpacity(evt.target.value))}
            />
          </div>
        </div>
        <div className="modaldesc">{t`Opacity of Overlay in percent.`}</div>
        <div className="modaldivider" />
      </div>

      <div className="setitem">
        <h3 className="settitle">{t`Shift/Spacebar Customization`}</h3>
        <div className="modaldesc">{t`Customize how the right-shift, left-shift and spacebar places`}</div>
        <div style={{ marginTop: '10px' }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ marginRight: '10px' }}>{t`Left Shift:`}</label>
            <select
              value={keyBindings.leftShift}
              onChange={(e) => dispatch(setKeyBinding('leftShift', e.target.value))}
            >
              <option value="OVERLAY">{t`Template Placing`}</option>
              <option value="HISTORY">{t`History`}</option>
              <option value="PENCIL">{t`Place with Color`}</option>
            </select>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ marginRight: '10px' }}>{t`Right Shift:`}</label>
            <select
              value={keyBindings.rightShift}
              onChange={(e) => dispatch(setKeyBinding('rightShift', e.target.value))}
      >
              <option value="OVERLAY">{t`Template Placing`}</option>
              <option value="HISTORY">{t`History`}</option>
              <option value="PENCIL">{t`Place with Color`}</option>
            </select>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ marginRight: '10px' }}>{t`Spacebar:`}</label>
            <select
              value={keyBindings.spacebar}
              onChange={(e) => dispatch(setKeyBinding('spacebar', e.target.value))}
            >
              <option value="OVERLAY">{t`Template Placing`}</option>
              <option value="HISTORY">{t`History`}</option>
              <option value="PENCIL">{t`Place with Color`}</option>
            </select>
          </div>
        </div>
        <div className="modaldivider" />
      </div>

      {list.map(({
        enabled, imageId, canvasId, title, x, y, width, height,
      }, index) => (editingIndices.includes(index) ? (
        <TemplateItemEdit
          enabled={enabled}
          key={index}
          title={title}
          imageId={imageId}
          canvasId={canvasId}
          x={x}
          y={y}
          stopEditing={toggleEditing}
        />
      ) : (
        <TemplateItem
          enabled={enabled}
          key={index}
          title={title}
          imageId={imageId}
          canvasId={canvasId}
          x={x}
          y={y}
          width={width}
          height={height}
          startEditing={toggleEditing}
        />
      )))}
      {showAdd && <TemplateItemEdit stopEditing={close} />}
      {(showAdd) ? (
        <span
          role="button"
          tabIndex={-1}
          className="modallink"
          onClick={() => close()}
        > {t`Cancel adding Template`}</span>
      ) : (
        <span
          role="button"
          tabIndex={-1}
          className="modallink"
          onClick={() => setShowAdd(true)}
        > {t`Add Template`}</span>
      )}
      {(list.some((z) => z.enabled)) && (
        <React.Fragment key="exps">
          &nbsp;|&nbsp;
          <span
            role="button"
            tabIndex={-1}
            className="modallink"
            onClick={async () => {
              const data = await templateLoader.exportEnabledTemplates();
              if (data) {
                fileDownload(
                  JSON.stringify(data), 'PixMapTemplates.json',
                );
              }
            }}
          >{t`Export enabled templates`}</span>
        </React.Fragment>
      )}
      &nbsp;|&nbsp;
      <span
        role="button"
        tabIndex={-1}
        className="modallink"
        onClick={async () => importRef.current?.click()}
      >{t`Import templates`}</span>
      <input
        type="file"
        key="impin"
        ref={importRef}
        style={{ display: 'none' }}
        onChange={(evt) => {
          templateLoader.importTemplates(evt.target.files?.[0]);
        }}
      />
    </>
  );
};

export default TemplateSettings;
