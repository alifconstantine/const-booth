
import * as api from './api.js';
import { Voice, voiceSupported } from './voice.js';
import { THEMES, DEFAULT_THEME } from './registry.js';

var PATH_RE = /^\/studio\/(?:build-together|date-room)\/([^/]+)\/?$/;

function $(id) {
  return document.getElementById(id);
}

var SCREENS = ['dr-screen-create', 'dr-screen-invite', 'dr-screen-join', 'dr-screen-status'];

function show(id) {
  $('dr-boot').hidden = true;
  api.setPhase(id === 'dr-screen-status' ? 'status' : 'landing');
  SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
  $('dr-app').setAttribute('data-screen', id.replace('dr-screen-', ''));
  var heading = $(id).querySelector('[tabindex="-1"]');
  if (heading) {
    try { heading.focus({ preventScroll: true }); } catch (_e) { heading.focus(); }
  }
  window.scrollTo(0, 0);
}

var STATUS_COPY = {
  full: { title: 'This session is already full.', create: true },
  expired: { title: 'This session has ended.', text: 'Sessions close an hour after everyone leaves. You can start a new one any time.', create: true },
  invalid: { title: 'This invite link isn’t valid.', text: 'Check that the whole link was copied, or start one of your own.', create: true },
  network: { title: 'We couldn’t connect you right now.', retry: true },
  busy: { title: 'We couldn’t connect you right now.', text: 'Please wait a moment, then try again.', retry: true },
  webgl: { title: 'This browser can’t show the 3D view.', text: 'Try opening the link in Chrome, Safari or Firefox.', create: false }
};

var CODE_PROBLEM = {
  invalid: 'That code doesn’t match a session.',
  expired: 'That session has ended.',
  full: 'That session is already full.',
  busy: 'Too many tries. Wait a moment.',
  network: 'Couldn’t connect. Try again.'
};

var pillTimer = null;
function showPill(text) {
  var pill = $('dr-pill');
  $('dr-pill-text').textContent = text;
  pill.hidden = false;
  pill.classList.remove('is-on');
  void pill.offsetWidth;
  pill.classList.add('is-on');
  clearTimeout(pillTimer);
  pillTimer = setTimeout(function () {
    pill.classList.remove('is-on');
    pillTimer = setTimeout(function () { pill.hidden = true; }, 250);
  }, 4500);
}

function hidePill() {
  clearTimeout(pillTimer);
  $('dr-pill').classList.remove('is-on');
  $('dr-pill').hidden = true;
}

function setMode(mode, focus) {
  var join = mode === 'join';
  $('dr-panel-create').hidden = join;
  $('dr-panel-join').hidden = !join;
  $('dr-mode-create').setAttribute('aria-pressed', String(!join));
  $('dr-mode-join').setAttribute('aria-pressed', String(join));
  if (!join) clearCodeError();
  if (join && focus) {
    try { $('dr-join-input').focus({ preventScroll: true }); } catch (_e) {}
  }
}

function codeError(kind, value) {
  var input = $('dr-join-input');
  setMode('join');
  if (typeof value === 'string') input.value = value;
  input.classList.add('is-error');
  input.classList.remove('is-shake');
  void input.offsetWidth;
  input.classList.add('is-shake');
  input.setAttribute('aria-invalid', 'true');
  showPill(CODE_PROBLEM[kind] || CODE_PROBLEM.invalid);
  try { input.focus({ preventScroll: false }); } catch (_e) {}
}

function clearCodeError() {
  var input = $('dr-join-input');
  input.classList.remove('is-error', 'is-shake');
  input.removeAttribute('aria-invalid');
  hidePill();
}

function backToStart(kind, value) {
  try { history.replaceState(null, '', '/studio/build-together'); } catch (_e) {}
  showCreate();
  codeError(kind, value);
}

