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
    display:flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;
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
          '</div>' +
          '<div class="ds-local-tip" id="ds-msg"></div>' +
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
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
          var arr = d.data || d.models || (Array.isArray(d) ? d : []);
          var names = arr.map(function (m) { return m.id || m.name || (typeof m === 'string' ? m : ''); }).filter(Boolean);
          renderModels(names, (cfgGet().model || ''));
        })
        .catch(function (err) { setMsg('获取失败：' + err.message); })
        .then(function () { btn.disabled = false; btn.textContent = '获取当前可用模型'; });
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

  function tick() { mountGear(); patchMenu(); hookNameEdit(); }
  watchMenu();
  setInterval(tick, 1000);
  document.addEventListener('DOMContentLoaded', tick);
  if (document.readyState !== 'loading') tick();

  window.__dsLocal = { open: openPanel, getCfg: cfgGet, setCfg: cfgSet, gear: function () { return gearBtn; } };
})();
