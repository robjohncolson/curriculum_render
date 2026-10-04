/**
 * TI-84 CE Menu Navigation Engine.
 * Module 1 of the native stat calculator reimplementation.
 *
 * Handles all menu screens: tab switching, cursor movement, item selection
 * via ENTER or direct number/letter key.
 *
 * Requires: window.TI84MenuTables (menu-tables.js)
 *
 * Usage:
 *   const menu = TI84MenuNav.create('stat-menu');
 *   menu.handleKey('RIGHT');   // switch to CALC tab
 *   menu.handleKey('ENTER');   // select current item
 *   menu.handleKey('5');       // jump to item 5 and select immediately
 *   const state = menu.getState();
 */
(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Returns the MenuTables object. Resolves from window global or
   * require() depending on the environment.
   */
  function tables() {
    if (typeof window !== 'undefined' && window.TI84MenuTables) {
      return window.TI84MenuTables;
    }
    if (typeof require !== 'undefined') {
      return require('./menu-tables');
    }
    throw new Error('TI84MenuTables not available');
  }

  /**
   * Build an index mapping prefix character -> 0-based item index.
   * TI-84 numbering: 1-9, 0, A-H.
   */
  function buildPrefixIndex(items) {
    var order = tables().PREFIX_ORDER;
    var map = Object.create(null);
    for (var i = 0; i < items.length && i < order.length; i++) {
      map[order[i]] = i;
    }
    return map;
  }

  /**
   * Find which tab family (if any) a menu belongs to.
   * Returns { family, tabIndex } or null.
   */
  function findTabFamily(menuId) {
    var families = tables().TAB_FAMILIES;
    var keys = Object.keys(families);
    for (var k = 0; k < keys.length; k++) {
      var fam = families[keys[k]];
      var idx = fam.menuIds.indexOf(menuId);
      if (idx !== -1) {
        return { family: fam, tabIndex: idx };
      }
    }
    return null;
  }

  // ── MenuNav factory ─────────────────────────────────────────────────

  function create(menuId) {
    var menus = tables().MENUS;
    if (!menus[menuId]) {
      throw new Error('Unknown menu: ' + menuId);
    }

    var currentMenuId = menuId;
    var cursorIndex = menus[menuId].cursor || 0;
    var selectCallbacks = [];

    // ── Private ──

    function menuDef() {
      return menus[currentMenuId];
    }

    function items() {
      return menuDef().items;
    }

    function prefixIndex() {
      return buildPrefixIndex(items());
    }

    function fireSelect(itemIndex) {
      var label = items()[itemIndex];
      var actions = tables().MENU_ACTIONS[currentMenuId];
      var targetScreen = (actions && actions[itemIndex]) || null;

      var evt = {
        menuId: currentMenuId,
        itemIndex: itemIndex,
        itemLabel: label,
        targetScreen: targetScreen
      };

      for (var i = 0; i < selectCallbacks.length; i++) {
        selectCallbacks[i](evt);
      }

      return evt;
    }

    // ── Tab navigation ──

    function switchTab(direction) {
      var info = findTabFamily(currentMenuId);
      if (!info) return false; // not a tabbed menu

      var fam = info.family;
      var newIdx = info.tabIndex + direction;

      // Wrap around
      if (newIdx < 0) newIdx = fam.menuIds.length - 1;
      if (newIdx >= fam.menuIds.length) newIdx = 0;

      currentMenuId = fam.menuIds[newIdx];
      cursorIndex = 0; // reset cursor on tab switch
      return true;
    }

    // ── Key handling ──

    function handleKey(key) {
      var normalizedKey = key.toUpperCase();

      // Tab navigation
      if (normalizedKey === 'RIGHT') {
        if (switchTab(1)) return getState();
        // No tabs — RIGHT does nothing in a plain menu
        return getState();
      }

      if (normalizedKey === 'LEFT') {
        if (switchTab(-1)) return getState();
        return getState();
      }

      // Cursor movement
      if (normalizedKey === 'DOWN') {
        cursorIndex++;
        if (cursorIndex >= items().length) cursorIndex = 0;
        return getState();
      }

      if (normalizedKey === 'UP') {
        cursorIndex--;
        if (cursorIndex < 0) cursorIndex = items().length - 1;
        return getState();
      }

      // ENTER — select current item
      if (normalizedKey === 'ENTER') {
        var result = getState();
        result.selected = fireSelect(cursorIndex);
        return result;
      }

      // Number key (1-9, 0) or letter key (A-H) — jump and select
      var pi = prefixIndex();
      if (pi[normalizedKey] !== undefined) {
        cursorIndex = pi[normalizedKey];
        var result2 = getState();
        result2.selected = fireSelect(cursorIndex);
        return result2;
      }

      // Unrecognized key — no-op
      return getState();
    }

    // ── State ──

    function getState() {
      var def = menuDef();
      var info = findTabFamily(currentMenuId);

      return {
        menuId: currentMenuId,
        title: def.title,
        activeTab: info ? info.family.tabs[info.tabIndex] : null,
        tabs: info ? info.family.tabs : (def.tabs || null),
        cursorIndex: cursorIndex,
        items: items().slice(), // defensive copy
        selectedItem: items()[cursorIndex] || null
      };
    }

    // ── Callback registration ──

    function onSelect(callback) {
      if (typeof callback === 'function') {
        selectCallbacks.push(callback);
      }
    }

    // ── Public API ──

    return {
      handleKey: handleKey,
      getState: getState,
      onSelect: onSelect
    };
  }

  // ── Module export ───────────────────────────────────────────────────

  var MenuNav = { create: create };

  if (typeof window !== 'undefined') {
    window.TI84MenuNav = MenuNav;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MenuNav;
  }
})();
