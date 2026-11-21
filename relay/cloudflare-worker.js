/* 中转（Cloudflare Worker）
 * 作用：给上游模型接口套一层自己的域名，并补上跨域响应头，
 * 这样纯静态站点才能直接调用它。
 *
 * 部署（免费，2 分钟）：
 *   1) 打开 https://dash.cloudflare.com/ → Workers & Pages → Create → Worker
 *   2) 把本文件内容整段贴进编辑器（覆盖默认代码）→ Deploy
 *   3) 拿到地址，例如 https://ds-relay.<你的子域>.workers.dev
 *   4) 回到站点，点左下角齿轮：URL 填 该地址 + /v1，Key 填上游的 Key，模型自己选
 *
 * 想换上游：在 Worker 的 Settings → Variables 里加 UPSTREAM（例如 https://api.openai.com）。
 * 想限制谁能用：把 CORS_ORIGIN 改成你的站点域名，例如 https://realikekjh.github.io
 */

const UPSTREAM = 'https://api.agnes-ai.cn';
const CORS_ORIGIN = '*';

export default {
  async fetch(request, env) {
    const upstream = ((env && env.UPSTREAM) || UPSTREAM).replace(/\/+$/, '');
    const allowOrigin = (env && env.CORS_ORIGIN) || CORS_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const target = upstream + url.pathname + url.search;
    const headers = new Headers(request.headers);
    ['host', 'origin', 'referer', 'cf-connecting-ip', 'x-forwarded-for'].forEach((k) => headers.delete(k));

    const init = { method: request.method, headers, redirect: 'follow' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

    const res = await fetch(target, init);
    const out = new Headers(res.headers);
    Object.keys(cors).forEach((k) => out.set(k, cors[k]));
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(res.body, { status: res.status, headers: out });
  }
};
