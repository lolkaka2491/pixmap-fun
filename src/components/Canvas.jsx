import React, { useRef, useState, useEffect } from 'react';

function Canvas() {
  const canvasRef = useRef();
  const [isDragging, setIsDragging] = useState(false);
  const [lastCoords, setLastCoords] = useState(null);
  const [currentCanvas, setCurrentCanvas] = useState(null);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    const coords = getCanvasCoords(e);
    setLastCoords(coords);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastCoords(null);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    const coords = getCanvasCoords(e);
    if (!lastCoords) {
      setLastCoords(coords);
      return;
    }

    // Calculate movement relative to last position
    const dx = coords.x - lastCoords.x;
    const dy = coords.y - lastCoords.y;
    
    // Update canvas position
    updateCanvasPosition(dx, dy);
    setLastCoords(coords);
  };

  const handleCanvasSwitch = (newCanvasId) => {
    // Reset coordinates when switching canvases
    setIsDragging(false);
    setLastCoords(null);
    setCurrentCanvas(newCanvasId);
    
    // Reset canvas position to center
    resetCanvasPosition();
  };

  // Handle keyboard canvas switching
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const canvasId = parseInt(e.key, 10);
        handleCanvasSwitch(canvasId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={canvasRef}
      className="canvas-container"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseUp}
    >
      {/* Canvas content */}
    </div>
  );
}

export default Canvas;