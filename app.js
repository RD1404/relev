/* Compatible avec Safari iOS 9 : ES5 + XMLHttpRequest, sans fetch/async. */
(function () {
  'use strict';
  function $(selector) { return document.querySelector(selector); }
  function each(selector, callback) { var nodes = document.querySelectorAll(selector); for (var i = 0; i < nodes.length; i++) callback(nodes[i], i); }
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  var type = localStorage.getItem('selectedType') || 'ELEC';
  var settings = $('#settings');
  var confirmation = $('#confirmation');
  var initialSettings = '';
  var installPrompt = null, toastTimer = null;
  function showToast(message) {
    var toast = $('#toast'); toast.textContent = message; toast.className = 'toast visible';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.className = 'toast'; }, 2000);
  }
  function isInstalled() { return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function updateInstallButton() {
    var button = $('#installButton'), installed = isInstalled();
    button.disabled = installed; button.className = 'install-button' + (installed ? ' installed' : '');
    button.title = installed ? 'Application déjà installée' : 'Installer l’application';
  }

  function setLoading(loading) {
    var overlay = $('#loadingOverlay');
    overlay.hidden = !loading;
    document.body.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function setSubmitEnabled(enabled, message) {
    var button = $('#submitButton');
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.className = 'primary' + (enabled ? '' : ' inactive');
    button.setAttribute('data-disabled-message', message || 'Ajoutez les références dans le menu');
  }

  function settingsValues() {
    return [$('#elecRef').value, $('#elecNum').value, $('#eauRef').value, $('#eauNum').value];
  }
  function validPair(ref, num) {
    return (ref === '' && num === '') || (/^\d{11}$/.test(ref) && /^\d{8}$/.test(num));
  }
  function updateSaveButton() {
    var values = settingsValues();
    var valid = validPair(values[0], values[1]) && validPair(values[2], values[3]);
    var changed = JSON.stringify(values) !== initialSettings;
    $('#saveSettings').disabled = !(valid && changed);
    var inputs = [$('#elecRef'), $('#elecNum'), $('#eauRef'), $('#eauNum')];
    for (var i = 0; i < inputs.length; i++) inputs[i].classList.remove('invalid');
    if (!validPair(values[0], values[1])) { inputs[0].classList.add('invalid'); inputs[1].classList.add('invalid'); }
    if (!validPair(values[2], values[3])) { inputs[2].classList.add('invalid'); inputs[3].classList.add('invalid'); }
  }

  function credentials(kind) { return readJSON('jirama_' + kind) || {}; }
  function isConfigured(kind) { var c = credentials(kind); return !!(c.ref && c.num); }
  function refreshAvailability() {
    var kinds = ['ELEC', 'EAU'];
    for (var i = 0; i < kinds.length; i++) {
      var kind = kinds[i], available = isConfigured(kind);
      var card = document.querySelector('.type-card[data-type="' + kind + '"]');
      card.disabled = false;
      card.setAttribute('aria-disabled', available ? 'false' : 'true');
      if (available) card.classList.remove('unavailable'); else {
        card.classList.add('unavailable'); card.classList.remove('selected');
        card.setAttribute('aria-pressed', 'false'); localStorage.removeItem('info_' + kind);
      }
    }
    if (!isConfigured(type)) {
      if (isConfigured('ELEC')) type = 'ELEC';
      else if (isConfigured('EAU')) type = 'EAU';
      else { showInfo(null); setSubmitEnabled(false); return; }
    }
    setType(type);
  }
  function fill() {
    var e = credentials('ELEC'), w = credentials('EAU');
    $('#elecRef').value = e.ref || ''; $('#elecNum').value = e.num || '';
    $('#eauRef').value = w.ref || ''; $('#eauNum').value = w.num || '';
  }
  function showInfo(info) {
    var period = $('#period'), submit = $('#submitButton');
    if (!info || !info.clientName || !info.periodDates || info.periodDates === 'NON DISPONIBLE') {
      $('#clientName').textContent = 'REFERENCE ABSENTE';
      $('#periodDates').textContent = 'À CONFIGURER';
      period.className = 'period unknown'; setSubmitEnabled(false); return;
    }
    $('#clientName').textContent = info.clientName;
    $('#periodDates').textContent = info.periodDates;
    period.className = 'period ' + (info.inPeriod ? '' : 'outside');
    setSubmitEnabled(true);
  }
  function status(message, kind) { var el = $('#status'); el.textContent = message; el.className = 'status ' + (kind || ''); }
  function request(data, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/submit', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var result;
      try { result = JSON.parse(xhr.responseText); } catch (e) { result = { success: false, message: 'Réponse du serveur invalide.' }; }
      callback(xhr.status >= 200 && xhr.status < 300 && result.success, result);
    };
    xhr.onerror = function () { callback(false, { message: 'Connexion au serveur impossible.' }); };
    xhr.send(JSON.stringify(data));
  }
  function setType(kind, verify) {
    type = kind; localStorage.setItem('selectedType', kind);
    each('.type-card', function (card) {
      var selected = card.getAttribute('data-type') === kind;
      if (selected) card.classList.add('selected'); else card.classList.remove('selected');
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    $('#submitButton').textContent = 'Envoyer relevé ' + (kind === 'ELEC' ? 'ÉLEC' : 'EAU');
    showInfo(readJSON('info_' + kind));
    if (verify !== false && credentials(kind).ref) verifyClient();
  }
  function verifyClient() {
    var c = credentials(type); if (!c.ref || !c.num) return;
    status('Vérification des informations…'); setSubmitEnabled(false, 'Informations JIRAMA en cours de chargement'); setLoading(true);
    request({ ref: c.ref, num: c.num, action: 'verify' }, function (ok, result) {
      setLoading(false);
      if (!ok) { setSubmitEnabled(false); status(result.message || 'Vérification impossible.', 'error'); return; }
      localStorage.setItem('info_' + type, JSON.stringify(result)); showInfo(result);
      status('Informations JIRAMA actualisées.', 'success');
    });
  }
  $('#menuButton').onclick = function () {
    fill(); initialSettings = JSON.stringify(settingsValues()); updateSaveButton();
    settings.hidden = false; this.setAttribute('aria-expanded', 'true');
  };
  each('[data-close]', function (button) { button.onclick = function () { settings.hidden = true; $('#menuButton').setAttribute('aria-expanded', 'false'); }; });
  each('.type-card', function (card) { card.onclick = function () {
    if (card.getAttribute('aria-disabled') === 'true') { showToast('Ajoutez les références dans le menu'); return; }
    setType(card.getAttribute('data-type'));
  }; });
  each('#elecRef,#elecNum,#eauRef,#eauNum', function (input) { input.oninput = function () { this.value = this.value.replace(/\D/g, ''); updateSaveButton(); }; });
  $('#saveSettings').onclick = function () { if (!this.disabled) confirmation.hidden = false; };
  $('#cancelSave').onclick = function () { confirmation.hidden = true; };
  $('#confirmSave').onclick = function () {
    localStorage.setItem('jirama_ELEC', JSON.stringify({ ref: $('#elecRef').value.replace(/^\s+|\s+$/g, ''), num: $('#elecNum').value.replace(/^\s+|\s+$/g, '') }));
    localStorage.setItem('jirama_EAU', JSON.stringify({ ref: $('#eauRef').value.replace(/^\s+|\s+$/g, ''), num: $('#eauNum').value.replace(/^\s+|\s+$/g, '') }));
    confirmation.hidden = true; settings.hidden = true; status('Configuration enregistrée.', 'success'); refreshAvailability();
  };
  $('#submitButton').onclick = function () {
    var c = credentials(type), reading = $('#reading').value.replace(/^\s+|\s+$/g, ''), button = this;
    if (button.getAttribute('aria-disabled') === 'true') { showToast(button.getAttribute('data-disabled-message') || 'Ajoutez les références dans le menu'); return; }
    if (!c.ref || !c.num) { showToast('Ajoutez les références dans le menu'); return; }
    if (!/^\d{5}$/.test(reading)) { status('Saisissez un relevé de 5 chiffres.', 'error'); return; }
    setSubmitEnabled(false, 'Envoi en cours…'); status('Envoi du relevé en cours…'); setLoading(true);
    request({ ref: c.ref, num: c.num, reading: reading, action: 'submit' }, function (ok, result) {
      setLoading(false);
      if (!ok) { setSubmitEnabled(true); status(result.message || 'Envoi refusé.', 'error'); return; }
      showInfo(result); localStorage.setItem('info_' + type, JSON.stringify(result)); $('#reading').value = '';
      status(result.message || 'Relevé transmis.', 'success');
    });
  };
  $('#reading').oninput = function () { this.value = this.value.replace(/\D/g, '').slice(0, 5); };
  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); installPrompt = event; updateInstallButton(); });
  window.addEventListener('appinstalled', function () { installPrompt = null; updateInstallButton(); showToast('Application installée'); });
  $('#installButton').onclick = function () {
    if (isInstalled()) return;
    if (installPrompt) {
      installPrompt.prompt();
      if (installPrompt.userChoice && installPrompt.userChoice.then) installPrompt.userChoice.then(function () { installPrompt = null; updateInstallButton(); });
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) showToast('Safari : Partager, puis Sur l’écran d’accueil');
    else showToast('Utilisez le menu du navigateur puis Installer l’application');
  };
  updateInstallButton();
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js'); });
  refreshAvailability();
}());
