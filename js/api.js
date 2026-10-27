(function (root) {
  function create(keyName) {
    var key = new URLSearchParams(root.location.search).get(keyName) || '';
    var messages = {forbidden:'鍵が違います。', server:'電話の仕組みでエラーが起きました。運営に知らせてください。', 'not-allowed':'このテーブルからはかけられません。', 'not-found':'記録が見つかりません。', 'bad-scene':'場面の値が正しくありません。', 'bad-region':'地域の値が正しくありません。', 'bad-ending':'通話の終わり方が正しくありません。', 'bad-action':'操作が正しくありません。', 'bad-json':'送信内容が正しくありません。'};
    function check(result) { if (result.error) throw new Error(messages[result.error] || '処理できませんでした。'); return result; }
    async function get(action, params) {
      var query = new URLSearchParams(Object.assign({action:action}, params || {}));
      query.set(keyName,key);
      var result;
      try { result = await (await fetch(PhoneConfig.GAS_URL + '?' + query.toString())).json(); }
      catch (_) { throw new Error('通信に失敗しました。'); }
      return check(result);
    }
    async function post(data) {
      var result;
      try { result = await (await fetch(PhoneConfig.GAS_URL, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},data,{[keyName]:key}))})).json(); }
      catch (_) { throw new Error('通信に失敗しました。'); }
      return check(result);
    }
    return {get:get,post:post,key:key,url:PhoneConfig.GAS_URL};
  }
  var PhoneApi = {create:create};
  if (typeof module !== 'undefined') module.exports = PhoneApi; else root.PhoneApi = PhoneApi;
})(this);