function showStatus(kind, onRetry) {
  stopInvitePoll();
  var copy = STATUS_COPY[kind] || STATUS_COPY.network;
  $('dr-status-title').textContent = copy.title;
  var text = $('dr-status-text');
  text.hidden = !copy.text;
  text.textContent = copy.text || '';
  $('dr-status-create').hidden = !copy.create;
  var retry = $('dr-status-retry');
  retry.hidden = !copy.retry;
  retry.onclick = onRetry || function () { window.location.reload(); };
  show('dr-screen-status');
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
  var input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (_e) {}
  document.body.removeChild(input);
  return ok;
}

function setLabel(button, text) {
  var label = button.querySelector('span');
  (label || button).textContent = text;
}

function flashLabel(button, text) {
  var label = button.querySelector('span') || button;
  var original = label.getAttribute('data-label') || label.textContent;
  label.setAttribute('data-label', original);
  label.textContent = text;
  clearTimeout(button._flash);
  button._flash = setTimeout(function () { label.textContent = original; }, 2000);
}

export function copyCode(token, button) {
  return copyText(api.formatCode(token)).then(function (ok) {
    if (button) flashLabel(button, ok ? 'Copied!' : 'Select the code to copy');
    return ok;
  });
}

export function copyInvite(token, button) {
  var url = api.inviteUrl(token);
  return copyText(url).then(function (ok) {
    if (button) flashLabel(button, ok ? 'Copied!' : 'Select the link to copy');
    return ok;
  });
}

function themeKey(theme) {
  return Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : DEFAULT_THEME;
}

function showPreview(img, theme) {
  var input = document.querySelector('input[name="dr-vibe"][value="' + themeKey(theme) + '"]');
  if (!input || !img) return;
  img.src = input.getAttribute('data-preview');
  img.srcset = input.getAttribute('data-preview') + ', ' + input.getAttribute('data-preview-2x') + ' 2x';
}

function showVibeChip(el, theme) {
  var def = THEMES[themeKey(theme)];
  el.textContent = def.emoji + ' ' + def.name;
  el.hidden = false;
}

function showCreate() {
  show('dr-screen-create');
  $('dr-mode-create').onclick = function () { setMode('create'); };
  $('dr-mode-join').onclick = function () { setMode('join', true); };
  setMode(window.location.hash === '#join' ? 'join' : 'create');
  if (!window.__drHashBound) {
    window.__drHashBound = true;
    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#join' && !$('dr-screen-create').hidden) setMode('join', true);
    });
  }
  var radios = document.querySelectorAll('input[name="dr-vibe"]');
  for (var r = 0; r < radios.length; r++) {
    radios[r].onchange = function () {
      showPreview($('dr-create-preview'), this.value);
      $('dr-create').disabled = false;
      $('dr-pick-hint').hidden = true;
    };
  }
  var picked0 = document.querySelector('input[name="dr-vibe"]:checked');
  $('dr-create').disabled = !picked0;
  $('dr-pick-hint').hidden = !!picked0;
  var btn = $('dr-create');
  var err = $('dr-create-error');
  btn.onclick = function () {
    if (btn.disabled) return;
    btn.disabled = true;
    setLabel(btn, 'Starting…');
    err.hidden = true;
    var picked = document.querySelector('input[name="dr-vibe"]:checked');
    if (!picked) return;
    var theme = themeKey(picked.value);
    api.createRoom(theme).then(function (res) {
      btn.disabled = false;
      setLabel(btn, 'Start building');
      if (!res.ok) {
        err.textContent = res.reason === 'busy'
          ? 'Lots of scenes being built right now. Try again in a minute.'
          : 'We couldn’t connect you right now.';
        err.hidden = false;
        return;
      }
      api.rememberOwner(res.token);
      try { history.replaceState(null, '', '/studio/build-together/' + res.token); } catch (_e) {}
      showInvite(res.token, theme);
    });
  };

  var codeInput = $('dr-join-input');
  codeInput.oninput = function () {
    clearCodeError();
    var raw = this.value.toUpperCase();
    if (raw.indexOf('/') !== -1) return;
    var clean = raw.replace(/[^A-Z0-9]/g, '').slice(0, 8);
    this.value = clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean;
  };
  codeInput.onpointerdown = function () { if (this.classList.contains('is-error')) clearCodeError(); };
  var form = $('dr-join-form');
  form.onsubmit = function (e) {
    e.preventDefault();
    var token = api.tokenFromInput($('dr-join-input').value);
    if (!token) {
      codeError('invalid');
      return;
    }
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    api.roomStatus(token).then(function (res) {
      submit.disabled = false;
      if (res.state === 'open' || res.state === 'rejoin') window.location.assign('/studio/build-together/' + token);
      else codeError(res.state, api.formatCode(token));
    });
  };
}

