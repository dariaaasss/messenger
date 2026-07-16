const TOKEN_KEY = "messenger_token";

const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authModeButtons = document.querySelectorAll("[data-auth-mode]");
const formTitle = document.querySelector("#form-title");
const formSubtitle = document.querySelector("#form-subtitle");
const submitButton = document.querySelector("#submit-button");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const confirmField = document.querySelector(".confirm-field");
const confirmInput = document.querySelector("#password-confirm");
const authError = document.querySelector("#auth-error");
const serverStatus = document.querySelector("#server-status");
const logoutButton = document.querySelector("#logout-button");
const currentUsername = document.querySelector("#current-username");
const userAvatar = document.querySelector("#user-avatar");
const chatCount = document.querySelector("#chat-count");
const chatList = document.querySelector("#chat-list");
const newChatButton = document.querySelector("#new-chat-button");
const emptyChat = document.querySelector("#empty-chat");
const chatView = document.querySelector("#chat-view");
const activeChatName = document.querySelector("#active-chat-name");
const activeChatMeta = document.querySelector("#active-chat-meta");
const connectionStatus = document.querySelector("#connection-status");
const backButton = document.querySelector("#back-button");
const membersButton = document.querySelector("#members-button");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const resetSearchButton = document.querySelector("#reset-search-button");
const searchSummary = document.querySelector("#search-summary");
const messages = document.querySelector("#messages");
const messageList = document.querySelector("#message-list");
const loadMoreButton = document.querySelector("#load-more-button");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const notice = document.querySelector("#notice");
const createChatDialog = document.querySelector("#create-chat-dialog");
const createChatForm = document.querySelector("#create-chat-form");
const chatModeButtons = document.querySelectorAll("[data-chat-mode]");
const privateChatFields = document.querySelector(".private-chat-fields");
const groupChatFields = document.querySelector(".group-chat-fields");
const privateUsername = document.querySelector("#private-username");
const groupName = document.querySelector("#group-name");
const groupUsernames = document.querySelector("#group-usernames");
const createChatError = document.querySelector("#create-chat-error");
const createChatSubmit = document.querySelector("#create-chat-submit");
const membersDialog = document.querySelector("#members-dialog");
const membersSubtitle = document.querySelector("#members-subtitle");
const memberList = document.querySelector("#member-list");
const addMemberForm = document.querySelector("#add-member-form");
const memberUsername = document.querySelector("#member-username");
const memberError = document.querySelector("#member-error");

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  chats: [],
  activeChatId: null,
  messages: [],
  searching: false,
  searchQuery: "",
  socket: null,
  socketRetry: null,
  noticeTimer: null,
  authMode: "login",
  chatMode: "private",
};

const authContent = {
  login: {
    title: "Добро пожаловать",
    subtitle: "Войдите, чтобы продолжить общение",
    button: "Войти",
  },
  register: {
    title: "Создание аккаунта",
    subtitle: "Придумайте логин и пароль",
    button: "Зарегистрироваться",
  },
};

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendHighlightedText(element, text, query) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let start = 0;
  let match = lowerText.indexOf(lowerQuery);

  while (match !== -1) {
    element.append(document.createTextNode(text.slice(start, match)));
    element.append(createElement(
      "mark",
      "search-highlight",
      text.slice(match, match + query.length),
    ));
    start = match + query.length;
    match = lowerText.indexOf(lowerQuery, start);
  }

  element.append(document.createTextNode(text.slice(start)));
}

function clearSearch() {
  state.searching = false;
  state.searchQuery = "";
  searchInput.value = "";
  resetSearchButton.hidden = true;
  searchSummary.hidden = true;
  searchSummary.textContent = "";
}

function setButtonLoading(button, loading, text) {
  if (loading) {
    button.dataset.defaultText = button.textContent;
    button.textContent = text;
    button.disabled = true;
    return;
  }

  button.textContent = button.dataset.defaultText || button.textContent;
  button.disabled = false;
}

