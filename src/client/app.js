// Game page: checks the session on start, then shows the login screen or the
// signed-in screen. All visible texts are in Polish.

import { ApiError, request } from './api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const views = {
  loading: $('#view-loading'),
  auth: $('#view-auth'),
  home: $('#view-home'),
};

const timeFormat = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

let clockTimer = null;

function show(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
}

async function start() {
  show('loading');
  $('#loading-text').textContent = 'Nawiązywanie połączenia…';
  $('#retry-button').hidden = true;
  refreshStatus();
  try {
    const { user } = await request('GET', '/api/me');
    enterHome(user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      enterAuth();
      return;
    }
    $('#loading-text').textContent = error.message;
    $('#retry-button').hidden = false;
  }
}

// Server health, version and clock. The clock shows server time, corrected
// for the request round trip, because the server decides about all timers.
async function refreshStatus() {
  const serverStatus = $('[data-status-server]');
  const databaseStatus = $('[data-status-database]');
  try {
    const sentAt = Date.now();
    const health = await request('GET', '/api/health');
    const offset = health.time - (sentAt + Date.now()) / 2;
    for (const element of $$('[data-version]')) element.textContent = health.version;
    setStatus(serverStatus, true, 'działa');
    setStatus(databaseStatus, true, 'działa');
    startClock(offset);
  } catch (error) {
    const reachable = error instanceof ApiError && error.status !== 0;
    setStatus(serverStatus, reachable, reachable ? 'działa' : 'brak połączenia');
    setStatus(databaseStatus, false, 'niedostępna');
  }
}

function setStatus(element, ok, text) {
  element.textContent = text;
  element.classList.toggle('status-ok', ok);
  element.classList.toggle('status-error', !ok);
}

function startClock(offset) {
  clearInterval(clockTimer);
  const element = $('[data-server-time]');
  const tick = () => {
    element.textContent = timeFormat.format(new Date(Date.now() + offset));
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function enterAuth() {
  for (const form of [$('#login-form'), $('#register-form')]) {
    form.reset();
    $('.form-error', form).hidden = true;
  }
  for (const toggle of $$('.password-toggle')) setPasswordVisible(toggle, false);
  setAuthMode('login');
  show('auth');
}

function enterHome(user) {
  for (const element of $$('[data-user-login]')) element.textContent = user.login;
  $('[data-user-created]').textContent = dateFormat.format(new Date(user.createdAt));
  $('#logout-error').hidden = true;
  show('home');
  $('#home-title').focus();
}

function setAuthMode(mode) {
  for (const button of $$('[data-auth-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
  }
  $('#login-form').hidden = mode !== 'login';
  $('#register-form').hidden = mode !== 'register';
}

function setPasswordVisible(toggle, visible) {
  const input = document.getElementById(toggle.getAttribute('aria-controls'));
  input.type = visible ? 'text' : 'password';
  toggle.textContent = visible ? 'Ukryj' : 'Pokaż';
  toggle.setAttribute('aria-label', visible ? 'Ukryj hasło' : 'Pokaż hasło');
}

function bindForm(form, submit) {
  const errorBox = $('.form-error', form);
  const button = $('button[type="submit"]', form);
  const idleLabel = button.textContent;
  form.addEventListener('input', () => {
    errorBox.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = button.dataset.busyLabel;
    try {
      const { user } = await submit(Object.fromEntries(new FormData(form)));
      form.reset();
      enterHome(user);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });
}

for (const button of $$('[data-auth-mode]')) {
  button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
}

for (const toggle of $$('.password-toggle')) {
  toggle.addEventListener('click', () => {
    const input = document.getElementById(toggle.getAttribute('aria-controls'));
    setPasswordVisible(toggle, input.type === 'password');
  });
}

bindForm($('#login-form'), (data) => request('POST', '/api/auth/login', data));
bindForm($('#register-form'), (data) => request('POST', '/api/auth/register', data));

$('#retry-button').addEventListener('click', start);

$('#logout-button').addEventListener('click', async () => {
  const button = $('#logout-button');
  button.disabled = true;
  try {
    await request('POST', '/api/auth/logout');
    enterAuth();
  } catch (error) {
    $('#logout-error').textContent = error.message;
    $('#logout-error').hidden = false;
  } finally {
    button.disabled = false;
  }
});

start();
