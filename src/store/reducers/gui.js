import { HOLD_PAINT } from '../../core/constants';

// Predefined brush shapes (5x5 grid, true = painted pixel)
const PREDEFINED_SHAPES = {
  square: [
    [true, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
  ],
  circle: [
    [false, false, true, false, false],
    [false, true, true, true, false],
    [true, true, true, true, true],
    [false, true, true, true, false],
    [false, false, true, false, false],
  ],
  diamond: [
    [false, false, true, false, false],
    [false, true, false, true, false],
    [true, false, false, false, true],
    [false, true, false, true, false],
    [false, false, true, false, false],
  ],
  cross: [
    [false, false, true, false, false],
    [false, false, true, false, false],
    [true, true, true, true, true],
    [false, false, true, false, false],
    [false, false, true, false, false],
  ],
  custom: [
    [false, false, true, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
    [false, false, false, false, false],
  ],
};

const initialState = {
  showGrid: false,
  showPixelNotify: false,
  showMvmCtrls: false,
  autoZoomIn: false,
  isPotato: false,
  isLightGrid: false,
  compactPalette: false,
  paletteOpen: true,
  mute: false,
  chatNotify: true,
  chatHistoryLength: 50, // Default to 50 messages
  // top-left button menu
  menuOpen: false,
  // show online users per canvas instead of total
  onlineCanvas: false,
  // selected theme
  style: 'default',
  // properties that aren't saved
  holdPaint: HOLD_PAINT.OFF,
  easterEgg: false,
  moveU: 0,
  moveV: 0,
  moveW: 0,
  brushSize: 1, // Default brush size is 1x1
  brushUnlocked: false, // Track if large brush is unlocked in this tab
  // brush shape customization
  brushShape: 'square', // Current selected brush shape
  customBrushShape: PREDEFINED_SHAPES.custom, // User's custom 5x5 shape
  brushShapes: PREDEFINED_SHAPES, // All available shapes
  // zoom settings
  legacyZoom: true, // Whether to use legacy zoom behavior (true = legacy is default)
};


export default function gui(
  state = initialState,
  action,
) {
  switch (action.type) {
    case 's/TGL_GRID': {
      return {
        ...state,
        showGrid: !state.showGrid,
      };
    }

    case 's/TGL_PXL_NOTIFY': {
      return {
        ...state,
        showPixelNotify: !state.showPixelNotify,
      };
    }

    case 's/TGL_MVM_CTRLS': {
      return {
        ...state,
        showMvmCtrls: !state.showMvmCtrls,
      };
    }

    case 's/TGL_AUTO_ZOOM_IN': {
      return {
        ...state,
        autoZoomIn: !state.autoZoomIn,
      };
    }

    case 's/TGL_ONLINE_CANVAS': {
      return {
        ...state,
        onlineCanvas: !state.onlineCanvas,
      };
    }

    case 's/TGL_POTATO_MODE': {
      return {
        ...state,
        isPotato: !state.isPotato,
      };
    }

    case 's/TGL_LIGHT_GRID': {
      return {
        ...state,
        isLightGrid: !state.isLightGrid,
      };
    }

    case 's/TGL_COMPACT_PALETTE': {
      return {
        ...state,
        compactPalette: !state.compactPalette,
      };
    }

    case 's/TGL_OPEN_PALETTE': {
      return {
        ...state,
        paletteOpen: !state.paletteOpen,
      };
    }

    case 's/TGL_OPEN_MENU': {
      return {
        ...state,
        menuOpen: !state.menuOpen,
      };
    }

    case 's/TGL_MUTE':
      return {
        ...state,
        mute: !state.mute,
      };

    case 's/TGL_CHAT_NOTIFY':
      return {
        ...state,
        chatNotify: !state.chatNotify,
      };

    case 's/TGL_EASTER_EGG': {
      return {
        ...state,
        easterEgg: !state.easterEgg,
      };
    }

    case 's/SELECT_HOLD_PAINT': {
      return {
        ...state,
        holdPaint: action.value,
      };
    }

    case 's/SELECT_STYLE': {
      const { style } = action;
      return {
        ...state,
        style,
      };
    }

    case 'SELECT_COLOR': {
      const {
        compactPalette,
      } = state;
      let {
        paletteOpen,
      } = state;
      if (compactPalette || window.innerWidth < 300) {
        paletteOpen = false;
      }
      return {
        ...state,
        paletteOpen,
      };
    }

    case 's/SET_MOVE_U': {
      const { value } = action;
      const moveU = value;
      return {
        ...state,
        moveU,
      };
    }

    case 's/SET_MOVE_V': {
      const { value } = action;
      const moveV = value;
      return {
        ...state,
        moveV,
      };
    }

    case 's/SET_MOVE_W': {
      const { value } = action;
      const moveW = value;
      return {
        ...state,
        moveW,
      };
    }

    case 's/CANCEL_MOVE': {
      return {
        ...state,
        moveU: 0,
        moveV: 0,
        moveW: 0,
      };
    }

    case 's/SET_CHAT_HISTORY_LENGTH': {
      const { length } = action;
      return {
        ...state,
        chatHistoryLength: Math.min(200, Math.max(1, length)),
      };
    }

    case 'persist/REHYDRATE':
      return {
        ...state,
        easterEgg: false,
        holdPaint: HOLD_PAINT.OFF,
        moveU: 0,
        moveV: 0,
        moveW: 0,
      };


    case 's/SET_BRUSH_UNLOCKED': {
      return {
        ...state,
        brushUnlocked: action.value,
      };
    }

    case 's/SET_BRUSH_SIZE': {
      const { size, userlvl } = action;
      let maxBrush = 5;
      if (userlvl === 1 || userlvl === 2) {
        maxBrush = 11;
      }
      return {
        ...state,
        brushSize: Math.max(1, Math.min(maxBrush, size)),
      };
    }

    case 's/TGL_LEGACY_ZOOM': {
      return {
        ...state,
        legacyZoom: !state.legacyZoom,
      };
    }

    case 's/SET_BRUSH_SHAPE': {
      return {
        ...state,
        brushShape: action.shape,
      };
    }

    case 's/SET_CUSTOM_BRUSH_SHAPE': {
      return {
        ...state,
        customBrushShape: action.shape,
        brushShapes: {
          ...state.brushShapes,
          custom: action.shape,
        },
      };
    }

    default:
      return state;
  }
}
