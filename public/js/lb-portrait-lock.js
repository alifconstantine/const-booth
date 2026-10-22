/*
 * Portrait-only notice for phones on pages whose layout needs portrait
 * (camera/frame booths, letters, cassette and build-together editors).
 * Phones only: tablets, desktops and foldables (short side >= 600px) are never
 * affected. Orientation comes from the device sensor, not the viewport shape,
 * so an on-screen keyboard can't trigger it.
 */
(function () {
  "use strict";
  if (window.__lbPortraitLock) return;
  window.__lbPortraitLock = true;

  var ID = "lb-portrait-lock";

  function isPhone() {
    var ua = navigator.userAgent || "";
    var uad = navigator.userAgentData;
    var mobile;
    if (uad && typeof uad.mobile === "boolean") {
      mobile = uad.mobile;
    } else {
      mobile = /iPhone|iPod/.test(ua) ||
        (/Android/.test(ua) && /Mobile/.test(ua)) ||
        /Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini/i.test(ua);
    }
    if (!mobile || /iPad|Tablet/i.test(ua)) return false;
    var s = window.screen || {};
    var shortSide = Math.min(s.width || 0, s.height || 0);
    if (!shortSide || shortSide >= 600) return false;
    return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  }

  function isLandscape() {
    var so = window.screen && window.screen.orientation;
    if (so && typeof so.type === "string") return so.type.indexOf("landscape") === 0;
    if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
    return window.innerWidth > window.innerHeight;
  }

  if (!isPhone()) return;

  var CSS = "\n    #lb-portrait-lock,\n    #lb-portrait-lock * {\n    box-sizing: border-box;\n    }\n    #lb-portrait-lock {\n    position: fixed;\n    top: 0; left: 0; right: 0; bottom: 0;\n    inset: 0;\n    width: 100vw;\n    height: 100vh;\n    height: 100dvh;\n    min-height: -webkit-fill-available;\n    background: #F4F4F0;\n    background-image: linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),\n    linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);\n    background-size: 32px 32px;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    z-index: 999999999;\n    opacity: 0;\n    pointer-events: none;\n    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);\n    font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    padding: 24px;\n    }\n    #lb-portrait-lock.visible {\n    opacity: 1;\n    pointer-events: auto;\n    }\n    .ob-content {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    gap: 20px;\n    width: 100%;\n    max-width: 320px;\n    text-align: center;\n    }\n    .ob-title {\n    font-size: 34px;\n    font-weight: 600 !important;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    color: #000;\n    letter-spacing: -0.03em;\n    line-height: 1.2;\n    margin: 0;\n    font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n    text-align: center;\n    width: 100%;\n    }\n    .ob-body {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    gap: 20px;\n    width: 100%;\n    }\n    .ob-icon-wrapper {\n    width: 96px;\n    height: 96px;\n    flex-shrink: 0;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    }\n    .ob-icon-wrapper svg {\n    width: 100%;\n    height: 100%;\n    overflow: visible;\n    display: block;\n    }\n    .ob-phone-group {\n    transform-origin: 50px 50px;\n    animation: ob-phone-rotate 2.8s cubic-bezier(0.77, 0, 0.175, 1) infinite;\n    }\n    @keyframes ob-phone-rotate {\n    0% { transform: rotate(-90deg); }\n    35% { transform: rotate(0deg); }\n    65% { transform: rotate(0deg); }\n    100% { transform: rotate(-90deg); }\n    }\n    .ob-text {\n    font-size: 16px;\n    font-weight: 500;\n    color: rgba(0,0,0,0.55);\n    line-height: 1.55;\n    margin: 0;\n    font-family: 'Satoshi', sans-serif;\n    text-align: center;\n    max-width: 280px;\n    }\n    html.lb-portrait-locked body {\n    overflow: hidden !important;\n    height: 100dvh !important;\n    width: 100dvw !important;\n    }\n    @media (orientation: landscape) {\n    #lb-portrait-lock {\n    padding: 16px 24px;\n    }\n    .ob-content {\n    max-width: 440px;\n    gap: 12px;\n    }\n    .ob-title {\n    font-size: 28px;\n    font-weight: 600 !important;\n    font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    }\n    .ob-body {\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    gap: 12px;\n    width: 100%;\n    }\n    .ob-icon-wrapper {\n    width: 80px;\n    height: 80px;\n    }\n    .ob-text {\n    font-size: 14px;\n    line-height: 1.45;\n    text-align: center;\n    max-width: 320px;\n    }\n    }\n";

  var HTML = "<div class=\"ob-content\">\n<h2 class=\"ob-title\" id=\"lb-portrait-lock-title\">Rotate your screen</h2>\n<div class=\"ob-body\">\n<div class=\"ob-icon-wrapper\">\n<svg aria-hidden=\"true\" viewBox=\"0 0 100 100\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M 50 14 A 36 36 0 0 1 86 50\" stroke=\"#F12850\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.35\" />\n<path d=\"M 50 86 A 36 36 0 0 1 14 50\" stroke=\"#F12850\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.35\" />\n<path d=\"M 81.5 45.5 L 86 50 L 90.5 45.5\" stroke=\"#F12850\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />\n<path d=\"M 18.5 54.5 L 14 50 L 9.5 54.5\" stroke=\"#F12850\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" />\n<g class=\"ob-phone-group\">\n<rect x=\"36\" y=\"25\" width=\"28\" height=\"50\" rx=\"6\" stroke=\"#111\" stroke-width=\"2.5\" fill=\"#FFF\"/>\n<rect x=\"38.5\" y=\"27.5\" width=\"23\" height=\"45\" rx=\"4\" fill=\"#111\" opacity=\"0.04\"/>\n<rect x=\"44\" y=\"29.5\" width=\"12\" height=\"2.5\" rx=\"1.25\" fill=\"#111\"/>\n<rect x=\"43\" y=\"69.5\" width=\"14\" height=\"1.8\" rx=\"0.9\" fill=\"#111\" opacity=\"0.3\"/>\n<path d=\"M 50 43.5 L 51.2 47.3 L 55 47.3 L 52 49.5 L 53.1 53.3 L 50 51 L 46.9 53.3 L 48 49.5 L 45 47.3 L 48.8 47.3 Z\" fill=\"#F12850\" />\n</g>\n</svg>\n</div>\n<p class=\"ob-text\">ConstBooth works best in portrait mode. Please turn your phone upright to continue.</p>\n</div>\n</div>";

  var el = null;

  function build() {
    if (el) return el;
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    el = document.createElement("div");
    el.id = ID;
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "lb-portrait-lock-title");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = HTML;
    el.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
    document.body.appendChild(el);
    return el;
  }

  function update() {
    var on = isLandscape();
    if (!on && !el) return;
    build();
    el.classList.toggle("visible", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
    document.documentElement.classList.toggle("lb-portrait-locked", on);
  }

  function start() {
    update();
    var so = window.screen && window.screen.orientation;
    if (so && so.addEventListener) so.addEventListener("change", update);
    window.addEventListener("orientationchange", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
