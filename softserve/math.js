/* Exact two-dimensional Soft-QN illustration; independent of benchmark data. */
(function (root) {
  'use strict';

  function softUpdate(lambda, angleDegrees) {
    if (!Number.isFinite(lambda) || lambda < 0 || !Number.isFinite(angleDegrees)) {
      throw new Error('The penalty must be finite and nonnegative; the angle must be finite.');
    }
    var theta = angleDegrees * Math.PI / 180;
    var y = [Math.cos(theta), Math.sin(theta)];
    var v = [(1 + lambda) * y[0], y[1]];
    var b = y[0] * v[0] + y[1] * v[1];
    var denominator = 1 + Math.sqrt(1 + 4 * lambda * b);
    var coefficient = 4 * lambda / (denominator * denominator);
    var a = 1 + lambda - coefficient * v[0] * v[0];
    var off = -coefficient * v[0] * v[1];
    var d = 1 - coefficient * v[1] * v[1];
    var largest = (a + d + Math.hypot(a - d, 2 * off)) / 2;
    var smallest = (a * d - off * off) / largest;
    var Hy = [a * y[0] + off * y[1], off * y[0] + d * y[1]];
    return {
      H: [[a, off], [off, d]],
      y: y,
      Hy: Hy,
      curvature: y[0],
      eigenvalues: [largest, smallest],
      eigenangle: Math.atan2(2 * off, a - d) / 2,
      residual: Math.hypot(1 - Hy[0], Hy[1])
    };
  }

  function memoryBytes(n) {
    return {dense: 4 * Math.pow(n, 4), diag: 4 * n * n, kron: 8 * n * n};
  }

  function formatBytes(bytes) {
    var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    var index = 0;
    while (bytes >= 1024 && index < units.length - 1) {
      bytes /= 1024;
      index += 1;
    }
    return Number(bytes.toPrecision(3)) + ' ' + units[index];
  }

  var api = {softUpdate: softUpdate, memoryBytes: memoryBytes, formatBytes: formatBytes};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SoftServeMath = api;
}(typeof window !== 'undefined' ? window : this));
