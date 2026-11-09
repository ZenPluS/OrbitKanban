// Color controls and their popup color picker.
import { Component } from '../core/Component.js';
import { ColorMath } from '../shared.js';

export class ColorPicker extends Component {
  constructor(app) {
    super(app);
    this.positionColorPicker = this.positionColorPicker.bind(this);
  }
  #activeColorPicker;
  colorControl(color, label, attributes, showValue = false) {
    const title = `${this.t("Color")}: ${label} (${color.toUpperCase()})`;
    return `<button type="button" class="color-control" ${attributes} value="${color}" style="--picked-color:${color}" data-color-label="${this.esc(label)}" aria-label="${this.esc(title)}" title="${this.esc(title)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="color-picker"><span class="color-control-swatch" aria-hidden="true"></span>${showValue ? `<span class="color-control-value">${color.toUpperCase()}</span>` : ''}${this.ico('chevron-down')}</button>`;
  }
  updateColorControl(button, color) {
    button.value = color;
    button.style.setProperty('--picked-color', color);
    const value = button.querySelector('.color-control-value');
    if (value) value.textContent = color.toUpperCase();
    button.title = `${this.t("Color")}: ${button.dataset.colorLabel} (${color.toUpperCase()})`;
    button.setAttribute('aria-label', button.title);
  }
  closeColorPicker(accept = false, restoreFocus = false) {
    const picker = this.#activeColorPicker;
    if (!picker) return;
    this.#activeColorPicker = null;
    picker.menu.remove();
    picker.button.setAttribute('aria-expanded', 'false');
    if (!accept && picker.button.value !== picker.initial) {
      picker.button.value = picker.initial;
      picker.button.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (restoreFocus && picker.button.isConnected) picker.button.focus({ preventScroll: true });
  }
  positionColorPicker() {
    if (!this.#activeColorPicker) return;
    const { button, menu } = this.#activeColorPicker, rect = button.getBoundingClientRect();
    const below = rect.bottom + 6, above = rect.top - menu.offsetHeight - 6;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(below + menu.offsetHeight <= innerHeight - 8 ? below : above, innerHeight - menu.offsetHeight - 8))}px`;
  }
  openColorPicker(button) {
    const same = this.#activeColorPicker?.button === button;
    this.closeColorPicker();
    this.app.tagMenu.closeTagMenu(); this.app.rowMarks.closeMarkMenu();
    if (same) return;
    const settings = this.state.view === 4 && this.state.settingsDraft ? this.state.settingsDraft : this.state.data.settings;
    const initial = button.value, theme = settings.themes.find(theme => theme.id === settings.themeId) || settings.themes[0];
    let hsv = ColorMath.hexToHsv(initial);
    const menu = document.createElement('form');
    menu.id = 'color-picker';
    menu.className = 'color-picker';
    menu.setAttribute('popover', 'manual');
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-labelledby', 'color-picker-title');
    // Keep the picker legible while previewing potentially low-contrast theme colors.
    const style = getComputedStyle(document.documentElement);
    for (const name of ['background', 'surface', 'text', 'accent', 'muted', 'border', 'on-accent']) menu.style.setProperty(`--${name}`, style.getPropertyValue(`--${name}`));
    const swatches = [...new Set([theme.background, theme.surface, theme.text, theme.accent, ...this.app.optionLists.highlightPalette].map(color => color.toLowerCase()))];
    menu.innerHTML = this.ui`<div class="color-picker-heading"><div><small>Choose color</small><h3 id="color-picker-title">${this.esc(button.dataset.colorLabel)}</h3></div><button type="button" class="icon-button" data-color-cancel aria-label="Close">${this.ico('close')}</button></div>
    <div class="color-plane" role="img" aria-label="Drag to adjust saturation and brightness, or use the sliders below."><span class="color-plane-thumb"></span></div>
    <label class="color-slider-label" for="color-hue"><span>Hue</span><output id="color-hue-value"></output></label><input id="color-hue" class="color-slider color-hue" type="range" min="0" max="360" step="1">
    <div class="color-picker-channels">${[['s', "Saturation"], ['v', "Brightness"]].map(([key, label]) => `<div><label class="color-slider-label" for="color-${key}"><span>${this.esc(this.t(label))}</span><output id="color-${key}-value"></output></label><input id="color-${key}" class="color-slider" type="range" min="0" max="100" step="1"></div>`).join('')}</div>
    <div class="color-picker-entry"><button type="button" class="color-original" style="--picked-color:${initial}" title="Restore original color" aria-label="Restore original color"></button><label class="field" for="color-hex">HEX<input id="color-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-describedby="color-error"></label></div>
    <p id="color-error" class="color-error" aria-live="polite" hidden>Enter a HEX color with 3 or 6 digits, for example #A392FF.</p>
    <div class="color-picker-swatches" role="group" aria-label="Theme colors and presets">${swatches.map(color => `<button type="button" class="color-preset" data-color-preset="${color}" style="--picked-color:${color}" aria-label="${color.toUpperCase()}" title="${color.toUpperCase()}"></button>`).join('')}</div>
    <div class="color-picker-actions"><button type="button" class="button small" data-color-cancel>Cancel</button><button type="submit" class="button small primary">Apply</button></div>`;
    document.body.append(menu);
    this.#activeColorPicker = { menu, button, initial };
    const hex = menu.querySelector('#color-hex'), plane = menu.querySelector('.color-plane');
    function update(fromText = false) {
      const color = ColorMath.hsvToHex(hsv), pureHue = ColorMath.hsvToHex({ h: hsv.h, s: 100, v: 100 });
      menu.style.setProperty('--picked-color', color);
      plane.style.backgroundColor = pureHue;
      plane.style.setProperty('--color-s', `${hsv.s}%`);
      plane.style.setProperty('--color-v', `${100 - hsv.v}%`);
      for (const [id, value] of [['hue', hsv.h], ['s', hsv.s], ['v', hsv.v]]) {
        menu.querySelector(`#color-${id}`).value = Math.round(value);
        menu.querySelector(`#color-${id}-value`).textContent = `${Math.round(value)}${id === 'hue' ? '\u00b0' : '%'}`;
      }
      menu.querySelector('#color-s').style.backgroundImage = `linear-gradient(to right, #fff, ${pureHue})`;
      menu.querySelector('#color-v').style.backgroundImage = `linear-gradient(to right, #000, ${ColorMath.hsvToHex({ ...hsv, v: 100 })})`;
      if (!fromText) hex.value = color.toUpperCase();
      menu.querySelectorAll('[data-color-preset]').forEach(preset => preset.setAttribute('aria-pressed', String(preset.dataset.colorPreset === color)));
      hex.setAttribute('aria-invalid', 'false');
      menu.querySelector('#color-error').hidden = true;
      menu.querySelector('[type="submit"]').disabled = false;
      if (button.value !== color) {
        button.value = color;
        button.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    function choose(color) {
      const next = ColorMath.hexToHsv(color);
      hsv = { ...next, h: next.s ? next.h : hsv.h };
      update();
    }
    hex.oninput = () => {
      const value = hex.value.trim();
      if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
        hex.setAttribute('aria-invalid', 'true');
        menu.querySelector('#color-error').hidden = false;
        menu.querySelector('[type="submit"]').disabled = true;
        this.positionColorPicker();
        return;
      }
      const next = ColorMath.hexToHsv(value.startsWith('#') ? value : '#' + value);
      hsv = { ...next, h: next.s ? next.h : hsv.h };
      update(true);
    };
    for (const [id, key] of [['hue', 'h'], ['s', 's'], ['v', 'v']]) menu.querySelector(`#color-${id}`).oninput = event => { hsv[key] = Number(event.target.value); update(); };
    let pointerId = null;
    const drag = event => {
      const bounds = plane.getBoundingClientRect(), clamp = value => Math.max(0, Math.min(1, value));
      hsv.s = clamp((event.clientX - bounds.left) / bounds.width) * 100;
      hsv.v = (1 - clamp((event.clientY - bounds.top) / bounds.height)) * 100;
      update();
    };
    plane.onpointerdown = event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      pointerId = event.pointerId;
      plane.setPointerCapture(pointerId);
      drag(event);
    };
    plane.onpointermove = event => { if (event.pointerId === pointerId) drag(event); };
    plane.onpointerup = event => { if (event.pointerId === pointerId) { drag(event); plane.releasePointerCapture(pointerId); pointerId = null; } };
    plane.onlostpointercapture = plane.onpointercancel = () => { pointerId = null; };
    menu.querySelectorAll('[data-color-preset]').forEach(preset => preset.onclick = () => choose(preset.dataset.colorPreset));
    menu.querySelector('.color-original').onclick = () => choose(initial);
    menu.querySelectorAll('[data-color-cancel]').forEach(cancel => cancel.onclick = () => this.closeColorPicker(false, true));
    menu.onsubmit = event => {
      event.preventDefault();
      if (hex.getAttribute('aria-invalid') === 'true') { hex.focus(); return; }
      this.closeColorPicker(true, true);
    };
    menu.onkeydown = event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.closeColorPicker(false, true); }
      if (event.key === 'Tab') {
        const inputs = [...menu.querySelectorAll('button:not(:disabled), input')], index = inputs.indexOf(document.activeElement);
        if (event.shiftKey && index === 0 || !event.shiftKey && index === inputs.length - 1) {
          event.preventDefault(); inputs[event.shiftKey ? inputs.length - 1 : 0].focus();
        }
      }
    };
    update();
    menu.showPopover();
    button.setAttribute('aria-expanded', 'true');
    this.positionColorPicker();
    hex.focus({ preventScroll: true }); hex.select();
  }
  install() {
    document.addEventListener('pointerdown', event => {
      if (this.#activeColorPicker && !this.#activeColorPicker.menu.contains(event.target) && !event.target.closest('.color-control')) this.closeColorPicker();
    }, true);
    window.addEventListener('scroll', event => {
      if (this.#activeColorPicker && !this.#activeColorPicker.menu.contains(event.target)) this.positionColorPicker();
    }, true);
    window.addEventListener('resize', this.positionColorPicker);
  }
}
