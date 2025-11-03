import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { t } from 'ttag';
import { notify } from '../../store/actions/thunks';
import { closeWindow } from '../../store/actions/windows';

const TemplatePosition = () => {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isPositioning, setIsPositioning] = useState(false);
  const dispatch = useDispatch();
  const templates = useSelector((state) => state.templates.list);
  const view = useSelector((state) => state.canvas.view);

  useEffect(() => {
    const handleMouseUp = () => {
      if (isPositioning) {
        setIsPositioning(false);
        setSelectedTemplate(null);
        dispatch(closeWindow('TEMPLATE_POSITION'));
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isPositioning, dispatch]);

  const handlePositionClick = (template) => {
    setSelectedTemplate(template);
    setIsPositioning(true);
    dispatch(notify(t`Select template position`));
    dispatch(closeWindow('TEMPLATE_POSITION'));
  };

  const handleMouseMove = (e) => {
    if (!isPositioning || !selectedTemplate) return;

    const x = Math.floor(e.clientX / view[2] + view[0]);
    const y = Math.floor(e.clientY / view[2] + view[1]);

    dispatch({
      type: 's/CHG_TEMPLATE',
      title: selectedTemplate.title,
      props: { x, y },
    });
  };

  return (
    <div className="content">
      <h3>{t`Select Template to Position`}</h3>
      <div className="modaldivider" />
      <div className="template-list">
        {templates.map((template) => (
          <div
            key={template.title}
            className="template-item"
            onClick={() => handlePositionClick(template)}
          >
            <div className="template-item-title">{template.title}</div>
            <div className="template-item-position">
              {t`Current position`}: {template.x}, {template.y}
            </div>
          </div>
        ))}
      </div>

      {isPositioning && (
        <div
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
            cursor: 'crosshair'
          }}
          onMouseMove={handleMouseMove}
        />
      )}
    </div>
  );
};

export default TemplatePosition; 