function errorMessage(data) {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) {
    return data.detail.map((item) => item.msg).join(", ");
  }
  return "не удалось выполнить запрос";
}

async function api(path, options = {}) {
  const headers = {...(options.headers || {})};
  if (options.body) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, {...options, headers});
  const data = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      signOut("сессия закончилась, войдите ещё раз");
    }
    throw new Error(errorMessage(data));
  }

  return data;
}

function showNotice(message, type = "error") {
  clearTimeout(state.noticeTimer);
  notice.textContent = message;
  notice.classList.toggle("success", type === "success");
  notice.hidden = false;
  state.noticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 3500);
}

function clearAuthErrors() {
  authError.textContent = "";
  authForm.querySelectorAll(".invalid").forEach((input) => input.classList.remove("invalid"));
  authForm.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function showFieldError(input, message) {
  input.classList.add("invalid");
  document.querySelector(`[data-error-for="${input.id}"]`).textContent = message;
}

function setAuthMode(mode) {
  state.authMode = mode;
  const content = authContent[mode];

  authModeButtons.forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  formTitle.textContent = content.title;
  formSubtitle.textContent = content.subtitle;
  if (submitButton.disabled) {
    submitButton.dataset.defaultText = content.button;
  } else {
    submitButton.textContent = content.button;
  }
  passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
  confirmField.hidden = mode !== "register";
  confirmInput.required = mode === "register";
  clearAuthErrors();
}

function validateAuthForm() {
  clearAuthErrors();
  let valid = true;

  if (usernameInput.value.trim().length < 3) {
    showFieldError(usernameInput, "минимум 3 символа");
    valid = false;
  }

  if (passwordInput.value.length < 6) {
    showFieldError(passwordInput, "минимум 6 символов");
    valid = false;
  }

  if (state.authMode === "register" && passwordInput.value !== confirmInput.value) {
    showFieldError(confirmInput, "пароли не совпадают");
    valid = false;
  }

  return valid;
}

function closeSocket() {
  clearTimeout(state.socketRetry);
  state.socketRetry = null;
  const socket = state.socket;
  state.socket = null;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
}

function clearSession() {
  closeSocket();
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.user = null;
  state.chats = [];
  state.activeChatId = null;
  state.messages = [];
  clearSearch();
}

function showAuth(message = "") {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  appView.hidden = true;
  appView.classList.remove("chat-open");
  authView.hidden = false;
  authError.textContent = message;
  passwordInput.value = "";
  confirmInput.value = "";
}

function signOut(message = "") {
  clearSession();
  showAuth(message);
}

async function enterApp(user) {
  state.user = user;
  currentUsername.textContent = user.username;
  userAvatar.textContent = user.username.charAt(0);
  authView.hidden = true;
  appView.hidden = false;
  await loadChats();
}

async function checkServer() {
  serverStatus.classList.remove("online", "offline");
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error();
    serverStatus.classList.add("online");
    serverStatus.querySelector(".status-text").textContent = "сервер работает";
  } catch {
    serverStatus.classList.add("offline");
    serverStatus.querySelector(".status-text").textContent = "сервер недоступен";
  }
}

function getActiveChat() {
  return state.chats.find((chat) => chat.id === state.activeChatId) || null;
}

function chatInitial(chat) {
  return (chat.name || "M").charAt(0).toUpperCase();
}

function renderChats() {
  chatList.innerHTML = "";
  chatCount.textContent = String(state.chats.length);

  if (!state.chats.length) {
    chatList.append(createElement("p", "chat-list-empty", "Чатов пока нет. Создайте первый диалог."));
    return;
  }

  state.chats.forEach((chat) => {
    const button = createElement("button", "chat-item");
    button.type = "button";
    button.classList.toggle("active", chat.id === state.activeChatId);

    const avatar = createElement("span", "chat-avatar", chatInitial(chat));
    avatar.classList.toggle("group", chat.is_group);

    const text = createElement("span", "chat-item-text");
    text.append(createElement("span", "chat-item-name", chat.name));
    text.append(createElement(
      "span",
      "chat-item-preview",
      chat.last_message || (chat.is_group ? `${chat.members.length} участников` : "Сообщений пока нет"),
    ));

    const count = chat.message_count ? `${chat.message_count} сообщ.` : "";
    button.append(avatar, text, createElement("span", "chat-item-count", count));
    button.addEventListener("click", () => openChat(chat.id));
    chatList.append(button);
  });
}

