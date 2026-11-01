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

export function loadBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    const parsed = JSON.parse(raw);
    const storedBindings = parsed.bindings || parsed;
    const validated: KeyBindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

    (Object.keys(DEFAULT_BINDINGS) as ActionName[]).forEach((action) => {
      if (Array.isArray(storedBindings[action]) && storedBindings[action].length > 0) {
        validated[action] = storedBindings[action].filter((c: any) => typeof c === 'string' && c.length > 0).slice(0, 2);
      }
    });
    return validated;
  } catch (err) {
    console.warn('Failed to load keybindings from localStorage:', err);
    return JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  }
}

export function loadSettings(): GameSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
        mouseSensitivity: DEFAULT_MOUSE_SETTINGS.mouseSensitivity,
        invertY: DEFAULT_MOUSE_SETTINGS.invertY
      };
    }
    const parsed = JSON.parse(raw);
    const bindings = loadBindings();
    const mouseSensitivity = typeof parsed.mouseSensitivity === 'number' && parsed.mouseSensitivity >= 0.5 && parsed.mouseSensitivity <= 2.0
      ? parsed.mouseSensitivity
      : DEFAULT_MOUSE_SETTINGS.mouseSensitivity;
    const invertY = typeof parsed.invertY === 'boolean' ? parsed.invertY : DEFAULT_MOUSE_SETTINGS.invertY;

    return { bindings, mouseSensitivity, invertY };
  } catch (err) {
    console.warn('Failed to load settings from localStorage:', err);
    return {
      bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
      mouseSensitivity: DEFAULT_MOUSE_SETTINGS.mouseSensitivity,
      invertY: DEFAULT_MOUSE_SETTINGS.invertY
    };
  }
}

export function saveBindings(bindings: KeyBindings, mouseSettings?: Partial<MouseSettings>): void {
  try {
    const current = loadSettings();
    const toSave: GameSettingsData = {
      bindings,
      mouseSensitivity: mouseSettings?.mouseSensitivity ?? current.mouseSensitivity,
      invertY: mouseSettings?.invertY ?? current.invertY
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn('Failed to save keybindings to localStorage:', err);
  }
}

export function resetBindings(): KeyBindings {
  const def = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
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
 * Given a KeyboardEvent.code and the current bindings, returns the matching ActionName if bound.
 */
export function actionForCode(code: string, bindings?: KeyBindings): ActionName | null {
  const b = bindings || loadBindings();
  for (const [action, keys] of Object.entries(b) as [ActionName, string[]][]) {
    if (keys.includes(code)) {
      return action;
    }
  }
  return null;
}
