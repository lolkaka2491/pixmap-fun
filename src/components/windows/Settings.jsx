/**
 *
 */

import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { c, t } from 'ttag';

import SettingsItem from '../SettingsItem';
import LanguageSelect from '../LanguageSelect';
import TemplateSettings from '../TemplateSettings';
import BrushShapeCustomizer from '../BrushShapeCustomizer';
import {
  toggleGrid,
  togglePixelNotify,
  toggleMvmCtrls,
  toggleMute,
  toggleAutoZoomIn,
  toggleCompactPalette,
  toggleChatNotify,
  togglePotatoMode,
  toggleLightGrid,
  toggleHistoricalView,
  selectStyle,
  setChatHistoryLength,
  setBrushSize,
  setBrushShape,
  setCustomBrushShape,
  toggleLegacyZoom,
} from '../../store/actions';

const SettingsItemSelect = ({
  title, values, selected, onSelect, icon, children,
}) => (
  <div className="setitem">
    <div className="setrow">
      <h3 className="settitle">{title}</h3>
      {(icon) && <img alt="" src={icon} />}
      <select
        value={selected}
        onChange={(e) => {
          const sel = e.target;
          onSelect(sel.options[sel.selectedIndex].value);
        }}
      >
        {
          values.map((value) => (
            <option
              key={value}
              value={value}
            >
              {value}
            </option>
          ))
        }
      </select>
    </div>
    <div className="modaldesc">{children}</div>
    <div className="modaldivider" />
  </div>
);

