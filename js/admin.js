(function () {
  'use strict';
  var api = PhoneApi.create('a'), selectedCall = null, selectedRegions = [], calls = [], tableFilter = '', sortKey = 'startedMs', sortDirection = -1;
  var $ = function (id) { return document.getElementById(id); };
  function time(ms) { return new Date(ms).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function duration(seconds) { return Math.floor(seconds/60) + '分' + seconds%60 + '秒'; }
  function elapsed(seconds) { return Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0'); }
  function renderCalls() {
    var tables = [];
    calls.forEach(function (call) { if (!tables.some(function (t) { return t.id === call.tableId; })) tables.push({id:call.tableId,name:call.tableName}); });
    tables.sort(function (a,b) { return a.id.localeCompare(b.id,'ja'); });
    var filter = $('table-filter'); filter.replaceChildren();
    var all = document.createElement('option'); all.value = ''; all.textContent = 'すべてのテーブル'; filter.appendChild(all);
    tables.forEach(function (t) { var option = document.createElement('option'); option.value = t.id; option.textContent = t.name; filter.appendChild(option); });
    filter.value = tableFilter;
    var shown = calls.filter(function (call) { return !tableFilter || call.tableId === tableFilter; });
    shown.sort(function (a,b) {
      var result = sortKey === 'startedMs' || sortKey === 'seconds' ? Number(a[sortKey] || 0) - Number(b[sortKey] || 0) : String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''),'ja');
      return result ? result * sortDirection : Number(b.startedMs) - Number(a.startedMs);
    });
    document.querySelectorAll('[data-sort]').forEach(function (button) {
      var active = button.dataset.sort === sortKey;
      button.textContent = button.dataset.sort === 'startedMs' ? '時刻（開始）' : button.dataset.sort === 'tableId' ? 'テーブル' : button.dataset.sort === 'destinationName' ? '電話先' : '長さ';
      if (active) button.textContent += sortDirection === 1 ? ' ▲' : ' ▼';
      button.setAttribute('aria-sort', active ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none');
    });
    $('total-scope').textContent = tableFilter ? '（' + tableFilter + 'のみ）' : '';
    $('total').textContent = (shown.reduce(function (sum,call) { return sum + Number(call.seconds || 0); },0)/60).toFixed(1) + '分';
    $('calls').replaceChildren();
    shown.forEach(function (call) {
      var tr = document.createElement('tr'); tr.classList.toggle('selected',call.callId === selectedCall);
      [time(call.startedMs),call.tableName,call.destinationName,String(call.scene),duration(call.seconds),call.endedBy || '通話中'].forEach(function (value) {
        var td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
      });
      tr.tabIndex = 0; tr.setAttribute('aria-label',call.tableName + ' ' + call.destinationName + 'の通話を開く');
      tr.onclick = function () { showCall(call.callId); };
      tr.onkeydown = function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showCall(call.callId); } };
      $('calls').appendChild(tr);
    });
  }
  async function showCall(id) {
    selectedCall = id; renderCalls(); $('detail-meta').textContent = ''; $('detail-turns').textContent = '読み込み中…';
    if (!$('detail').open) $('detail').showModal();
    try {
      var data = await api.get('adminCall',{callId:id});
      if (selectedCall !== id) return;
      var call = Object.assign({}, calls.find(function (x) { return x.callId === id; }) || {}, data.call || {});
      $('detail-meta').replaceChildren();
      [time(call.startedMs),call.tableName || call.tableId,call.destinationName || call.destinationId,'場面 ' + call.scene,duration(call.seconds || 0),call.endedBy || '通話中'].forEach(function (value) {
        var span = document.createElement('span'); span.textContent = value; $('detail-meta').appendChild(span);
      });
      $('detail-turns').replaceChildren();
      if (!(data.turns || []).length) $('detail-turns').textContent = '発話はありません（終わり方: ' + (call.endedBy || '通話中') + '）';
      (data.turns || []).forEach(function (turn) {
        var line = document.createElement('div'), bubble = document.createElement('div'), t = document.createElement('small');
        line.className = 'turn' + (turn.who === '参加者' ? ' mine' : ''); bubble.className = 'bubble';
        bubble.textContent = turn.text; t.textContent = elapsed(turn.t);
        line.append(bubble,t); $('detail-turns').appendChild(line);
      });
    } catch (e) { $('detail-turns').textContent = '発話を読めません: ' + e.message; }
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
      calls = data.calls || []; renderCalls();
    } catch (e) { $('error').textContent = '運営画面を更新できません: ' + e.message; }
  }
  $('table-filter').onchange = function () { tableFilter = this.value; renderCalls(); };
  document.querySelectorAll('[data-sort]').forEach(function (button) { button.onclick = function () {
    var key = button.dataset.sort;
    if (sortKey === key) sortDirection *= -1; else { sortKey = key; sortDirection = key === 'startedMs' || key === 'seconds' ? -1 : 1; }
    renderCalls();
  }; });
  $('close-detail').onclick = function () { $('detail').close(); };
  $('detail').onclose = function () { selectedCall = null; renderCalls(); };
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
