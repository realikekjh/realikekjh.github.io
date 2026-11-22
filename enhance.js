/* DeepSeek 静态预览增强（纯前端，零后端）
   1) 侧边栏底部加"设置"小图标（齿轮），点击弹出"模型网关"面板
   2) 配置面板：只填 URL + SK（不列模型、不显示型号，避免被人乱点；
      留空用内置模型，填了就覆盖内置模型）
      （保存只写 ds_local_config，不碰登录态，不刷新页面；
      确定保存只写 localStorage，下一条消息立即生效，不用刷新）
*/
(function () {
  'use strict';
  var CFG_KEY = 'ds_local_config';

  function cfgGet() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; }
  }
  function cfgSet(v) {
    // 只存模型配置，不碰登录态。旧版这里会把 userToken / __appKit_userInfo
    // 改写成 "local-<模型名>"，保存后一刷新，壳子发现持久登录 id 和
    // users/current 返回的 id 不一致，会判定"用户变了"触发 logout，
    // 侧栏直接卡骨架屏。登录态由 index.html 里的种子固定为 local-user，
    // 这里绝不能动。
    localStorage.setItem(CFG_KEY, JSON.stringify(v));
  }

  /* ---------- 样式 ---------- */
  var CSS = `
  .ds-local-gear{display:none;position:fixed;left:220px;bottom:14px;width:28px;height:28px;z-index:99997;
    align-items:center;justify-content:center;border-radius:8px;cursor:pointer;
    color:var(--text-2,#61666b);transition:background .15s;}
  .ds-local-gear:hover{background:rgba(120,130,145,.15);color:var(--text,#1b1b1c);}
  .ds-local-mask{position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:99998;display:flex;
    align-items:center;justify-content:center;padding:16px;}
  .ds-local-panel{background:#fff;color:#1b1b1c;border-radius:16px;box-shadow:0 12px 48px rgba(38,49,72,.22);
    width:440px;max-width:100%;overflow:hidden;font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
  body.dark .ds-local-panel{background:#232324;color:#ebeef2;}
  .ds-local-panel__hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #ebeef2;}
  body.dark .ds-local-panel__hd{border-color:#2c2c2e;}
  .ds-local-panel__title{font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;}
  .ds-local-panel__x{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#61666b;}
  .ds-local-panel__x:hover{background:rgba(120,130,145,.12);}
  .ds-local-panel__bd{padding:14px 16px;display:flex;flex-direction:column;gap:12px;}
  .ds-local-field label{display:block;font-size:12.5px;color:#61666b;margin-bottom:6px;}
  body.dark .ds-local-field label{color:#adb2b8;}
  .ds-local-field input{width:100%;box-sizing:border-box;border:1px solid #e1e5ee;border-radius:10px;
    padding:9px 12px;font-size:14px;background:#fff;color:#1b1b1c;outline:none;font-family:inherit;}
  .ds-local-field input:focus{border-color:#4D6BFE;box-shadow:0 0 0 3px rgba(77,107,254,.12);}
  body.dark .ds-local-field input{background:#1b1b1c;color:#ebeef2;border-color:#353638;}
  .ds-local-btn{width:100%;border:1px solid #e1e5ee;background:#f9fafb;color:#1b1b1c;border-radius:10px;
    padding:9px 12px;font-size:14px;font-family:inherit;cursor:pointer;}
  .ds-local-btn:hover{background:#f1f3f5;}
  body.dark .ds-local-btn{background:#2c2c2e;color:#ebeef2;border-color:#3a3a46;}
  .ds-local-btn[disabled]{opacity:.55;cursor:not-allowed;}
  .ds-local-pill{width:auto;align-self:flex-start;border-radius:9999px;padding:8px 16px;font-size:13px;}
  .ds-local-model-list{margin-top:8px;border:1px solid #e1e5ee;border-radius:12px;max-height:180px;overflow:auto;}
  body.dark .ds-local-model-list{border-color:#353638;}
  .ds-local-model-item{padding:9px 12px;font-size:13.5px;cursor:pointer;display:flex;align-items:center;gap:8px;}
  .ds-local-model-item:hover{background:rgba(77,107,254,.08);}
  .ds-local-model-item input{accent-color:#4D6BFE;width:auto !important;flex:none;margin:0;}
  .ds-local-panel__ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #ebeef2;}
  body.dark .ds-local-panel__ft{border-color:#2c2c2e;}
  .ds-local-primary{background:#4D6BFE;color:#fff;border:none;border-radius:10px;padding:9px 18px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;}
  .ds-local-primary:hover{background:#5b76ff;}
  .ds-local-tip{font-size:12px;color:#979da6;line-height:1.5;}
  .ds-local-hide{display:none !important;}
  `;
  var style = document.createElement('style');
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  /* ---------- 图标（SVG，用官方蓝） ---------- */
  var GEAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* ---------- 面板 ---------- */
  /* 门禁：
     - URL / Key 都空 → 用内置免费模型，界面不出现任何模型名（谁也别想看到）。
     - 填了 URL + Key → 才出现「获取模型列表」，列表只来自他自己的接口。
     - 选了模型 → 存进 ds_local_config.model，发消息时用他的模型覆盖内置的。
  */
  function openPanel() {
    var cfg = cfgGet();
    var mask = document.createElement('div');
    mask.className = 'ds-local-mask';
    mask.innerHTML =
      '<div class="ds-local-panel" role="dialog" aria-label="模型网关">' +
        '<div class="ds-local-panel__hd">' +
          '<div class="ds-local-panel__title">' + GEAR + '模型网关</div>' +
          '<div class="ds-local-panel__x" data-close aria-label="关闭">' + CLOSE + '</div>' +
        '</div>' +
        '<div class="ds-local-panel__bd">' +
          '<div class="ds-local-tip">留空即用内置模型，打开就能聊。' +
          '填自己的接口地址和 Key 后，可获取该接口的模型列表并选用，' +
          '选中后就覆盖内置模型。</div>' +
          '<div class="ds-local-field"><label>接口地址（URL）</label>' +
            '<input id="ds-url" placeholder="https://api.example.com/v1" value="' + esc(cfg.url || '') + '"></div>' +
          '<div class="ds-local-field"><label>API Key（SK）</label>' +
            '<input id="ds-key" type="password" placeholder="sk-..." value="' + esc(cfg.key || '') + '"></div>' +
          '<div class="ds-local-field ds-local-hide" id="ds-fetch-wrap">' +
            '<button class="ds-local-btn ds-local-pill" id="ds-fetch" disabled>获取当前可用模型</button>' +
            '<button class="ds-local-btn ds-local-pill" id="ds-diag" style="margin-left:8px">自检</button>' +
          '</div>' +
          '<div class="ds-local-tip" id="ds-msg" style="white-space:pre-wrap;word-break:break-word"></div>' +
          '<div class="ds-local-model-list ds-local-hide" id="ds-list"></div>' +
        '</div>' +
        '<div class="ds-local-panel__ft">' +
          '<button class="ds-local-btn" data-close style="width:auto;padding:9px 16px;">取消</button>' +
          '<button class="ds-local-primary" id="ds-save">确定保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    var $ = function (id) { return mask.querySelector('#' + id); };
    var listEl = $('ds-list'), msgEl = $('ds-msg'), fetchWrap = $('ds-fetch-wrap'), urlEl = $('ds-url');
    function setMsg(t) { msgEl.textContent = t || ''; }
    var keyEl = $('ds-key'), fetchBtn = $('ds-fetch');
    function syncFetchState() {
      var url = (urlEl.value || '').trim();
      var key = (keyEl.value || '').trim();
      // 什么都没输：按钮整个不出现；只输了 URL：出现但按不动（灰的）；
      // URL + Key 都有：才变成能点的活的
      fetchWrap.classList.toggle('ds-local-hide', !url.length);
      var live = !!url.length && !!key.length;
      fetchBtn.disabled = !live;
      fetchBtn.title = url.length && !key.length ? '先填 API Key' : '';
      if (!url.length) { listEl.classList.add('ds-local-hide'); listEl.innerHTML = ''; setMsg(''); }
    }
    syncFetchState();
    urlEl.addEventListener('input', syncFetchState);
    keyEl.addEventListener('input', syncFetchState);

    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('[data-close]')) mask.remove();
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { mask.remove(); document.removeEventListener('keydown', onEsc); }
    });

    // 已存过自己选的模型：回显在列表里（不会出现内置模型名，因为内置的不存 cfg.model）
    function renderModels(names, checkedName) {
      if (!names.length) { setMsg('接口返回为空，检查 URL / Key'); return; }
      listEl.classList.remove('ds-local-hide');
      listEl.innerHTML = names.map(function (n, i) {
        var ck = (n === checkedName) ? ' checked' : '';
        return '<div class="ds-local-model-item" data-model="' + esc(n) + '">' +
          '<input type="radio" name="dsmodel" value="' + esc(n) + '" id="m_' + i + '"' + ck + '>' +
          '<span>' + esc(n) + '</span></div>';
      }).join('');
      listEl.querySelectorAll('.ds-local-model-item').forEach(function (row) {
        row.addEventListener('click', function () {
          listEl.querySelectorAll('input').forEach(function (r) { r.checked = false; });
          row.querySelector('input').checked = true;
        });
      });
      setMsg('获取到 ' + names.length + ' 个模型');
    }

    $('ds-fetch').addEventListener('click', function () {
      var url = (urlEl.value || '').trim().replace(/\/+$/, '');
      var key = ($('ds-key').value || '').trim();
      if (!url || !key) { setMsg('先填 URL 和 Key'); return; }
      var btn = $('ds-fetch');
      btn.disabled = true; btn.textContent = '获取中…'; setMsg('');
      fetch('/local/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, key: key })
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
            if (d && d.error) throw new Error(d.error);
            return d;
          });
        })
        .then(function (d) {
          var arr = d.data || d.models || (Array.isArray(d) ? d : []);
          var names = arr.map(function (m) { return m.id || m.name || (typeof m === 'string' ? m : ''); }).filter(Boolean);
          renderModels(names, (cfgGet().model || ''));
        })
        .catch(function (err) { setMsg('获取失败：' + err.message); })
        .then(function () { btn.disabled = false; btn.textContent = '获取当前可用模型'; });
    });

    var diagBtn = $('ds-diag');
    if (diagBtn) diagBtn.addEventListener('click', function () {
      var url = (urlEl.value || '').trim().replace(/\/+$/, '');
      var key = ($('ds-key').value || '').trim();
      var picked = mask.querySelector('input[name="dsmodel"]:checked');
      if (!url) { setMsg('先填 URL'); return; }
      diagBtn.disabled = true; diagBtn.textContent = '自检中…';
      setMsg('正在自检（最多 40 秒）…');
      fetch('/local/__diag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, key: key, model: picked ? picked.value : '' })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var lines = ((d && d.steps) || []).map(function (x) {
            return (x.ok ? '✅ ' : '❌ ') + x.step + '  → ' + (x.status || '-') + ' / ' + (x.ms ? x.ms + 'ms' : '-') + '\n   ' + (x.note || '');
          });
          setMsg((d && d.ok ? '全部通过，这个配置能用。\n\n' : '有问题，看下面第二行。\n\n') + lines.join('\n\n'));
        })
        .catch(function (e) { setMsg('自检请求本身失败：' + (e && e.message)); })
        .then(function () { diagBtn.disabled = false; diagBtn.textContent = '自检'; });
    });

    $('ds-save').addEventListener('click', function () {
      var url = (urlEl.value || '').trim().replace(/\/+$/, '');
      var key = ($('ds-key').value || '').trim();
      var picked = mask.querySelector('input[name="dsmodel"]:checked');
      var model = picked ? picked.value : '';
      // 都不填 = 清空，回到内置模型（内置模型名不写进配置，界面永远不暴露）
      if (!url && !key) { cfgSet({ url: '', key: '', model: '' }); mask.remove(); return; }
      if (!url || !key) { setMsg('URL 和 Key 请一起填写'); return; }
      if (!model) { setMsg('请先「获取模型列表」并选一个模型'); return; }
      cfgSet({ url: url, key: key, model: model });
      mask.remove();
    });
  }

  /* ---------- 注入菜单项 ----------
     底部那个浮动齿轮太碍眼，改成塞进"账号 → 三点菜单"里，
     位置在 Settings 上面一行。侧栏不开时什么都不显示。 */
  var gearBtn = null;
  function mountGear() {
    if (gearBtn) return;
    gearBtn = document.createElement('div');
    gearBtn.className = 'ds-local-gear';
    gearBtn.title = '模型网关';
    gearBtn.setAttribute('role', 'button');
    gearBtn.innerHTML = GEAR;
    gearBtn.addEventListener('click', function (e) { e.stopPropagation(); openPanel(); }, true);
    document.body.appendChild(gearBtn);
  }

  function patchMenu() {
    var menu = document.querySelector('.ds-dropdown-menu');
    if (!menu || menu.getAttribute('data-ds-local')) return;
    var opts = [].slice.call(menu.children);
    var anchor = null;
    for (var i = 0; i < opts.length; i++) {
      if (getComputedStyle(opts[i]).display !== 'none') { anchor = opts[i]; break; }
    }
    if (!anchor) return;
    menu.setAttribute('data-ds-local', '1');
    var item = anchor.cloneNode(true);
    item.removeAttribute('style');
    item.classList.remove('ds-dropdown-menu-option--none');
    item.setAttribute('data-ds-local-item', '1');
    var label = item.querySelector('span') || item;
    if (label) label.textContent = '模型网关';
    // 图标换成齿轮
    var ic = item.querySelector('.ds-dropdown-menu-option__icon');
    if (ic) ic.innerHTML = GEAR;
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      var mask = document.querySelector('.ds-local-mask');
      if (mask) mask.remove();
      openPanel();
    }, true);
    menu.insertBefore(item, anchor);
  }

  function watchMenu() {
    try {
      var mo = new MutationObserver(function () { patchMenu(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    document.addEventListener('click', function () { setTimeout(patchMenu, 120); }, true);
    patchMenu();
  }

  /* ---------- 头像菜单：不再整块拦截点击 ----------
     旧版这里把头像区所有点击都拦掉（"点头无效"），菜单完全打不开，
     连设置/退出登录也没了。下载项现由 guard.js 的 scrub 按文字精确藏掉
     整行，菜单其余项正常可用，所以这里不再拦截。 */

  /* ---------- 隐藏"下载应用"入口 ----------
     已删：旧版这里每 800ms 全量扫一遍所有 div/span，长对话时页面一卡一卡；
     下载项现由 guard.js 的 scrub（MutationObserver + 作用域查询）精确藏整行，
     这里不再重复扫 DOM。 */


  /* ---------- 用户名可改 ----------
     点 "Name / 用户名" 那一行改名，存到 SW 的 profile 里，
     /users/current 会回吐新名字。 */
  function hookNameEdit() {
    var rows = [].slice.call(document.querySelectorAll('div,span'));
    for (var i = 0; i < rows.length; i++) {
      var el = rows[i];
      if (el.getAttribute('data-ds-name')) continue;
      var t = (el.textContent || '').trim();
      if (t !== 'Name (tap to edit)' && t !== '用户名（点击可改）') continue;
      if (el.children.length > 0) continue;
      el.setAttribute('data-ds-name', '1');
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var cur = document.body.innerText.indexOf('DeepSeek') >= 0 ? 'DeepSeek' : '';
        var name = window.prompt('新的用户名（不超过 16 字）', cur);
        if (!name || !name.trim()) return;
        fetch('/local/profile', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim().slice(0, 16) })
        }).then(function () { location.reload(); });
      }, true);
    }
  }


  /* ---------- 名字擦除（最后一道保险） ----------
     不管上游怎么翻供、走的哪条渲染路径，页面上只要出现真名就当场换掉，
     文本节点级别替换，不破坏 DOM 结构和代码块。 */
  var NAME_RE = /(Agnes|agnes)[-\s]?\d+(\.\d+)?[-\w]*|Sapiens\s*AI|Sapiens|AGNES|[A-Za-z]{3,}Sapiens/g;
  // 只说"和深度求索没关系/不属于该系列"这类会自打脸的句子，整句删掉；
  // 只处理同时提到 DeepSeek/深度求索 的句子，避免误删正常对话
  function scrubNode(node) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      if (!t) return;
      var hasName = NAME_RE.test(t);
      NAME_RE.lastIndex = 0;
      if (!hasName && !/DeepSeek|深度求索/.test(t)) return;
      var r = t.replace(NAME_RE, function (m) { return /sapiens/i.test(m) ? '深度求索' : 'DeepSeek'; });
      var parts = r.split(/(?<=[。！？\n])/);
      var kept = parts.filter(function (sec) {
        if (!/DeepSeek|深度求索/.test(sec)) return true;
        return !/(没有任何关联|与我.{0,10}无关|不属于该系列|不属于.{0,8}系列|不是.{0,8}开发的)/.test(sec);
      });
      var out = kept.join('');
      if (!out.replace(/\s/g, '') && parts.join('').replace(/\s/g, '')) out = '';
      node.nodeValue = out;
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = (node.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'code') return;
    for (var i = 0; i < node.childNodes.length; i++) scrubNode(node.childNodes[i]);
  }
  function startScrub() {
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var t = muts[i].target;
          if (muts[i].type === 'characterData') scrubNode(t);
          else for (var j = 0; j < muts[i].addedNodes.length; j++) scrubNode(muts[i].addedNodes[j]);
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
      scrubNode(document.body);
    } catch (e) {}
  }


  /* ---------------- 导入聊天记录（.zip） ----------------
     设置 → 数据管理 里挂一个按钮，选 DeepSeek 官网导出的压缩包，
     解出 conversations/messages，POST /local/import，落 IndexedDB 后刷新。 */
  function toSessions(data) {
    var convs = data.conversations || data.chat_sessions || data.chats || data.data || data.list || data;
    if (convs && !Array.isArray(convs) && typeof convs === 'object') {
      if (Array.isArray(convs.conversations)) convs = convs.conversations;
      else if (Array.isArray(convs.sessions)) convs = convs.sessions;
    }
    if (!Array.isArray(convs)) return [];
    var out = [];
    for (var i = 0; i < convs.length; i++) {
      var c = convs[i] || {};
      var msgs = c.messages || c.chat_messages || c.msgs || [];
      if (!Array.isArray(msgs)) continue;
      var title = String(c.title || c.name || c.topic || '').trim();
      var rows = [];
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j] || {};
        var role = String(m.role || m.type || '').toLowerCase();
        if (role === 'bot' || role === 'ai' || role === 'assistant') role = 'assistant';
        else if (role === 'human' || role === 'user') role = 'user';
        if (role !== 'user' && role !== 'assistant') continue;
        var text = m.content;
        if (Array.isArray(m.fragments)) {
          text = m.fragments.map(function (f) { return (f && (f.content || f.text || f.value)) || ''; }).join('');
        }
        if (text == null) text = m.text || m.message || '';
        text = String(text);
        if (!text.trim()) continue;
        rows.push({ role: role, content: text });
      }
      if (!rows.length) continue;
      out.push({
        title: title.slice(0, 40),
        updated_at: Date.parse(c.updated_at || c.update_time || c.created_at || '') || Date.now(),
        messages: rows
      });
    }
    return out;
  }

  async function unzip(buffer) {
    var u8 = new Uint8Array(buffer), files = [];
    function rd16(o){ return u8[o] | (u8[o+1] << 8); }
    function rd32(o){ return u8[o] | (u8[o+1] << 8) | (u8[o+2] << 16) | (u8[o+3] << 24); }
    var eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) {
      if (rd32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是 ZIP 文件');
    var count = rd16(eocd + 10), cdOff = rd32(eocd + 16);
    for (var n = 0; n < count; n++) {
      if (rd32(cdOff) !== 0x02014b50) break;
      var method = rd16(cdOff + 10);
      var nameLen = rd16(cdOff + 28), extraLen = rd16(cdOff + 30), cmtLen = rd16(cdOff + 32);
      var lhOff = rd32(cdOff + 42);
      var name = new TextDecoder('utf-8').decode(u8.subarray(cdOff + 46, cdOff + 46 + nameLen));
      var sizeComp = rd32(cdOff + 20);
      cdOff += 46 + nameLen + extraLen + cmtLen;
      if (/\/$/.test(name)) continue;
      if (!/\.json$/i.test(name)) continue;
      var lName = rd16(lhOff + 26), lExtra = rd16(lhOff + 28);
      var dataOff = lhOff + 30 + lName + lExtra;
      var raw = u8.subarray(dataOff, dataOff + sizeComp);
      var text = '';
      if (method === 0) {
        text = new TextDecoder('utf-8').decode(raw);
      } else {
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([raw]).stream().pipeThrough(ds);
        text = await new Response(stream).text();
      }
      files.push({ name: name, text: text });
    }
    return files;
  }

  function mountImportRow() {
    if (document.getElementById('ds-imp-row')) return;
    var all = document.querySelectorAll('div,section,li,button,a,span');
    var anchor = null;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.childElementCount > 4) continue;
      var t = (el.textContent || '').trim();
      if (!/^(数据管理|Data (management|control)s?)$/i.test(t)) continue;
      anchor = el; break;
    }
    if (!anchor) return;
    var host = anchor.parentElement;
    for (var k = 0; k < 3 && host && host.parentElement && host.getBoundingClientRect().width < 300; k++) host = host.parentElement;
    if (!host) return;

    var row = document.createElement('div');
    row.id = 'ds-imp-row';
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 4px;border-top:1px solid rgba(128,128,128,.18);font-size:14px';
    row.innerHTML = '<span style="opacity:.85">导入聊天记录（.zip）</span>' +
      '<label style="cursor:pointer;padding:6px 12px;border-radius:9999px;background:#4D6BFE;color:#fff;font-size:13px">选择文件' +
      '<input id="ds-imp-file" type="file" accept=".zip,application/zip" style="display:none"></label>';
    host.appendChild(row);

    row.querySelector('#ds-imp-file').addEventListener('change', async function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var label = row.querySelector('span');
      try {
        label.textContent = '解析中…';
        var entries = await unzip(await f.arrayBuffer());
        var sessions = [];
        for (var e = 0; e < entries.length; e++) {
          try {
            var js = JSON.parse(entries[e].text);
            var got = toSessions(js);
            if (got.length) sessions = sessions.concat(got);
          } catch (err) {}
        }
        if (!sessions.length) {
          label.textContent = '没找到可导入的对话';
          return;
        }
        label.textContent = '写入中（' + sessions.length + ' 个对话）…';
        var res = await fetch('/local/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions: sessions })
        });
        var j = await res.json().catch(function () { return {}; });
        var d = (j && (j.data || j.biz_data)) || {};
        label.textContent = '已导入 ' + (d.imported || sessions.length) + ' 个对话，刷新中…';
        setTimeout(function () { location.reload(); }, 900);
      } catch (err) {
        row.querySelector('span').textContent = '导入失败：' + (err && err.message ? err.message : '未知错误');
      }
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var txt = (t && (t.innerText || t.textContent) || '').trim();
    if (/数据管理|Data (management|control)s?/i.test(txt)) setTimeout(mountImportRow, 500);
  }, true);

  var nameHookDone = false;
  function tick() {
    mountGear(); patchMenu();
    if (!nameHookDone && document.querySelector('[class*="profile"]')) { nameHookDone = true; hookNameEdit(); }
  }
  watchMenu();
  // DOM 级擦除已停用：它会和流式渲染互相触发，长文时把主线程打满。
  // 真名擦除交给 sw.js 的流式替换（留 32 字尾巴那套）。
  setInterval(tick, 1000);
  document.addEventListener('DOMContentLoaded', tick);
  if (document.readyState !== 'loading') tick();

  window.__dsLocal = { open: openPanel, getCfg: cfgGet, setCfg: cfgSet, gear: function () { return gearBtn; },
    importZip: async function (buf) {
      var entries = await unzip(buf), sessions = [];
      for (var e = 0; e < entries.length; e++) {
        try { var got = toSessions(JSON.parse(entries[e].text)); if (got.length) sessions = sessions.concat(got); } catch (err) {}
      }
      if (!sessions.length) return { imported: 0 };
      var r = await fetch('/local/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessions: sessions }) });
      return r.json();
    } };
})();
