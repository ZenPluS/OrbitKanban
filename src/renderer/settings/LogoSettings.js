// Organization logo settings.
import { Component } from '../core/Component.js';
import { ThemeGenerator } from '../shared.js';

export class LogoSettings extends Component {
  drawLogoPreview() {
    this.$('#logo-preview').innerHTML = this.state.settingsDraft.logo ? `<img src="${this.state.settingsDraft.logo}" alt="${this.esc(this.t("Organization logo"))}">` : `<span class="muted">${this.t("No logo")}</span>`;
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
