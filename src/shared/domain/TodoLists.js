'use strict';
// Independent, organization-local notes and checklists.
(() => {
const Common = typeof module !== 'undefined' ? require('./Common') : globalThis.OrbitKanban.Domain.Common;

class TodoLists {
  static LIMIT = 1000;
  static ITEM_LIMIT = 200;
  static TITLE_MAX = 120;
  static TEXT_MAX = 10000;
  static ITEM_MAX = 300;
  static PALETTE = ['#5aa9f6', '#b18cff', '#4fcf8f', '#ff9f5a', '#f0647a', '#3fd0c9', '#f2c94c', '#ff7ac6'];
  static validate(list) {
    const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
    const unique = values => new Set(values.map(value => value.id)).size === values.length;
    const validItem = item => Common.plainObject(item) && id(item.id) && typeof item.text === 'string' && item.text.trim() && item.text.length <= TodoLists.ITEM_MAX && typeof item.done === 'boolean';
    const validCard = card => Common.plainObject(card) && id(card.id) && typeof card.title === 'string' && card.title.length <= TodoLists.TITLE_MAX &&
      typeof card.text === 'string' && card.text.length <= TodoLists.TEXT_MAX && typeof card.color === 'string' && /^#[0-9a-f]{6}$/i.test(card.color) && typeof card.pinned === 'boolean' &&
      Array.isArray(card.items) && card.items.length <= TodoLists.ITEM_LIMIT && card.items.every(validItem) && unique(card.items) &&
      Boolean(card.title.trim() || card.text.trim() || card.items.length);
    Common.assert(Array.isArray(list) && list.length <= TodoLists.LIMIT && list.every(validCard) && unique(list), "Invalid to-do cards.");
    return list;
  }
  static merge(current, incoming) {
    const result = structuredClone(current || []);
    for (const card of structuredClone(incoming)) {
      const index = result.findIndex(existing => existing.id === card.id);
      if (index >= 0) result[index] = card;
      else result.push(card);
    }
    return TodoLists.validate(result);
  }
}

if (typeof module !== 'undefined') module.exports = TodoLists;
else ((globalThis.OrbitKanban ??= {}).Domain ??= {}).TodoLists = TodoLists;
})();
