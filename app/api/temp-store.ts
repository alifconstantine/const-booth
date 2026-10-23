interface TempImageItem {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

interface BoothStateItem {
  outputMode: string;
  stripStyle?: string;
  template?: any;
  cardLayout?: string;
  photoCount?: number;
  updatedAt: number;
}

// Global declarations to persist across hot reloads in development
const globalForStore = globalThis as unknown as {
  _tempImageStore?: Map<string, TempImageItem>;
  _boothStateStore?: Map<string, BoothStateItem>;
};

export const tempImageStore = globalForStore._tempImageStore || new Map<string, TempImageItem>();
export const boothStateStore = globalForStore._boothStateStore || new Map<string, BoothStateItem>();

if (process.env.NODE_ENV !== 'production') {
  globalForStore._tempImageStore = tempImageStore;
  globalForStore._boothStateStore = boothStateStore;
}

export function saveTempImage(
  id: string,
  buffer: Buffer,
  contentType: string,
  ttlMs: number = 15 * 60 * 1000
) {
  cleanupExpiredImages();
  tempImageStore.set(id.toLowerCase(), {
    buffer,
    contentType,
    expiresAt: Date.now() + ttlMs
  });
}

export function getTempImage(id: string): TempImageItem | null {
  cleanupExpiredImages();
  const item = tempImageStore.get(id.toLowerCase());
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    tempImageStore.delete(id.toLowerCase());
    return null;
  }
  return item;
}

function cleanupExpiredImages() {
  const now = Date.now();
  for (const [id, item] of tempImageStore.entries()) {
    if (now > item.expiresAt) {
      tempImageStore.delete(id);
    }
  }
}

export function saveBoothState(
  boothId: string,
  state: {
    outputMode?: string;
    stripStyle?: string;
    template?: any;
    cardLayout?: string;
    photoCount?: number;
  }
) {
  const key = boothId.toUpperCase().trim();
  const existing = boothStateStore.get(key) || {
    outputMode: 'strip',
    updatedAt: Date.now()
  };

  boothStateStore.set(key, {
    ...existing,
    ...state,
    outputMode: state.outputMode || existing.outputMode || 'strip',
    updatedAt: Date.now()
  });
}

export function getBoothState(boothId: string): BoothStateItem | null {
  return boothStateStore.get(boothId.toUpperCase().trim()) || null;
}