async function loadChats() {
  try {
    state.chats = await api("/api/chats");
    if (state.activeChatId && !getActiveChat()) {
      state.activeChatId = null;
      closeSocket();
      chatView.hidden = true;
      emptyChat.hidden = false;
    }
    renderChats();
  } catch (error) {
    if (state.token) showNotice(error.message);
  }
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"});
}

function renderChatHeader() {
  const chat = getActiveChat();
  if (!chat) return;

  activeChatName.textContent = chat.name;
  activeChatMeta.textContent = chat.is_group
    ? `${chat.members.length} участников`
    : "личный чат";
  membersButton.hidden = !chat.is_group;
}

function renderMessages() {
  messageList.innerHTML = "";

  if (!state.messages.length) {
    const text = state.searching
      ? `По запросу «${state.searchQuery}» ничего не найдено`
      : "Сообщений пока нет";
    messageList.append(createElement("p", "messages-empty", text));
    updateLoadMoreButton();
    return;
  }

  const chat = getActiveChat();
  state.messages.forEach((message) => {
    const own = message.sender_id === state.user.id;
    const row = createElement("div", "message-row");
    row.classList.toggle("own", own);
    row.classList.toggle("search-result", state.searching);

    const bubble = createElement("div", "message-bubble");
    if (chat?.is_group && !own) {
      bubble.append(createElement("div", "message-author", message.sender_username));
    }
    const text = createElement("p", "message-text");
    if (state.searching) {
      appendHighlightedText(text, message.text, state.searchQuery);
    } else {
      text.textContent = message.text;
    }
    bubble.append(text);
    const meta = createElement("div", "message-meta");
    meta.append(createElement("time", "message-time", formatTime(message.created_at)));
    if (own) {
      const status = createElement("span", "message-status", "✓");
      status.title = "отправлено";
      status.setAttribute("aria-label", "отправлено");
      meta.append(status);
    }
    bubble.append(meta);
    row.append(bubble);
    messageList.append(row);
  });

  updateLoadMoreButton();
}

function updateLoadMoreButton() {
  const chat = getActiveChat();
  loadMoreButton.hidden = state.searching
    || !chat
    || !state.messages.length
    || state.messages.length >= Number(chat.message_count || 0);
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

async function loadMessages() {
  try {
    clearSearch();
    state.messages = await api(`/api/chats/${state.activeChatId}/messages`);
    renderMessages();
    scrollMessagesToBottom();
  } catch (error) {
    showNotice(error.message);
  }
}

async function loadOlderMessages() {
  if (!state.messages.length) return;

  loadMoreButton.disabled = true;
  const previousHeight = messages.scrollHeight;
  const beforeId = state.messages[0].id;

  try {
    const older = await api(
      `/api/chats/${state.activeChatId}/messages?before_id=${beforeId}`,
    );
    state.messages = [...older, ...state.messages];
    renderMessages();
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight - previousHeight;
    });
  } catch (error) {
    showNotice(error.message);
  } finally {
    loadMoreButton.disabled = false;
  }
}

function setConnection(text, type = "") {
  connectionStatus.textContent = text;
  connectionStatus.className = "connection-status";
  if (type) connectionStatus.classList.add(type);
}

function updateChatAfterMessage(message) {
  const index = state.chats.findIndex((chat) => chat.id === message.chat_id);
  if (index === -1) return;

  const chat = state.chats[index];
  chat.last_message = message.text;
  chat.message_count = Number(chat.message_count || 0) + 1;
  state.chats.splice(index, 1);
  state.chats.unshift(chat);
  renderChats();
}

