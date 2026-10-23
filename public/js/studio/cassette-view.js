(function (window, document) {
  'use strict';

  var ART = window.LBCassetteArt;
  var DECK = window.LBCassetteDeck;

  var ID_PATTERN = /^\/studio\/cassette\/([a-f0-9]{32})(?:\/|\?|#|$)/i;
  var VALID_ID = /^[a-f0-9]{32}$/i;
  var VOLUME_KEY = 'lb_cassette_volume';

  var els = {};
  var state = 'LOADING';
  var cassetteId = null;
  var data = null;
  var deck = null;
  var art = null;
  var audio = null;
  var clock = { lastTime: 0, lastAt: 0, waiting: false, played: false };

  function byId(id) { return document.getElementById(id); }

  function now() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  function track(name, params) {
    try {
      if (typeof window.trackGA4Event === 'function') window.trackGA4Event(name, params || {});
    } catch (_e) {}
  }

  function toast(message, kind) {
    var type = kind || 'info';
    if (typeof window.showPillMessage === 'function') {
      window.showPillMessage(message, { type: type, duration: type === 'error' ? 3200 : 2500 });
    } else if (window.LBExport && window.LBExport.toast) {
      window.LBExport.toast(message, type);
    }
  }

  function setState(next) {
    state = next;
    els.app.setAttribute('data-state', next);
    renderKeys();
    renderStatus();
    if (!deck) return;
    var deckState = { READY: 'INSERTED', PLAYING: 'PLAYING', PAUSED: 'PAUSED_PLAYBACK', FINISHED: 'STOPPED' }[next];
    if (deckState) deck.setState(deckState);
    deck.setActive(next === 'PLAYING' && !clock.waiting);
  }

  function showError(kind) {
    var copy = {
      invalid: {
        title: 'This link isn’t quite right.',
        text: 'The cassette link looks incomplete. Ask whoever sent it to share it again.',
        retry: false
      },
      missing: {
        title: 'This cassette isn’t available.',
        text: 'It may have been removed, or the link may be incomplete. Ask whoever sent it for a new link.',
        retry: false
      },
      expired: {
        title: 'This cassette has expired.',
        text: 'Cassettes are kept for 30 days. Ask whoever sent it to record a new one.',
        retry: false
      },
      network: {
        title: 'Couldn’t load this cassette.',
        text: 'Check your connection and try again.',
        retry: true
      },
      offline: {
        title: 'You’re offline.',
        text: 'Reconnect to the internet, then try again.',
        retry: true
      },
      busy: {
        title: 'Lots of people are listening.',
        text: 'Wait a moment, then try again.',
        retry: true
      },
      design: {
        title: 'Couldn’t load this cassette.',
        text: 'Something went wrong while loading it. Try again in a moment.',
        retry: true
      }
    }[kind] || null;

    state = 'ERROR';
    els.app.setAttribute('data-state', 'ERROR');
    els.loading.hidden = true;
    els.main.hidden = true;
    els.error.hidden = false;
    els.errorTitle.textContent = copy.title;
    els.errorText.textContent = copy.text;
    els.retry.hidden = !copy.retry;
    els.errorTitle.focus();
  }

  function load() {
    els.error.hidden = true;
    els.loading.hidden = false;
    els.main.hidden = true;
    state = 'LOADING';
    els.app.setAttribute('data-state', 'LOADING');

    var match = ID_PATTERN.exec(window.location.pathname);
    if (!match || !VALID_ID.test(match[1])) {
      showError('invalid');
      return;
    }
    cassetteId = match[1].toLowerCase();

    if (typeof navigator.onLine === 'boolean' && navigator.onLine === false) {
      showError('offline');
      return;
    }

    fetch('/api/cassettes/' + cassetteId, { credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 404) throw new Error('missing');
        if (res.status === 410) throw new Error('expired');
        if (res.status === 429) throw new Error('busy');
        if (!res.ok) throw new Error('network');
        return res.json().catch(function () { throw new Error('network'); });
      }, function () {
        throw new Error('network');
      })
      .then(function (json) {
        if (!json || !json.audio || !json.audio.url || !ART.design(json.design)) throw new Error('missing');
        data = json;
        return Promise.all([
          ART.create(json.design).catch(function () { throw new Error('design'); }),
          loadPhoto(json.photo)
        ]);
      })
      .then(function (results) {
        art = results[0];
        art.update({ message: data.message, date: data.date, photo: results[1] });
        art.svg.setAttribute('role', 'img');
        art.svg.setAttribute('aria-label', describe());
        art.svg.removeAttribute('aria-hidden');
        present();
      })
      .catch(function (err) {
        var reason = err && err.message;
        if (typeof navigator.onLine === 'boolean' && navigator.onLine === false) reason = 'offline';
        showError(['missing', 'expired', 'design', 'busy', 'offline'].indexOf(reason) !== -1 ? reason : 'network');
      });
  }

  function loadPhoto(photo) {
    if (!photo || !photo.url) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var img = new Image();
      var settled = false;
      function done(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      img.onload = function () {
        done({ url: photo.url, width: img.naturalWidth, height: img.naturalHeight, zoom: 1, fx: 0.5, fy: 0.5 });
      };
      img.onerror = function () { done(null); };
      window.setTimeout(function () { done(null); }, 8000);
      img.src = photo.url;
    });
  }

  function describe() {
    var design = ART.design(data.design);
    var parts = [(design ? design.name : 'A') + ' cassette'];
    if (data.message) parts.push('labelled “' + data.message + '”');
    if (data.date) parts.push('dated ' + data.date);
    if (data.photo) parts.push('with a photo on the cover');
    return parts.join(', ');
  }

  function present() {
    els.loading.hidden = true;
    els.main.hidden = false;
    if (data.message) {
      els.note.textContent = data.message;
      els.noteWrap.hidden = false;
    }

    deck = DECK.create(els.deckMount, { keysLabel: 'Player controls' });
    deck.setArt(art);
    deck.setTotal(data.duration);
    deck.follow(playbackSeconds);

    buildAudio();

    state = 'CASSETTE_APPEARS';
    els.app.setAttribute('data-state', state);
    renderKeys();
    renderStatus();

    window.requestAnimationFrame(function () {
      window.setTimeout(function () {
        state = 'INSERTING';
        els.app.setAttribute('data-state', state);
        renderStatus();
        deck.insert({ duration: 2700 }).then(function () {
          deck.windTo(0);
          setState('READY');
          deck.revealKeys();
          var first = deck.keys.querySelector('button');
          if (first) DECK.focusForKeyboard(first);
        });
      }, DECK.reducedMotion() ? 0 : 350);
    });
  }

  function renderStatus() {
    var text = {
      CASSETTE_APPEARS: '',
      INSERTING: 'Loading the cassette…',
      READY: 'Press Play to listen.',
      PLAYING: clock.waiting ? 'Buffering…' : 'Playing.',
      PAUSED: 'Paused.',
      FINISHED: 'That’s the end of the tape.'
    }[state];
    if (typeof text === 'string' && els.status.textContent !== text) els.status.textContent = text;
  }

  function renderKeys() {
    if (!deck) return;
    var keys = [];
    var loading = state === 'CASSETTE_APPEARS' || state === 'INSERTING';
    if (loading) {
      keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', primary: true, disabled: true });
    } else if (state === 'READY') {
      keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', primary: true, onPress: play });
    } else if (state === 'PLAYING') {
      keys.push({ id: 'pause', text: 'Pause', label: 'Pause', icon: 'pause', primary: true, onPress: pause });
      keys.push({ id: 'replay', text: 'Replay', label: 'Replay', icon: 'replay', onPress: replay });
    } else if (state === 'PAUSED') {
      keys.push({ id: 'play', text: 'Play', label: 'Play', icon: 'play', primary: true, onPress: play });
      keys.push({ id: 'replay', text: 'Replay', label: 'Replay', icon: 'replay', onPress: replay });
    } else if (state === 'FINISHED') {
      keys.push({ id: 'replay', text: 'Replay', label: 'Replay', icon: 'replay', primary: true, onPress: replay });
    }
    DECK.renderKeys(deck.keys, keys);
  }

  function playbackSeconds() {
    if (!audio) return 0;
    var t = audio.currentTime || 0;
    var at = now();
    if (t !== clock.lastTime) {
      clock.lastTime = t;
      clock.lastAt = at;
    }
    var limit = totalSeconds();
    if (state === 'PLAYING' && !clock.waiting && !audio.paused) {
      return Math.min(limit, t + Math.min(0.35, (at - clock.lastAt) / 1000));
    }
    return Math.min(limit, t);
  }

  function totalSeconds() {
    if (audio && isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    return data && data.duration > 0 ? data.duration : Infinity;
  }

  function buildAudio() {
    audio = els.audio;
    audio.preload = 'none';
    audio.src = data.audio.url;

    audio.addEventListener('play', function () {
      if (state !== 'ERROR') setState('PLAYING');
    });
    audio.addEventListener('playing', function () {
      clock.waiting = false;
      clock.lastAt = now();
      if (state !== 'ERROR') setState('PLAYING');
    });
    audio.addEventListener('waiting', function () {
      clock.waiting = true;
      if (deck) deck.setActive(false);
      renderStatus();
    });
    audio.addEventListener('pause', function () {
      if (audio.ended || state === 'ERROR') return;
      if (state === 'PLAYING') setState('PAUSED');
    });
    audio.addEventListener('ended', function () {
      clock.waiting = false;
      setState('FINISHED');
    });
    audio.addEventListener('durationchange', function () {
      if (deck && isFinite(audio.duration) && audio.duration > 0) deck.setTotal(audio.duration);
    });
    audio.addEventListener('error', function () {
      if (state === 'LOADING' || state === 'CASSETTE_APPEARS' || state === 'INSERTING') return;
      playbackFailed();
    });

    restoreVolume();
  }

  function playbackFailed() {
    clock.waiting = false;
    if (deck) {
      deck.setActive(false);
      deck.setState('STOPPED');
    }
    state = 'PAUSED';
    els.app.setAttribute('data-state', 'PAUSED');
    renderKeys();
    els.status.textContent = 'This recording couldn’t be played on this device. Check your connection, or try another browser.';
  }

  function play() {
    if (!audio) return;
    if (state === 'FINISHED' || audio.ended) {
      try { audio.currentTime = 0; } catch (_e) {}
    }
    if (audio.error) {

      audio.src = data.audio.url;
      audio.load();
    }
    var attempt;
    try {
      attempt = audio.play();
    } catch (_e) {
      playbackFailed();
      return;
    }
    if (attempt && typeof attempt.then === 'function') {
      attempt.catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (err && err.name === 'NotAllowedError') {
          els.status.textContent = 'Press Play to listen.';
          return;
        }
        playbackFailed();
      });
    }
    if (!clock.played) {
      clock.played = true;
      track('cassette_played', { role: 'receiver' });
    }
  }

  function pause() {
    if (audio) audio.pause();
  }

  function replay() {
    if (!audio) return;
    try { audio.currentTime = 0; } catch (_e) {}
    clock.lastTime = 0;
    clock.lastAt = now();
    if (deck) deck.windTo(0);
    play();
  }

  function restoreVolume() {
    var saved = null;
    try { saved = window.localStorage.getItem(VOLUME_KEY); } catch (_e) {}

    var level = Number(saved);
    var value = saved !== null && isFinite(level) && level > 0 ? Math.min(1, level) : 1;
    audio.volume = value;
    els.volume.value = String(Math.round(value * 100));
    syncMute();
  }

  function rememberVolume(value) {
    try { window.localStorage.setItem(VOLUME_KEY, String(value)); } catch (_e) {}
  }

  function syncMute() {
    var muted = audio.muted || audio.volume === 0;
    els.mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    els.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    els.muteText.textContent = muted ? 'Unmute' : 'Mute';
    els.mute.classList.toggle('is-muted', muted);
  }

  function bindVideoSave() {
    if (!window.LBCassetteVideo) {
      els.save.hidden = true;
      return;
    }
    var audioBlob = null;
    window.LBCassetteVideo.bindSaveButton({
      button: els.save,
      progress: els.videoProgress,
      fill: els.videoFill,
      text: els.videoText,
      cancel: els.videoCancel,
      title: 'A ConstBooth cassette',
      toast: toast,
      track: function (name, params) {
        params.role = 'receiver';
        track(name, params);
      },
      getInput: function () {
        if (audio) audio.pause();
        var fetchAudio = audioBlob
          ? Promise.resolve(audioBlob)
          : fetch(data.audio.url, { credentials: 'same-origin' }).then(function (res) {
            if (!res.ok) throw new Error('audio');
            return res.blob();
          }).then(function (blob) {
            audioBlob = blob;
            return blob;
          });
        return fetchAudio.then(function (blob) {
          return { design: data.design, state: art ? art.state() : { message: data.message, date: data.date, photo: null }, audio: blob };
        });
      }
    });
  }

  var isBooted = false;
  function boot() {
    if (isBooted) return;
    isBooted = true;
    els = {
      app: byId('cs-view'),
      loading: byId('cs-view-loading'),
      main: byId('cs-view-main'),
      error: byId('cs-view-error'),
      errorTitle: byId('cs-view-error-title'),
      errorText: byId('cs-view-error-text'),
      retry: byId('cs-view-retry'),
      deckMount: byId('cs-deck-mount'),
      status: byId('cs-view-status'),
      noteWrap: byId('cs-view-note'),
      note: byId('cs-view-note-text'),
      audio: byId('cs-audio'),
      mute: byId('cs-mute'),
      muteText: byId('cs-mute-text'),
      volume: byId('cs-volume'),
      save: byId('cs-view-save'),
      videoProgress: byId('cs-video-progress'),
      videoFill: byId('cs-video-fill'),
      videoText: byId('cs-video-text'),
      videoCancel: byId('cs-video-cancel')
    };
    if (!els.app || !ART || !DECK) return;

    els.retry.addEventListener('click', load);
    bindVideoSave();
    els.mute.addEventListener('click', function () {
      if (!audio) return;
      if (audio.volume === 0) {
        audio.volume = 1;
        els.volume.value = '100';
        audio.muted = false;
        rememberVolume(1);
      } else {
        audio.muted = !audio.muted;
      }
      syncMute();
    });
    els.volume.addEventListener('input', function () {
      if (!audio) return;
      var value = Math.max(0, Math.min(100, Number(els.volume.value) || 0)) / 100;
      audio.volume = value;
      audio.muted = value === 0;
      if (value > 0) rememberVolume(value);
      syncMute();
    });

    window.addEventListener('pagehide', function () {
      if (audio) audio.pause();
    });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
