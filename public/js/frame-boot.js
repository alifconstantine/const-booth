(function () {
  "use strict";
  var path = window.location.pathname.replace(/\/$/, "");
  if (!path.endsWith("/frame")) return;

  window.__lbFramePage = true;

  try {
    localStorage.setItem("outputMode", "card");
    if (!localStorage.getItem("cardLayout")) {
      localStorage.setItem("cardLayout", "single");
    }
    var qs = window.location.search || "";
    localStorage.setItem("targetUrl", "/frame" + qs);
  } catch (_e) {}

  function onDomReady() {
    try {
      document.body.classList.add("output-mode-card");
      document.body.classList.remove("preview-visible");
      var preview = document.getElementById("preview-screen");
      if (preview) preview.classList.remove("visible");
      if (typeof window.hideLoader === "function") window.hideLoader();
    } catch (_e) {}
  }

  if (document.body) onDomReady();
  else document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
})();