function receiveMessage(message) {
  updateChatAfterMessage(message);
  if (message.chat_id !== state.activeChatId || state.searching) return;
  if (state.messages.some((item) => item.id === message.id)) return;
  state.messages.push(message);
  renderMessages();
  scrollMessagesToBottom();
}

function connectSocket() {
  closeSocket();
  const chatId = state.activeChatId;
  if (!chatId || !state.token) return;

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(
    `${protocol}://${location.host}/api/chats/${chatId}/ws?token=${encodeURIComponent(state.token)}`,
  );
  state.socket = socket;
  setConnection("подключение");

  socket.addEventListener("open", () => {
    if (state.socket === socket) setConnection("в сети", "online");
  });

  socket.addEventListener("message", (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === "error") {
      showNotice(data.detail);
      return;
    }
    if (data.type === "message") receiveMessage(data);
  });

  socket.addEventListener("close", () => {
    if (state.socket !== socket) return;
    state.socket = null;
    setConnection("нет соединения", "offline");
    if (state.activeChatId === chatId && state.token) {
      state.socketRetry = setTimeout(connectSocket, 2000);
    }
  });
}

async function openChat(chatId) {
  if (state.activeChatId !== chatId) closeSocket();
  state.activeChatId = chatId;
  state.messages = [];
  clearSearch();
  appView.classList.add("chat-open");
  emptyChat.hidden = true;
  chatView.hidden = false;
  renderChats();
  renderChatHeader();
  renderMessages();
  await loadMessages();
  connectSocket();
}

