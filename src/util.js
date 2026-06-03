// util.js — 작은 DOM 헬퍼 + 토스트. (저장소 접근 없음)

// el("div.cls#id", {attrs}, [children]) 형태의 가벼운 엘리먼트 생성기.
export function el(tag, props = {}, children = []) {
  let tagName = "div";
  const classes = [];
  let id = null;
  // "button.btn.primary#go" 파싱
  const m = tag.match(/^([a-zA-Z0-9]+)?((?:[.#][\w-]+)*)$/);
  if (m) {
    tagName = m[1] || "div";
    (m[2].match(/[.#][\w-]+/g) || []).forEach((tok) => {
      if (tok[0] === ".") classes.push(tok.slice(1));
      else id = tok.slice(1);
    });
  }
  const node = document.createElement(tagName);
  if (classes.length) node.className = classes.join(" ");
  if (id) node.id = id;

  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = (node.className + " " + v).trim();
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : v);
  }

  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let _toastTimer = null;
export function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div.toast");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// 간단 확인 다이얼로그 (네이티브) — 파괴적 동작 전 확인.
export function confirmAction(msg) {
  return window.confirm(msg);
}
