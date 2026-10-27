(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var api = PhoneApi.create('k'), tables = [], contacts = [], selected = null, currentTab = 'contacts', call = null;
  function error(message) { $('error').textContent = message; $('error').hidden = false; setTimeout(function () { $('error').hidden = true; }, 8000); }
  function formatTime(seconds) { seconds = Math.max(0,Math.floor(seconds)); return Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0'); }
  function formatStart(ms) { return new Date(ms).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}); }
  function view(name) {
    ['table','contacts','history','detail'].forEach(function (n) { $(n+'-view').hidden = n !== name; });
    $('tabs').hidden = name === 'table';
    $('header').hidden = name === 'table'; $('notice').hidden = name === 'table';
    $('tab-contacts').classList.toggle('selected', name === 'contacts');
    $('tab-history').classList.toggle('selected', name === 'history' || name === 'detail');
  }
  function renderTables() {
    var list = $('table-list'); list.replaceChildren();
    tables.forEach(function (t) {
      var button = document.createElement('button'); button.className = 'row'; button.type = 'button'; button.textContent = t.name;
      button.onclick = function () { selectTable(t); }; list.appendChild(button);
    });
  }
  async function selectTable(t) {
    selected = t; $('table-name').textContent = t.name;
    try { localStorage.setItem('drill-phone-table',t.id); } catch (_) {}
    view('contacts');
    try { contacts = await api.get('contacts',{table:t.id}); renderContacts(); }
    catch (e) { error('連絡先を読めません: ' + e.message); }
  }
  function renderContacts() {
    var list = $('contacts-list'); list.replaceChildren();
    ['卸','医療機器','医療ガス','上位本部'].forEach(function (kind) {
      var entries = contacts.filter(function (d) { return d.kind === kind; }); if (!entries.length) return;
      var heading = document.createElement('h2'); heading.className = 'section-heading'; heading.textContent = kind; list.appendChild(heading);
      var card = document.createElement('div'); card.className = 'card';
      entries.forEach(function (d) {
        var button = document.createElement('button'); button.className = 'row'; button.type = 'button';
        var label = document.createElement('span'); label.className = 'name'; label.textContent = d.name;
        var icon = document.createElement('span'); icon.className = 'phone-icon'; icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 2.5 10 6l-2 3c1.5 3 3 4.5 6 6l3-2 3.5 3.4-1.4 3c-.4.9-1.4 1.5-2.4 1.3C9 19.6 4.4 15 3.2 7.3c-.2-1 .4-2 1.3-2.4z" fill="currentColor"/></svg>';
        button.append(label,icon); button.onclick = function () { dial(d); }; card.appendChild(button);
      }); list.appendChild(card);
    });
  }
  async function renderHistory() {
    if (!selected) return;
    view('history'); var list = $('history-list'); list.textContent = '読み込み中…';
    try {
      var rows = await api.get('history',{table:selected.id}); list.replaceChildren();
      if (!rows.length) { list.textContent = '通話履歴はまだありません。'; return; }
      rows.forEach(function (row) {
        var button = document.createElement('button'); button.className = 'row'; button.type = 'button';
        var text = document.createElement('span'), name = document.createElement('span'), sub = document.createElement('span');
        name.textContent = (contacts.find(function (c) { return c.id === row.destinationId; }) || {}).name || row.destinationId;
        sub.className = 'sub'; sub.textContent = formatStart(row.startedMs) + '・' + Math.floor(row.seconds/60) + '分' + row.seconds%60 + '秒';
        text.append(name,sub); button.appendChild(text);
        if (['出ない','話し中','混雑'].indexOf(row.endedBy) >= 0) { var right = document.createElement('span'); right.className = 'right'; right.textContent = row.endedBy; button.appendChild(right); }
        button.onclick = function () { showCall(row); }; list.appendChild(button);
      });
    } catch (e) { error('通話履歴を読めません: ' + e.message); }
  }
  async function showCall(row) {
    view('detail'); $('detail-title').textContent = (contacts.find(function (c) { return c.id === row.destinationId; }) || {}).name || row.destinationId;
    var area = $('turns'); area.textContent = '読み込み中…';
    try {
      var data = await api.get('call',{table:selected.id,callId:row.callId}); area.replaceChildren();
      (data.turns || []).forEach(function (turn) {
        var div = document.createElement('div'); div.className = 'turn' + (turn.who === '参加者' ? ' mine' : '');
        var bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = turn.text;
        var time = document.createElement('small'); time.textContent = formatTime(turn.t);
        div.append(bubble,time); area.appendChild(div);
      });
    } catch (e) { error('通話記録を読めません: ' + e.message); }
  }
  function setStatus(value) { $('call-status').textContent = value; }
  function talkButton(state) {
    var button = $('talk'); button.className = state;
    button.disabled = state === 'disabled';
    button.textContent = state === 'waiting' ? 'どうぞ' : state === 'talking' ? '聞いています' : state === 'other' ? '相手' : '話す';
  }
  function cancelTalkReady(c) { if (c.readyTimer) clearTimeout(c.readyTimer); c.readyTimer = null; }
  function scheduleTalkReady(c) {
    cancelTalkReady(c);
    if (!c.modelTurnComplete || c.finished || !c.ready || c.gate.state !== 'idle' || c.tailUntil) return;
    c.readyTimer = setTimeout(function () {
      c.readyTimer = null;
      if (c.finished || !c.modelTurnComplete || c.gate.state !== 'idle' || c.tailUntil) return;
      if (c.live.playbackRemainingMs() > 0) { scheduleTalkReady(c); return; }
      talkButton('idle');
    }, c.live.playbackRemainingMs());
  }
  function makeTone(ctx, busy) {
    var timer, active = [];
    function off() { active.forEach(function (node) { try { node.stop(); } catch (_) {} }); active = []; }
    function on() {
      off(); (busy ? [400] : [400,450]).forEach(function (frequency) {
        var source = ctx.createOscillator(), gain = ctx.createGain(); source.frequency.value = frequency; gain.gain.value = 0.05;
        source.connect(gain); gain.connect(ctx.destination); source.start(); active.push(source);
      });
      setTimeout(off,busy ? 500 : 1000);
    }
    on(); timer = setInterval(on,busy ? 1000 : 3000);
    return function () { clearInterval(timer); off(); };
  }
  function clearCallTimers(c) {
    (c.timers || []).forEach(clearTimeout); if (c.clock) clearInterval(c.clock);
    if (c.noAudio) clearTimeout(c.noAudio); if (c.tailTimer) clearTimeout(c.tailTimer);
    cancelTalkReady(c);
    if (c.stopTone) c.stopTone();
  }
  function endPayload(c, ending) { return {action:'end',callId:c.callId,table:selected.id,endedBy:ending,turns:c.transcript.turns}; }
  function closeResources(c) {
    clearCallTimers(c);
    if (c.live) c.live.close();
    if (c.stream) c.stream.getTracks().forEach(function (track) { track.stop(); });
    if (c.worklet) c.worklet.disconnect();
    if (c.inContext) c.inContext.close().catch(function () {});
    if (c.outContext) c.outContext.close().catch(function () {});
  }
  function finish(ending, message) {
    var c = call; if (!c || c.finished) return; c.finished = true;
    if (message) setStatus(message);
    closeResources(c);
    if (c.callId) api.post(endPayload(c,ending)).catch(function (e) { error('通話記録を保存できません: ' + e.message); });
    setTimeout(function () { if (call === c) { call = null; $('call-view').hidden = true; view('contacts'); } }, message ? 3000 : 0);
  }
  function sendAudio(c, data) { if (c.live && c.live.isOpen()) c.live.audio(data); }
  function scheduleActivityEnd(c) {
    if (c.tailTimer || !c.live) return;
    cancelTalkReady(c); c.modelTurnComplete = false;
    c.lastPress = Date.now();
    c.tailUntil = Date.now() + 300;
    c.tailTimer = setTimeout(function () {
      c.tailUntil = 0; c.tailTimer = null;
      if (!c.finished && c.live) {
        c.live.end(); c.awaitingAudio = true;
        if (c.noAudio) clearTimeout(c.noAudio);
        c.noAudio = setTimeout(function () { if (call === c && c.awaitingAudio && !c.finished) { c.stalled = true; setStatus('お電話が遠いようです…（このまま待つか、切ってかけ直してください）'); } },8000);
      }
    },300);
    talkButton('other');
  }
  function onMicChunk(c, samples) {
    if (c.finished || !c.ready || !c.gate) return;
    var pcm = PhoneAudio.resample(samples,c.inContext.sampleRate,16000), encoded = PhoneAudio.encode(pcm);
    if (c.tailUntil) { sendAudio(c,encoded); return; }
    var before = c.gate.state, actions = c.gate.chunk(PhoneAudio.rms(pcm), Math.round(samples.length * 1000 / c.inContext.sampleRate));
    if (before === 'waiting') {
      c.pending.push(encoded);
      if (!actions.some(function (a) { return a.type === 'start'; }) && c.pending.length > 5) c.pending.shift();
    }
    actions.forEach(function (action) {
      if (action.type === 'start') { c.live.start(); talkButton('talking'); }
      if (action.type === 'audio') {
        if (before === 'waiting') { c.pending.forEach(function (x) { sendAudio(c,x); }); c.pending = []; }
        else sendAudio(c,encoded);
      }
      if (action.type === 'end') scheduleActivityEnd(c);
      if (action.type === 'cancel') { c.pending = []; talkButton('idle'); }
    });
  }
  async function startMic(c) {
    c.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
    if (c.finished) { c.stream.getTracks().forEach(function (track) { track.stop(); }); return; }
    await c.inContext.resume(); await c.outContext.resume();
    var chunkSize = Math.round(c.inContext.sampleRate / 10);
    var code = 'class DrillMic extends AudioWorkletProcessor { constructor(){super();this.buf=[]} process(inputs){const ch=inputs[0][0];if(ch){this.buf.push(...ch);while(this.buf.length>=' + chunkSize + '){this.port.postMessage(new Float32Array(this.buf.splice(0,' + chunkSize + ')))}}return true}}registerProcessor("drill-mic",DrillMic)';
    var url = URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
    try { await c.inContext.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    c.worklet = new AudioWorkletNode(c.inContext,'drill-mic');
    var source = c.inContext.createMediaStreamSource(c.stream), mute = c.inContext.createGain(); mute.gain.value = 0;
    source.connect(c.worklet); c.worklet.connect(mute); mute.connect(c.inContext.destination);
    c.worklet.port.onmessage = function (event) { onMicChunk(c,event.data); };
  }
  function connectAi(c,result) {
    c.live = PhoneLive.connect(result.token,result.model,c.outContext,{
      connected: function () {
        if (c.finished) return;
        c.ready = true; if (c.stopTone) { c.stopTone(); c.stopTone = null; }
        c.connectedAt = Date.now(); c.stalled = false; setStatus('0:00'); talkButton('other');
        c.clock = setInterval(function () { if (!c.finished && !c.stalled) setStatus(formatTime((Date.now()-c.connectedAt)/1000)); },1000);
        c.timers.push(setTimeout(function () { finish('時間切れ','時間になりました'); },300000));
        c.timers.push(setInterval(function () { if (!c.finished && Date.now() - c.lastPress > 60000) finish('無言で切断'); },1000));
      },
      audio: function () {
        cancelTalkReady(c);
        c.awaitingAudio = false; c.stalled = false; if (c.noAudio) clearTimeout(c.noAudio);
        if (c.connectedAt) setStatus(formatTime((Date.now()-c.connectedAt)/1000));
        if (c.gate.state === 'idle' && !c.tailUntil) talkButton('other');
        if (c.modelTurnComplete) scheduleTalkReady(c);
      },
      input: function (text) { c.transcript.input(text,Math.floor((Date.now()-c.startedAt)/1000)); },
      output: function (text) { c.transcript.output(text,Math.floor((Date.now()-c.startedAt)/1000)); },
      turnComplete: function () { c.modelTurnComplete = true; scheduleTalkReady(c); },
      interrupted: function () {
        cancelTalkReady(c); c.modelTurnComplete = false;
        if (c.gate.state === 'idle' && !c.tailUntil) talkButton('idle');
      },
      closed: function (event,ready) {
        if (c.finished) return;
        if (!ready && (event.code === 1011 || /quota/i.test(event.reason || ''))) {
          if (c.stopTone) c.stopTone(); c.stopTone = makeTone(c.outContext,true);
          setStatus('回線が混み合っています。少し待ってかけ直してください');
          c.timers.push(setTimeout(function () { finish('混雑'); },5000));
        } else finish('エラー',ready ? '通話が切れました' : '電話がつながりませんでした');
      },
      error: function () {}
    });
  }
  async function dial(destination) {
    if (call) return;
    var Context = window.AudioContext || window.webkitAudioContext;
    // iPad Safari では、両方の AudioContext をタップ処理内の await より前に作る。
    var inContext = new Context(), outContext = new Context();
    inContext.resume(); outContext.resume();
    var c = {destination:destination,inContext:inContext,outContext:outContext,gate:Gate.create(),pending:[],transcript:Transcript.create(),timers:[],startedAt:Date.now(),lastPress:Date.now(),finished:false,ready:false,modelTurnComplete:false};
    call = c; $('call-name').textContent = destination.name; $('avatar').textContent = destination.name.charAt(0);
    $('call-view').hidden = false; setStatus('呼び出し中…'); talkButton('disabled');
    c.stopTone = makeTone(outContext,false);
    try {
      var result = await api.get('dial',{table:selected.id,dest:destination.id});
      if (c.finished) { c.callId = result.callId; api.post(endPayload(c,'切った')).catch(function () {}); return; }
      c.callId = result.callId;
      c.startedAt = Date.now();
      if (result.mode === 'noanswer' || result.mode === 'busy') {
        if (result.mode === 'busy') { c.stopTone(); c.stopTone = makeTone(outContext,true); }
        c.timers.push(setTimeout(function () {
          if (c.finished) return;
          c.stopTone(); c.stopTone = null;
          setStatus(result.mode === 'busy' ? '話し中' : '応答がありません');
          c.timers.push(setTimeout(function () { finish(result.mode === 'busy' ? '話し中' : '出ない'); },3000));
        },result.mode === 'busy' ? 5000 : 30000));
        return;
      }
      await startMic(c);
      if (!c.finished) connectAi(c,result);
    } catch (e) {
      if (/permission|denied|notallowed/i.test(e.name || '') || /permission|denied|notallowed/i.test(e.message || '')) {
        finish('エラー'); error('マイクが使えません。Safari の設定で、このページのマイクを許可してください');
      } else { finish('エラー'); error('電話をかけられません。運営に確認してください。'); }
    }
  }
  $('talk').onclick = function () {
    var c = call; if (!c || c.finished || !c.ready) return;
    cancelTalkReady(c); c.modelTurnComplete = false;
    c.lastPress = Date.now();
    if (c.tailTimer) { clearTimeout(c.tailTimer); c.tailTimer = null; c.tailUntil = 0; c.live.end(); }
    if (c.noAudio) clearTimeout(c.noAudio); c.awaitingAudio = false; c.stalled = false;
    if (c.gate.state === 'idle') { c.live.interrupt(); c.pending = []; }
    var actions = c.gate.tap();
    if (actions.some(function (a) { return a.type === 'end'; })) scheduleActivityEnd(c);
    else if (actions.some(function (a) { return a.type === 'cancel'; })) { c.pending = []; talkButton('idle'); }
    else talkButton('waiting');
  };
  $('hang').onclick = function () { finish('切った'); };
  $('change-table').onclick = function () { if (!call) { selected = null; view('table'); } };
  $('tab-contacts').onclick = function () { currentTab = 'contacts'; view('contacts'); };
  $('tab-history').onclick = function () { currentTab = 'history'; renderHistory(); };
  $('back-history').onclick = renderHistory;
  window.addEventListener('pagehide',function () {
    var c = call; if (!c || c.finished || !c.callId) return;
    c.finished = true; closeResources(c);
    var payload = JSON.stringify(endPayload(c,'切った'));
    navigator.sendBeacon(api.url,new Blob([payload],{type:'text/plain;charset=utf-8'}));
  });
  async function init() {
    if (!api.key || !api.url) { error('電話の設定がありません。運営に確認してください。'); return; }
    try {
      var config = await api.get('config'); tables = config.tables || []; renderTables();
      var saved = ''; try { saved = localStorage.getItem('drill-phone-table') || ''; } catch (_) {}
      var t = tables.find(function (item) { return item.id === saved; });
      if (t) await selectTable(t); else view('table');
    } catch (e) { error('設定を読めません: ' + e.message); }
  }
  init();
})();
