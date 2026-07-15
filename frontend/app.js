const form = document.querySelector("#auth-form");
const modeButtons = document.querySelectorAll(".mode-button");
const title = document.querySelector("#form-title");
const subtitle = document.querySelector("#form-subtitle");
const submitButton = document.querySelector("#submit-button");
const confirmField = document.querySelector(".confirm-field");
const confirmInput = document.querySelector("#password-confirm");
const serverStatus = document.querySelector("#server-status");

let currentMode = "login";

const modeContent = {
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

function clearErrors() {
  form.querySelectorAll(".invalid").forEach((input) => input.classList.remove("invalid"));
  form.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function setMode(mode) {
  currentMode = mode;
  const content = modeContent[mode];

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  title.textContent = content.title;
  subtitle.textContent = content.subtitle;
  submitButton.textContent = content.button;
  confirmField.hidden = mode !== "register";
  confirmInput.required = mode === "register";
  clearErrors();
}

function showError(input, message) {
  input.classList.add("invalid");
  document.querySelector(`[data-error-for="${input.id}"]`).textContent = message;
}

function validateForm() {
  clearErrors();
  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  let valid = true;

  if (username.value.trim().length < 3) {
    showError(username, "минимум 3 символа");
    valid = false;
  }

  if (password.value.length < 6) {
    showError(password, "минимум 6 символов");
    valid = false;
  }

  if (currentMode === "register" && password.value !== confirmInput.value) {
    showError(confirmInput, "пароли не совпадают");
    valid = false;
  }

  return valid;
}

async function checkServer() {
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

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  validateForm();
});

checkServer();
