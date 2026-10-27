(function (root) {
  function resample(input, fromRate, toRate) {
    var count = Math.round(input.length * toRate / fromRate), out = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var at = i * fromRate / toRate, left = Math.floor(at), right = Math.min(left + 1, input.length - 1), fraction = at - left;
      out[i] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return out;
  }
  function toInt16(input) {
    var out = new Int16Array(input.length);
    for (var i = 0; i < input.length; i++) out[i] = Math.round(Math.max(-1, Math.min(1, input[i])) * (input[i] < 0 ? 32768 : 32767));
    return out;
  }
  function encode(input) {
    var pcm = toInt16(input), bytes = new Uint8Array(pcm.length * 2);
    for (var i = 0; i < pcm.length; i++) { bytes[2*i] = pcm[i] & 255; bytes[2*i+1] = (pcm[i] >> 8) & 255; }
    var s = ''; for (var j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  }
  function decode(base64) {
    var s = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
    var out = new Float32Array(Math.floor(s.length / 2));
    for (var i = 0; i < out.length; i++) {
      var n = s.charCodeAt(i*2) | (s.charCodeAt(i*2+1) << 8);
      if (n >= 32768) n -= 65536;
      out[i] = n / (n < 0 ? 32768 : 32767);
    }
    return out;
  }
  function rms(input) { if (!input.length) return 0; var sum = 0; for (var i = 0; i < input.length; i++) sum += input[i] * input[i]; return Math.sqrt(sum / input.length); }
  var PhoneAudio = {resample:resample,toInt16:toInt16,encode:encode,decode:decode,rms:rms};
  if (typeof module !== 'undefined') module.exports = PhoneAudio; else root.PhoneAudio = PhoneAudio;
})(this);
