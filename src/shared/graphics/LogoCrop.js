'use strict';
// Raster logo crops keep the same transparent PNG in the interface and the portable startup screen.
(() => {
class LogoCrop {
  static shapes = [
    { id: 'none', name: 'Original' },
    { id: 'circle', name: 'Circle' },
    { id: 'square', name: 'Square' },
    { id: 'rounded-square', name: 'Rounded square' },
    { id: 'triangle', name: 'Triangle' },
    { id: 'diamond', name: 'Diamond' },
    { id: 'hexagon', name: 'Hexagon' }
  ];
  static valid(shape) { return LogoCrop.shapes.some(item => item.id === shape); }
  static draw(context, image, shape) {
    if (!LogoCrop.valid(shape)) throw new Error('Invalid logo shape.');
    const { width, height } = context.canvas;
    context.clearRect(0, 0, width, height);
    if (shape === 'none') { context.drawImage(image, 0, 0, width, height); return; }
    context.save();
    try {
      context.beginPath();
      if (shape === 'circle') context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
      else if (shape === 'rounded-square') context.roundRect(0, 0, width, height, width * .2);
      else if (shape === 'square') context.rect(0, 0, width, height);
      else {
        const points = {
          triangle: [[.5, 0], [1, 1], [0, 1]],
          diamond: [[.5, 0], [1, .5], [.5, 1], [0, .5]],
          hexagon: [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]]
        }[shape];
        points.forEach(([x, y], index) => context[index ? 'lineTo' : 'moveTo'](x * width, y * height));
        context.closePath();
      }
      context.clip();
      const side = Math.min(image.width, image.height);
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, width, height);
    } finally { context.restore(); }
  }
}
if (typeof module !== 'undefined') module.exports = LogoCrop;
else ((globalThis.OrbitKanban ??= {}).Graphics ??= {}).LogoCrop = LogoCrop;
})();
