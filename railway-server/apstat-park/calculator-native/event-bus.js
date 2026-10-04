/**
 * TI-84 CE Event Bus — simple pub/sub for trainer hooks.
 * Module 6 of the native stat calculator reimplementation.
 *
 * Usage:
 *   const bus = TI84EventBus.create();
 *   bus.on('compute', data => console.log(data));
 *   bus.emit('compute', { type: 'tTest', inputs: {}, results: {} });
 *   bus.off('compute', handler);
 */
(function () {
  'use strict';

  function create() {
    const listeners = Object.create(null);

    function on(event, callback) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    }

    function off(event, callback) {
      const list = listeners[event];
      if (!list) return;
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }

    function emit(event, data) {
      const list = listeners[event];
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        list[i](data);
      }
    }

    return { on, off, emit };
  }

  var EventBus = { create: create };

  if (typeof window !== 'undefined') {
    window.TI84EventBus = EventBus;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventBus;
  }
})();
