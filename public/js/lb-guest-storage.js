

(function (window) {
  'use strict';

  const DB_NAME = 'lensbooth_guest_db';
  
  
  const DB_VERSION = 2;
  const STORE_NAME = 'guest_strips';

  
  
  const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  let dbPromise = null;
  let isIndexedDBAvailable = true;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        isIndexedDBAvailable = false;
        return resolve(null);
      }

      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = function (e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'local_strip_id' });
            store.createIndex('migration_status', 'migration_status', { unique: false });
            store.createIndex('created_at', 'created_at', { unique: false });
          }
        };

        req.onsuccess = function (e) {
          resolve(e.target.result);
        };

        req.onerror = function (e) {
          console.warn('[LBGuestStorage] IndexedDB open error:', e.target.error);
          isIndexedDBAvailable = false;
          resolve(null);
        };

        req.onblocked = function () {
          console.warn('[LBGuestStorage] IndexedDB open blocked');
          resolve(null);
        };
      } catch (err) {
        console.warn('[LBGuestStorage] IndexedDB initialization failed:', err);
        isIndexedDBAvailable = false;
        resolve(null);
      }
    });

    return dbPromise;
  }

  
  function fallbackHash(str) {
    
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = ((h1 ^ c) * 0x01000193) >>> 0;
      h2 = ((h2 ^ (c + i)) * 0x85ebca6b) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') +
            str.length.toString(16)).slice(0, 32);
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(digest);
    let out = '';
    for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
    return out;
  }

  
  let lastHashInput = null;
  let lastHashValue = null;

  
  async function contentId(image) {
    if (typeof image === 'string' && image === lastHashInput) return lastHashValue;

    let hex = null;
    try {
      if (window.crypto && crypto.subtle) {
        if (image instanceof Blob) {
          hex = await sha256Hex(new Uint8Array(await image.arrayBuffer()));
        } else {
          hex = await sha256Hex(new TextEncoder().encode(String(image)));
        }
      }
    } catch (_e) {
      hex = null;
    }

    if (!hex) {
      
      
      hex = (image instanceof Blob)
        ? fallbackHash('blob:' + image.size + ':' + image.type)
        : fallbackHash(String(image));
    }

    const id = 'lb-' + hex.slice(0, 32);
    if (typeof image === 'string') {
      lastHashInput = image;
      lastHashValue = id;
    }
    return id;
  }

  
  let channel = null;
  function notify(type, detail) {
    const payload = Object.assign({ type: type }, detail || {});

    
    try {
      window.dispatchEvent(new CustomEvent('lb-strips-changed', { detail: payload }));
    } catch (_e) {}

    
    try {
      if (!channel && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('lb-strips');
      }
      if (channel) channel.postMessage(payload);
    } catch (_e) {
      channel = null;
    }
  }

  
  function pruneSettled(store) {
    try {
      const cutoff = Date.now() - TOMBSTONE_TTL_MS;
      const req = store.getAll();
      req.onsuccess = function (e) {
        for (const row of (e.target.result || [])) {
          if (!row) continue;
          if (row.migration_status !== 'migrated' && row.migration_status !== 'deleted') continue;
          const settledAt = Date.parse(row.settled_at || row.migrated_at || row.created_at || '');
          if (Number.isFinite(settledAt) && settledAt < cutoff) {
            try { store.delete(row.local_strip_id); } catch (_e) {}
          }
        }
      };
    } catch (_e) {}
  }

  const LBGuestStorage = {
    isAvailable: function () {
      return isIndexedDBAvailable && Boolean(window.indexedDB);
    },

    
    contentId: contentId,

    
    saveGuestStrip: async function ({ id, image, thumbnail, style = 'classic', mode = 'strip', explicit = false }) {
      if (!image || (typeof image === 'string' && image.length < 500)) {
        
        return null;
      }

      const stripId = id || await contentId(image);

      const db = await openDB();
      if (!db) {
        
        try {
          sessionStorage.setItem('lb_latest_guest_strip', JSON.stringify({
            local_strip_id: stripId,
            style: String(style || 'classic'),
            mode: String(mode || 'strip'),
            created_at: new Date().toISOString(),
          }));
        } catch (_e) {}
        return { local_strip_id: stripId, image, thumbnail: thumbnail || null, style, mode };
      }

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);

          
          const getReq = store.get(stripId);

          getReq.onsuccess = function (e) {
            const existing = e.target.result || null;

            if (existing && existing.migration_status === 'deleted' && !explicit) {
              
              resolve(null);
              return;
            }

            if (existing && existing.migration_status === 'migrated') {
              
              resolve(existing);
              return;
            }

            const record = {
              local_strip_id: stripId,
              image: image,
              thumbnail: thumbnail || null,
              style: String(style || (existing ? existing.style : 'classic')),
              mode: String(mode || (existing ? existing.mode : 'strip')),
              created_at: (existing && existing.created_at) || new Date().toISOString(),
              migration_status: 'pending',
              
              migration_attempts: (existing && existing.migration_attempts) || 0,
              
              
              locked_at: (existing && existing.migration_status === 'in_progress')
                ? existing.locked_at
                : null,
              last_error: (existing && existing.last_error) || null,
              
              reinstate: !!(existing && existing.migration_status === 'deleted' && explicit),
            };
            if (existing && existing.migration_status === 'in_progress') {
              record.migration_status = 'in_progress';
            }

            const putReq = store.put(record);
            putReq.onsuccess = function () {
              notify('saved', { id: record.local_strip_id });
              resolve(record);
            };
            putReq.onerror = function (err) {
              console.warn('[LBGuestStorage] saveGuestStrip error:', err.target.error);
              resolve(record);
            };
          };

          getReq.onerror = function () {
            resolve(null);
          };
        } catch (err) {
          console.warn('[LBGuestStorage] Transaction failed:', err);
          resolve(null);
        }
      });
    },

    
    getPendingStrips: async function () {
      const db = await openDB();
      if (!db) return [];

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();

          req.onsuccess = function (e) {
            const all = e.target.result || [];
            const now = Date.now();
            const LOCK_TIMEOUT = 30 * 1000; 

            const pending = all.filter((item) => {
              if (!item) return false;
              
              if (item.migration_status === 'migrated') return false;
              if (item.migration_status === 'deleted') return false;
              
              if (!item.image) return false;
              if (item.migration_status === 'in_progress') {
                if (item.locked_at && now - item.locked_at < LOCK_TIMEOUT) {
                  return false; 
                }
              }
              return true;
            });

            pruneSettled(store);
            resolve(pending);
          };

          req.onerror = function () {
            resolve([]);
          };
        } catch (_err) {
          resolve([]);
        }
      });
    },

    
    lockStripsForMigration: async function (stripIds) {
      const db = await openDB();
      if (!db || !Array.isArray(stripIds) || stripIds.length === 0) return;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const now = Date.now();

          stripIds.forEach((id) => {
            const getReq = store.get(id);
            getReq.onsuccess = function (e) {
              const record = e.target.result;
              if (record &&
                  record.migration_status !== 'migrated' &&
                  record.migration_status !== 'deleted') {
                record.migration_status = 'in_progress';
                record.locked_at = now;
                record.migration_attempts = (record.migration_attempts || 0) + 1;
                store.put(record);
              }
            };
          });

          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (_err) {
          resolve();
        }
      });
    },

    
    markStripsMigrated: async function (migratedIds) {
      const db = await openDB();
      if (!db || !Array.isArray(migratedIds) || migratedIds.length === 0) return;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);

          migratedIds.forEach((id) => {
            const getReq = store.get(id);
            getReq.onsuccess = function (e) {
              const record = e.target.result;
              if (!record) return;
              
              if (record.migration_status === 'deleted') return;
              record.migration_status = 'migrated';
              record.migrated_at = new Date().toISOString();
              record.settled_at = record.migrated_at;
              record.locked_at = null;
              
              record.reinstate = false;
              
              record.image = null;
              record.thumbnail = null;
              store.put(record);
            };
          });

          tx.oncomplete = function () {
            notify('migrated', { ids: migratedIds });
            resolve();
          };
          tx.onerror = function () { resolve(); };
        } catch (_err) {
          resolve();
        }
      });
    },

    
    markStripsFailed: async function (failedList) {
      const db = await openDB();
      if (!db || !Array.isArray(failedList) || failedList.length === 0) return;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);

          failedList.forEach((item) => {
            const id = typeof item === 'string' ? item : item.id;
            const errorMsg = typeof item === 'object' ? item.error : null;

            const getReq = store.get(id);
            getReq.onsuccess = function (e) {
              const record = e.target.result;
              if (record &&
                  record.migration_status !== 'migrated' &&
                  record.migration_status !== 'deleted') {
                record.migration_status = 'failed';
                record.locked_at = null;
                record.last_error = errorMsg || 'upload_failed';
                store.put(record);
              }
            };
          });

          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (_err) {
          resolve();
        }
      });
    },

    
    deleteGuestStrip: async function (id) {
      const db = await openDB();
      if (!db || !id) return false;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const nowIso = new Date().toISOString();

          const tombstone = (record) => {
            if (!record) return;
            record.migration_status = 'deleted';
            record.deleted_at = nowIso;
            record.settled_at = nowIso;
            record.locked_at = null;
            record.image = null;
            record.thumbnail = null;
            store.put(record);
          };

          const direct = store.get(id);
          direct.onsuccess = function (e) {
            if (e.target.result) tombstone(e.target.result);
          };

          
          
          const scan = store.getAll();
          scan.onsuccess = function (e) {
            for (const item of (e.target.result || [])) {
              if (!item || item.local_strip_id === id) continue;
              if (item.strip_id === id || item.client_strip_id === id || item.clientStripId === id) {
                tombstone(item);
              }
            }
          };

          tx.oncomplete = function () {
            notify('deleted', { id: id });
            resolve(true);
          };
          tx.onerror = function () { resolve(false); };
        } catch (_e) {
          resolve(false);
        }
      });
    },

    
    clearAll: async function () {
      const db = await openDB();
      if (!db) return false;

      lastHashInput = null;
      lastHashValue = null;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (_e) {
          resolve(false);
        }
      });
    },
  };

  window.LBGuestStorage = LBGuestStorage;
})(window);
