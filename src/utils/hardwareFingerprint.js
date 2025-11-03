/*
 * Client-side Hardware Fingerprinting
 * Collects comprehensive hardware information for anti-fraud detection
 */

class HardwareFingerprinter {
  constructor() {
    this.fingerprint = {};
    this.canvas = null;
    this.audioContext = null;
  }

  /**
   * Generate comprehensive hardware fingerprint
   */
  async generateFingerprint() {
    try {
      this.fingerprint = {
        // Basic browser info
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        onLine: navigator.onLine,
        
        // Screen and display
        screen: this.getScreenInfo(),
        window: this.getWindowInfo(),
        
        // Time and timezone
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        
        // Hardware capabilities
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints,
        
        // WebGL capabilities
        webgl: await this.getWebGLInfo(),
        
        // Canvas fingerprinting
        canvas: await this.getCanvasFingerprint(),
        
        // Audio fingerprinting
        audio: await this.getAudioFingerprint(),
        
        // Font detection
        fonts: await this.getFontList(),
        
        // Plugin information
        plugins: this.getPluginInfo(),
        
        // Connection info
        connection: this.getConnectionInfo(),
        
        // Battery info (if available)
        battery: await this.getBatteryInfo(),
        
        // Performance timing
        performance: this.getPerformanceInfo(),
        
        // Generated timestamp
        timestamp: Date.now()
      };

      return this.fingerprint;
    } catch (error) {
      console.error('Error generating hardware fingerprint:', error);
      return null;
    }
  }

  /**
   * Get screen information
   */
  getScreenInfo() {
    return {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      orientation: screen.orientation ? screen.orientation.type : 'unknown'
    };
  }

  /**
   * Get window information
   */
  getWindowInfo() {
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  /**
   * Get WebGL information
   */
  async getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        return { available: false };
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      
      return {
        available: true,
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
        maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
        maxVertexTextureImageUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
        maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        extensions: gl.getSupportedExtensions(),
        debugVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
        debugRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  /**
   * Generate canvas fingerprint
   */
  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size
      canvas.width = 200;
      canvas.height = 200;
      
      // Draw various shapes and text
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Hardware fingerprinting test', 2, 2);
      
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillRect(100, 5, 80, 20);
      
      ctx.fillStyle = 'rgba(204, 0, 0, 0.7)';
      ctx.fillRect(20, 40, 60, 20);
      
      ctx.fillStyle = 'rgba(0, 0, 204, 0.7)';
      ctx.fillRect(120, 40, 60, 20);
      
      // Draw complex shapes
      ctx.beginPath();
      ctx.moveTo(50, 100);
      ctx.lineTo(100, 50);
      ctx.lineTo(150, 100);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 0, 255, 0.7)';
      ctx.fill();
      
      // Draw gradients
      const gradient = ctx.createLinearGradient(0, 0, 200, 200);
      gradient.addColorStop(0, 'rgba(255, 255, 0, 0.5)');
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0.5)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 150, 200, 50);
      
      // Get image data and hash it
      const imageData = ctx.getImageData(0, 0, 200, 200);
      const hash = this.hashImageData(imageData.data);
      
      return {
        hash: hash,
        width: canvas.width,
        height: canvas.height,
        dataURL: canvas.toDataURL()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Generate audio fingerprint
   */
  async getAudioFingerprint() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      
      // Hash the frequency data
      const hash = this.hashArray(frequencyData);
      
      // Cleanup
      oscillator.disconnect();
      analyser.disconnect();
      gainNode.disconnect();
      
      return {
        hash: hash,
        sampleRate: audioContext.sampleRate,
        maxChannelCount: audioContext.destination.maxChannelCount
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get font list
   */
  async getFontList() {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    context.font = testSize + ' ' + baseFonts[0];
    const baseWidth = context.measureText(testString).width;
    
    const fonts = [
      'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Console',
      'Tahoma', 'Geneva', 'Lucida Sans Unicode', 'Franklin Gothic Medium',
      'Arial Narrow', 'Brush Script MT', 'Lucida Handwriting',
      'Copperplate', 'Papyrus', 'Chalkboard', 'Marker Felt', 'Trattatello'
    ];
    
    const detectedFonts = [];
    
    for (const font of fonts) {
      context.font = testSize + ' ' + font;
      const width = context.measureText(testString).width;
      if (width !== baseWidth) {
        detectedFonts.push(font);
      }
    }
    
    return detectedFonts;
  }

  /**
   * Get plugin information
   */
  getPluginInfo() {
    const plugins = [];
    
    if (navigator.plugins) {
      for (let i = 0; i < navigator.plugins.length; i++) {
        const plugin = navigator.plugins[i];
        plugins.push({
          name: plugin.name,
          description: plugin.description,
          filename: plugin.filename,
          length: plugin.length
        });
      }
    }
    
    return plugins;
  }

  /**
   * Get connection information
   */
  getConnectionInfo() {
    if (navigator.connection) {
      return {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      };
    }
    
    return { available: false };
  }

  /**
   * Get battery information
   */
  async getBatteryInfo() {
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        return {
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
          level: battery.level
        };
      }
      return { available: false };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  /**
   * Get performance information
   */
  getPerformanceInfo() {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      return {
        navigationStart: timing.navigationStart,
        loadEventEnd: timing.loadEventEnd,
        domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
        responseEnd: timing.responseEnd,
        requestStart: timing.requestStart,
        domainLookupEnd: timing.domainLookupEnd,
        domainLookupStart: timing.domainLookupStart,
        connectEnd: timing.connectEnd,
        connectStart: timing.connectStart
      };
    }
    return { available: false };
  }

  /**
   * Hash image data
   */
  hashImageData(data) {
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) {
      hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
      hash = ((hash << 5) - hash + data[i + 1]) & 0xffffffff;
      hash = ((hash << 5) - hash + data[i + 2]) & 0xffffffff;
      hash = ((hash << 5) - hash + data[i + 3]) & 0xffffffff;
    }
    return hash.toString(16);
  }

  /**
   * Hash array data
   */
  hashArray(array) {
    let hash = 0;
    for (let i = 0; i < array.length; i++) {
      hash = ((hash << 5) - hash + array[i]) & 0xffffffff;
    }
    return hash.toString(16);
  }

  /**
   * Get fingerprint as JSON string
   */
  getFingerprintString() {
    return JSON.stringify(this.fingerprint);
  }

  /**
   * Get fingerprint hash
   */
  getFingerprintHash() {
    const str = this.getFingerprintString();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) & 0xffffffff;
    }
    return hash.toString(16);
  }
}

export default HardwareFingerprinter;
