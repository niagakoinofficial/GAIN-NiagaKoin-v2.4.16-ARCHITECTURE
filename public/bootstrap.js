// Polyfill setter for window.fetch if it only has a getter in AI Studio preview iframe / extension sandbox
(function() {
  try {
    var originalFetch = window.fetch;
    var activeFetch = originalFetch;
    var desc = Object.getOwnPropertyDescriptor(window, 'fetch') ||
      Object.getOwnPropertyDescriptor(Window.prototype, 'fetch') ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch');

    if (!desc || !desc.set || !desc.writable) {
      try {
        Object.defineProperty(window, 'fetch', {
          get: function() { return activeFetch; },
          set: function(val) { activeFetch = val; },
          configurable: true,
          enumerable: true,
        });
      } catch (e1) {
        try {
          Object.defineProperty(Window.prototype, 'fetch', {
            get: function() { return activeFetch; },
            set: function(val) { activeFetch = val; },
            configurable: true,
            enumerable: true,
          });
        } catch (e2) {}
      }
    }
  } catch (e) {}

  function isBenignError(msg) {
    if (!msg || typeof msg !== 'string') return false;
    return msg.includes('Cannot set property fetch') ||
      msg.includes('which has only a getter') ||
      msg.includes('fetch of #<Window>') ||
      msg.includes('WebSocket closed without opened') ||
      msg.includes('failed to connect to websocket') ||
      msg.includes('[vite] failed to connect');
  }

  window.addEventListener('error', function(event) {
    var msg = event.message || (event.error && event.error.message) || String(event);
    if (isBenignError(msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', function(event) {
    var msg = (event.reason && (event.reason.message || String(event.reason))) || '';
    if (isBenignError(msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  }, true);

  var prevOnError = window.onerror;
  window.onerror = function(msg) {
    if (typeof msg === 'string' && isBenignError(msg)) return true;
    if (prevOnError) return prevOnError.apply(this, arguments);
  };
})();

(function() {
  try {
    localStorage.removeItem('gain_custom_logo');
    var saved = localStorage.getItem('gain_theme');
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    var hasSavedTheme = saved === 'light' || saved === 'dark';
    var theme = hasSavedTheme ? saved : (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme-source', hasSavedTheme ? 'user' : 'system');
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();