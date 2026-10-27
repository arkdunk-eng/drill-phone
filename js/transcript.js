(function (root) {
  var Transcript = {
    create: function () {
      var turns = [];
      return {
        turns: turns,
        add: function (who, text, t) {
          if ((who !== '参加者' && who !== '相手') || typeof text !== 'string' || !text) return;
          var last = turns[turns.length - 1];
          if (last && last.who === who) last.text += text;
          else turns.push({who:who,text:text,t:t});
        },
        input: function (text,t) { this.add('参加者',text,t); },
        output: function (text,t) { this.add('相手',text,t); }
      };
    }
  };
  if (typeof module !== 'undefined') module.exports = Transcript; else root.Transcript = Transcript;
})(this);
