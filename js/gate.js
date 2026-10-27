(function (root) {
  var Gate = {
    create: function (options) {
      var o = Object.assign({threshold:0.02,silenceMs:1500,waitMs:8000,maxMs:25000,prebuffer:5}, options || {});
      var state = 'idle', elapsed = 0, silence = 0, buffered = 0;
      return {
        get state() { return state; },
        tap: function () {
          if (state === 'talking') { state = 'idle'; return [{type:'end'}]; }
          if (state === 'waiting') { state = 'idle'; return [{type:'cancel'}]; }
          state = 'waiting'; elapsed = 0; silence = 0; buffered = 0; return [];
        },
        chunk: function (rms, ms) {
          if (state === 'idle') return [];
          elapsed += ms;
          if (state === 'waiting') {
            if (rms > o.threshold) { state = 'talking'; silence = 0; return [{type:'start'},{type:'audio',count:buffered + 1}]; }
            buffered = Math.min(o.prebuffer, buffered + 1);
            if (elapsed >= o.waitMs) { state = 'idle'; return [{type:'cancel'}]; }
            return [];
          }
          var actions = [{type:'audio',count:1}];
          silence = rms < o.threshold ? silence + ms : 0;
          if (silence >= o.silenceMs || elapsed >= o.maxMs) { state = 'idle'; actions.push({type:'end'}); }
          return actions;
        }
      };
    }
  };
  if (typeof module !== 'undefined') module.exports = Gate; else root.Gate = Gate;
})(this);
