// Organization logo settings.
import { Component } from '../core/Component.js';
import { LogoCrop, ThemeGenerator } from '../shared.js';

export class LogoSettings extends Component {
  drawLogoPreview() {
    this.$('#logo-preview').innerHTML = this.state.settingsDraft.logo ? `<img src="${this.state.settingsDraft.logo}" alt="${this.esc(this.t("Organization logo"))}">` : `<span class="muted">${this.t("No logo")}</span>`;
    const shape = this.$('#logo-shape');
    shape.value = this.state.settingsDraft.logoShape ?? 'none';
    shape.disabled = !this.state.settingsDraft.logo || this.$('#logo-file').disabled;
  }
  shapeOptions() {
    return LogoCrop.shapes.map(shape => `<option value="${shape.id}">${this.esc(this.t(shape.name))}</option>`).join('');
  }
  async cropLogo(source, shape) {
    if (!LogoCrop.valid(shape)) throw new Error(this.t("Invalid logo shape."));
    if (shape === 'none') return source;
    const image = new Image();
    image.src = source;
    try { await image.decode(); }
    catch { throw new Error(this.t("Cannot read this image. The file may be damaged or unsupported.")); }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(image.width, image.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(this.t("The image picker is unavailable on this device."));
    LogoCrop.draw(context, image, shape);
    const logo = canvas.toDataURL('image/png');
    if (logo.length > 1500000) throw new Error(this.t("The logo image is too large after conversion."));
    return logo;
  }
  wireLogoShape() {
    const select = this.$('#logo-shape'), file = this.$('#logo-file'), result = this.$('#logo-result'), remove = this.$('#remove-logo');
    select.onchange = this.app.notifier.action(async () => {
      const draft = this.state.settingsDraft, source = draft.logoSource || draft.logo, shape = select.value;
      select.disabled = file.disabled = remove.disabled = true;
      result.textContent = this.t("Loading image…");
      try {
        const logo = await this.cropLogo(source, shape);
        if (this.state.settingsDraft !== draft || !select.isConnected) return;
        draft.logoSource = source;
        draft.logoShape = shape;
        draft.logo = logo;
        result.textContent = this.t("Logo crop previewed. Save settings to keep it.");
        this.app.settings.refreshSettingsState();
      } catch (error) { result.textContent = this.t(error.message); throw error; }
      finally {
        file.disabled = remove.disabled = false;
        if (select.isConnected && this.state.settingsDraft === draft) this.drawLogoPreview();
      }
    });
  }
  async decodeImage(file) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) throw new Error(this.t("Choose a PNG, JPEG, WebP, GIF or BMP image."));
    if (file.size > 15 * 1024 * 1024) throw new Error(this.t("The image is too large. The limit is 15 MB."));
    try { return await createImageBitmap(file); }
    catch { throw new Error(this.t("Cannot read this image. The file may be damaged or unsupported.")); }
  }
  async processLogo(file) {
    const bitmap = await this.decodeImage(file);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error(this.t("The image picker is unavailable on this device."));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const logo = canvas.toDataURL('image/png');
      if (logo.length > 1500000) throw new Error(this.t("The logo image is too large after conversion."));
      const palette = ThemeGenerator.themeFromLogo(context.getImageData(0, 0, canvas.width, canvas.height).data);
      return { logo, palette };
    } finally { bitmap.close(); }
  }
}
