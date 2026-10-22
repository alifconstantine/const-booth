(function (window) {
  'use strict';

  let currentUser = null;
  let isSyncing = false;
  let initPromise = null;
  let retryTimer = null;
  let retryDelayMs = 0;

  const RETRY_BASE_MS = 5000;
  const RETRY_MAX_MS = 60000;

  const MIGRATE_BATCH_SIZE = 2;

  function scheduleRetry(afterMs) {
    if (retryTimer) return;
    const delay = Math.min(
      RETRY_MAX_MS,
      Math.max(RETRY_BASE_MS, afterMs || (retryDelayMs ? retryDelayMs * 2 : RETRY_BASE_MS))
    );
    retryDelayMs = delay;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      LBAuthSync.syncPending();
    }, delay);
  }

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryDelayMs = 0;
  }

  const LBAuthSync = {

    getCurrentUser: function () {
      return currentUser;
    },

    init: function () {
      if (initPromise) return initPromise;

      initPromise = (async function () {

        let settled = false;
        try {
          const res = await fetch('/auth/me', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'include',
          });

          if (res.ok) {
            const data = await res.json();
            currentUser = data.user || null;
            settled = true;
            if (currentUser) {

              LBAuthSync.syncPending();
            }
          } else if (res.status === 401 || res.status === 403) {

            currentUser = null;
            settled = true;
          } else {
            currentUser = null;
          }
        } catch (_err) {
          currentUser = null;
        }

        if (!settled) initPromise = null;

        window.dispatchEvent(new CustomEvent('lb-auth-changed', {
          detail: { user: currentUser }
        }));

        return currentUser;
      })();

      return initPromise;
    },

    loginWithGoogle: function (returnTo) {
      const target = returnTo || (window.location.pathname + window.location.search);
      const cleanTarget = target.startsWith('/') ? target : '/profile';
      const url = '/auth/google?returnTo=' + encodeURIComponent(cleanTarget);

      if (typeof window.__lbTopNavigate === 'function') { window.__lbTopNavigate(url); return; }
      window.location.href = url;
    },

    syncPending: async function () {
      if (!window.LBGuestStorage) return;
      if (!currentUser) {

        try {
          await LBAuthSync.init();
        } catch (_e) {}
        if (!currentUser) return;
      }
      if (isSyncing) {

        window._lbNeedsSyncPass = true;
        return;
      }
      isSyncing = true;

      try {
        do {
          window._lbNeedsSyncPass = false;
          const pending = await window.LBGuestStorage.getPendingStrips();
          if (!pending || pending.length === 0) break;

          let progressed = false;
          let halt = false;

          for (let i = 0; i < pending.length && !halt; i += MIGRATE_BATCH_SIZE) {
            const batch = pending.slice(i, i + MIGRATE_BATCH_SIZE);

            const toMigrate = [];
            for (const item of batch) {
              if (!item) continue;
              if (item.image instanceof Blob) {
                try {
                  const dUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(item.image);
                  });
                  if (dUrl && typeof dUrl === 'string') {
                    item.image = dUrl;
                    toMigrate.push(item);
                  }
                } catch (_convErr) {}
              } else if (typeof item.image === 'string' && (item.image.startsWith('data:') || item.image.startsWith('http'))) {
                toMigrate.push(item);
              }
            }

            if (toMigrate.length === 0) continue;

            const stripIds = toMigrate.map(item => item.local_strip_id);
            await window.LBGuestStorage.lockStripsForMigration(stripIds);

            const payload = {
              strips: toMigrate.map(item => ({
                local_strip_id: item.local_strip_id,
                image: item.image,
                thumbnail: item.thumbnail || null,
                style: item.style || 'classic',
                mode: item.mode || 'strip',
                created_at: item.created_at,

                reinstate: item.reinstate === true,
              }))
            };

            const res = await fetch('/api/strips/migrate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-lb-csrf': 'true',
              },
              credentials: 'include',
              body: JSON.stringify(payload),
            });

            if (res.ok) {
              clearRetry();
              progressed = true;
              const result = await res.json();
              if (result.migrated && result.migrated.length > 0) {
                await window.LBGuestStorage.markStripsMigrated(result.migrated);
              }
              if (result.failed && result.failed.length > 0) {
                await window.LBGuestStorage.markStripsFailed(result.failed);
                scheduleRetry();
              }

              window.dispatchEvent(new CustomEvent('lb-strips-migrated', {
                detail: {
                  migrated: result.migrated || [],
                  failed: result.failed || []
                }
              }));
            } else {
              await window.LBGuestStorage.markStripsFailed(stripIds);

              let retryAfterMs = 0;
              if (res.status === 429) {
                const hdr = parseInt(res.headers.get('Retry-After'), 10);
                if (hdr > 0) retryAfterMs = Math.min(RETRY_MAX_MS, hdr * 1000);
              }
              scheduleRetry(retryAfterMs);

              halt = true;
            }
          }

          if (halt) break;

          if (!progressed && !window._lbNeedsSyncPass) break;
        } while (window._lbNeedsSyncPass);
      } catch (err) {
        console.warn('[LBAuthSync] Migration error:', err);
        scheduleRetry();
      } finally {
        isSyncing = false;
      }
    },

    logout: async function () {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: { 'x-lb-csrf': 'true' },
          credentials: 'include',
        });
      } catch (_e) {}

      try {
        if (window.LBGuestStorage && typeof window.LBGuestStorage.clearAll === 'function') {
          await window.LBGuestStorage.clearAll();
        }
      } catch (_e) {}

      currentUser = null;
      initPromise = null;
      clearRetry();
      try {
        sessionStorage.removeItem('lb_pending_strip');
        sessionStorage.removeItem('lb_ic_photos');
        sessionStorage.removeItem('lb_from_output');
      } catch (_e) {}

      window.dispatchEvent(new CustomEvent('lb-auth-changed', {
        detail: { user: null }
      }));

      if (window.location.pathname.indexOf('/profile') !== -1) {
        window.location.reload();
      } else {
        window.location.href = '/profile';
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LBAuthSync.init());
  } else {
    LBAuthSync.init();
  }

  window.LBAuthSync = LBAuthSync;
})(window);
