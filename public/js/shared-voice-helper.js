(function () {
  const isDebug = (function() {
    try {
      if (window.DEBUG_VOICE === true) return true;
      if (sessionStorage.getItem('lb_debug_voice') === '1') return true;
      const h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    } catch (_e) {}
    return false;
  })();

  function logDebug(...args) {
    if (isDebug) console.log(...args);
  }
  function warnDebug(...args) {
    if (isDebug) console.warn(...args);
  }

  let isSharedBooth = false;
  try {
    const boothParam = new URLSearchParams(window.location.search).get('booth');
    const boothStorage = sessionStorage.getItem("lb_booth_id") || localStorage.getItem("lb_booth_id");
    const boothType = localStorage.getItem("boothType");
    
    
    
    
    
    isSharedBooth = !!boothParam || (!!boothStorage && boothType !== "solo");
    logDebug("[LB-VOICE-DEBUG] isSharedBooth resolution", { boothParam, boothStorage, boothType, isSharedBooth, page: location.pathname });
  } catch (e) {}
  if (!isSharedBooth) return; 

  
  document.body.classList.add('shared-layout');
  const camSec = document.querySelector('.camera-section');
  if (camSec) camSec.classList.add('shared-layout');

  window._voiceEnabled = false; 
  window.localStream = null;

  
  let remoteAudioEl = null;
  let remoteAudioStream = null;
  let audioCtx = null;
  let audioSource = null;

  function getOrCreateRemoteAudio() {
    if (!remoteAudioEl) {
      remoteAudioEl = document.getElementById('shared-remote-audio');
      if (!remoteAudioEl) {
        remoteAudioEl = document.createElement('audio');
        remoteAudioEl.id = 'shared-remote-audio';
        remoteAudioEl.autoplay = true;
        remoteAudioEl.playsInline = true;
        remoteAudioEl.setAttribute('playsinline', '');
        remoteAudioEl.setAttribute('webkit-playsinline', '');
        remoteAudioEl.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 1px; height: 1px; opacity: 0.01; pointer-events: none; z-index: -100;';
        (document.body || document.documentElement).appendChild(remoteAudioEl);
      }
    }
    if (!remoteAudioStream) {
      remoteAudioStream = new MediaStream();
      
      
      
      
      
    }
    return remoteAudioEl;
  }

  
  
  
  
  
  
  
  
  function getAudioContext() {
    try {
      if (!audioCtx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        audioCtx = new Ctor();
      }
      return audioCtx;
    } catch (err) {
      return null;
    }
  }

  
  function ensureAudioContextResumed() {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (err) {}
  }

  
  
  function attachRemoteAudioStream() {
    if (!remoteAudioEl || !remoteAudioStream) return;
    if (!remoteAudioStream.getAudioTracks().length) return;
    if (remoteAudioEl.srcObject === remoteAudioStream) return;
    remoteAudioEl.srcObject = remoteAudioStream;
  }

  
  function playRemoteAudioStream(stream) {
    const audioEl = getOrCreateRemoteAudio();
    logDebug("[LB-VOICE-DEBUG] playRemoteAudioStream called", {
      hasAudioEl: !!audioEl,
      hasStream: !!stream,
      audioTrackCount: stream ? stream.getAudioTracks().length : 0
    });
    if (!audioEl || !stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    
    remoteAudioStream.getAudioTracks().forEach(oldTrack => {
      if (oldTrack.readyState === 'ended' || !audioTracks.some(t => t.id === oldTrack.id)) {
        try { remoteAudioStream.removeTrack(oldTrack); } catch (e) {}
      }
    });

    
    audioTracks.forEach(track => {
      const existing = remoteAudioStream.getAudioTracks().find(t => t.id === track.id);
      if (!existing) {
        remoteAudioStream.addTrack(track);
        
        
        track.addEventListener('unmute', () => {
          logDebug("[Shared Voice] Remote audio track unmuted.");
          ensureAudioContextResumed();
          if (audioEl.paused) {
            audioEl.play().catch(() => {});
          }
        });
      }
    });

    attachRemoteAudioStream();
    ensureAudioContextResumed();

    audioEl.muted = false;
    audioEl.removeAttribute('muted');
    audioEl.volume = 1.0;
    audioEl.play().then(() => {
      logDebug("[LB-VOICE-DEBUG] remote audio element play() succeeded", { paused: audioEl.paused, muted: audioEl.muted });
    }).catch(err => {
      warnDebug("[Shared Voice] Remote audio autoplay blocked, waiting for user gesture.", err);
      warnDebug("[LB-VOICE-DEBUG] remote audio element play() FAILED", { errName: err && err.name, errMsg: err && err.message });
    });
  }

  
  function unlockMobileAudio() {
    const audioEl = getOrCreateRemoteAudio();
    if (audioEl && remoteAudioStream) {
      
      remoteAudioStream.getAudioTracks().forEach(oldTrack => {
        if (oldTrack.readyState === 'ended') {
          try { remoteAudioStream.removeTrack(oldTrack); } catch (e) {}
        }
      });
      attachRemoteAudioStream();
      if (!audioEl.srcObject) return ensureAudioContextResumed();
      audioEl.muted = false;
      audioEl.removeAttribute('muted');
      audioEl.volume = 1.0;
      if (audioEl.paused) {
        audioEl.play().catch(() => {});
      }
    }
    ensureAudioContextResumed();
  }

  
  ['touchstart', 'touchend', 'click', 'pointerdown', 'focus'].forEach(evtName => {
    window.addEventListener(evtName, unlockMobileAudio, { passive: true, capture: true });
  });

  
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      unlockMobileAudio();
    }
  });

  
  
  
  
  
  
  
  
  const _peerConnections = [];
  function getLivePeerConnections() {
    for (let i = _peerConnections.length - 1; i >= 0; i--) {
      const pc = _peerConnections[i];
      if (!pc || pc.connectionState === 'closed' || pc.signalingState === 'closed') {
        _peerConnections.splice(i, 1);
      }
    }
    return _peerConnections;
  }

  
  
  function getRemoteTrackIds() {
    const ids = new Set();
    getLivePeerConnections().forEach(pc => {
      try {
        pc.getReceivers().forEach(r => { if (r.track) ids.add(r.track.id); });
      } catch (e) {}
    });
    return ids;
  }

  
  const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (OriginalRTCPeerConnection) {
    window.RTCPeerConnection = function (config, constraints) {
      const pc = new OriginalRTCPeerConnection(config, constraints);
      _peerConnections.push(pc);

      
      
      
      
      
      
      
      
      
      
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'closed') {
          const i = _peerConnections.indexOf(pc);
          if (i !== -1) _peerConnections.splice(i, 1);
        }
      });

      
      pc.addEventListener('track', (event) => {
        if (event.track && event.track.kind === 'audio') {
          
          const remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
          playRemoteAudioStream(remoteStream);

          
          event.track.addEventListener('ended', () => {
            warnDebug("[Shared Voice] Remote audio track ended.");
          });
        }
      });

      return pc;
    };
    
    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    Object.keys(OriginalRTCPeerConnection).forEach(key => {
      try { window.RTCPeerConnection[key] = OriginalRTCPeerConnection[key]; } catch (_e) {}
    });
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }
    
    if (OriginalRTCPeerConnection.generateCertificate) {
      window.RTCPeerConnection.generateCertificate = OriginalRTCPeerConnection.generateCertificate;
    }
  }

  
  let _markFn = null;
  Object.defineProperty(window, '__lbMarkCameraReady', {
    get() {
      return function () {
        if (typeof _markFn === 'function') { _markFn(); }
        if (typeof window.__lbSyncCaptureGate === 'function') { window.__lbSyncCaptureGate(); }
      };
    },
    set(val) { _markFn = val; },
    configurable: true
  });

  let _healFn = null;
  Object.defineProperty(window, '__lbHealCameraReady', {
    get() {
      return function () {
        let res = false;
        if (typeof _healFn === 'function') { res = _healFn(); }
        if (typeof window.__lbSyncCaptureGate === 'function') { window.__lbSyncCaptureGate(); }
        return res;
      };
    },
    set(val) { _healFn = val; },
    configurable: true
  });

  function forceSyncUI() {
    if (typeof window.__lbHealCameraReady === 'function') { window.__lbHealCameraReady(); }
    if (typeof window.__lbSyncCaptureGate === 'function') { window.__lbSyncCaptureGate(); }
  }

  
  
  function createSilentAudioTrack() {
    try {
      const silentAudioContext = getAudioContext();
      if (!silentAudioContext) return null;
      const osc = silentAudioContext.createOscillator();
      const gain = silentAudioContext.createGain();
      gain.gain.value = 0; 
      osc.connect(gain);
      const dst = silentAudioContext.createMediaStreamDestination();
      gain.connect(dst);
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false;
        track._isSilentFallback = true;
      }
      return track;
    } catch (e) {
      warnDebug("[Shared Voice] Failed to create silent audio track:", e);
      return null;
    }
  }

  
  function ensureStreamHasAudioTrack(stream) {
    if (!stream) return stream;
    if (stream.getAudioTracks().length === 0) {
      const silentTrack = createSilentAudioTrack();
      if (silentTrack) {
        stream.addTrack(silentTrack);
        logDebug("[Shared Voice] Added silent audio track to stream for initial SDP m=audio negotiation.");
      }
    }
    return stream;
  }

  
  
  
  window.__lbEnsureStreamHasAudioTrack = ensureStreamHasAudioTrack;

  
  
  
  
  
  
  
  
  
  
  
  
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const patchedGetUserMedia = async function (constraints) {
      
      
      
      
      
      
      
      const req = (constraints && typeof constraints === 'object')
        ? Object.assign({}, constraints)
        : constraints;
      if (req && req.video) {
        
        req.audio = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        };
      }
      try {
        const stream = await originalGetUserMedia(req);

        
        
        if (req && req.video) {
          ensureStreamHasAudioTrack(stream);
          window.localStream = stream;
        }

        
        stream.getAudioTracks().forEach(track => {
          track.enabled = window._voiceEnabled;
        });

        logDebug("[LB-VOICE-DEBUG] getUserMedia resolved (via patch)", {
          requestedVideo: !!(req && req.video),
          audioTracks: stream.getAudioTracks().map(t => ({ id: t.id, label: t.label, silent: !!t._isSilentFallback, enabled: t.enabled, readyState: t.readyState }))
        });

        setTimeout(forceSyncUI, 600);
        return stream;
      } catch (err) {
        
        if (req && req.audio) {
          warnDebug("[Shared Voice] Microphone access failed. Falling back to video-only with silent track.", err);
          
          const videoOnlyReq = Object.assign({}, req, { audio: false });

          const videoOnlyStream = await originalGetUserMedia(videoOnlyReq);
          if (videoOnlyReq.video) {
            ensureStreamHasAudioTrack(videoOnlyStream);
            window.localStream = videoOnlyStream;
          }
          logDebug("[LB-VOICE-DEBUG] getUserMedia resolved (via patch, video-only fallback after mic failure)", {
            audioTracks: videoOnlyStream.getAudioTracks().map(t => ({ id: t.id, silent: !!t._isSilentFallback, readyState: t.readyState }))
          });
          setTimeout(forceSyncUI, 600);
          return videoOnlyStream;
        }
        throw err;
      }
    };

    try {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: patchedGetUserMedia,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (defineErr) {
      try {
        navigator.mediaDevices.getUserMedia = patchedGetUserMedia;
      } catch (assignErr) {
        warnDebug("[LB-VOICE-DEBUG] getUserMedia patch install FAILED (both defineProperty and assignment)", { defineErr, assignErr });
      }
    }

    const patchInstalled = navigator.mediaDevices.getUserMedia === patchedGetUserMedia;
    logDebug("[LB-VOICE-DEBUG] getUserMedia patch install " + (patchInstalled ? "confirmed OK" : "DID NOT STICK - falling back to direct constraints in camera.min.js/ios-camera-fix.js"));
  }

  
  function updateMicUIState(isEnabled) {
    const allMicBtns = document.querySelectorAll('#mobile-mic-toggle, .mobile-mic-toggle');
    allMicBtns.forEach(btn => {
      if (isEnabled) {
        btn.classList.remove('mic-muted');
        btn.classList.add('mic-active');
      } else {
        btn.classList.remove('mic-active');
        btn.classList.add('mic-muted');
      }
      const mutedIcon = btn.querySelector('.mic-muted-icon');
      const activeIcon = btn.querySelector('.mic-active-icon');
      if (mutedIcon) mutedIcon.style.display = isEnabled ? 'none' : 'block';
      if (activeIcon) activeIcon.style.display = isEnabled ? 'block' : 'none';
    });
  }

  
  
  
  
  
  
  
  
  
  
  
  
  function streamHasLiveTrack(stream) {
    if (!stream || typeof stream.getTracks !== 'function') return false;
    return stream.getTracks().some(t => t.readyState === 'live');
  }

  function resolveLocalStream() {
    const remoteIds = getRemoteTrackIds();
    const isLocal = (stream) => {
      if (!streamHasLiveTrack(stream)) return false;
      return !stream.getTracks().some(t => remoteIds.has(t.id));
    };

    
    
    
    
    const mainVideo = document.getElementById('main-video');
    if (mainVideo && isLocal(mainVideo.srcObject)) {
      window.localStream = mainVideo.srcObject;
      return window.localStream;
    }

    if (streamHasLiveTrack(window.localStream)) return window.localStream;

    
    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      if (isLocal(videos[i].srcObject)) {
        window.localStream = videos[i].srcObject;
        return window.localStream;
      }
    }

    
    const senderTracks = [];
    getLivePeerConnections().forEach(pc => {
      try {
        pc.getSenders().forEach(s => {
          if (s.track && s.track.readyState === 'live') senderTracks.push(s.track);
        });
      } catch (e) {}
    });
    if (senderTracks.length) {
      window.localStream = new MediaStream(senderTracks);
      return window.localStream;
    }

    return null;
  }

  
  function getAudioSenders() {
    const senders = [];
    getLivePeerConnections().forEach(pc => {
      try {
        pc.getSenders().forEach(s => {
          if (s.track && s.track.kind === 'audio') senders.push(s);
        });
      } catch (e) {}
    });
    return senders;
  }

  
  
  
  function applyMicState(enabled) {
    let touched = 0;
    const stream = resolveLocalStream();
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        if (track._isSilentFallback) { track.enabled = false; return; }
        if (track.enabled !== enabled) touched++;
        track.enabled = enabled;
      });
    }
    getAudioSenders().forEach(sender => {
      const track = sender.track;
      if (!track || track._isSilentFallback) return;
      if (track.enabled !== enabled) touched++;
      track.enabled = enabled;
    });
    return touched;
  }

  
  
  
  
  function syncMicState() {
    
    
    applyMicState(!!window._voiceEnabled);
  }

  
  
  
  
  
  
  
  
  function pushStreamToSharedModule(stream, attempt) {
    attempt = attempt || 0;
    const target = stream || resolveLocalStream();
    if (!target) {
      warnDebug("[LB-VOICE-DEBUG] pushStreamToSharedModule: no local stream to push");
      return;
    }
    if (window.sharedModule && typeof window.sharedModule.updateStream === 'function') {
      window.sharedModule.updateStream(target);
      logDebug("[LB-VOICE-DEBUG] pushStreamToSharedModule: delivered", { attempt });
      
      
      setTimeout(() => applyMicState(!!window._voiceEnabled), 250);
      return;
    }
    if (attempt >= 15) { 
      warnDebug("[LB-VOICE-DEBUG] pushStreamToSharedModule: gave up, sharedModule never became ready", { attempt });
      return;
    }
    setTimeout(() => pushStreamToSharedModule(target, attempt + 1), 400);
  }

  
  async function handleMicClick() {
    
    
    
    let stream = resolveLocalStream();

    logDebug("[LB-VOICE-DEBUG] handleMicClick fired", {
      voiceEnabledBefore: window._voiceEnabled,
      streamResolved: !!stream,
      audioSenders: getAudioSenders().length,
      localStreamAudioTracks: stream ? stream.getAudioTracks().map(t => ({ id: t.id, enabled: t.enabled, silent: !!t._isSilentFallback, readyState: t.readyState })) : "NO localStream"
    });
    unlockMobileAudio();

    if (typeof window.__lbHealCameraReady === 'function') {
      window.__lbHealCameraReady();
    }

    
    
    const activeRealAudioTracks = stream ? stream.getAudioTracks().filter(t => !t._isSilentFallback && t.readyState !== 'ended') : [];
    const hasLiveSenderAudio = getAudioSenders().some(s => s.track && !s.track._isSilentFallback && s.track.readyState === 'live');

    
    
    
    
    
    
    
    
    
    if (activeRealAudioTracks.length === 0 && !hasLiveSenderAudio) {
      let audioTrack = null;
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        audioTrack = audioStream.getAudioTracks()[0];
      } catch (err) {
        warnDebug("[Shared Voice] Native microphone permission request failed.", err);
        if (typeof window.showLocalToast === 'function') {
          window.showLocalToast("Microphone Permission Denied");
        }
        return; 
      }

      if (audioTrack) {
        if (!stream) {
          stream = new MediaStream();
          window.localStream = stream;
        }
        stream.getAudioTracks().forEach(track => {
          if (track._isSilentFallback || track.readyState === 'ended') {
            try { track.stop(); } catch (e) {}
            try { stream.removeTrack(track); } catch (e) {}
          }
        });
        stream.addTrack(audioTrack);
        logDebug("[LB-VOICE-DEBUG] real mic track acquired, pushing to sharedModule", {
          trackId: audioTrack.id,
          sharedModuleReady: !!(window.sharedModule && typeof window.sharedModule.updateStream === 'function')
        });
        pushStreamToSharedModule(stream);
      }
    }

    window._voiceEnabled = !window._voiceEnabled;
    updateMicUIState(window._voiceEnabled);

    
    
    
    const touched = applyMicState(window._voiceEnabled);

    unlockMobileAudio();
    if (typeof window.showLocalToast === 'function') {
      window.showLocalToast(window._voiceEnabled ? "Microphone ON" : "Microphone Muted");
    }

    logDebug("[LB-VOICE-DEBUG] handleMicClick finished", {
      voiceEnabledAfter: window._voiceEnabled,
      tracksToggled: touched,
      senderAudioTracks: getAudioSenders().map(s => ({ id: s.track && s.track.id, enabled: s.track && s.track.enabled, readyState: s.track && s.track.readyState })),
      localStreamAudioTracks: window.localStream ? window.localStream.getAudioTracks().map(t => ({ id: t.id, enabled: t.enabled, silent: !!t._isSilentFallback, readyState: t.readyState })) : "NO localStream"
    });

    if (typeof window.__lbSyncCaptureGate === 'function') {
      window.__lbSyncCaptureGate();
    }
  }

  
  const originalCreateElement = document.createElement.bind(document);

  function restructureUI() {
    getOrCreateRemoteAudio();

    if (!document.body.classList.contains('shared-layout')) {
      document.body.classList.add('shared-layout');
    }
    const camSec = document.querySelector('.camera-section');
    if (camSec && !camSec.classList.contains('shared-layout')) {
      camSec.classList.add('shared-layout');
    }

    const actionRows = document.querySelectorAll('.mobile-action-row, #frame-action-row');
    if (!actionRows.length) {
      if (!window.__lbMicRowMissingLogged) {
        window.__lbMicRowMissingLogged = true;
        warnDebug("[LB-VOICE-DEBUG] restructureUI: no .mobile-action-row / #frame-action-row found yet - mic button cannot be injected");
      }
      return;
    }

    actionRows.forEach(row => {
      let micBtn = row.querySelector('#mobile-mic-toggle, .mobile-mic-toggle');
      if (!micBtn) {
        if (!window.__lbMicBtnCreatedLogged) {
          window.__lbMicBtnCreatedLogged = true;
          logDebug("[LB-VOICE-DEBUG] restructureUI: creating and wiring mic button", { rowId: row.id || row.className });
        }
        micBtn = originalCreateElement('button');
        micBtn.className = `mobile-side-btn mobile-mic-toggle ${window._voiceEnabled ? 'mic-active' : 'mic-muted'}`;
        micBtn.id = 'mobile-mic-toggle';
        micBtn.setAttribute('aria-label', 'Toggle Microphone');
        micBtn.setAttribute('title', 'Toggle Microphone');
        micBtn.innerHTML = `
          <svg class="mic-muted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="${window._voiceEnabled ? 'display:none;' : 'display:block;'}">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
          <svg class="mic-active-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="${window._voiceEnabled ? 'display:block;' : 'display:none;'}">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;

        micBtn.addEventListener('click', handleMicClick);
        row.insertBefore(micBtn, row.firstChild);
      }
    });

    forceSyncUI();
  }

  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restructureUI);
  } else {
    restructureUI();
  }

  setInterval(restructureUI, 400);

  
  
  
  
  setInterval(syncMicState, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncMicState();
  });

  
  
  
  
  
  
  let _restructureQueued = false;
  const observer = new MutationObserver(() => {
    if (_restructureQueued) return;
    _restructureQueued = true;
    requestAnimationFrame(() => {
      _restructureQueued = false;
      restructureUI();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
