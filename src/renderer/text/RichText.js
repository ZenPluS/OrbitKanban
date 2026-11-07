// Rich text sanitizing and cached conversion to plain text.
import { Component } from '../core/Component.js';

export class RichText extends Component {
  #plainCache = new Map();
  #PLAIN_CACHE_LIMIT = 4096; #PLAIN_CACHE_CHARS = 4_000_000;
  #plainCacheChars = 0;
  plain = html => {
    const source = String(html);
    if (this.#plainCache.has(source)) return this.#plainCache.get(source);
    const el = document.createElement('div');
    el.innerHTML = this.sanitize(source);
    el.querySelectorAll('br').forEach(node => node.replaceWith(' '));
    el.querySelectorAll('p,div,li,blockquote').forEach(node => node.append(' '));
    const text = el.textContent.replace(/\s+/g, ' ').trim(), size = source.length + text.length;
    if (size <= this.#PLAIN_CACHE_CHARS) {
      while (this.#plainCache.size && (this.#plainCache.size >= this.#PLAIN_CACHE_LIMIT || this.#plainCacheChars + size > this.#PLAIN_CACHE_CHARS)) {
        const oldest = this.#plainCache.keys().next().value;
        this.#plainCacheChars -= oldest.length + this.#plainCache.get(oldest).length;
        this.#plainCache.delete(oldest);
      }
      this.#plainCache.set(source, text);
      this.#plainCacheChars += size;
    }
    return text;
  };
  sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'DIV', 'BLOCKQUOTE']);
    function clean(parent) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'MATH'].includes(child.tagName)) { child.remove(); continue; }
          clean(child);
          if (!allowed.has(child.tagName)) child.replaceWith(...child.childNodes);
          else for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
        } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
      }
    }
    clean(doc.body);
    return doc.body.innerHTML;
  }
}
