/* Runs before first paint (classic script, no imports) to avoid a theme flash. */
(function () {
  try {
    var d = JSON.parse(localStorage.getItem('sf:device') || '{}');
    var root = document.documentElement;
    root.setAttribute('data-theme', d.theme === 'light' || d.theme === 'dark' ? d.theme : 'system');
    if (d.motion === 'reduce') root.setAttribute('data-motion', 'reduce');
  } catch (e) { /* storage blocked: keep defaults */ }
})();
