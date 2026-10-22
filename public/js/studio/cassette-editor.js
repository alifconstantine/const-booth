(function (window, document) {
  'use strict';

  var ART = window.LBCassetteArt;
  var DECK = window.LBCassetteDeck;

  var MAX_SECONDS = ART.MAX_SECONDS;
  var MESSAGE_MAX = 60;
  var PHOTO_MAX_BYTES = 10 * 1024 * 1024;
  var PHOTO_MIN_EDGE = 64;
  var PHOTO_MAX_DECODE_EDGE = 12000;
  var PHOTO_WORK_EDGE = 2400;
  var ZOOM_MAX = 3;

  var LEGACY_DRAFT_KEY = 'lb_cassette_draft_v1';

  var AUDIO = {
    IDLE: 'IDLE',
    REQUESTING_MIC: 'REQUESTING_MIC',
    RECORDING: 'RECORDING',
    PAUSED_RECORDING: 'PAUSED_RECORDING',
    STOPPED: 'STOPPED',
    PLAYING: 'PLAYING',
    PAUSED_PLAYBACK: 'PAUSED_PLAYBACK',
    FINISHED: 'FINISHED',
    RE_RECORDING: 'RE_RECORDING',
    ERROR: 'ERROR'
  };

  var els = {};
  var cover = { design: null, message: '', date: '', photo: null };
  var preview = null;
  var deck = null;
  var deckArt = null;

  var audioState = AUDIO.IDLE;
  var rec = {
    stream: null,
    recorder: null,
    chunks: [],
    mime: '',
    elapsed: 0,
    segmentStart: 0,
    limitTimer: 0,
    stopping: false,
    blob: null,
    url: '',
    duration: 0
  };
  var playback = { lastTime: 0, lastAt: 0, waiting: false, played: false };
  var shared = { id: null, url: '', uploading: false, blobUsed: null };
  var videoSaver = null;

  function byId(id) { return document.getElementById(id); }

  function now() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function track(name, params) {
    try {
      if (typeof window.trackGA4Event === 'function') window.trackGA4Event(name, params || {});
    } catch (_e) {}
  }

  var INFO_ICON =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  function toast(message, kind) {
    var type = kind || 'info';
    var opts = { type: type, duration: type === 'error' ? 3200 : 2500 };
    if (type === 'info') opts.iconHTML = INFO_ICON;
    if (typeof window.showPillMessage === 'function') {
      window.showPillMessage(message, opts);
    } else if (window.LBExport && window.LBExport.toast) {
      window.LBExport.toast(message, type);
    }
  }

  function show(step) {
    ['choose', 'cover', 'record', 'final'].forEach(function (name) {
      els['step_' + name].hidden = name !== step;
    });
    els.app.setAttribute('data-step', step);
    syncHeaderBack(step);
    var heading = els['step_' + step].querySelector('.cs-title');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }

  var PREVIOUS_STEP_LABEL = {
    choose: 'Back to Studio',
    cover: 'Back to cassette designs',
    record: 'Back to the cover',
    final: 'Back to recording'
  };

  function syncHeaderBack(step) {
    var label = PREVIOUS_STEP_LABEL[step] || 'Back';
    els.headerBack.forEach(function (link) {
      link.setAttribute('aria-label', label);
      link.setAttribute('title', label);
    });
  }

  function goBackOneStep() {
    var step = els.app.getAttribute('data-step');
    if (step === 'cover') {
      setAdjusting(false);
      show('choose');
      if (cover.design) selectDesign(cover.design, false);
      var checked = els.designs.querySelector('input:checked');
      if (checked) DECK.focusForKeyboard(checked);
      return true;
    }
    if (step === 'record') {
      if (audioState === AUDIO.RECORDING || audioState === AUDIO.PAUSED_RECORDING ||
          audioState === AUDIO.REQUESTING_MIC || rec.stopping) {
        toast('Stop recording before going back.', 'info');
        return true;
      }
      if (deck && (deck.state() === 'INSERTING' || deck.state() === 'EJECTING')) return true;
      backToCover();
      return true;
    }
    if (step === 'final') {
      if (shared.uploading || (videoSaver && videoSaver.busy())) {
        toast('Hang on, your cassette is still saving.', 'info');
        return true;
      }
      openRecord();
      return true;
    }
    return false;
  }

  function coverState() {
    return {
      message: cover.message.trim(),
      date: cover.date,
      photo: cover.photo ? {
        url: cover.photo.url,
        width: cover.photo.width,
        height: cover.photo.height,
        zoom: cover.photo.zoom,
        fx: cover.photo.fx,
        fy: cover.photo.fy
      } : null
    };
  }

  function renderArt() {
    var state = coverState();
    if (preview) preview.update(state);
    if (deckArt) deckArt.update(state);
    els.previewLabel.setAttribute('aria-label', describeCassette());
  }

  function describeCassette() {
    var design = ART.design(cover.design);
    var parts = [(design ? design.name : 'A') + ' cassette'];
    if (cover.message.trim()) parts.push('labelled “' + cover.message.trim() + '”');
    if (cover.date) parts.push('dated ' + cover.date);
    if (cover.photo) parts.push('with a photo on the cover');
    return parts.join(', ');
  }

  var carouselIndex = 0;
  var designCards = [];
  var dotButtons = [];
  var carouselEventsBound = false;

  function buildDesignCard(design, index) {
    var label = document.createElement('label');
    label.className = 'cs-design';
    label.setAttribute('data-index', String(index));

    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'cs-design';
    input.setAttribute('autocomplete', 'off');
    input.value = design.id;
    input.className = 'cs-design-input';

    var art = document.createElement('span');
    art.className = 'cs-design-art';
    var img = document.createElement('img');
    img.src = design.src;
    img.alt = '';
    img.width = 831;
    img.height = 506;
    img.decoding = 'async';
    art.appendChild(img);

    var name = document.createElement('span');
    name.className = 'cs-design-name';
    name.textContent = design.name;

    var tick = document.createElement('span');
    tick.className = 'cs-design-tick';
    tick.setAttribute('aria-hidden', 'true');
    tick.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7"></polyline></svg>';

    label.appendChild(input);
    label.appendChild(art);
    label.appendChild(name);
    label.appendChild(tick);
    els.designs.appendChild(label);
    return label;
  }

  function buildDesignChoices() {
    if (!els.designs) return;
    var shipped = els.designs.querySelectorAll('label.cs-design');
    var reuse = shipped.length === ART.designs.length;
    if (!reuse) els.designs.innerHTML = '';
    if (els.carouselDots) els.carouselDots.innerHTML = '';
    designCards = [];
    dotButtons = [];

    ART.designs.forEach(function (design, index) {
      var label = reuse ? shipped[index] : buildDesignCard(design, index);
      var input = label.querySelector('input');
      input.value = design.id;
      input.addEventListener('change', function () {
        if (!input.checked) return;
        setCarouselIndex(index, true);
      });

      label.addEventListener('click', function (e) {
        var pos = label.getAttribute('data-pos');
        if (pos === 'left') {
          e.preventDefault();
          e.stopPropagation();
          setCarouselIndex(carouselIndex - 1, true);
        } else if (pos === 'right') {
          e.preventDefault();
          e.stopPropagation();
          setCarouselIndex(carouselIndex + 1, true);
        } else if (pos === 'center') {
          selectDesign(design.id, true);
        }
      });

      designCards.push(label);

      if (els.carouselDots) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'cs-carousel-dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Select ' + design.name);
        dot.setAttribute('title', design.name);
        dot.addEventListener('click', function () {
          setCarouselIndex(index, true);
        });
        els.carouselDots.appendChild(dot);
        dotButtons.push(dot);
      }
    });

    initCarouselEvents();
  }

  function setCarouselIndex(newIndex, fromUser) {
    var total = ART.designs.length;
    if (!total) return;
    carouselIndex = ((newIndex % total) + total) % total;

    designCards.forEach(function (card, i) {
      var diff = ((i - carouselIndex) % total + total) % total;
      var pos = 'hidden-right';
      if (diff === 0) {
        pos = 'center';
      } else if (diff === 1) {
        pos = 'right';
      } else if (diff === total - 1) {
        pos = 'left';
      } else if (diff === total - 2) {
        pos = 'hidden-left';
      } else {
        pos = 'hidden-right';
      }
      card.setAttribute('data-pos', pos);
      var input = card.querySelector('input');
      if (pos === 'center') {
        card.setAttribute('aria-hidden', 'false');
        card.classList.add('is-selected');
        if (input) input.checked = true;
      } else {
        card.setAttribute('aria-hidden', pos === 'left' || pos === 'right' ? 'false' : 'true');
        card.classList.remove('is-selected');
        if (input) input.checked = false;
      }

      if (input) {
        if (card.getAttribute('aria-hidden') === 'true') input.setAttribute('tabindex', '-1');
        else input.removeAttribute('tabindex');
      }
    });

    dotButtons.forEach(function (dot, i) {
      var isActive = (i === carouselIndex);
      dot.classList.toggle('is-active', isActive);
      dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    var selectedDesign = ART.designs[carouselIndex];
    if (selectedDesign) {
      cover.design = selectedDesign.id;
      if (els.chooseNext) els.chooseNext.disabled = false;
      if (fromUser) track('cassette_selected', { design: selectedDesign.id });
    }
  }

  function selectDesign(id, fromUser) {
    var foundIndex = -1;
    ART.designs.forEach(function (d, i) {
      if (d.id === id) foundIndex = i;
    });
    if (foundIndex >= 0) {
      setCarouselIndex(foundIndex, fromUser);
    }
  }

  function initCarouselEvents() {
    if (carouselEventsBound) return;
    carouselEventsBound = true;

    if (els.carouselPrev) {
      els.carouselPrev.addEventListener('click', function () {
        setCarouselIndex(carouselIndex - 1, true);
      });
    }
    if (els.carouselNext) {
      els.carouselNext.addEventListener('click', function () {
        setCarouselIndex(carouselIndex + 1, true);
      });
    }

    if (els.carouselStage) {
      var startX = 0;
      var startY = 0;
      var tracking = false;
      var isSwipe = false;

      els.carouselStage.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        tracking = true;
        isSwipe = false;
      }, { passive: true });

      els.carouselStage.addEventListener('pointerup', function (e) {
        if (!tracking) return;
        tracking = false;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
          isSwipe = true;
          if (dx < 0) {
            setCarouselIndex(carouselIndex + 1, true);
          } else {
            setCarouselIndex(carouselIndex - 1, true);
          }
        }
      }, { passive: true });

      els.carouselStage.addEventListener('pointercancel', function () {
        tracking = false;
      }, { passive: true });

      els.carouselStage.addEventListener('click', function (e) {
        if (isSwipe) {
          isSwipe = false;
          return;
        }

        var card = e.target && e.target.closest ? e.target.closest('.cs-design') : null;
        if (card) {
          var pos = card.getAttribute('data-pos');
          if (pos === 'center') return;
        }
        var rect = els.carouselStage.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        var midX = rect.width / 2;
        if (clickX < midX - 30) {
          setCarouselIndex(carouselIndex - 1, true);
        } else if (clickX > midX + 30) {
          setCarouselIndex(carouselIndex + 1, true);
        }
      });

      els.carouselStage.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setCarouselIndex(carouselIndex - 1, true);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setCarouselIndex(carouselIndex + 1, true);
        }
      });
    }
  }

  var previewToken = 0;

  function openCover() {
    if (!cover.design) return;
    show('cover');
    var token = ++previewToken;
    els.preview.classList.add('is-loading');

    if (preview && preview.design.id === cover.design) {
      els.preview.classList.remove('is-loading');
      renderArt();
      return;
    }

    ART.create(cover.design).then(function (instance) {
      if (token !== previewToken) return;
      preview = instance;
      while (els.preview.firstChild) els.preview.removeChild(els.preview.firstChild);
      els.preview.appendChild(instance.svg);
      bindPhotoDrag(instance);
      els.preview.classList.remove('is-loading');
      renderArt();
      syncPhotoControls();
    }).catch(function () {
      if (token !== previewToken) return;
      els.preview.classList.remove('is-loading');
      toast('That cassette could not be loaded. Check your connection and try again.', 'error');
      show('choose');
    });
  }

  function syncMessageControls() {
    var length = Array.from ? Array.from(cover.message).length : cover.message.length;
    els.messageCount.textContent = length + ' / ' + MESSAGE_MAX;
    els.messageCount.classList.toggle('is-full', length >= MESSAGE_MAX);
    els.messageClear.hidden = !cover.message;
  }

  function syncDateControls() {
    var has = !!cover.date;
    els.dateAdd.hidden = has;
    els.dateRow.hidden = !has;
  }

  function isoToLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    return m[3] + '.' + m[2] + '.' + m[1].slice(2);
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var PHOTO_TYPES = ['image/jpeg', 'image/png'];
  var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function sniffImage(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var b = new Uint8Array(reader.result);
        if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return resolve('image/jpeg');
        var png = b.length >= PNG_SIGNATURE.length;
        for (var i = 0; png && i < PNG_SIGNATURE.length; i++) {
          if (b[i] !== PNG_SIGNATURE[i]) png = false;
        }
        resolve(png ? 'image/png' : null);
      };
      reader.onerror = function () { resolve(null); };
      reader.readAsArrayBuffer(file.slice(0, 16));
    });
  }

  function decodePhoto(file) {
    if (!file) return Promise.reject(new Error('empty'));
    if (file.size > PHOTO_MAX_BYTES) return Promise.reject(new Error('too-large'));

    if (file.type && PHOTO_TYPES.indexOf(file.type.toLowerCase()) === -1) {
      return Promise.reject(new Error('unsupported'));
    }

    var screen = window.LBInputGuard
      ? window.LBInputGuard.checkImage(file, { maxBytes: PHOTO_MAX_BYTES }).then(function (check) {
        if (!check.ok) throw new Error(check.reason === 'too-large' ? 'too-large' : 'unsupported');
        return check.type;
      })
      : sniffImage(file);

    return screen.then(function (type) {
      if (PHOTO_TYPES.indexOf(type) === -1) throw new Error('unsupported');
      var source = URL.createObjectURL(file);
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('corrupt')); };
        img.src = source;
      }).then(function (img) {
        URL.revokeObjectURL(source);
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (!w || !h) throw new Error('corrupt');
        if (w < PHOTO_MIN_EDGE || h < PHOTO_MIN_EDGE) throw new Error('too-small');
        if (w > PHOTO_MAX_DECODE_EDGE || h > PHOTO_MAX_DECODE_EDGE) throw new Error('too-large');

        var k = Math.min(1, PHOTO_WORK_EDGE / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * k));
        canvas.height = Math.max(1, Math.round(h * k));
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return ART.canvasToBlob(canvas, 'image/jpeg', 0.9).then(function (blob) {
          var url = URL.createObjectURL(blob);
          return new Promise(function (resolve, reject) {
            var work = new Image();
            work.onload = function () { resolve({ image: work, url: url, width: canvas.width, height: canvas.height }); };
            work.onerror = function () { URL.revokeObjectURL(url); reject(new Error('corrupt')); };
            work.src = url;
          });
        });
      }, function (err) {
        URL.revokeObjectURL(source);
        throw err;
      });
    });
  }

  function setPhoto(result) {
    removePhoto(true);
    cover.photo = {
      image: result.image,
      url: result.url,
      width: result.width,
      height: result.height,
      zoom: 1,
      fx: 0.5,
      fy: 0.5
    };
    els.zoom.value = '1';
    renderArt();
    setAdjusting(true);
    syncPhotoControls();
  }

  function removePhoto(silent) {
    if (cover.photo && cover.photo.url) URL.revokeObjectURL(cover.photo.url);
    cover.photo = null;
    setAdjusting(false);
    renderArt();
    syncPhotoControls();
    if (!silent) toast('Photo removed.', 'info');
  }

  var adjusting = false;

  function setAdjusting(on) {
    adjusting = !!on && !!cover.photo;
    els.preview.classList.toggle('is-adjusting', adjusting);
    els.photoAdjust.hidden = !adjusting;
    els.photoHint.hidden = !adjusting;
    if (preview) preview.photoHandle.setAttribute('display', adjusting ? 'inline' : 'none');
    els.previewLabel.tabIndex = adjusting ? 0 : -1;
    els.previewLabel.setAttribute('role', adjusting ? 'application' : 'img');
    els.previewLabel.setAttribute('aria-roledescription', adjusting ? 'photo position' : 'cassette preview');
  }

  function syncPhotoControls() {
    var has = !!cover.photo;
    els.photoAdd.hidden = has;
    els.photoReplace.hidden = !has;
    els.photoRemove.hidden = !has;
    els.photoEdit.hidden = !has || adjusting;
  }

  function onFileChosen() {
    var file = els.file.files && els.file.files[0];
    els.file.value = '';
    if (!file) return;
    els.photoAdd.disabled = true;
    els.photoReplace.disabled = true;
    decodePhoto(file).then(function (result) {
      setPhoto(result);
      track('cassette_photo_added');
    }).catch(function (err) {
      var reason = err && err.message;
      if (reason === 'too-large') toast('That image is too big. Try one under 10 MB.', 'error');
      else if (reason === 'unsupported') toast('Please choose a JPG or PNG photo.', 'error');
      else if (reason === 'too-small') toast('That image is too small for a cover. Try a larger photo.', 'error');
      else toast('That photo could not be opened. It may be damaged.', 'error');
    }).then(function () {
      els.photoAdd.disabled = false;
      els.photoReplace.disabled = false;
    });
  }

  function movePhoto(dx, dy) {
    if (!cover.photo || !preview) return;
    var rect = preview.photoRect;
    var place = ART.photoPlacement(cover.photo, rect);
    var moved = ART.photoPlacement({
      width: cover.photo.width,
      height: cover.photo.height,
      zoom: cover.photo.zoom,
      fx: (rect.x + rect.w / 2 - (place.x + dx)) / place.w,
      fy: (rect.y + rect.h / 2 - (place.y + dy)) / place.h
    }, rect);
    cover.photo.fx = moved.fx;
    cover.photo.fy = moved.fy;
    renderArt();
  }

  function setZoom(value) {
    if (!cover.photo) return;
    var zoom = Math.max(1, Math.min(ZOOM_MAX, value));
    cover.photo.zoom = zoom;
    var settled = ART.photoPlacement(cover.photo, preview ? preview.photoRect : ART.design(cover.design).photo.rect);
    cover.photo.fx = settled.fx;
    cover.photo.fy = settled.fy;
    els.zoom.value = String(zoom);
    renderArt();
  }

  function bindPhotoDrag(instance) {
    var handle = instance.photoHandle;
    var drag = null;

    function unitsPerPixel() {
      var box = instance.svg.getBoundingClientRect();
      return box.width ? ART.WIDTH / box.width : 1;
    }

    handle.addEventListener('pointerdown', function (e) {
      if (!adjusting || !cover.photo) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, k: unitsPerPixel() };
      if (handle.setPointerCapture) {
        try { handle.setPointerCapture(e.pointerId); } catch (_e) {}
      }
      els.preview.classList.add('is-dragging');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = (e.clientX - drag.x) * drag.k;
      var dy = (e.clientY - drag.y) * drag.k;
      drag.x = e.clientX;
      drag.y = e.clientY;
      movePhoto(dx, dy);
      e.preventDefault();
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      els.preview.classList.remove('is-dragging');
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    handle.addEventListener('wheel', function (e) {
      if (!adjusting || !cover.photo) return;
      e.preventDefault();
      setZoom(cover.photo.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
    }, { passive: false });
  }

  function onPreviewKey(e) {
    if (!adjusting || !cover.photo) return;
    var step = e.shiftKey ? 30 : 8;
    var handled = true;
    if (e.key === 'ArrowLeft') movePhoto(-step, 0);
    else if (e.key === 'ArrowRight') movePhoto(step, 0);
    else if (e.key === 'ArrowUp') movePhoto(0, -step);
    else if (e.key === 'ArrowDown') movePhoto(0, step);
    else if (e.key === '+' || e.key === '=') setZoom(cover.photo.zoom + 0.1);
    else if (e.key === '-' || e.key === '_') setZoom(cover.photo.zoom - 0.1);
    else if (e.key === 'Enter' || e.key === 'Escape') { setAdjusting(false); syncPhotoControls(); els.photoEdit.focus(); }
    else handled = false;
    if (handled) e.preventDefault();
  }

  function recorderSupported() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof window.MediaRecorder === 'function');
  }

  function pauseSupported() {
    return !!(window.MediaRecorder && window.MediaRecorder.prototype &&
      typeof window.MediaRecorder.prototype.pause === 'function' &&
      typeof window.MediaRecorder.prototype.resume === 'function');
  }

  function pickMimeType() {
    var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
    if (typeof window.MediaRecorder.isTypeSupported !== 'function') return '';
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (window.MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_e) {}
    }
    return '';
  }

  function recordedSeconds() {
    if (audioState === AUDIO.RECORDING && !rec.stopping) return rec.elapsed + (now() - rec.segmentStart) / 1000;
    return rec.elapsed;
  }

  function playbackSeconds() {
    var t = els.audio.currentTime || 0;
    var at = now();
    if (t !== playback.lastTime) {
      playback.lastTime = t;
      playback.lastAt = at;
    }
    if (audioState === AUDIO.PLAYING && !playback.waiting && !els.audio.paused) {

      return Math.min(rec.duration || Infinity, t + Math.min(0.35, (at - playback.lastAt) / 1000));
    }
    return Math.min(rec.duration || Infinity, t);
  }

  function setAudioState(next) {
    audioState = next;
    els.app.setAttribute('data-audio', next);
    var deckState = {
      IDLE: 'INSERTED',
      REQUESTING_MIC: 'INSERTED',
      RECORDING: 'RECORDING',
      PAUSED_RECORDING: 'PAUSED_RECORDING',
      STOPPED: 'STOPPED',
      PLAYING: 'PLAYING',
      PAUSED_PLAYBACK: 'PAUSED_PLAYBACK',
      FINISHED: 'STOPPED',
      RE_RECORDING: 'INSERTED',
      ERROR: 'INSERTED'
    }[next];
    if (deck && deck.state() !== 'INSERTING' && deck.state() !== 'EJECTING') deck.setState(deckState);

    var recordingPhase = next === AUDIO.IDLE || next === AUDIO.REQUESTING_MIC || next === AUDIO.RECORDING ||
      next === AUDIO.PAUSED_RECORDING || next === AUDIO.RE_RECORDING || (next === AUDIO.ERROR && !rec.blob);
    if (deck) {
      deck.follow(recordingPhase ? recordedSeconds : playbackSeconds);
      deck.setTotal(recordingPhase ? 0 : rec.duration);
      deck.setActive(next === AUDIO.RECORDING || (next === AUDIO.PLAYING && !playback.waiting));
    }

    renderRecordKeys();
    renderRecordStatus();
    els.finish.disabled = !rec.blob || next === AUDIO.RECORDING || next === AUDIO.PAUSED_RECORDING ||
      next === AUDIO.REQUESTING_MIC || rec.stopping || next === AUDIO.RE_RECORDING;
    els.recordBack.disabled = next === AUDIO.RECORDING || next === AUDIO.PAUSED_RECORDING ||
      next === AUDIO.REQUESTING_MIC || rec.stopping;
  }

  function renderRecordStatus() {
    var text;
    switch (audioState) {
      case AUDIO.REQUESTING_MIC: text = 'Allow microphone access to start recording.'; break;
      case AUDIO.RECORDING: text = rec.stopping ? 'Stopping…' : 'Recording. Up to 5 minutes.'; break;
      case AUDIO.PAUSED_RECORDING: text = 'Recording paused.'; break;
      case AUDIO.STOPPED:
      case AUDIO.FINISHED:
      case AUDIO.PAUSED_PLAYBACK: text = 'Your cassette is ready.'; break;
      case AUDIO.PLAYING: text = 'Playing your cassette.'; break;
      case AUDIO.RE_RECORDING: text = 'Rewinding…'; break;
      case AUDIO.ERROR: text = rec.blob ? 'Your cassette is ready.' : 'Press REC when you’re ready. Up to 5 minutes.'; break;
      default: text = 'Press REC when you’re ready. Up to 5 minutes.';
    }
    if (els.recordStatus.textContent !== text) els.recordStatus.textContent = text;
  }

  function renderRecordKeys() {
    if (!deck) return;
    var keys = [];
    var busy = rec.stopping;
    switch (audioState) {
      case AUDIO.IDLE:
      case AUDIO.ERROR:
        if (rec.blob) {
          keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', primary: true, onPress: play });
          keys.push({ id: 'rerecord', text: 'Re-record', label: 'Re-record', icon: 'rerecord', onPress: reRecord });
        } else {
          keys.push({ id: 'rec', text: 'REC', label: 'Record', icon: 'rec', rec: true, primary: true, onPress: startRecording });
        }
        break;
      case AUDIO.REQUESTING_MIC:
        keys.push({ id: 'rec', text: 'REC', label: 'Record', icon: 'rec', rec: true, primary: true, disabled: true });
        break;
      case AUDIO.RECORDING:
        if (pauseSupported()) keys.push({ id: 'pause', text: 'Pause', label: 'Pause recording', icon: 'pause', disabled: busy, onPress: pauseRecording });
        keys.push({ id: 'stop', text: 'Stop', label: 'Stop recording', icon: 'stop', primary: true, disabled: busy, onPress: stopRecording });
        break;
      case AUDIO.PAUSED_RECORDING:
        keys.push({ id: 'resume', text: 'Resume', label: 'Resume recording', icon: 'rec', rec: true, disabled: busy, onPress: resumeRecording });
        keys.push({ id: 'stop', text: 'Stop', label: 'Stop recording', icon: 'stop', primary: true, disabled: busy, onPress: stopRecording });
        break;
      case AUDIO.STOPPED:
        keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', primary: true, onPress: play });
        keys.push({ id: 'rerecord', text: 'Re-record', label: 'Re-record', icon: 'rerecord', onPress: reRecord });
        break;
      case AUDIO.PLAYING:
        keys.push({ id: 'pause', text: 'Pause', label: 'Pause', icon: 'pause', primary: true, onPress: pausePlayback });
        break;
      case AUDIO.PAUSED_PLAYBACK:
        keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', primary: true, onPress: play });
        keys.push({ id: 'replay', text: 'Replay', label: 'Replay', icon: 'replay', onPress: replay });
        keys.push({ id: 'rerecord', text: 'Re-record', label: 'Re-record', icon: 'rerecord', onPress: reRecord });
        break;
      case AUDIO.FINISHED:
        keys.push({ id: 'replay', text: 'Replay', label: 'Replay', icon: 'replay', primary: true, onPress: replay });
        keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', onPress: play });
        keys.push({ id: 'rerecord', text: 'Re-record', label: 'Re-record', icon: 'rerecord', onPress: reRecord });
        break;
      case AUDIO.RE_RECORDING:
        keys.push({ id: 'rec', text: 'REC', label: 'Record', icon: 'rec', rec: true, primary: true, disabled: true });
        break;
    }
    DECK.renderKeys(deck.keys, keys);
  }

  function showRecordError(message, canRetry) {
    els.recordErrorText.textContent = message;
    els.recordRetry.hidden = !canRetry;
    els.recordError.hidden = false;
  }

  function hideRecordError() {
    els.recordError.hidden = true;
  }

  function stopStream() {
    if (rec.stream) {
      rec.stream.getTracks().forEach(function (track) {
        try { track.stop(); } catch (_e) {}
      });
    }
    rec.stream = null;
  }

  function clearLimitTimer() {
    if (rec.limitTimer) window.clearTimeout(rec.limitTimer);
    rec.limitTimer = 0;
  }

  function scheduleLimit() {
    clearLimitTimer();
    var remaining = Math.max(0, MAX_SECONDS - recordedSeconds());
    rec.limitTimer = window.setTimeout(function () {
      if (audioState === AUDIO.RECORDING) {
        toast('That’s the full 5 minutes. Your recording is ready.', 'info');
        stopRecording();
      }
    }, remaining * 1000);
  }

  function limitWatch() {
    if (audioState !== AUDIO.RECORDING || rec.stopping) return;
    if (recordedSeconds() >= MAX_SECONDS) {
      toast('That’s the full 5 minutes. Your recording is ready.', 'info');
      stopRecording();
      return;
    }
    window.requestAnimationFrame(limitWatch);
  }

  function startRecording() {
    hideRecordError();
    if (!recorderSupported()) {
      setAudioState(AUDIO.ERROR);
      showRecordError('Recording isn’t supported in this browser. Try the latest Chrome, Safari, Edge or Firefox.', false);
      return;
    }

    setAudioState(AUDIO.REQUESTING_MIC);
    var constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      if (audioState !== AUDIO.REQUESTING_MIC) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      rec.stream = stream;

      var mime = pickMimeType();
      var recorder;
      try {
        recorder = new window.MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 });
      } catch (_e) {
        try {
          recorder = new window.MediaRecorder(stream);
        } catch (_e2) {
          stopStream();
          setAudioState(AUDIO.ERROR);
          showRecordError('Recording isn’t supported in this browser. Try the latest Chrome, Safari, Edge or Firefox.', false);
          return;
        }
      }

      rec.recorder = recorder;
      rec.mime = recorder.mimeType || mime || '';
      rec.chunks = [];
      rec.elapsed = 0;
      rec.stopping = false;

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) rec.chunks.push(e.data);
      };
      recorder.onstop = finalizeRecording;
      recorder.onerror = function () {
        failRecording('Something went wrong while recording. Please try again.');
      };

      try {
        recorder.start(1000);
      } catch (_e) {
        failRecording('Your microphone could not start recording. Please try again.');
        return;
      }

      rec.segmentStart = now();
      setAudioState(AUDIO.RECORDING);
      scheduleLimit();
      window.requestAnimationFrame(limitWatch);
      track('cassette_recording_started');
    }).catch(function (err) {
      stopStream();
      if (audioState !== AUDIO.REQUESTING_MIC) return;
      setAudioState(AUDIO.ERROR);
      var name = err && err.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        showRecordError('Microphone access is needed to record your cassette.', true);
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        showRecordError('No microphone was found. Connect one and try again.', true);
      } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
        showRecordError('Your microphone is busy in another app. Close it and try again.', true);
      } else {
        showRecordError('Your microphone could not be started. Please try again.', true);
      }
    });
  }

  function failRecording(message) {
    clearLimitTimer();
    rec.stopping = false;
    var recorder = rec.recorder;
    rec.recorder = null;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_e) {}
    }
    stopStream();
    rec.chunks = [];
    rec.elapsed = 0;
    setAudioState(AUDIO.ERROR);
    showRecordError(message, true);
  }

  function pauseRecording() {
    if (audioState !== AUDIO.RECORDING || !rec.recorder || rec.stopping) return;
    try {
      rec.recorder.pause();
    } catch (_e) {
      return;
    }
    rec.elapsed += (now() - rec.segmentStart) / 1000;
    clearLimitTimer();
    setAudioState(AUDIO.PAUSED_RECORDING);
  }

  function resumeRecording() {
    if (audioState !== AUDIO.PAUSED_RECORDING || !rec.recorder || rec.stopping) return;
    try {
      rec.recorder.resume();
    } catch (_e) {
      return;
    }
    rec.segmentStart = now();
    setAudioState(AUDIO.RECORDING);
    scheduleLimit();
    window.requestAnimationFrame(limitWatch);
  }

  function stopRecording() {
    if ((audioState !== AUDIO.RECORDING && audioState !== AUDIO.PAUSED_RECORDING) || !rec.recorder || rec.stopping) return;
    if (audioState === AUDIO.RECORDING) rec.elapsed += (now() - rec.segmentStart) / 1000;
    rec.elapsed = Math.min(MAX_SECONDS, rec.elapsed);
    clearLimitTimer();
    rec.stopping = true;

    if (deck) {
      deck.setState('STOPPED');
      deck.setActive(false);
    }
    setAudioState(audioState);
    try {
      rec.recorder.stop();
    } catch (_e) {
      finalizeRecording();
    }
  }

  function finalizeRecording() {
    var recorder = rec.recorder;
    rec.recorder = null;
    rec.stopping = false;
    stopStream();

    var type = (recorder && recorder.mimeType) || rec.mime || (rec.chunks[0] && rec.chunks[0].type) || 'audio/webm';
    var blob = new Blob(rec.chunks, { type: type.split(';')[0] });
    rec.chunks = [];

    if (!blob.size || rec.elapsed < 0.5) {
      rec.elapsed = 0;
      setAudioState(AUDIO.ERROR);
      showRecordError('That recording was too short. Press REC and try again.', false);
      return;
    }

    releaseRecording();
    rec.blob = blob;
    rec.duration = rec.elapsed;
    rec.url = URL.createObjectURL(blob);
    els.audio.src = rec.url;
    els.audio.load();
    playback.lastTime = 0;
    playback.lastAt = now();
    playback.played = false;
    shared.id = null;
    shared.url = '';

    setAudioState(AUDIO.STOPPED);
    track('cassette_recording_completed', { seconds: Math.round(rec.duration) });

    if (window.LBCassetteVideo) {
      window.LBCassetteVideo.measureDuration(blob).then(function (seconds) {
        if (!seconds || rec.blob !== blob) return;
        rec.duration = seconds;
        if (deck && audioState !== AUDIO.RECORDING && audioState !== AUDIO.PAUSED_RECORDING) deck.setTotal(seconds);
      });
    }
  }

  function releaseRecording() {
    if (videoSaver) videoSaver.reset();
    try { els.audio.pause(); } catch (_e) {}
    if (els.audio.getAttribute('src')) {
      els.audio.removeAttribute('src');
      try { els.audio.load(); } catch (_e) {}
    }
    if (rec.url) URL.revokeObjectURL(rec.url);
    rec.url = '';
    rec.blob = null;
    rec.duration = 0;
  }

  function play() {
    if (!rec.blob) return;
    hideRecordError();
    if (audioState === AUDIO.FINISHED || (rec.duration && els.audio.currentTime >= rec.duration - 0.05)) {
      try { els.audio.currentTime = 0; } catch (_e) {}
    }
    var attempt;
    try {
      attempt = els.audio.play();
    } catch (_e) {
      onPlaybackError();
      return;
    }
    if (attempt && typeof attempt.then === 'function') {
      attempt.catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (err && err.name === 'NotAllowedError') {
          toast('Tap Play again to listen.', 'info');
          return;
        }
        onPlaybackError();
      });
    }
    if (!playback.played) {
      playback.played = true;
      track('cassette_played', { role: 'creator' });
    }
  }

  function pausePlayback() {
    try { els.audio.pause(); } catch (_e) {}
  }

  function replay() {
    if (!rec.blob) return;
    try { els.audio.currentTime = 0; } catch (_e) {}
    playback.lastTime = 0;
    playback.lastAt = now();
    play();
  }

  function reRecord() {
    if (audioState === AUDIO.RECORDING || audioState === AUDIO.PAUSED_RECORDING || rec.stopping) return;
    hideRecordError();
    releaseRecording();
    shared.id = null;
    shared.url = '';
    rec.elapsed = 0;
    setAudioState(AUDIO.RE_RECORDING);
    if (deck) deck.windTo(0);
    window.setTimeout(function () {
      if (audioState === AUDIO.RE_RECORDING) setAudioState(AUDIO.IDLE);
    }, DECK.reducedMotion() ? 50 : 650);
  }

  function onPlaybackError() {
    if (!rec.blob) return;
    setAudioState(AUDIO.PAUSED_PLAYBACK);
    showRecordError('This recording couldn’t be played back here, but it was recorded. You can still finish your cassette or record again.', false);
  }

  function bindAudioEvents() {
    var audio = els.audio;
    audio.addEventListener('playing', function () {
      playback.waiting = false;
      playback.lastAt = now();
      if (rec.blob) setAudioState(AUDIO.PLAYING);
    });
    audio.addEventListener('play', function () {
      if (rec.blob) setAudioState(AUDIO.PLAYING);
    });
    audio.addEventListener('waiting', function () {
      playback.waiting = true;
      if (deck) deck.setActive(false);
    });
    audio.addEventListener('pause', function () {
      if (!rec.blob || audio.ended) return;
      if (audioState === AUDIO.PLAYING) setAudioState(AUDIO.PAUSED_PLAYBACK);
    });
    audio.addEventListener('ended', function () {
      if (!rec.blob) return;
      setAudioState(AUDIO.FINISHED);
    });
    audio.addEventListener('timeupdate', function () {

      if (rec.blob && isFinite(audio.duration) && audio.duration > 0 && Math.abs(audio.duration - rec.duration) > 0.25) {
        rec.duration = audio.duration;
        if (deck) deck.setTotal(rec.duration);
      }
    });
    audio.addEventListener('error', function () {
      if (!rec.blob || !audio.getAttribute('src')) return;
      onPlaybackError();
    });
  }

  function openRecord() {
    var design = ART.design(cover.design);
    if (!design) return;
    show('record');
    hideRecordError();

    var ready = deckArt && deckArt.design.id === cover.design
      ? Promise.resolve(deckArt)
      : ART.create(cover.design);

    ready.then(function (instance) {
      if (!deck) {
        deck = DECK.create(els.deckMount, { keysLabel: 'Recorder controls' });
      }
      if (deckArt !== instance) {
        deckArt = instance;
        deck.setArt(instance);
      }
      deckArt.update(coverState());
      deckArt.svg.setAttribute('role', 'img');
      deckArt.svg.setAttribute('aria-label', describeCassette());
      deckArt.svg.removeAttribute('aria-hidden');

      setAudioState(rec.blob ? AUDIO.STOPPED : AUDIO.IDLE);
      deck.setState('INSERTING');
      renderRecordKeys();
      Array.prototype.forEach.call(deck.keys.querySelectorAll('button'), function (b) { b.disabled = true; });

      return deck.insert({ duration: 1900 }).then(function () {
        setAudioState(rec.blob ? AUDIO.STOPPED : AUDIO.IDLE);
        deck.windTo(rec.blob ? 0 : Math.min(1, rec.elapsed / MAX_SECONDS));
        deck.revealKeys();
        var first = deck.keys.querySelector('button:not([disabled])');
        if (first) DECK.focusForKeyboard(first);
      });
    }).catch(function () {
      toast('That cassette could not be loaded. Check your connection and try again.', 'error');
      show('cover');
    });
  }

  function backToCover() {
    if (audioState === AUDIO.RECORDING || audioState === AUDIO.PAUSED_RECORDING || rec.stopping) return;
    pausePlayback();
    els.recordBack.disabled = true;
    els.finish.disabled = true;
    var done = deck ? deck.eject() : Promise.resolve();
    done.then(function () {
      openCover();
      els.recordBack.disabled = false;
    });
  }

  function messageHasLink() {
    if (!window.LBInputGuard || !window.LBInputGuard.hasLink(cover.message)) return false;
    toast('Links can’t be added to a cassette label.', 'error');
    if (els.app.getAttribute('data-step') === 'cover') els.message.focus();
    return true;
  }

  function finish() {
    if (!rec.blob || !cover.design) return;
    if (messageHasLink()) return;
    pausePlayback();
    show('final');
    renderFinalArt();
    upload();
  }

  function renderFinalArt() {
    ART.create(cover.design).then(function (instance) {
      instance.update(coverState());
      instance.setTape(0, null);
      instance.svg.setAttribute('role', 'img');
      instance.svg.setAttribute('aria-label', describeCassette());
      instance.svg.removeAttribute('aria-hidden');
      while (els.finalArt.firstChild) els.finalArt.removeChild(els.finalArt.firstChild);
      els.finalArt.appendChild(instance.svg);
    }).catch(function () {});
  }

  function setFinalBusy(busy, label) {
    shared.uploading = busy;
    els.finalTitle.textContent = busy ? 'Saving your cassette…' : 'Your cassette is ready.';
    els.finalProgress.hidden = !busy;
    els.finalProgressText.textContent = label || '';
    els.share.disabled = busy || !shared.id;
    els.save.disabled = busy || !!(videoSaver && videoSaver.busy());
    els.finalEdit.disabled = busy;
  }

  function upload() {
    if (shared.uploading) return;
    if (shared.id && shared.blobUsed === rec.blob) {
      setFinalBusy(false);
      els.saveError.hidden = true;
      return;
    }
    els.saveError.hidden = true;
    els.shareLink.hidden = true;

    if (typeof navigator.onLine === 'boolean' && navigator.onLine === false) {
      showSaveError('offline');
      return;
    }

    setFinalBusy(true, 'Uploading your recording');
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var saveTimer = window.setTimeout(function () { if (controller) controller.abort(); }, 120000);

    var design = cover.design;
    var blob = rec.blob;
    var photoJob = cover.photo
      ? ART.renderCover(design, cover.photo, cover.photo.image)
      : Promise.resolve(null);

    photoJob.then(function (photoBlob) {
      var form = new FormData();
      form.append('meta', JSON.stringify({
        design: design,
        message: cover.message.trim(),
        date: cover.date,
        duration: Math.round(rec.duration * 100) / 100
      }));
      var ext = /mp4|m4a|aac/.test(blob.type) ? 'm4a' : (/ogg/.test(blob.type) ? 'ogg' : 'webm');
      form.append('audio', blob, 'cassette.' + ext);
      if (photoBlob) form.append('photo', photoBlob, 'cover.jpg');

      return fetch('/api/cassettes', {
        method: 'POST',
        headers: { 'x-lb-csrf': 'true' },
        credentials: 'same-origin',
        body: form,
        signal: controller ? controller.signal : undefined
      });
    }).then(function (res) {
      if (res.status === 429) throw new Error('rate-limited');
      if (res.status === 413) throw new Error('too-large');
      if (res.status === 503) throw new Error('unavailable');
      if (res.status === 400) {
        return res.json().catch(function () { return null; }).then(function (body) {
          var err = new Error('invalid');
          err.detail = body && typeof body.error === 'string' && body.error.length < 140 ? body.error : '';
          throw err;
        });
      }
      if (!res.ok) throw new Error('save-failed');
      return res.json().catch(function () { throw new Error('save-failed'); });
    }).then(function (data) {
      if (!data || !/^[a-f0-9]{32}$/.test(data.id || '')) throw new Error('save-failed');
      shared.id = data.id;
      shared.blobUsed = blob;
      shared.url = window.location.origin + '/studio/cassette/' + data.id;
      els.shareLink.value = shared.url;
      setFinalBusy(false);
      DECK.focusForKeyboard(els.share);
    }).catch(function (err) {
      var reason = err && err.message;
      if (err && err.name === 'AbortError') reason = 'timeout';
      if (typeof navigator.onLine === 'boolean' && navigator.onLine === false) reason = 'offline';
      showSaveError(reason, err && err.detail);
    }).then(function () {
      window.clearTimeout(saveTimer);
    });
  }

  var SAVE_ERRORS = {
    'rate-limited': 'Couldn’t save your cassette. You’re going a little fast; wait a moment.',
    'too-large': 'Your recording is too large to save. Try a shorter one.',
    'unavailable': 'Saving is unavailable right now. Try again in a few minutes.',
    'offline': 'You’re offline. Reconnect, then try again. Your cassette is still here.',
    'timeout': 'Saving took too long. Check your connection and try again.',
    'invalid': 'Couldn’t save your cassette. Check the label and try again.'
  };

  function showSaveError(reason, detail) {
    setFinalBusy(false);
    var message = detail || SAVE_ERRORS[reason] || 'Couldn’t save your cassette.';
    els.finalTitle.textContent = 'Almost there.';
    els.saveErrorText.textContent = message;
    els.saveError.hidden = false;
    els.share.disabled = true;
    toast(message, 'error');
    DECK.focusForKeyboard(els.saveRetry);
  }

  function shareCassette() {
    if (!shared.url) return;
    function copied() {
      copyToClipboard(shared.url).then(function (ok) {
        els.shareLink.hidden = false;
        if (ok) {
          toast('Link copied!', 'success');
        } else {
          els.shareLink.focus();
          els.shareLink.select();
          toast('Select the link below to send it.', 'info');
        }
      });
    }
    track('cassette_shared');
    if (navigator.share) {
      navigator.share({ title: 'A cassette for you', text: 'I made you a cassette.', url: shared.url })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          copied();
        });
      return;
    }
    copied();
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return !!ok;
    } catch (_e) {
      return false;
    }
  }

  function bindVideoSave() {
    if (!window.LBCassetteVideo) {
      els.save.hidden = true;
      return;
    }
    videoSaver = window.LBCassetteVideo.bindSaveButton({
      button: els.save,
      progress: els.videoProgress,
      fill: els.videoFill,
      text: els.videoText,
      cancel: els.videoCancel,
      title: 'My ConstBooth cassette',
      toast: toast,
      track: track,
      getInput: function () {
        pausePlayback();
        return { design: cover.design, state: coverState(), audio: rec.blob };
      }
    });
  }

  function startOver() {
    if (rec.blob && !shared.id && !window.confirm('Start a new cassette? Your recording will be discarded.')) return;
    releaseRecording();
    rec.elapsed = 0;
    shared.id = null;
    shared.url = '';
    shared.blobUsed = null;
    if (cover.photo) removePhoto(true);
    cover.message = '';
    cover.date = '';
    els.message.value = '';
    syncMessageControls();
    syncDateControls();
    if (deck) {
      deck.follow(function () { return 0; });
      deck.windTo(0);
      deck.setState('IDLE');
    }
    setAudioState(AUDIO.IDLE);
    renderArt();
    setCarouselIndex(0, false);
    show('choose');
  }

  function hasUnsavedWork() {
    return audioState === AUDIO.RECORDING || audioState === AUDIO.PAUSED_RECORDING || (rec.blob && !shared.id);
  }

  function teardown() {
    clearLimitTimer();
    if (rec.recorder) {
      rec.recorder.onstop = null;
      try { if (rec.recorder.state !== 'inactive') rec.recorder.stop(); } catch (_e) {}
      rec.recorder = null;
    }
    stopStream();
  }

  function bind() {
    els.chooseNext.addEventListener('click', openCover);
    els.headerBack.forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (!goBackOneStep()) return;
        e.preventDefault();

        e.stopPropagation();
      });
    });
    els.coverBack.addEventListener('click', function () {
      setAdjusting(false);
      show('choose');
      if (cover.design) selectDesign(cover.design, false);
      var checked = els.designs.querySelector('input:checked');
      if (checked) DECK.focusForKeyboard(checked);
    });
    els.coverNext.addEventListener('click', function () {
      if (messageHasLink()) return;
      setAdjusting(false);
      syncPhotoControls();
      openRecord();
    });

    els.photoAdd.addEventListener('click', function () { els.file.click(); });
    els.photoReplace.addEventListener('click', function () { els.file.click(); });
    els.photoRemove.addEventListener('click', function () { removePhoto(false); DECK.focusForKeyboard(els.photoAdd); });
    els.photoEdit.addEventListener('click', function () {
      setAdjusting(true);
      syncPhotoControls();
      DECK.focusForKeyboard(els.zoom);
    });
    els.photoDone.addEventListener('click', function () {
      setAdjusting(false);
      syncPhotoControls();
      DECK.focusForKeyboard(els.photoEdit);
    });
    els.file.addEventListener('change', onFileChosen);
    els.zoom.addEventListener('input', function () { setZoom(parseFloat(els.zoom.value) || 1); });
    els.previewLabel.addEventListener('keydown', onPreviewKey);

    els.message.addEventListener('input', function () {
      var chars = Array.from ? Array.from(els.message.value) : els.message.value.split('');
      if (chars.length > MESSAGE_MAX) {
        els.message.value = chars.slice(0, MESSAGE_MAX).join('');
      }
      cover.message = els.message.value.replace(/[\r\n\t]+/g, ' ');
      syncMessageControls();
      renderArt();
    });
    els.messageClear.addEventListener('click', function () {
      cover.message = '';
      els.message.value = '';
      syncMessageControls();
      renderArt();
      els.message.focus();
    });

    els.dateAdd.addEventListener('click', function () {
      els.dateInput.value = els.dateInput.value || todayIso();
      cover.date = isoToLabel(els.dateInput.value);
      syncDateControls();
      renderArt();
      els.dateInput.focus();
    });
    els.dateInput.addEventListener('change', function () {
      var label = isoToLabel(els.dateInput.value);
      if (!label) return;
      cover.date = label;
      renderArt();
    });
    els.dateRemove.addEventListener('click', function () {
      cover.date = '';
      syncDateControls();
      renderArt();
      DECK.focusForKeyboard(els.dateAdd);
    });

    els.recordBack.addEventListener('click', backToCover);
    els.recordRetry.addEventListener('click', startRecording);
    els.finish.addEventListener('click', finish);

    els.saveRetry.addEventListener('click', upload);
    els.share.addEventListener('click', shareCassette);
    els.finalEdit.addEventListener('click', function () {
      if (shared.uploading) return;
      openRecord();
    });
    els.startOver.addEventListener('click', startOver);

    window.addEventListener('beforeunload', function (e) {
      if (!hasUnsavedWork()) return;
      e.preventDefault();
      e.returnValue = '';
    });
    window.addEventListener('pagehide', teardown);
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) window.location.reload();
    });

    window.addEventListener('load', function () {
      Array.prototype.forEach.call(els.designs.querySelectorAll('input'), function (input) {
        input.checked = input.value === cover.design;
      });
      if (!cover.message) els.message.value = '';
      if (!cover.date) els.dateInput.value = '';
    });
    document.addEventListener('visibilitychange', function () {

      if (!document.hidden && audioState === AUDIO.RECORDING) {
        if (recordedSeconds() >= MAX_SECONDS) stopRecording();
        else { scheduleLimit(); window.requestAnimationFrame(limitWatch); }
      }
    });

    bindAudioEvents();
  }

  var isBooted = false;
  function boot() {
    if (isBooted) return;
    isBooted = true;
    els = {
      app: byId('cs-app'),
      headerBack: ['nav-back-btn', 'mobile-back-btn'].map(byId).filter(Boolean),
      step_choose: byId('cs-step-choose'),
      step_cover: byId('cs-step-cover'),
      step_record: byId('cs-step-record'),
      step_final: byId('cs-step-final'),
      designs: byId('cs-designs'),
      carouselWrap: byId('cs-carousel-wrap'),
      carouselStage: byId('cs-carousel-stage'),
      carouselPrev: byId('cs-carousel-prev'),
      carouselNext: byId('cs-carousel-next'),
      carouselDots: byId('cs-carousel-dots'),
      chooseNext: byId('cs-choose-next'),
      preview: byId('cs-preview'),
      previewLabel: byId('cs-preview-frame'),
      photoHint: byId('cs-photo-hint'),
      photoAdd: byId('cs-photo-add'),
      photoReplace: byId('cs-photo-replace'),
      photoRemove: byId('cs-photo-remove'),
      photoEdit: byId('cs-photo-edit'),
      photoAdjust: byId('cs-photo-adjust'),
      photoDone: byId('cs-photo-done'),
      zoom: byId('cs-photo-zoom'),
      file: byId('cs-file'),
      message: byId('cs-message'),
      messageCount: byId('cs-message-count'),
      messageClear: byId('cs-message-clear'),
      dateAdd: byId('cs-date-add'),
      dateRow: byId('cs-date-row'),
      dateInput: byId('cs-date'),
      dateRemove: byId('cs-date-remove'),
      coverBack: byId('cs-cover-back'),
      coverNext: byId('cs-cover-next'),
      deckMount: byId('cs-deck-mount'),
      recordStatus: byId('cs-record-status'),
      recordError: byId('cs-record-error'),
      recordErrorText: byId('cs-record-error-text'),
      recordRetry: byId('cs-record-retry'),
      recordBack: byId('cs-record-back'),
      finish: byId('cs-finish'),
      audio: byId('cs-audio'),
      finalTitle: byId('cs-final-title'),
      finalArt: byId('cs-final-art'),
      finalProgress: byId('cs-final-progress'),
      finalProgressText: byId('cs-final-progress-text'),
      saveError: byId('cs-save-error'),
      saveErrorText: byId('cs-save-error-text'),
      saveRetry: byId('cs-save-retry'),
      share: byId('cs-share'),
      save: byId('cs-save'),
      videoProgress: byId('cs-video-progress'),
      videoFill: byId('cs-video-fill'),
      videoText: byId('cs-video-text'),
      videoCancel: byId('cs-video-cancel'),
      shareLink: byId('cs-share-link'),
      finalEdit: byId('cs-final-edit'),
      startOver: byId('cs-start-over')
    };
    if (!els.app || !ART || !DECK) return;

    try { window.sessionStorage.removeItem(LEGACY_DRAFT_KEY); } catch (_e) {}
    buildDesignChoices();
    setCarouselIndex(0, false);
    els.message.value = '';
    els.dateInput.value = '';
    els.message.setAttribute('maxlength', String(MESSAGE_MAX));
    syncMessageControls();
    syncDateControls();
    syncPhotoControls();
    bind();
    syncHeaderBack('choose');
    bindVideoSave();
    setAudioState(AUDIO.IDLE);
    els.app.removeAttribute('aria-busy');
    track('cassette_opened');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
