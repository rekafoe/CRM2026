export const MINIAPP_CLIENT_PART_API = `
  var _miniappAuthPromise = null;
  function getMiniappInitData() {
    var tg = window.Telegram && window.Telegram.WebApp;
    return (tg && tg.initData) ? tg.initData : '';
  }
  function miniappCloneHeaders(src) {
    var outHeaders = {};
    if (!src) return outHeaders;
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) outHeaders[k] = src[k];
    }
    return outHeaders;
  }
  function miniappJsonResponse(r) {
    return r.text().then(function (text) {
      var j = null;
      if (text) {
        try { j = JSON.parse(text); } catch (e) { j = null; }
      }
      return { ok: r.ok, status: r.status, j: j };
    });
  }
  function miniappEnsureSession(force) {
    if (out.token && !force) return Promise.resolve({ token: out.token });
    if (_miniappAuthPromise) return _miniappAuthPromise;
    var initData = getMiniappInitData();
    if (!initData) return Promise.resolve(null);
    _miniappAuthPromise = fetch(API_BASE + '/api/miniapp/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ initData: initData })
    })
      .then(function (r) { return miniappJsonResponse(r); })
      .then(function (x) {
        if (!x.ok || !x.j || !x.j.token) {
          out.token = null;
          return null;
        }
        out.token = x.j.token;
        return x.j;
      })
      .catch(function () {
        out.token = null;
        return null;
      })
      .then(function (result) {
        _miniappAuthPromise = null;
        return result;
      }, function (err) {
        _miniappAuthPromise = null;
        throw err;
      });
    return _miniappAuthPromise;
  }
  function miniappRequest(path, opts) {
    var options = opts || {};
    var attemptReauth = options.retry401 !== false;
    var headersBase = miniappCloneHeaders(options.headers);
    if (options.auth !== false && out.token && !headersBase.Authorization) {
      headersBase.Authorization = 'Bearer ' + out.token;
    }
    function doFetch(headersObj) {
      return fetch(API_BASE + path, {
        method: options.method || 'GET',
        headers: headersObj,
        body: options.body
      });
    }
    return doFetch(headersBase).then(function (r) {
      if (r.status !== 401 || options.auth === false || !attemptReauth) return r;
      return miniappEnsureSession(true).then(function (authRes) {
        if (!authRes || !out.token) return r;
        var retryHeaders = miniappCloneHeaders(options.headers);
        retryHeaders.Authorization = 'Bearer ' + out.token;
        return doFetch(retryHeaders);
      });
    });
  }
  function miniappRequestJson(path, opts) {
    return miniappRequest(path, opts).then(function (r) { return miniappJsonResponse(r); });
  }
`;