function showInvite(token, theme) {
  showVibeChip($('dr-invite-vibe'), theme);
  showPreview($('dr-invite-preview'), theme);
  var codeEl = $('dr-invite-code');
  codeEl.removeAttribute('data-label');
  codeEl.textContent = api.formatCode(token);
  $('dr-copy-code').onclick = function () {
    copyText(api.formatCode(token)).then(function (ok) {
      if (ok) { flashLabel($('dr-copy-code'), 'Copied!'); return; }
      try { window.getSelection().selectAllChildren(codeEl); } catch (_e) {}
    });
  };
  var main = $('dr-copy');
  if (navigator.share) setLabel(main, 'Share invite link');
  main.onclick = function () {
    if (!navigator.share) { copyInvite(token, main); return; }
    navigator.share({ title: 'Build Together', text: 'I picked ' + THEMES[themeKey(theme)].name + ' for us. Come decorate it with me, live 💕', url: api.inviteUrl(token) }).catch(function (e) {
      if (!e || e.name !== 'AbortError') copyInvite(token, main);
    });
  };
  $('dr-enter-owner').onclick = function () { askMicrophone(token, theme); };
  cameFrom = 'invite';
  show('dr-screen-invite');
  startInvitePoll(token);
}

function showJoin(token, rejoin, theme) {
  showVibeChip($('dr-join-vibe'), theme);
  showPreview($('dr-join-preview'), theme);
  var owner = api.isOwner(token);
  if (rejoin) {
    $('dr-join-title').textContent = 'Welcome back';
    $('dr-join-text').textContent = owner ? 'Your person can join with the invite link.' : 'Pick up where you left off.';
    setLabel($('dr-join'), 'Back into the scene');
  }
  var copy = $('dr-join-copy');
  copy.hidden = !owner;
  copy.onclick = function () { copyInvite(token, copy); };
  $('dr-join').onclick = function () { askMicrophone(token, theme); };
  cameFrom = 'join';
  show('dr-screen-join');
}

function checkRoom(token) {
  $('dr-boot').hidden = false;
  api.roomStatus(token).then(function (res) {
    var prev = (res.state === 'open' || res.state === 'rejoin') ? takeScreen(token) : null;
    if (prev === 'invite' && api.isOwner(token)) showInvite(token, res.theme);
    else if (prev === 'join') showJoin(token, false, res.theme);
    else if (res.state === 'open') {
      if (api.isOwner(token) && !api.getSeat(token)) showInvite(token, res.theme);
      else showJoin(token, false, res.theme);
    } else if (res.state === 'rejoin') {
      showJoin(token, true, res.theme);
    } else if (CODE_PROBLEM[res.state] && res.state !== 'network') {
      backToStart(res.state, api.formatCode(token));
    } else {
      showStatus(res.state, function () { checkRoom(token); });
    }
  });
}

var voice = null;
var cameFrom = 'join';

function rememberScreen(token) {
  try { sessionStorage.setItem('lb_dr_prev', JSON.stringify({ token: token, kind: cameFrom })); } catch (_e) {}
}

function takeScreen(token) {
  try {
    var raw = sessionStorage.getItem('lb_dr_prev');
    sessionStorage.removeItem('lb_dr_prev');
    var v = raw && JSON.parse(raw);
    return v && v.token === token ? v.kind : null;
  } catch (_e) { return null; }
}