const Settings = () => {
  const [
    isGridShown,
    isPixelNotifyShown,
    isMvmCtrlsShown,
    autoZoomIn,
    compactPalette,
    isPotato,
    isLightGrid,
    selectedStyle,
    isMuted,
    chatNotify,
    isHistoricalView,
    templatesAvailable,
    chatHistoryLength,
    showHeatmap,
    brushSize,
    legacyZoom,
  ] = useSelector((state) => [
    state.gui.showGrid,
    state.gui.showPixelNotify,
    state.gui.showMvmCtrls,
    state.gui.autoZoomIn,
    state.gui.compactPalette,
    state.gui.isPotato,
    state.gui.isLightGrid,
    state.gui.style,
    state.gui.mute,
    state.gui.chatNotify,
    state.canvas.isHistoricalView,
    state.templates.available,
    state.gui.chatHistoryLength,
    state.gui.showHeatmap,
    state.gui.brushSize,
    state.gui.legacyZoom,
  ], shallowEqual);

  const { windows, args } = useSelector((state) => ({
    windows: state.windows.windows,
    args: state.windows.args,
  }), shallowEqual);

  const dispatch = useDispatch();
  const audioAvailable = window.AudioContext || window.webkitAudioContext;
  const templateSettingsRef = useRef(null);
  const brushUnlocked = useSelector((state) => state.gui.brushUnlocked);
  const [secretKey, setSecretKey] = useState('');
  const [keyStatus, setKeyStatus] = useState(null);
  const userlvl = useSelector((state) => state.user?.userlvl);

  useEffect(() => {
    const currentWindow = windows[0];
    if (currentWindow && args[currentWindow.windowId]?.focusTemplates && templateSettingsRef.current) {
      templateSettingsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [windows, args]);

  // On mount, check sessionStorage for unlock state
  useEffect(() => {
    if (userlvl === 1 && sessionStorage.getItem('brushUnlocked') === 'true') {
      dispatch({ type: 's/SET_BRUSH_UNLOCKED', value: true });
    }
  }, [userlvl]);

  // Function to validate the key with the server
  async function validateBrushKey(key) {
    try {
      const res = await fetch('/api/validate-brush-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyStatus('success');
        sessionStorage.setItem('brushUnlocked', 'true');
        dispatch({ type: 's/SET_BRUSH_UNLOCKED', value: true });
      } else {
        setKeyStatus('fail');
        sessionStorage.removeItem('brushUnlocked');
        dispatch({ type: 's/SET_BRUSH_UNLOCKED', value: false });
      }
    } catch {
      setKeyStatus('fail');
      sessionStorage.removeItem('brushUnlocked');
      dispatch({ type: 's/SET_BRUSH_UNLOCKED', value: false });
    }
  }

  return (
    <div className="content">
      <SettingsItem
        title={t`Show Grid`}
        keyBind={c('keybinds').t`G`}
        value={isGridShown}
        onToggle={() => dispatch(toggleGrid())}
      >
        {t`Turn on grid to highlight pixel borders.`}
      </SettingsItem>
      <SettingsItem
        title={t`Show Pixel Activity`}
        keyBind={c('keybinds').t`X`}
        value={isPixelNotifyShown}
        onToggle={() => dispatch(togglePixelNotify())}
      >
        {t`Show circles where pixels are placed.`}
      </SettingsItem>
      <SettingsItem
        title={t`Always show Movement Controls`}
        keyBind={c('keybinds').t`N`}
        value={isMvmCtrlsShown}
        onToggle={() => dispatch(toggleMvmCtrls())}
      >
        {t`Always show movement control buttons`}
      </SettingsItem>
      <SettingsItem
        title={t`Disable Game Sounds`}
        keyBind={c('keybinds').t`M`}
        deactivated={(!audioAvailable)}
        value={!audioAvailable || isMuted}
        onToggle={() => dispatch(toggleMute())}
      >
        {[t`All sound effects will be disabled.`,
          (!audioAvailable) && (
            <p className="warn">
              {/* eslint-disable-next-line max-len */}
              {t`Your Browser doesn't allow us to use AudioContext to play sounds. Do you have some privacy feature blocking us?`}
            </p>
          ),
        ]}
      </SettingsItem>
      <SettingsItem
        title={t`Enable chat notifications`}
        value={chatNotify}
        onToggle={() => dispatch(toggleChatNotify())}
      >
        {t`Play a sound when new chat messages arrive`}
      </SettingsItem>
      <SettingsItem
        title={t`Auto Zoom In`}
        value={autoZoomIn}
        onToggle={() => dispatch(toggleAutoZoomIn())}
      >
        {/* eslint-disable-next-line max-len */}
        {t`Zoom in instead of placing a pixel when you tap the canvas and your zoom is small.`}
      </SettingsItem>
      <SettingsItem
        title={t`Compact Palette`}
        // eslint-disable-next-line max-len
        value={compactPalette}
        onToggle={() => dispatch(toggleCompactPalette())}
      >
        {t`Display Palette in a compact form that takes less screen space.`}
      </SettingsItem>
      <SettingsItem
        title={t`Potato Mode`}
        value={isPotato}
        onToggle={() => dispatch(togglePotatoMode())}
      >
        {t`For when you are playing on a potato.`}
      </SettingsItem>
      <SettingsItem
        title={t`Light Grid`}
        value={isLightGrid}
        onToggle={() => dispatch(toggleLightGrid())}
      >
        {t`Show Grid in white instead of black.`}
      </SettingsItem>

      <SettingsItem
        title={t`Enable Legacy Zoom`}
        value={legacyZoom}
        onToggle={() => dispatch(toggleLegacyZoom())}
      >
        {t`Use the old zoom behavior instead of smooth zoom.`}
      </SettingsItem>
      <SettingsItemSelect
        title={t`Brush Size`}
        values={
          (userlvl === 1 || userlvl === 2)
            ? ['1', '3', '5', '7', '9', '11']
            : ['1', '3', '5']
        }
        selected={String(brushSize)}
        onSelect={(value) => dispatch(setBrushSize(parseInt(value, 10), null, userlvl))}
      >
        {t`Set the brush size for pixel placement (odd sizes only). Each brush action respects cooldown.`}
      </SettingsItemSelect>
      <BrushShapeCustomizer />
      <SettingsItemSelect
        title={t`Chat History Length`}
        values={['10', '25', '50', '100', '150', '200']}
        selected={String(chatHistoryLength)}
        onSelect={(value) => dispatch(setChatHistoryLength(parseInt(value, 10)))}
      >
        {t`Number of chat messages to display (1-200). Higher values may cause performance issues.`}
      </SettingsItemSelect>
      {(window.ssv && window.ssv.backupurl) && (
      <SettingsItem
        title={t`Historical View`}
        value={isHistoricalView}
        keyBind={c('keybinds').t`H`}
        onToggle={() => dispatch(toggleHistoricalView())}
      >
        {t`Check out past versions of the canvas.`}
      </SettingsItem>
      )}
      {(window.ssv && window.ssv.availableStyles) && (
        <SettingsItemSelect
          title={t`Themes`}
          values={Object.keys(window.ssv.availableStyles)}
          selected={selectedStyle}
          onSelect={(style) => dispatch(selectStyle(style))}
        >
          {t`How pixmap should look like.`}
        </SettingsItemSelect>
      )}
      {(window.ssv && navigator.cookieEnabled && window.ssv.langs) && (
        <div className="setitem">
          <div className="setrow">
            <h3 className="settitle">
              {t`Select Language`}
            </h3>
            <LanguageSelect />
          </div>
        </div>
      )}
      <div className="modaldivider" />
      {(templatesAvailable) && (
        <div ref={templateSettingsRef}>
          <TemplateSettings />
        </div>
      )}
    </div>
  );
};

export default React.memo(Settings);
