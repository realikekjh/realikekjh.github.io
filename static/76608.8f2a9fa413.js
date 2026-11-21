/* PoW worker（本地短路版）：收到挑战直接返回 answer=0，不实际计算 */
self.onmessage = function(t) {
  if (t.data && t.data.type === "pow-challenge") {
    var c = t.data.challenge;
    self.postMessage({
      type: "pow-answer",
      answer: {
        algorithm: c.algorithm,
        challenge: c.challenge,
        salt: c.salt,
        answer: 0,
        signature: c.signature
      }
    });
  }
};