function askMicrophone(token, theme) {
  var modal = $('dr-mic');
  var supported = voiceSupported();
  $('dr-mic-on').hidden = !supported;
  $('dr-mic-lead').hidden = !supported;
  $('dr-mic-unsupported').hidden = supported;
  setLabel($('dr-mic-off'), supported ? 'Join with microphone off' : 'Start building');
  modal.hidden = false;
  try { $('dr-mic-title').focus({ preventScroll: true }); } catch (_e) {}

  var opener = document.activeElement;
  function close() {
    modal.hidden = true;
    document.removeEventListener('keydown', onKey);
  }
  function dismiss() {
    close();
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') dismiss();
  }
  document.addEventListener('keydown', onKey);
  $('dr-mic-backdrop').onclick = dismiss;
  $('dr-mic-close').onclick = dismiss;

  voice = voice || new Voice({
    sendSignal: function () {},
    onChange: function () {},
    audio: $('dr-remote-audio'),
    getIceServers: memoIce()
  });

  $('dr-mic-on').onclick = function () {
    var btn = this;
    btn.disabled = true;
    voice.enableMic().then(function () {
      btn.disabled = false;
      close();
      enter(token, theme);
    });
  };
  $('dr-mic-off').onclick = function () {
    close();
    enter(token, theme);
  };
}

var ICE_FRESH_MS = 30 * 60 * 1000;
var ICE_RETRY_MS = 15 * 1000;

function memoIce() {
  var pending = null;
  var fetchedAt = 0;
  var turn = false;
  return function () {
    var now = Date.now();
    var stale = now - fetchedAt > ICE_FRESH_MS;
    var retryNoTurn = !turn && now - fetchedAt > ICE_RETRY_MS;
    if (!pending || stale || retryNoTurn) {
      fetchedAt = now;
      pending = api.iceServers().then(function (servers) {
        turn = api.hasTurn(servers);
        return servers;
      });
    }
    return pending;
  };
}

function enter(token, theme) {
  stopInvitePoll();
  rememberScreen(token);
  SCREENS.forEach(function (s) { $(s).hidden = true; });
  api.setPhase('room');
  import('./room-view.js').then(function (m) {
    m.enterRoom({ token: token, theme: themeKey(theme), voice: voice, owner: api.isOwner(token), copyInvite: copyInvite, copyCode: copyCode, onUnsupported: function () { showStatus('webgl'); } });
  }).catch(function () {
    showStatus('network', function () { window.location.reload(); });
  });
}

function boot() {
  var m = window.location.pathname.match(PATH_RE);
  if (!m) {
    showCreate();
    return;
  }
  var raw;
  try {
    raw = decodeURIComponent(m[1]);
  } catch (_e) {
    raw = '';
  }
  var token = api.normalizeCode(raw);
  if (!token) {
    backToStart('invalid', String(raw || '').slice(0, 40));
    return;
  }
  if (token !== m[1]) {
    try { history.replaceState(null, '', '/studio/build-together/' + token); } catch (_e) {}
  }
  checkRoom(token);
}

boot();


var invitePollTimer = null;
var partnerWasHere = false;
var origDocTitle = document.title;

function startInvitePoll(token) {
  if (invitePollTimer) clearInterval(invitePollTimer);
  partnerWasHere = false;
  var banner = $('dr-invite-banner');
  if (banner) banner.hidden = true;
  var btn = $('dr-enter-owner');
  if (btn) setLabel(btn, 'Start building');
  document.title = origDocTitle;

  invitePollTimer = setInterval(function () {
    api.roomStatus(token).then(function (res) {
      if (res && (res.seats > 1 || res.active > 0) && !partnerWasHere) {
        partnerWasHere = true;
        if (banner) banner.hidden = false;
        setLabel(btn, 'Start building together');
        document.title = 'Your person is here - ConstBooth';
      }
    });
  }, 3500);
}

function stopInvitePoll() {
  if (invitePollTimer) clearInterval(invitePollTimer);
  document.title = origDocTitle;
}

