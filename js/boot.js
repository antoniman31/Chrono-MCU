// Filet de sécurité : script classique chargé avant l'application. Si l'application ne démarre pas (module absent, erreur au chargement),
// ou si une erreur inattendue survient ensuite, on l'écrit dans la page au lieu de laisser un écran blanc ou muet.
(function () {
  var START_TIMEOUT_MS = 10000;
  var shown = false;

  function show(text) {
    var el = document.getElementById('message');
    if (!el || shown) return;
    shown = true;
    el.textContent = text;
    el.className = 'error';
    el.hidden = false;
  }

  function started() {
    return document.body && document.body.dataset.ready === 'true';
  }

  var STARTUP = 'L\'application n\'a pas pu démarrer. Recharge la page ; si le problème continue, ta progression enregistrée n\'est pas touchée : réessaie dans quelques minutes.';
  var RUNTIME = 'Une erreur inattendue s\'est produite. Si quelque chose ne marche pas, recharge la page.';

  // Erreurs JavaScript, et ressources vitales (scripts, feuille de style) qui ne se chargent pas ; les images (affiches) sont ignorées
  window.addEventListener('error', function (e) {
    var t = e.target;
    var vital = t && t !== window && (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && t.rel === 'stylesheet'));
    if (t === window || vital) show(started() && !vital ? RUNTIME : STARTUP);
  }, true);

  window.addEventListener('unhandledrejection', function () {
    show(started() ? RUNTIME : STARTUP);
  });

  // Rien n'est apparu au bout de 10 s : on le dit (sauf si un message précis, comme « catalogue indisponible », est déjà affiché)
  setTimeout(function () {
    var el = document.getElementById('message');
    if (!started() && el && el.hidden) show(STARTUP);
  }, START_TIMEOUT_MS);
})();
