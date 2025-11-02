import IconThemeSun from "~icons/line-md/sun-rising-twotone-loop";
import IconThemeMoon from "~icons/line-md/moon-alt-loop";
import IconRefresh from "~icons/mdi/refresh";
import IconDelete from "~icons/mdi/delete";
import IconMenu from "~icons/mdi/menu";
import IconMicrophone from "~icons/mdi/microphone";
import IconMicrophoneTitle from "~icons/mdi/microphone";
import IconHistory from "~icons/mdi/history";
import IconSend from "~icons/mdi/send";

export function initIcons() {
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    const currentTheme = localStorage.getItem("theme") || "light";
    themeBtn.innerHTML = currentTheme === "dark" ? IconThemeMoon : IconThemeSun;
    const svg = themeBtn.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-6");
  }

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    const span = document.createElement("span");
    span.innerHTML = IconRefresh;
    const svg = span.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-4");
    refreshBtn.insertBefore(span, refreshBtn.firstChild);
  }

  const clearBtn = document.getElementById("clearAllBtn");
  if (clearBtn) {
    const span = document.createElement("span");
    span.innerHTML = IconDelete;
    const svg = span.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-4");
    clearBtn.insertBefore(span, clearBtn.firstChild);
  }

  const menuBtn = document.querySelector('label[for="main-drawer"]');
  if (menuBtn) {
    menuBtn.innerHTML = IconMenu;
    const svg = menuBtn.querySelector("svg");
    if (svg) svg.setAttribute("class", "inline-block size-6 stroke-current");
  }

  const listenIcon = document.getElementById("listenIcon");
  if (listenIcon) {
    listenIcon.innerHTML = IconMicrophone;
    const svg = listenIcon.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-6");
  }

  const voiceControlTitle = document.getElementById("voice-control-title");
  if (voiceControlTitle) {
    const span = document.createElement("span");
    span.innerHTML = IconMicrophoneTitle;
    const svg = span.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-5 mr-2");
    voiceControlTitle.insertBefore(span, voiceControlTitle.firstChild);
  }

  const messagesTitle = document.getElementById("messages-title");
  if (messagesTitle) {
    const span = document.createElement("span");
    span.innerHTML = IconHistory;
    const svg = span.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-5 mr-2");
    messagesTitle.insertBefore(span, messagesTitle.firstChild);
  }

  const deliverIcon = document.getElementById("deliverIcon");
  if (deliverIcon) {
    deliverIcon.innerHTML = IconSend;
    const svg = deliverIcon.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-5");
  }
}

export function updateThemeIcon(isDark: boolean) {
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    themeBtn.innerHTML = isDark ? IconThemeMoon : IconThemeSun;
    const svg = themeBtn.querySelector("svg");
    if (svg) svg.setAttribute("class", "size-6");
  }
}