function setChatMode(mode) {
  state.chatMode = mode;
  chatModeButtons.forEach((button) => {
    const active = button.dataset.chatMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  privateChatFields.hidden = mode !== "private";
  groupChatFields.hidden = mode !== "group";
  createChatError.textContent = "";
}

function openCreateChatDialog() {
  createChatForm.reset();
  setChatMode("private");
  createChatDialog.showModal();
  privateUsername.focus();
}

function parseUsernames(value) {
  return value
    .split(",")
    .map((username) => username.trim())
    .filter(Boolean);
}

async function createChat(event) {
  event.preventDefault();
  createChatError.textContent = "";

  let path;
  let body;
  if (state.chatMode === "private") {
    const username = privateUsername.value.trim();
    if (!username) {
      createChatError.textContent = "введите логин собеседника";
      return;
    }
    path = "/api/chats/private";
    body = {username};
  } else {
    const name = groupName.value.trim();
    if (!name) {
      createChatError.textContent = "введите название группы";
      return;
    }
    path = "/api/chats/group";
    body = {name, usernames: parseUsernames(groupUsernames.value)};
  }

  setButtonLoading(createChatSubmit, true, "Создаём...");
  try {
    const chat = await api(path, {method: "POST", body: JSON.stringify(body)});
    state.chats.unshift(chat);
    renderChats();
    createChatDialog.close();
    await openChat(chat.id);
  } catch (error) {
    createChatError.textContent = error.message;
  } finally {
    setButtonLoading(createChatSubmit, false);
  }
}

function pluralMembers(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} участников`;
  if (last === 1) return `${count} участник`;
  if (last >= 2 && last <= 4) return `${count} участника`;
  return `${count} участников`;
}

function renderMembers() {
  const chat = getActiveChat();
  if (!chat) return;

  memberList.innerHTML = "";
  membersSubtitle.textContent = pluralMembers(chat.members.length);
  const currentMembership = chat.members.find((member) => member.id === state.user.id);
  const isAdmin = Boolean(currentMembership?.is_admin);
  addMemberForm.hidden = !isAdmin;

  chat.members.forEach((member) => {
    const row = createElement("div", "member-row");
    const avatar = createElement("span", "avatar", member.username.charAt(0));
    row.append(avatar, createElement("span", "member-name", member.username));

    if (member.is_admin) {
      row.append(createElement("span", "admin-label", "администратор"));
    }

    if (isAdmin && member.id !== state.user.id) {
      const removeButton = createElement("button", "remove-member-button", "Удалить");
      removeButton.type = "button";
      removeButton.addEventListener("click", () => removeMember(member.id, removeButton));
      row.append(removeButton);
    }

    memberList.append(row);
  });
}

function openMembersDialog() {
  memberError.textContent = "";
  memberUsername.value = "";
  renderMembers();
  membersDialog.showModal();
}

async function addMember(event) {
  event.preventDefault();
  memberError.textContent = "";
  const username = memberUsername.value.trim();
  if (!username) {
    memberError.textContent = "введите логин пользователя";
    return;
  }

  const button = addMemberForm.querySelector("button[type=submit]");
  setButtonLoading(button, true, "Добавляем...");
  try {
    const member = await api(`/api/chats/${state.activeChatId}/members`, {
      method: "POST",
      body: JSON.stringify({username}),
    });
    getActiveChat().members.push(member);
    memberUsername.value = "";
    renderMembers();
    renderChatHeader();
    renderChats();
    showNotice("участник добавлен", "success");
  } catch (error) {
    memberError.textContent = error.message;
  } finally {
    setButtonLoading(button, false);
  }
}

async function removeMember(memberId, button) {
  button.disabled = true;
  try {
    await api(`/api/chats/${state.activeChatId}/members/${memberId}`, {
      method: "DELETE",
    });
    const chat = getActiveChat();
    chat.members = chat.members.filter((member) => member.id !== memberId);
    renderMembers();
    renderChatHeader();
    renderChats();
    showNotice("участник удалён", "success");
  } catch (error) {
    memberError.textContent = error.message;
    button.disabled = false;
  }
}

async function searchMessages(event) {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    showNotice("введите текст для поиска");
    return;
  }

  try {
    const result = await api(
      `/api/chats/${state.activeChatId}/messages/search?q=${encodeURIComponent(query)}`,
    );
    state.searching = true;
    state.searchQuery = query;
    state.messages = result.reverse();
    resetSearchButton.hidden = false;
    searchSummary.textContent = `Найдено сообщений: ${result.length} · «${query}»`;
    searchSummary.hidden = false;
    renderMessages();
    scrollMessagesToBottom();
  } catch (error) {
    showNotice(error.message);
  }
}

async function resetSearch() {
  await loadMessages();
}

function sendMessage(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showNotice("соединение ещё не установлено");
    return;
  }

  state.socket.send(JSON.stringify({text}));
  messageInput.value = "";
  messageInput.style.height = "auto";
}

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

chatModeButtons.forEach((button) => {
  button.addEventListener("click", () => setChatMode(button.dataset.chatMode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateAuthForm()) return;

  setButtonLoading(submitButton, true, "Подождите...");
  try {
    const data = await api(`/api/auth/${state.authMode}`, {
      method: "POST",
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    state.token = data.access_token;
    localStorage.setItem(TOKEN_KEY, state.token);
    const user = await api("/api/auth/me");
    authForm.reset();
    setAuthMode("login");
    await enterApp(user);
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    setButtonLoading(submitButton, false);
  }
});

logoutButton.addEventListener("click", () => signOut());
newChatButton.addEventListener("click", openCreateChatDialog);
createChatForm.addEventListener("submit", createChat);
membersButton.addEventListener("click", openMembersDialog);
addMemberForm.addEventListener("submit", addMember);
loadMoreButton.addEventListener("click", loadOlderMessages);
searchForm.addEventListener("submit", searchMessages);
resetSearchButton.addEventListener("click", resetSearch);
messageForm.addEventListener("submit", sendMessage);
backButton.addEventListener("click", () => appView.classList.remove("chat-open"));

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.closeDialog}`).close();
  });
});

[createChatDialog, membersDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

window.addEventListener("beforeunload", closeSocket);

async function start() {
  checkServer();
  if (!state.token) {
    showAuth();
    return;
  }

  try {
    const user = await api("/api/auth/me");
    await enterApp(user);
  } catch {
    signOut();
  }
}

start();
