import React from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { t } from 'ttag';
import { setBrushShape, setCustomBrushShape } from '../store/actions';

const brushShapeBlacklist = (shape) => {
  
  const pixelMargin = 1.6; // As a decimal percentage, how much of the pattern's pixels have to be present in order for the blacklist to NOT take effect?

  const patterns = [
    [
      [0, 1, 0,],
      [0, 1, 0,],
      [1, 0, 1,]
    ],
    [
      [0, 0, 1,],
      [1, 1, 0,],
      [0, 0, 1,]
    ],
    [
      [1, 0, 1,],
      [0, 1, 0,],
      [0, 1, 0,]
    ],
    [
      [1, 0, 0,],
      [0, 1, 1,],
      [1, 0, 0,]
    ],
    [
      [0, 1, 0,],
      [0, 1, 0,],
      [1, 1, 1,]
    ],
    [
      [0, 0, 1,],
      [1, 1, 1,],
      [0, 0, 1,]
    ],
    [
      [1, 1, 1,],
      [0, 1, 0,],
      [0, 1, 0,]
    ],
    [
      [1, 0, 0,],
      [1, 1, 1,],
      [1, 0, 0,]
    ],
    [
      [1, 0, 1, 1, 1],
      [1, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 1],
      [1, 1, 1, 0, 1]
    ],
    [
      [1, 1, 1, 0, 1],
      [0, 0, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 0],
      [1, 0, 1, 1, 1]
    ],
    [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 0],
      [1, 0, 1, 1, 1]
    ],
    // Z letter variations - Original Z
    [
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1]
    ],
    // Z horizontally flipped (backward Z)
    [
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1]
    ],
    // Z vertically flipped
    [
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1]
    ],
    // Z both horizontally and vertically flipped
    [
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1]
    ],
    // Z rotated 90° clockwise
    [
      [1, 0, 0, 0, 1],
      [1, 0, 0, 1, 1],
      [1, 0, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1]
    ],
    // Z rotated 180° (same as horizontal + vertical flip)
    [
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1]
    ],
    // Z rotated 270° (90° counter-clockwise)
    [
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 0, 1],
      [1, 1, 0, 0, 1],
      [1, 0, 0, 0, 1]
    ],
    // Additional Z variations with slightly different patterns
    // Thinner Z (3-pixel wide lines)
    [
      [1, 1, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 1, 1, 0, 0]
    ],
    [
      [0, 0, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
      [0, 0, 1, 1, 1]
    ],
    [
      [0, 0, 1, 1, 1],
      [0, 0, 0, 0, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 1, 1]
    ],
    [
      [1, 1, 1, 0, 0],
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 0, 0]
    ],
    // Minimal Z patterns (2-pixel wide)
    [
      [1, 1, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ],
    [
      [0, 0, 1, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 1, 1, 0],
      [0, 0, 0, 0, 0]
    ],
    [
      [0, 0, 0, 1, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
      [0, 0, 0, 1, 1],
      [0, 0, 0, 0, 0]
    ],
    // Rotated minimal Z patterns
    [
      [1, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ],
    [
      [0, 1, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ]
  ];
  
  const shapeSum = shape.flat().reduce((a, b) => a + b, 0);

  for (const pattern of patterns) {
    const patternRows = pattern.length;
    const patternCols = pattern[0].length;
    const patternSum = pattern.flat().reduce((a, b) => a + b, 0);

    for (let row = 0; row <= shape.length - patternRows; row++) {
      for (let col = 0; col <= shape[0].length - patternCols; col++) {
        let matched = true;

        for (let pr = 0; pr < patternRows; pr++) {
          for (let pc = 0; pc < patternCols; pc++) {
            if (!!shape[row + pr][col + pc] !== !!pattern[pr][pc]) {
              matched = false;
              break;
            }
          }
          if (!matched) break;
        }

        if (matched && ((patternSum * pixelMargin) > shapeSum)) {
          return [row + Math.floor(patternRows / 2), col + Math.floor(patternCols / 2)];
        }
      }
    }
  }
  return null;
}

const BrushShapeCustomizer = () => {
  const {
    brushShape,
    customBrushShape,
    brushShapes,
  } = useSelector((state) => ({
    brushShape: state.gui.brushShape,
    customBrushShape: state.gui.customBrushShape,
    brushShapes: state.gui.brushShapes,
  }), shallowEqual);

  const dispatch = useDispatch();

  const handleShapeSelect = (shapeName) => {
    dispatch(setBrushShape(shapeName));
  };

  const handleCustomShapeChange = (row, col) => {
    const newShape = customBrushShape.map((r, rowIndex) =>
      r.map((cell, colIndex) => 
        rowIndex === row && colIndex === col ? !cell : cell
      )
    );
    let topLeftSelectedPixel = null;

    const match = brushShapeBlacklist(newShape);

    if (!!match) {
      const offendingElement = document.querySelector(`[name="brush-edit-${match[0]}-${match[1]}"`);
      offendingElement.setCustomValidity(`You can not use this shape!`);
      offendingElement.reportValidity();
      dispatch(setCustomBrushShape(
        [
          Array(5).fill(0),
          Array(5).fill(0),
          [0, 0, 1, 0, 0],
          Array(5).fill(0),
          Array(5).fill(0),
        ]
      ));
    } else {
      dispatch(setCustomBrushShape(newShape));
    }
  };

  const renderShapePreview = (shape, isSelected, shapeName) => (
    <div
      key={shapeName}
      className={`shape-preview ${isSelected ? 'selected' : ''}`}
      onClick={() => handleShapeSelect(shapeName)}
      style={{
        display: 'inline-block',
        margin: '4px',
        padding: '4px',
        border: isSelected ? '2px solid #007acc' : '1px solid #ccc',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#f0f8ff' : 'white',
      }}
    >
      <div style={{ fontSize: '10px', textAlign: 'center', marginBottom: '2px' }}>
        {shapeName.charAt(0).toUpperCase() + shapeName.slice(1)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 8px)', gap: '1px' }}>
        {shape.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: cell ? '#333' : '#eee',
                border: '1px solid #ddd',
              }}
            />
          ))
        )}
      </div>
    </div>
  );

  const renderCustomShapeEditor = () => (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '12px', marginBottom: '4px' }}>
        {t`Custom Shape Editor (Click to toggle)`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 16px)', gap: '2px' }}>
        {customBrushShape.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <input
              type='checkbox'
              name={`brush-edit-${rowIndex}-${colIndex}`}
              key={`${rowIndex}-${colIndex}`}
              onClick={() => handleCustomShapeChange(rowIndex, colIndex)}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                width: '16px',
                height: '16px',
                margin: '0',
                backgroundColor: cell ? '#333' : '#eee',
                border: '1px solid #ddd',
                cursor: 'pointer',
              }}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="setitem">
      <div className="setrow">
        <h3 className="settitle">{t`Brush Shape`}</h3>
      </div>
      <div className="modaldesc">
        {t`Choose a brush shape from the presets or create your own custom shape.`}
      </div>
      <div style={{ marginTop: '8px' }}>
        {Object.entries(brushShapes).map(([shapeName, shape]) =>
          renderShapePreview(shape, brushShape === shapeName, shapeName)
        )}
      </div>
      {brushShape === 'custom' && renderCustomShapeEditor()}
      <div className="modaldivider" />
    </div>
  );
};

export default React.memo(BrushShapeCustomizer); 