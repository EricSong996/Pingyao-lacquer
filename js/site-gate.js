/**
 * 全站访问验证（客户端软门禁）
 * sessionStorage 同标签页内跨页面有效；关闭标签后需重新输入
 */
(function () {
  var STORAGE_KEY = "site_unlocked";
  var PASSWORD = "2025212810";
  var GATE_ID = "site-gate";

  if (sessionStorage.getItem(STORAGE_KEY) === "1") {
    document.documentElement.classList.add("site-unlocked");
    return;
  }

  document.documentElement.classList.add("site-locked");

  function unlock() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    document.documentElement.classList.remove("site-locked");
    document.documentElement.classList.add("site-unlocked");
    var gate = document.getElementById(GATE_ID);
    if (gate) gate.remove();
  }

  function buildGate() {
    if (document.getElementById(GATE_ID)) return;

    var gate = document.createElement("div");
    gate.id = GATE_ID;
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "site-gate-title");

    gate.innerHTML =
      '<div class="site-gate__panel">' +
      '<h1 class="site-gate__title" id="site-gate-title">访问验证</h1>' +
      '<p class="site-gate__hint">本站内容仅供内部访问，请输入密码</p>' +
      '<form class="site-gate__form" autocomplete="off">' +
      '<label class="site-gate__label" for="site-gate-password">密码</label>' +
      '<input class="site-gate__input" id="site-gate-password" name="password" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" required autofocus />' +
      '<button class="site-gate__submit" type="submit">确认进入</button>' +
      '<p class="site-gate__error" id="site-gate-error" hidden>密码不正确，请重试</p>' +
      "</form>" +
      "</div>";

    document.body.appendChild(gate);

    var form = gate.querySelector(".site-gate__form");
    var input = gate.querySelector("#site-gate-password");
    var error = gate.querySelector("#site-gate-error");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var value = (input.value || "").trim();
      if (value === PASSWORD) {
        unlock();
        return;
      }
      error.hidden = false;
      input.value = "";
      input.focus();
    });

    input.addEventListener("input", function () {
      if (!error.hidden) error.hidden = true;
    });

    setTimeout(function () {
      input.focus();
    }, 0);
  }

  function init() {
    if (document.body) buildGate();
    else document.addEventListener("DOMContentLoaded", buildGate);
  }

  init();
})();
