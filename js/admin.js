(function () {
  'use strict';
  var api = PhoneApi.create('a'), selectedCall = null, selectedRegions = [];
  var $ = function (id) { return document.getElementById(id); };
  function time(ms) { return new Date(ms).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function duration(seconds) { return Math.floor(seconds/60) + '分' + seconds%60 + '秒'; }
  function elapsed(seconds) { return Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0'); }
  async function showCall(id) {
    selectedCall = id; $('detail').textContent = '読み込み中…';
    try {
      var data = await api.get('adminCall',{callId:id});
      if (selectedCall !== id) return;
      $('detail').replaceChildren();
      var title = document.createElement('h3'); title.textContent = '発話の全文'; $('detail').appendChild(title);
      (data.turns || []).forEach(function (turn) {
        var line = document.createElement('p'), label = document.createElement('strong'), t = document.createElement('small');
        label.textContent = turn.who + ': '; t.textContent = ' ' + elapsed(turn.t);
        line.append(label,document.createTextNode(turn.text),t); $('detail').appendChild(line);
      });
    } catch (e) { $('error').textContent = '発話を読めません: ' + e.message; }
  }
  async function refresh() {
    try {
      var data = await api.get('admin'); $('error').textContent = '';
      selectedRegions = data.regions || [];
      document.querySelectorAll('#regions button').forEach(function (button) { button.classList.toggle('active', selectedRegions.indexOf(button.dataset.region) >= 0); });
      document.querySelectorAll('#scenes button').forEach(function (button) { button.classList.toggle('active',Number(button.dataset.scene) === data.scene); });
      var missing = data.missing || [];
      $('missing').hidden = missing.length === 0;
      $('missing').textContent = missing.length ? 'この場面の台本が無い電話先（かけると「出ない」になります）: ' + missing.map(function (d) { return d.name; }).join('、') : '';
      $('total').textContent = (data.totalSeconds/60).toFixed(1) + '分';
      $('calls').replaceChildren();
      (data.calls || []).forEach(function (call) {
        var tr = document.createElement('tr');
        [time(call.startedMs),call.tableName,call.destinationName,String(call.scene),duration(call.seconds),call.endedBy || '通話中'].forEach(function (value) {
          var td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
        });
        tr.onclick = function () { showCall(call.callId); }; $('calls').appendChild(tr);
      });
    } catch (e) { $('error').textContent = '運営画面を更新できません: ' + e.message; }
  }
  document.querySelectorAll('#regions button').forEach(function (button) {
    button.onclick = async function () {
      var region = button.dataset.region;
      var regions = Array.from(document.querySelectorAll('#regions button')).map(function (b) { return b.dataset.region; }).filter(function (name) {
        return name === region ? selectedRegions.indexOf(name) < 0 : selectedRegions.indexOf(name) >= 0;
      });
      var question = regions.length ? '表示する地域を「' + regions.join('、') + '」にしますか？' : 'すべての地域を表示しますか？';
      if (!confirm(question)) return;
      try { await api.post({action:'setRegions',regions:regions}); await refresh(); }
      catch (e) { $('error').textContent = '地域を切り替えられません: ' + e.message; }
    };
  });
  document.querySelectorAll('#scenes button').forEach(function (button) {
    button.onclick = async function () {
      var scene = Number(button.dataset.scene);
      if (!confirm('場面を「' + button.textContent + '」に切り替えますか？')) return;
      try { await api.post({action:'setScene',scene:scene}); await refresh(); }
      catch (e) { $('error').textContent = '場面を切り替えられません: ' + e.message; }
    };
  });
  if (!api.key || !api.url) $('error').textContent = '運営画面の設定がありません。';
  else { refresh(); setInterval(refresh,15000); }
})();
