if ("serviceWorker" in navigator) {
  let isSplashBlocking = function () {
    try {
      const e = document.getElementById("splash-screen");
      return e ? !e.classList.contains("hidden") && getComputedStyle(e).display !== "none" : !1;
    } catch {
      return !1;
    }
  };

  let isBoothOrStudioPage = function () {
    try {
      const e = window.location.pathname;
      return (
        e.includes("/camera") ||
        e.includes("/frame") ||
        e.includes("/strips") ||
        e.includes("/booth") ||
        e.includes("/studio")
      );
    } catch {
      return !1;
    }
  };

  let applyPendingReload = function () {
    try {
      if (isBoothOrStudioPage()) return !1;
      return !hasController || sessionStorage.getItem(reloadKey) !== "1" || isSplashBlocking()
        ? !1
        : (sessionStorage.removeItem(reloadKey), window.location.reload(), !0);
    } catch {
      return !1;
    }
  };

  let deferReload = function () {
    try {
      sessionStorage.setItem(reloadKey, "1");
    } catch {}
  };

  let watchSplashThenReload = function () {
    if (!hasController || isBoothOrStudioPage()) return;
    if (splashWatched) {
      applyPendingReload();
      return;
    }
    splashWatched = !0;
    if (applyPendingReload()) return;
    const e = document.getElementById("splash-screen");
    if (!e) {
      applyPendingReload();
      return;
    }
    const observer = new MutationObserver(() => applyPendingReload());
    observer.observe(e, { attributes: !0, attributeFilter: ["class", "style"] });
    const interval = setInterval(() => {
      (applyPendingReload() || !document.getElementById("splash-screen")) &&
        (clearInterval(interval), observer.disconnect());
    }, 400);
    setTimeout(() => {
      clearInterval(interval);
      observer.disconnect();
      applyPendingReload();
    }, 9000);
  };

  const reloadKey = "lb_sw_reload_pending";
  const hasController = !!navigator.serviceWorker.controller;
  let splashWatched = !1;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {})
      .catch((err) => {
        console.error("ServiceWorker registration failed: ", err);
      });
    if (hasController && !isBoothOrStudioPage()) {
      watchSplashThenReload();
    }
  });

  navigator.serviceWorker.addEventListener("message", (e) => {
    if (hasController && e.data && e.data.type === "SW_UPDATED" && !isBoothOrStudioPage()) {
      if (isSplashBlocking()) {
        deferReload();
        watchSplashThenReload();
        return;
      }
      sessionStorage.removeItem(reloadKey);
      window.location.reload();
    }
  });
}
