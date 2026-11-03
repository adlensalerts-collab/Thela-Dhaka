export type ActionName =
  | 'forward'
  | 'backward'
  | 'turnLeft'
  | 'turnRight'
  | 'sell'
  | 'sprint'
  | 'restock'
  | 'upgrade'
  | 'upgradeStamina'
  | 'changeView'
  | 'placeStall'
  | 'repair'
  | 'pause';

export type KeyBindings = Record<ActionName, string[]>;

export interface MouseSettings {
  mouseSensitivity: number; // 0.5 to 2.0, default 1.0
  invertY: boolean; // default false
}

export interface GameSettingsData {
  bindings: KeyBindings;
  mouseSensitivity: number;
  invertY: boolean;
}

export const DEFAULT_BINDINGS: KeyBindings = {
  forward: ['ArrowUp', 'KeyW'],
  backward: ['ArrowDown', 'KeyS'],
  turnLeft: ['ArrowLeft', 'KeyA'],
  turnRight: ['ArrowRight', 'KeyD'],
  sell: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  restock: ['KeyR'],
  upgrade: ['KeyU'],
  upgradeStamina: ['KeyT'],
  changeView: ['KeyC'],
  placeStall: ['KeyB'],
  repair: ['KeyF'],
  pause: ['Escape']
};

export const DEFAULT_MOUSE_SETTINGS: MouseSettings = {
  mouseSensitivity: 1.0,
  invertY: false
};

const STORAGE_KEY = 'thela_keybindings_v1';

export const ACTION_METADATA: Record<ActionName, { label: string; bnLabel: string; isHold: boolean }> = {
  forward: { label: 'Move Forward', bnLabel: 'সামনে এগোন', isHold: true },
  backward: { label: 'Move Backward (Reverse)', bnLabel: 'পেছনে যান', isHold: true },
  turnLeft: { label: 'Turn Left', bnLabel: 'বামে ঘোরান', isHold: true },
  turnRight: { label: 'Turn Right', bnLabel: 'ডানে ঘোরান', isHold: true },
  sell: { label: 'Sell / Arrest', bnLabel: 'বেচাকেনা / আটক', isHold: false },
  sprint: { label: 'Sprint (Hold)', bnLabel: 'দৌড়ান (ধরে রাখুন)', isHold: true },
  restock: { label: 'Restock Cart', bnLabel: 'পণ্য রিস্টক', isHold: false },
  upgrade: { label: 'Upgrade Cart', bnLabel: 'গাড়ি আপগ্রেড', isHold: false },
  upgradeStamina: { label: 'Upgrade Stamina', bnLabel: 'স্ট্যামিনা আপগ্রেড', isHold: false },
  changeView: { label: 'Change Camera View', bnLabel: 'ক্যামেরা পরিবর্তন', isHold: false },
  placeStall: { label: 'Place Food Stall', bnLabel: 'বড় দোকান বসান', isHold: false },
  repair: { label: 'Repair Vehicle', bnLabel: 'মেরামত করুন', isHold: false },
  pause: { label: 'Pause Game', bnLabel: 'খেলা থামান', isHold: false }
};

export function formatCode(code: string | undefined): string {
  if (!code) return '—';
  if (code === 'Space') return 'Space';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'Escape') return 'Esc';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

let memorySettings: GameSettingsData | null = null;

function cloneDefaultBindings(): KeyBindings {
  return JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
}

export function loadBindings(): KeyBindings {
  const fallback = memorySettings
    ? JSON.parse(JSON.stringify(memorySettings.bindings))
    : cloneDefaultBindings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const storedBindings = parsed.bindings || parsed;
    const validated: KeyBindings = cloneDefaultBindings();

    (Object.keys(DEFAULT_BINDINGS) as ActionName[]).forEach((action) => {
      if (Array.isArray(storedBindings[action]) && storedBindings[action].length > 0) {
        validated[action] = storedBindings[action]
          .filter((c: any) => typeof c === 'string' && c.length > 0)
          .slice(0, 2);
      }
    });
    return validated;
  } catch (err) {
    console.warn('Failed to load keybindings from localStorage:', err);
    return fallback;
  }
}

