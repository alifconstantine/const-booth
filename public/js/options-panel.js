(function () {
  "use strict";
  window.LensBoothBgState = { selectedBackground: "none" };

  var AR_BG_RESTRICTION_MSG_USE = "Choose an AR filter to use a background";
  var AR_BG_RESTRICTION_MSG_KEEP = "Only AR filters work with backgrounds";
  var SPARKLES_ICON_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>';

  function showARBackgroundRestrictionToast(actionOrMsg) {
    var msg = AR_BG_RESTRICTION_MSG_USE;
    if (actionOrMsg === "keep" || actionOrMsg === "keep_background" || actionOrMsg === AR_BG_RESTRICTION_MSG_KEEP) {
      msg = AR_BG_RESTRICTION_MSG_KEEP;
    } else if (actionOrMsg === "use" || actionOrMsg === "use_background" || actionOrMsg === AR_BG_RESTRICTION_MSG_USE) {
      msg = AR_BG_RESTRICTION_MSG_USE;
    } else if (typeof actionOrMsg === "string" && actionOrMsg.length > 0) {
      msg = actionOrMsg;
    } else if (isVirtualBackgroundActive()) {
      msg = AR_BG_RESTRICTION_MSG_KEEP;
    } else {
      msg = AR_BG_RESTRICTION_MSG_USE;
    }

    if (typeof window.showPillMessage === "function") {
      window.showPillMessage(msg, {
        type: "warning",
        position: "top-center",
        iconHTML: SPARKLES_ICON_SVG,
        duration: 2500
      });
    } else if (typeof window.showLocalToast === "function") {
      window.showLocalToast(msg, SPARKLES_ICON_SVG);
    }
  }
  window.showARBackgroundRestrictionToast = showARBackgroundRestrictionToast;

  function isNormalFilterActive() {
    if (window.LensBoothCurrentFilter && window.LensBoothCurrentFilter !== "none") {
      return true;
    }
    return false;
  }
  window.isNormalFilterActive = isNormalFilterActive;

  function isVirtualBackgroundActive() {
    if (window.LensBoothBgState && window.LensBoothBgState.selectedBackground) {
      return window.LensBoothBgState.selectedBackground !== "none";
    }
    return false;
  }
  window.isVirtualBackgroundActive = isVirtualBackgroundActive;

  document.addEventListener("DOMContentLoaded", function () {
    var toggleFilters = document.getElementById("toggle-filters");
    var toggleBackgrounds = document.getElementById("toggle-backgrounds");
    var optionsPanel = document.getElementById("options-panel");
    var panelFilters = document.getElementById("panel-filters");
    var panelBackgrounds = document.getElementById("panel-backgrounds");
    var filterScroll = document.getElementById("filter-scroll");
    var bgScroll = document.getElementById("background-scroll");
    var backdrop = document.getElementById("options-backdrop");
    var optionsCloseBtn = document.getElementById("options-close-btn");

    var currentPanel = null;

    function centerButton(container, btn, smooth) {
      if (!container || !btn) return;
      var containerWidth = container.clientWidth;
      if (!containerWidth) return;
      var targetScrollLeft = btn.offsetLeft - (containerWidth / 2) + (btn.offsetWidth / 2);
      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: smooth ? "smooth" : "instant"
      });
    }

    function updateState() {
      if (!currentPanel) {
        if (optionsPanel) optionsPanel.classList.remove("open");
        if (toggleFilters) toggleFilters.classList.remove("active");
        if (toggleBackgrounds) toggleBackgrounds.classList.remove("active");
        if (backdrop) backdrop.classList.remove("active");
      } else {
        if (optionsPanel) optionsPanel.classList.add("open");
        if (backdrop) backdrop.classList.add("active");
        if (currentPanel === "filters") {
          if (panelFilters) panelFilters.style.display = "block";
          if (panelBackgrounds) panelBackgrounds.style.display = "none";
          if (toggleFilters) toggleFilters.classList.add("active");
          if (toggleBackgrounds) toggleBackgrounds.classList.remove("active");
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (filterScroll) {
                var activeFilter = filterScroll.querySelector(".filter.active") || filterScroll.querySelector(".filter:not(.back-to-start)");
                if (activeFilter) centerButton(filterScroll, activeFilter, false);
              }
            });
          });
        } else {
          if (panelFilters) panelFilters.style.display = "none";
          if (panelBackgrounds) panelBackgrounds.style.display = "block";
          if (toggleFilters) toggleFilters.classList.remove("active");
          if (toggleBackgrounds) toggleBackgrounds.classList.add("active");
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (bgScroll) {
                var activeBg = bgScroll.querySelector(".filter.active") || bgScroll.querySelector(".filter:not(.back-to-start)");
                if (activeBg) centerButton(bgScroll, activeBg, false);
              }
            });
          });
        }
      }
    }

    if (toggleFilters) {
      toggleFilters.addEventListener("click", function () {
        currentPanel = currentPanel === "filters" ? null : "filters";
        updateState();
      });
    }

    if (toggleBackgrounds) {
      toggleBackgrounds.addEventListener("click", function () {
        currentPanel = currentPanel === "background" ? null : "background";
        updateState();
      });
    }

    function closePanels() {
      if (!currentPanel) return;
      currentPanel = null;
      updateState();
    }

    if (optionsCloseBtn) {
      optionsCloseBtn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePanels();
      });
      optionsCloseBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePanels();
      });
    }

    if (backdrop) {
      backdrop.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePanels();
      });
      backdrop.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePanels();
      });
    }

    function handleGlobalTap(e) {
      if (!currentPanel) return;
      if (e.target.closest("#options-panel") || e.target.closest(".option-toggle-btn")) {
        return;
      }
      closePanels();
    }

    window.addEventListener("pointerdown", handleGlobalTap, { capture: true, passive: true });
    window.addEventListener("click", handleGlobalTap, { capture: true, passive: true });

    function applyBackgroundChange(bgId) {
      if (bgId && bgId !== "none" && isNormalFilterActive()) {
        showARBackgroundRestrictionToast(AR_BG_RESTRICTION_MSG_USE);
        return;
      }
      window.LensBoothBgState.selectedBackground = bgId;
      if (window.LensBoothBackgroundProcessor && typeof window.LensBoothBackgroundProcessor.setBackground === "function") {
        window.LensBoothBackgroundProcessor.setBackground(bgId);
      }
    }

    function setupScrollSelection(scrollContainer, isBackground) {
      if (!scrollContainer) return;

      var isProgrammatic = false;
      var programmaticTimer = null;

      function lockProgrammatic(duration) {
        isProgrammatic = true;
        clearTimeout(programmaticTimer);
        programmaticTimer = setTimeout(function () {
          isProgrammatic = false;
        }, duration || 500);
      }

      scrollContainer.addEventListener("click", function (e) {

        var backBtn = e.target.closest(".back-to-start");
        if (backBtn) {
          e.preventDefault();
          e.stopPropagation();

          var allValidBtns = scrollContainer.querySelectorAll(".filter:not(.back-to-start)");
          if (allValidBtns.length > 0) {
            var firstBtn = allValidBtns[0];
            lockProgrammatic(600);

            if (isBackground) {
              var bgId = firstBtn.getAttribute("data-bg") || "none";
              applyBackgroundChange(bgId);
              allValidBtns.forEach(function (b) { b.classList.toggle("active", b === firstBtn); });
            } else {
              firstBtn.click();
              allValidBtns.forEach(function (b) { b.classList.toggle("active", b === firstBtn); });
            }

            centerButton(scrollContainer, firstBtn, true);
          }
          return;
        }

        var btn = e.target.closest(".filter:not(.back-to-start)");
        if (!btn) return;

        var btns = scrollContainer.querySelectorAll(".filter:not(.back-to-start)");
        lockProgrammatic(500);

        if (isBackground) {
          var bgId = btn.getAttribute("data-bg") || "none";
          applyBackgroundChange(bgId);
          btns.forEach(function (b) { b.classList.toggle("active", b === btn); });
          centerButton(scrollContainer, btn, true);
        } else {
          var fId = btn.getAttribute("data-filter");
          if (fId && fId !== "none" && isVirtualBackgroundActive()) {
            showARBackgroundRestrictionToast(AR_BG_RESTRICTION_MSG_KEEP);
          }
          btns.forEach(function (b) { b.classList.toggle("active", b === btn); });
          centerButton(scrollContainer, btn, true);
        }
      });

      var scrollTimeout;
      scrollContainer.addEventListener("scroll", function () {
        if (isProgrammatic) return;

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(function () {
          if (isProgrammatic) return;

          var containerRect = scrollContainer.getBoundingClientRect();
          var containerCenter = containerRect.left + containerRect.width / 2;
          var closestBtn = null;
          var minDiff = Infinity;

          var btns = scrollContainer.querySelectorAll(".filter:not(.back-to-start)");
          btns.forEach(function (btn) {
            var rect = btn.getBoundingClientRect();
            var btnCenter = rect.left + rect.width / 2;
            var diff = Math.abs(containerCenter - btnCenter);
            if (diff < minDiff) {
              minDiff = diff;
              closestBtn = btn;
            }
          });

          if (closestBtn && !closestBtn.classList.contains("active")) {
            if (isBackground) {
              var bgId = closestBtn.getAttribute("data-bg") || "none";
              applyBackgroundChange(bgId);
              btns.forEach(function (b) { b.classList.toggle("active", b === closestBtn); });
            } else {
              var fId = closestBtn.getAttribute("data-filter");
              if (fId && fId !== "none" && isVirtualBackgroundActive()) {
                showARBackgroundRestrictionToast(AR_BG_RESTRICTION_MSG_KEEP);
              } else {
                closestBtn.click();
              }
              btns.forEach(function (b) { b.classList.toggle("active", b === closestBtn); });
            }
          }
        }, 70);
      }, { passive: true });
    }

    setupScrollSelection(filterScroll, false);
    setupScrollSelection(bgScroll, true);

    document.addEventListener("keydown", function (e) {
      if (!currentPanel) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      var scroll = currentPanel === "filters" ? filterScroll : bgScroll;
      if (!scroll) return;

      var btns = Array.from(scroll.querySelectorAll(".filter:not(.back-to-start)"));
      var activeIndex = btns.findIndex(function (b) { return b.classList.contains("active"); });
      if (activeIndex === -1) activeIndex = 0;

      var nextIndex = e.key === "ArrowLeft" ? activeIndex - 1 : activeIndex + 1;
      if (nextIndex < 0) nextIndex = 0;
      if (nextIndex >= btns.length) nextIndex = btns.length - 1;

      if (nextIndex !== activeIndex) {
        var nextBtn = btns[nextIndex];

        if (currentPanel === "background") {
          var bgId = nextBtn.getAttribute("data-bg") || "none";
          applyBackgroundChange(bgId);
          centerButton(scroll, nextBtn, true);
          btns.forEach(function (b) { b.classList.toggle("active", b === nextBtn); });
        } else {
          var fId = nextBtn.getAttribute("data-filter");
          if (fId && fId !== "none" && isVirtualBackgroundActive()) {
            showARBackgroundRestrictionToast(AR_BG_RESTRICTION_MSG_KEEP);
          } else {
            nextBtn.click();
          }
          centerButton(scroll, nextBtn, true);
          btns.forEach(function (b) { b.classList.toggle("active", b === nextBtn); });
        }
      }
    });
  });
})();
