(function (root) {
  var WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
  function connect(token, model, playbackContext, handlers) {
    var ws = new WebSocket(WS_BASE + '?access_token=' + encodeURIComponent(token));
    ws.binaryType = 'arraybuffer';
    var ready = false, nextAt = playbackContext.currentTime, sources = [];
    function send(value) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); }
    function stopPlayback() { sources.forEach(function (source) { try { source.stop(); } catch (_) {} }); sources = []; nextAt = playbackContext.currentTime; }
    function playbackRemainingMs() { return Math.max(0, Math.ceil((nextAt - playbackContext.currentTime) * 1000)); }
    function play(base64) {
      var samples = PhoneAudio.decode(base64), buffer = playbackContext.createBuffer(1,samples.length,24000);
      buffer.copyToChannel(samples,0);
      var source = playbackContext.createBufferSource(); source.buffer = buffer; source.connect(playbackContext.destination);
      var at = Math.max(nextAt,playbackContext.currentTime); source.start(at); nextAt = at + buffer.duration;
      sources.push(source); source.onended = function () { sources = sources.filter(function (s) { return s !== source; }); };
    }
    ws.onopen = function () { send({setup:{model:model}}); };
    ws.onmessage = function (event) {
      var raw = typeof event.data === 'string' ? event.data : event.data instanceof ArrayBuffer ? new TextDecoder().decode(event.data) : '', msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }
      if (msg.setupComplete) {
        ready = true;
        handlers.connected();
        send({clientContent:{turns:[{role:'user',parts:[{text:'（電話が鳴っています。受話器を取って第一声だけを言ってください）'}]}],turnComplete:true}});
      }
      var content = msg.serverContent;
      if (!content) return;
      (content.modelTurn && content.modelTurn.parts || []).forEach(function (part) {
        if (part.inlineData && part.inlineData.data) { play(part.inlineData.data); handlers.audio(); }
      });
      if (content.inputTranscription && content.inputTranscription.text) handlers.input(content.inputTranscription.text);
      if (content.outputTranscription && content.outputTranscription.text) handlers.output(content.outputTranscription.text);
      if (content.interrupted) { stopPlayback(); if (handlers.interrupted) handlers.interrupted(); }
      if (content.turnComplete && handlers.turnComplete) handlers.turnComplete();
    };
    ws.onclose = function (event) { stopPlayback(); handlers.closed(event,ready); };
    ws.onerror = function () { if (handlers.error) handlers.error(); };
    return {
      start: function () { send({realtimeInput:{activityStart:{}}}); },
      audio: function (base64) { send({realtimeInput:{audio:{data:base64,mimeType:'audio/pcm;rate=16000'}}}); },
      end: function () { send({realtimeInput:{activityEnd:{}}}); },
      interrupt: stopPlayback,
      close: function () { ws.close(); stopPlayback(); },
      isOpen: function () { return ws.readyState === WebSocket.OPEN; },
      playbackRemainingMs: playbackRemainingMs
    };
  }
  var PhoneLive = {connect:connect};
  if (typeof module !== 'undefined') module.exports = PhoneLive; else root.PhoneLive = PhoneLive;
})(this);