export function loadSettings(): GameSettingsData {
  const fallback: GameSettingsData = memorySettings
    ? {
        bindings: JSON.parse(JSON.stringify(memorySettings.bindings)),
        mouseSensitivity: memorySettings.mouseSensitivity,
        invertY: memorySettings.invertY
      }
    : {
        bindings: cloneDefaultBindings(),
        mouseSensitivity: DEFAULT_MOUSE_SETTINGS.mouseSensitivity,
        invertY: DEFAULT_MOUSE_SETTINGS.invertY
      };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memorySettings = fallback;
      return fallback;
    }
    const parsed = JSON.parse(raw);
    const bindings = loadBindings();
    const mouseSensitivity =
      typeof parsed.mouseSensitivity === 'number' &&
      parsed.mouseSensitivity >= 0.5 &&
      parsed.mouseSensitivity <= 2.0
        ? parsed.mouseSensitivity
        : fallback.mouseSensitivity;
    const invertY =
      typeof parsed.invertY === 'boolean' ? parsed.invertY : fallback.invertY;

    const loaded: GameSettingsData = { bindings, mouseSensitivity, invertY };
    memorySettings = {
      bindings: JSON.parse(JSON.stringify(bindings)),
      mouseSensitivity,
      invertY
    };
    return loaded;
  } catch (err) {
    console.warn('Failed to load settings from localStorage:', err);
    return fallback;
  }
}

export function saveBindings(bindings: KeyBindings, mouseSettings?: Partial<MouseSettings>): void {
  const current = loadSettings();
  const toSave: GameSettingsData = {
    bindings: JSON.parse(JSON.stringify(bindings)),
    mouseSensitivity: mouseSettings?.mouseSensitivity ?? current.mouseSensitivity,
    invertY: mouseSettings?.invertY ?? current.invertY
  };
  memorySettings = {
    bindings: JSON.parse(JSON.stringify(toSave.bindings)),
    mouseSensitivity: toSave.mouseSensitivity,
    invertY: toSave.invertY
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn('Failed to save keybindings to localStorage:', err);
  }
}

export function resetBindings(): KeyBindings {
  const def = cloneDefaultBindings();
  saveBindings(def, DEFAULT_MOUSE_SETTINGS);
  return def;
}

/**
 * Assigns a key code to an action at a specific slot (0 or 1).
 * If the key is already used by another action, it is removed from that action.
 */
export function assignKey(
  bindings: KeyBindings,
  action: ActionName,
  slotIndex: number,
  newCode: string
): KeyBindings {
  const updated: KeyBindings = JSON.parse(JSON.stringify(bindings));

  // Remove this code from any other action to prevent duplicate/conflicting bindings
  (Object.keys(updated) as ActionName[]).forEach((act) => {
    updated[act] = updated[act].filter((c) => c !== newCode);
  });

  // Assign to target action at slot
  if (!updated[action]) {
    updated[action] = [];
  }
  if (slotIndex === 0) {
    updated[action][0] = newCode;
  } else {
    // Slot 1
    if (updated[action].length === 0) {
      updated[action][0] = newCode;
    } else {
      updated[action][1] = newCode;
    }
  }

  // Filter out any empties and cap at 2
  updated[action] = updated[action].filter(Boolean).slice(0, 2);

  return updated;
}

/**
 * Maps a KeyboardEvent.key value to a canonical KeyboardEvent.code fallback
 * when e.code is missing or remapped by keyboard layout/environment.
 */
export function keyToFallbackCode(key: string | undefined): string | null {
  if (!key) return null;
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key === 'ArrowUp' || key === 'Up') return 'ArrowUp';
  if (key === 'ArrowDown' || key === 'Down') return 'ArrowDown';
  if (key === 'ArrowLeft' || key === 'Left') return 'ArrowLeft';
  if (key === 'ArrowRight' || key === 'Right') return 'ArrowRight';
  if (key === 'Shift') return 'ShiftLeft';
  if (key === 'Escape' || key === 'Esc') return 'Escape';
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return `Key${upper}`;
    if (upper >= '0' && upper <= '9') return `Digit${upper}`;
  }
  return null;
}

/**
 * Given a KeyboardEvent.code and the current bindings, returns the matching ActionName if bound.
 */
export function actionForCode(code: string, bindings?: KeyBindings): ActionName | null {
  if (!code) return null;
  const b = bindings || loadBindings();
  for (const [action, keys] of Object.entries(b) as [ActionName, string[]][]) {
    if (Array.isArray(keys) && keys.includes(code)) {
      return action;
    }
  }
  return null;
}

/**
 * Resolves a KeyboardEvent (using both e.code and e.key fallback) to its bound ActionName.
 */
export function actionForEvent(
  e: { code?: string; key?: string },
  bindings?: KeyBindings
): ActionName | null {
  const b = bindings || loadBindings();
  if (e.code) {
    const byCode = actionForCode(e.code, b);
    if (byCode) return byCode;
  }
  const fallbackCode = keyToFallbackCode(e.key);
  if (fallbackCode) {
    const byKey = actionForCode(fallbackCode, b);
    if (byKey) return byKey;
    if (fallbackCode === 'ShiftLeft') {
      const byRightShift = actionForCode('ShiftRight', b);
      if (byRightShift) return byRightShift;
    }
  }
  return null;
}

