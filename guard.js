/* 本地 guard（纯前端，零后端）
   1) 拦截所有外发请求（fetch / XHR / EventSource / WebSocket / sendBeacon）：
      只放行本机（serve.py），其余域名静默拒绝（返回伪造成功，不留网络
      日志，不弹错）——空壳不连任何官方原生接口，也就不会出现
      "服务器繁忙 / 网络繁忙 / 服务器不可用"。
   2) 聊天接口：把"模型网关"面板里配的 URL/SK/模型用 x-local-* 头带给 serve.py
      （只发给本机后端；面板没配时后端用 local-config.json 或内置网关的配置）。
   3) 藏掉官方原生入口：下载应用、分享、帮助与反馈、退出登录，
      以及设置页里本地版无意义的项（注销账号、登出所有设备、
      登录设备管理、数据用于优化体验、我共享的链接、服务协议）。
      （退出登录/注销账号在单机空壳里没有意义：登录态是本地种死的，
      退了重进还是同一个用户，注销还会把本地会话状态清掉；系统设置
      保留，主题/语言/导出/删除对话有用。）
   4) 外链：只拦 DeepSeek 官方域名（deepseek.com 及其子域，如政策页、
      下载页、分享链接）；模型回复里的其他外链（维基、新闻等）正常放行，
      点了能跳，用户自己决定看不看。

   性能注意：旧版 scrub 每 500ms 全量扫一遍所有 div/span，长对话时
   DOM 节点上千，页面会一卡一卡的。现在改成 MutationObserver（只看
   新增节点）+ 2 秒一次的作用域查询（只查菜单行/弹窗/分享图标/设置页），
   不再全量扫 DOM。
*/
(function () {
  'use strict';
  window.__guardLoaded = true;
  var SELF = location.origin;
  // 不用经过后端、直接本地假成功的遥测/上报接口（发了也白发，直接省掉）
  var localFakePaths = ['/api/v0/telemetry', '/api/v0/telemetry/', '/api/v0/client/span', '/api/v0/client/settings/report'];
  function hostOf(u) { try { return new URL(u, location.href).host; } catch (e) { return ''; } }
  function allow(u) {
    var h = hostOf(u);
    if (!h || h === hostOf(SELF)) return true;
    return false;
  }
  function pathOf(u) { try { return new URL(u, location.href).pathname; } catch (e) { return ''; } }
  function isLocalFake(u) { return localFakePaths.indexOf(pathOf(u)) >= 0; }
  // 聊天接口：把面板里配的 URL/SK/模型用本地头带给 serve.py（只发给本机后端）
  var chatPaths = ['/api/v0/chat/completion', '/api/v0/chat/regenerate', '/api/v0/chat/continue', '/api/v0/chat/edit_message'];
  function isChatApi(u) { return chatPaths.indexOf(pathOf(u)) >= 0; }
  function localHeaders() {
    try {
      var cfg = JSON.parse(localStorage.getItem('ds_local_config') || '{}');
      var h = {};
      if (cfg.url) h['x-local-api-url'] = cfg.url;
      if (cfg.key) h['x-local-api-key'] = cfg.key;
      if (cfg.model) h['x-local-model'] = cfg.model;
      return h;
    } catch (e) { return {}; }
  }
  var okResp = function () { return new Response('{"code":0,"msg":"ok","data":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };

  // fetch
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!allow(url)) return Promise.resolve(okResp());
    if (isLocalFake(url)) return Promise.resolve(okResp());
    if (isChatApi(url)) {
      var lh = localHeaders(), has = false, k;
      for (k in lh) { has = true; break; }
      if (has) {
        if (typeof input === 'string') {
          init = init || {};
          var hdrs = new Headers(init.headers || {});
          for (k in lh) hdrs.set(k, lh[k]);
          init.headers = hdrs;
          return origFetch.call(this, input, init);
        } else if (input && input.url) {
          var hdrs2 = new Headers(input.headers || {});
          if (init && init.headers) new Headers(init.headers).forEach(function (v, n) { hdrs2.set(n, v); });
          for (k in lh) hdrs2.set(k, lh[k]);
          var init2 = {};
          if (init) { for (var p in init) if (p !== 'headers') init2[p] = init[p]; }
          return origFetch.call(this, new Request(input, { headers: hdrs2 }), init2);
        }
      }
    }
    return origFetch.apply(this, arguments);
  };
  // XHR（壳子的 http 客户端 lyla 用 XHR 发请求，聊天走这里）
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__url = url;
    this.__blocked = !allow(url);
    this.__localFake = isLocalFake(url);
    if (this.__blocked || this.__localFake) return; // 不真正 open，send 时静默
    return origOpen.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__blocked || this.__localFake) { var self=this; setTimeout(function(){ if(self.onload) self.onload({target:{status:200, responseText:'{"code":0,"data":{}}'}}); },0); return; }
    if (isChatApi(this.__url || '')) {
      var lh = localHeaders();
      for (var k in lh) { try { this.setRequestHeader(k, lh[k]); } catch (e) {} }
    }
    return origSend.apply(this, arguments);
  };
  // EventSource
  var OrigES = window.EventSource;
  window.EventSource = function (url) { if (!allow(url)) return { close: function(){}, addEventListener:function(){}, readyState:0 }; return new OrigES(url); };
  // WebSocket
  var OrigWS = window.WebSocket;
  window.WebSocket = function (url) { if (!allow(url)) return { close:function(){}, send:function(){}, addEventListener:function(){}, readyState:0 }; return new OrigWS(url); };
  // sendBeacon
  if (navigator.sendBeacon) { var origBeacon = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (url) { if (!allow(url)) return true; return origBeacon(url); }; }

  // PoW：不用假 worker 了。本包的两个 PoW 求解 worker（37627 wasm / 76608 JS）
  // 已有短路补丁（直接回 answer=0），且 serve.py 给的挑战本身就是真可解的，
  // 即使换回原版 worker 也能解出。guard.js 不再碰 Worker。

  // 外链导航拦截：只拦 DeepSeek 官方域名（政策页/下载页/分享链接等），
  // 加两个官方反馈表单与 App Store 上的 DeepSeek 应用页；
  // 模型回复里的其他外链正常放行。
  // 注意：不要碰 window.open——实测任何形式的替换（普通函数、Proxy）
  // 都会让壳子启动时直接不发任何 /api 请求（疑似壳子检查了 window.open
  // 的属性来源）；下载入口本身已由下面的 scrub 从界面上删掉，
  // window.open 的调用点（下载/横幅/引用链接）没有 UI 能触发，已足够。
  function isOfficialHost(h) {
    h = (h || '').toLowerCase();
    return h === 'deepseek.com' || h.slice(-13) === '.deepseek.com';
  }
  var BLOCKED_URLS = [
    'trtgsjkv6r.feishu.cn/share/base/form/shrcnh2NQeMJ0dHvasX469i79ng',
    'trtgsjkv6r.feishu.cn/share/base/form/shrcnhcHE4A6lQaQ3v0raCXmBAg',
    'apps.apple.com/app/apple-store/id6737597349'
  ];
  function isBlockedLink(href) {
    if (isOfficialHost(hostOf(href))) return true;
    var u = href.replace(/^https?:\/\//, '').split(/[?#]/)[0];
    return BLOCKED_URLS.indexOf(u) >= 0;
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && a.href && isBlockedLink(a.href)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // 隐藏官方原生入口：下载应用 / 分享 / 帮助与反馈 / 退出登录
  // 根因：旧版清理只藏了菜单项里的文字，整行（手机图标+可点击行）还在，
  // 所以点图标照样跳 download.deepseek.com。现在改成藏整行。
  // 安全规则：只看菜单行（.ds-dropdown-menu-option）和弹窗标题，
  // 消息正文里就算写了"分享"也不会被删。
  var HIDE_TEXT_RE = /^(Download (mobile )?app|下载(手机)?应用|下载 App|Get App|分享|Share|帮助与反馈|Help (&|and) Feedback|退出登录|Log ?out)$/i;
  var MODAL_TEXT_RE = /^(创建分享链接|Create public link|扫码下载 DeepSeek App|Scan to get DeepSeek app)$/i;
  function hideEl(el) { try { el.style.setProperty('display', 'none', 'important'); } catch (e) {} }
  function scrubRoot(root) {
    if (!root || root.nodeType !== 1) return;
    // ① 分享图标按钮：壳子里的分享按钮是 div[role=button]，没有 aria-label/title，
    // 只能认图标。分享图标（纸飞机箭头）的 SVG path 在 bundle 里是固定值，
    // 以 M7.95889 1.52285 开头，实测全站只有回复操作栏与页顶两个分享按钮用它，
    // 其余图标（复制/重生成/赞/踩/发送等）path 都不同，不会误藏。
    var paths = root.querySelectorAll
      ? root.querySelectorAll('svg path[d^="M7.95889 1.52285"]') : [];
    for (var i = 0; i < paths.length; i++) {
      var btn = paths[i].closest('button,a,[role="button"],[tabindex="0"]');
      if (btn) hideEl(btn);
    }
    // ①b 有 aria-label/title 的分享按钮
    var labeled = root.querySelectorAll
      ? root.querySelectorAll('button[aria-label="分享"],button[aria-label="Share"],[title="分享"],[title="Share"]') : [];
    for (var j = 0; j < labeled.length; j++) hideEl(labeled[j]);
    // ② 菜单行：只查 .ds-dropdown-menu-option（壳子菜单项的行容器），
    // 整行文字匹配才藏——正文不受影响。
    var rows = root.querySelectorAll
      ? root.querySelectorAll('.ds-dropdown-menu-option') : [];
    // root 自己也可能是菜单行
    if (root.matches && root.matches('.ds-dropdown-menu-option')) {
      rows = [root].concat(Array.prototype.slice.call(rows));
    }
    for (var k = 0; k < rows.length; k++) {
      var t = (rows[k].textContent || '').trim();
      if (HIDE_TEXT_RE.test(t)) hideEl(rows[k]);
    }
    // ③ 分享/下载弹窗：只查弹窗里的标题
    var dlgs = root.querySelectorAll ? root.querySelectorAll('[role="dialog"]') : [];
    for (var m = 0; m < dlgs.length; m++) {
      var heads = dlgs[m].querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="Title"]');
      for (var n = 0; n < heads.length; n++) {
        if (MODAL_TEXT_RE.test((heads[n].textContent || '').trim())) { hideEl(dlgs[m]); break; }
      }
    }
    // ④ 设置页（系统设置弹窗）：藏掉本地版无意义/有危险的原生项。
    // 只在标题含"系统设置"的弹窗里跑，不碰其他弹窗。行结构：每行是
    // div.ds-flex，标签是里面的 span/div（实测 DOM）；标签文字精确匹配
    // 才藏整行，正文不受影响。弹窗本身可能是 [role=dialog] 或
    // .ds-modal-content，且可能是 scrubRoot 的根节点本身，都要算上。
    var settingsLabels = ['注销账号', '登出所有设备', '登录设备管理',
      '数据用于优化体验', '我共享的链接', '用户协议', '隐私政策'];
    var dlgCands = [];
    for (var dd = 0; dd < dlgs.length; dd++) dlgCands.push(dlgs[dd]);
    var modals = root.querySelectorAll
      ? root.querySelectorAll('.ds-modal-content') : [];
    for (var mm = 0; mm < modals.length; mm++) dlgCands.push(modals[mm]);
    if (root.matches && (root.matches('[role="dialog"]') ||
        root.matches('.ds-modal-content'))) dlgCands.push(root);
    // 新增节点可能是在已有弹窗内部挂载的（比如设置页切标签时只换内容区），
    // 这时根节点既不是弹窗也不包含弹窗，要往上找它所在的弹窗。
    if (root.closest) {
      var anc = root.closest('[role="dialog"], .ds-modal-content');
      if (anc) dlgCands.push(anc);
    }
    for (var s = 0; s < dlgCands.length; s++) {
      var dlg = dlgCands[s];
      if ((dlg.innerText || '').indexOf('系统设置') < 0) continue;
      var all = dlg.querySelectorAll('*');
      for (var q = 0; q < all.length; q++) {
        var el = all[q];
        var own = '';
        for (var c = 0; c < el.childNodes.length; c++) {
          if (el.childNodes[c].nodeType === 3) own += el.childNodes[c].textContent;
        }
        if (settingsLabels.indexOf(own.trim()) >= 0) {
          var row = el.closest ? el.closest('div.ds-flex') : null;
          hideEl(row || el);
        }
      }
      // "服务协议"标签页：它里面只有两条官方政策链接，整页藏掉。
      // 找 innerText 恰好等于"服务协议"的最小元素，再往上爬到只含
      // 该文字的祖先（即标签项本身），藏掉它。
      var cands = [];
      for (var w = 0; w < all.length; w++) {
        if ((all[w].innerText || '').trim() === '服务协议') cands.push(all[w]);
      }
      if (cands.length) {
        cands.sort(function (a, b) {
          var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return ra.width * ra.height - rb.width * rb.height;
        });
        var tab = cands[0], par = tab.parentElement;
        while (par && (par.innerText || '').trim() === '服务协议') {
          tab = par; par = par.parentElement;
        }
        hideEl(tab);
      }
    }
  }
  function scrubAll() { scrubRoot(document); }
  // 新增节点才 scrub（菜单/弹窗都是动态挂载的），不全量扫 DOM
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) scrubRoot(added[j]);
    }
  });
  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState !== 'loading') { scrubAll(); startObserver(); }
  else document.addEventListener('DOMContentLoaded', function () { scrubAll(); startObserver(); });
  // 兜底：2 秒一次轻量复查（作用域查询，不扫全 DOM）
  setInterval(scrubAll, 2000);
})();
