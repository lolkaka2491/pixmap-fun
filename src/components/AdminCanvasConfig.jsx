import React, { useState, useEffect } from 'react';

const AdminCanvasConfig = () => {
  const [canvases, setCanvases] = useState({});
  const [selectedCanvas, setSelectedCanvas] = useState('');
  const [config, setConfig] = useState({
    ident: '',
    size: 1024,
    bcd: 5000,
    cds: 60000,
    pcd: 0,
    colors: [[255, 255, 255], [0, 0, 0]],
    cli: 0,
    req: '',
    ranked: false,
    v: false,
    hid: false,
    sd: '',
    ed: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load canvas configurations on component mount
  useEffect(() => {
    loadCanvases();
  }, []);

  const loadCanvases = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('/api/modtools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          canvasconfig: true,
          action: 'get'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load canvases: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      setCanvases(data);
      
      // Select first canvas by default
      const firstCanvasId = Object.keys(data)[0];
      if (firstCanvasId) {
        setSelectedCanvas(firstCanvasId);
        setConfig(data[firstCanvasId]);
      }
    } catch (err) {
      setError(`Error loading canvases: ${err.message}`);
      console.error('Load canvases error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasSelect = (canvasId) => {
    setSelectedCanvas(canvasId);
    setConfig(canvases[canvasId] || {});
    setError('');
    setSuccess('');
  };

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
    setSuccess('');
  };

  const handleColorChange = (index, colorIndex, value) => {
    const newColors = [...config.colors];
    newColors[index] = [...newColors[index]];
    newColors[index][colorIndex] = Math.max(0, Math.min(255, parseInt(value) || 0));
    handleConfigChange('colors', newColors);
  };

  const addColor = () => {
    if (config.colors.length >= 256) {
      setError('Maximum 256 colors allowed');
      return;
    }
    handleConfigChange('colors', [...config.colors, [255, 255, 255]]);
  };

  const removeColor = (index) => {
    if (config.colors.length <= 1) {
      setError('At least one color is required');
      return;
    }
    const newColors = config.colors.filter((_, i) => i !== index);
    handleConfigChange('colors', newColors);
  };

  const validateConfig = () => {
    const errors = [];
    
    if (!config.ident || config.ident.length === 0 || config.ident.length > 2) {
      errors.push('Canvas identifier must be 1-2 characters');
    }
    
    if (!config.size || config.size < 256 || config.size > 65536) {
      errors.push('Canvas size must be between 256 and 65536');
    }
    
    if ((config.size & (config.size - 1)) !== 0) {
      errors.push('Canvas size must be a power of 2');
    }
    
    if (!config.bcd || config.bcd < 0) {
      errors.push('Base cooldown must be positive');
    }
    
    if (!config.cds || config.cds < 0) {
      errors.push('Cooldown stack time must be positive');
    }
    
    if (!config.colors || config.colors.length === 0) {
      errors.push('At least one color is required');
    }
    
    return errors;
  };

  const saveConfig = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      // Client-side validation
      const validationErrors = validateConfig();
      if (validationErrors.length > 0) {
        setError(`Validation failed: ${validationErrors.join(', ')}`);
        return;
      }
      
      // Confirm dangerous operation
      if (!window.confirm(`Are you sure you want to update canvas ${selectedCanvas} configuration? This will affect all users immediately.`)) {
        return;
      }
      
      const response = await fetch('/api/modtools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          canvasconfig: true,
          action: 'update',
          canvasId: selectedCanvas,
          config: config
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save configuration: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      setSuccess(`Configuration saved successfully! Backup created at: ${result.backupPath}`);
      
      // Reload canvases to get updated data
      await loadCanvases();
      
    } catch (err) {
      setError(`Error saving configuration: ${err.message}`);
      console.error('Save config error:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportConfig = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `canvas_${selectedCanvas}_config.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className="admin-canvas-config">
      <h2>Canvas Configuration Management</h2>
      
      {error && (
        <div className="error-message" style={{ color: 'red', marginBottom: '10px', padding: '10px', border: '1px solid red', borderRadius: '4px' }}>
          {error}
        </div>
      )}
      
      {success && (
        <div className="success-message" style={{ color: 'green', marginBottom: '10px', padding: '10px', border: '1px solid green', borderRadius: '4px' }}>
          {success}
        </div>
      )}

      <div className="canvas-selector" style={{ marginBottom: '20px' }}>
        <label htmlFor="canvas-select">Select Canvas:</label>
        <select 
          id="canvas-select"
          value={selectedCanvas} 
          onChange={(e) => handleCanvasSelect(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a canvas...</option>
          {Object.keys(canvases).map(canvasId => (
            <option key={canvasId} value={canvasId}>
              Canvas {canvasId} ({canvases[canvasId]?.ident || 'Unknown'})
            </option>
          ))}
        </select>
      </div>

      {selectedCanvas && (
        <div className="config-form">
          <div className="basic-config" style={{ marginBottom: '20px' }}>
            <h3>Basic Configuration</h3>
            
            <div className="form-row">
              <label>Canvas Identifier:</label>
              <input
                type="text"
                value={config.ident || ''}
                onChange={(e) => handleConfigChange('ident', e.target.value)}
                maxLength={2}
                placeholder="e.g., 'p', 'c'"
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <label>Canvas Size:</label>
              <select
                value={config.size || 1024}
                onChange={(e) => handleConfigChange('size', parseInt(e.target.value))}
                disabled={loading}
              >
                <option value={256}>256x256</option>
                <option value={512}>512x512</option>
                <option value={1024}>1024x1024</option>
                <option value={2048}>2048x2048</option>
                <option value={4096}>4096x4096</option>
                <option value={8192}>8192x8192</option>
                <option value={16384}>16384x16384</option>
                <option value={32768}>32768x32768</option>
                <option value={65536}>65536x65536</option>
              </select>
            </div>

            <div className="form-row">
              <label>Base Cooldown (ms):</label>
              <input
                type="number"
                value={config.bcd || 5000}
                onChange={(e) => handleConfigChange('bcd', parseInt(e.target.value))}
                min={0}
                max={86400000}
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <label>Cooldown Stack Time (ms):</label>
              <input
                type="number"
                value={config.cds || 60000}
                onChange={(e) => handleConfigChange('cds', parseInt(e.target.value))}
                min={0}
                max={86400000}
                disabled={loading}
              />
            </div>
          </div>

          <div className="advanced-config" style={{ marginBottom: '20px' }}>
            <h3>Advanced Configuration</h3>
            
            <div className="form-row">
              <label>Placed Pixel Cooldown (ms):</label>
              <input
                type="number"
                value={config.pcd || 0}
                onChange={(e) => handleConfigChange('pcd', parseInt(e.target.value))}
                min={0}
                max={86400000}
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <label>Colors to Ignore:</label>
              <input
                type="number"
                value={config.cli || 0}
                onChange={(e) => handleConfigChange('cli', parseInt(e.target.value))}
                min={0}
                max={config.colors?.length || 0}
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <label>Requirement:</label>
              <input
                type="text"
                value={config.req || ''}
                onChange={(e) => handleConfigChange('req', e.target.value)}
                placeholder="e.g., 'verified' or pixel count"
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <label>
                <input
                  type="checkbox"
                  checked={config.ranked || false}
                  onChange={(e) => handleConfigChange('ranked', e.target.checked)}
                  disabled={loading}
                />
                Ranked Canvas
              </label>
            </div>

            <div className="form-row">
              <label>
                <input
                  type="checkbox"
                  checked={config.v || false}
                  onChange={(e) => handleConfigChange('v', e.target.checked)}
                  disabled={loading}
                />
                3D Canvas
              </label>
            </div>

            <div className="form-row">
              <label>
                <input
                  type="checkbox"
                  checked={config.hid || false}
                  onChange={(e) => handleConfigChange('hid', e.target.checked)}
                  disabled={loading}
                />
                Hidden Canvas
              </label>
            </div>

            <div className="form-row">
              <label>Start Date (YYYY-MM-DD):</label>
              <input
                type="date"
                value={config.sd || ''}
                onChange={(e) => handleConfigChange('sd', e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <label>End Date (YYYY-MM-DD):</label>
              <input
                type="date"
                value={config.ed || ''}
                onChange={(e) => handleConfigChange('ed', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="color-palette" style={{ marginBottom: '20px' }}>
            <h3>Color Palette</h3>
            <div className="colors-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {config.colors?.map((color, index) => (
                <div key={index} className="color-item" style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '4px' }}>
                  <div className="color-preview" style={{ 
                    width: '50px', 
                    height: '50px', 
                    backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                    border: '1px solid #000',
                    marginBottom: '5px'
                  }}></div>
                  <div className="color-inputs">
                    <input
                      type="number"
                      value={color[0]}
                      onChange={(e) => handleColorChange(index, 0, e.target.value)}
                      min={0}
                      max={255}
                      placeholder="R"
                      style={{ width: '50px', marginRight: '5px' }}
                      disabled={loading}
                    />
                    <input
                      type="number"
                      value={color[1]}
                      onChange={(e) => handleColorChange(index, 1, e.target.value)}
                      min={0}
                      max={255}
                      placeholder="G"
                      style={{ width: '50px', marginRight: '5px' }}
                      disabled={loading}
                    />
                    <input
                      type="number"
                      value={color[2]}
                      onChange={(e) => handleColorChange(index, 2, e.target.value)}
                      min={0}
                      max={255}
                      placeholder="B"
                      style={{ width: '50px', marginRight: '5px' }}
                      disabled={loading}
                    />
                    <button 
                      onClick={() => removeColor(index)}
                      style={{ backgroundColor: 'red', color: 'white', border: 'none', padding: '2px 5px', borderRadius: '2px' }}
                      disabled={loading || config.colors.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={addColor}
              style={{ marginTop: '10px', padding: '5px 10px', backgroundColor: 'green', color: 'white', border: 'none', borderRadius: '4px' }}
              disabled={loading || config.colors?.length >= 256}
            >
              Add Color
            </button>
          </div>

          <div className="actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button 
              onClick={saveConfig}
              disabled={loading}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: loading ? '#ccc' : '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
            
            <button 
              onClick={exportConfig}
              disabled={loading}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: loading ? '#ccc' : '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Export Configuration
            </button>
            
            <button 
              onClick={loadCanvases}
              disabled={loading}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: loading ? '#ccc' : '#6c757d', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Loading...' : 'Reload Canvases'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCanvasConfig; 