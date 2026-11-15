
// ==========================================
// NOVA AI — COMPLETE FRONTEND
// Chat + Streaming + History + Voice
// Image Generation + Image Analysis
// Cinematic Orb + Settings + Profile
// ==========================================

const $ = (selector, root = document) => root.querySelector(selector);

const input = $("#user-input");
const sendBtn = $("#send-btn");
const stopBtn = $("#stop-btn");
const newChatBtn = $(".new-chat");
const voiceBtn = $("#voice-btn");
const voiceStatus = $("#voice-status");
const modelSelector = $("#model-selector");
const modelStatus = $("#model-status");
const scrollArea = $("#conversation-scroll");
const welcome = $("#welcome-screen");
const messagesBox = $("#messages");

const STORAGE_KEY = "nova_ai_chat_history";
const MODEL_KEY = "nova_ai_model";
const VOICE_OUTPUT_KEY = "nova_ai_voice_output";
const VOICE_LANGUAGE_KEY = "nova_ai_voice_language";
const VOICE_RATE_KEY = "nova_ai_voice_rate";
const SIDEBAR_WIDTH_KEY = "nova_ai_sidebar_width";
const PROFILE_NAME_KEY = "nova_ai_profile_name";
const THEME_KEY = "nova_ai_theme";

let chats = loadChats();
let chatHistory = [];
let activeChatId = null;

let isSending = false;
let imageMode = false;
let recognition = null;
let isListening = false;

let speakerEnabled = localStorage.getItem(VOICE_OUTPUT_KEY) === "true";
let voiceLanguage = localStorage.getItem(VOICE_LANGUAGE_KEY) || "en-IN";
let voiceRate = Number(localStorage.getItem(VOICE_RATE_KEY)) || 1;

let currentController = null;
let currentModel = localStorage.getItem(MODEL_KEY) || "openai/gpt-oss-20b";
let loadingMessage = null;

// Image attachment
let selectedImageDataUrl = null;
let selectedImageName = "";

const voiceControls = $(".voice-controls");

const settingsOverlay = $("#settings-overlay");
const settingsButton = $("#settings-menu-button");
const closeSettingsButton = $("#close-settings");
const voiceOutputToggle = $("#voice-output-toggle");
const voiceLanguageSelect = $("#voice-language");
const voiceRateInput = $("#voice-rate");
const voiceRateValue = $("#voice-rate-value");
const refreshModelsButton = $("#refresh-models");
const settingsModelStatus = $("#settings-model-status");

function setVoiceStatus(message) {
  if (voiceStatus) voiceStatus.textContent = message;
}

// ==========================================
// SIDEBAR RESIZING
// ==========================================

function setupSidebarResize() {
  const sidebar = $(".sidebar");
  const handle = $("#sidebar-resize-handle");

  if (!sidebar || !handle) return;

  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  const initial = saved >= 190 && saved <= 420 ? saved : 260;

  document.documentElement.style.setProperty("--sidebar-width", initial + "px");

  let dragging = false;

  handle.addEventListener("pointerdown", e => {
    if (innerWidth <= 560) return;

    dragging = true;
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    e.preventDefault();
  });

  handle.addEventListener("pointermove", e => {
    if (!dragging) return;

    const width = Math.max(190, Math.min(420, e.clientX));

    document.documentElement.style.setProperty(
      "--sidebar-width",
      width + "px"
    );
  });

  const stop = () => {
    if (!dragging) return;

    dragging = false;
    handle.classList.remove("dragging");

    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    const width = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--sidebar-width")
    );

    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  };

  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

// ==========================================
// IMAGE AND SPEAKER CONTROLS
// ==========================================

const imageBtn = document.createElement("button");

imageBtn.id = "nova-image-mode";
imageBtn.type = "button";
imageBtn.setAttribute("aria-label", "Toggle image generation");

function updateImageButton() {
  imageBtn.classList.toggle("active", imageMode);
  imageBtn.innerHTML = imageMode ? "✦" : "✧";

  imageBtn.title = imageMode
    ? "Switch to normal chat"
    : "Switch to image generation";

  imageBtn.setAttribute("aria-pressed", String(imageMode));
}

const speakerBtn = document.createElement("button");

speakerBtn.id = "speaker-btn";
speakerBtn.type = "button";

function updateSpeakerButton() {
  speakerBtn.classList.toggle("enabled", speakerEnabled);

  speakerBtn.textContent = speakerEnabled ? "🔊" : "🔇";

  speakerBtn.title = speakerEnabled
    ? "NOVA voice is ON"
    : "NOVA voice is OFF";

  speakerBtn.setAttribute("aria-pressed", String(speakerEnabled));

  if (voiceOutputToggle) {
    voiceOutputToggle.checked = speakerEnabled;
  }
}

// ==========================================
// IMAGE ATTACHMENT UI
// ==========================================

const attachImageBtn = document.createElement("button");

attachImageBtn.id = "nova-attach-image";
attachImageBtn.type = "button";
attachImageBtn.textContent = "▧";
attachImageBtn.title = "Attach an image for analysis";
attachImageBtn.setAttribute("aria-label", "Attach image");

const imageFileInput = document.createElement("input");

imageFileInput.type = "file";
imageFileInput.accept = "image/jpeg,image/png,image/webp";
imageFileInput.hidden = true;
imageFileInput.id = "nova-image-file-input";

const imagePreview = document.createElement("div");

imagePreview.id = "nova-image-preview";
imagePreview.hidden = true;

const imagePreviewStyle = document.createElement("style");

imagePreviewStyle.textContent = `
#nova-attach-image {
  min-width: 38px;
  min-height: 38px;
  border: 1px solid rgba(166,112,255,.3);
  border-radius: 12px;
  background: rgba(139,75,255,.10);
  color: #c49aff;
  font-size: 22px;
  cursor: pointer;
  transition: .2s ease;
}
#nova-attach-image:hover {
  background: rgba(139,75,255,.25);
  border-color: #a879ff;
  transform: translateY(-2px);
}
#nova-attach-image:disabled {
  opacity: .4;
  cursor: not-allowed;
}
#nova-image-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  margin: 8px 0;
  border: 1px solid rgba(160,110,255,.3);
  background: rgba(130,80,220,.10);
  border-radius: 12px;
  max-width: 100%;
}
#nova-image-preview[hidden] {
  display: none;
}
#nova-image-preview img {
  width: 55px;
  height: 55px;
  object-fit: cover;
  border-radius: 8px;
}
#nova-image-preview .nova-preview-info {
  min-width: 0;
  flex: 1;
  color: inherit;
  font-size: 12px;
  overflow: hidden;
}
#nova-image-preview .nova-preview-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#nova-image-preview .nova-preview-remove {
  border: 0;
  background: transparent;
  color: #ff8585;
  font-size: 22px;
  cursor: pointer;
  padding: 5px 10px;
}
.nova-user-image {
  display: block;
  max-width: min(280px, 100%);
  max-height: 260px;
  object-fit: contain;
  border-radius: 12px;
  margin-top: 10px;
}
.nova-image-label {
  color: #b99bff;
  font-size: 12px;
  margin-top: 6px;
}
#orb-stage {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
#orb-stage.nova-cinematic-active {
  filter: drop-shadow(0 0 25px rgba(155,92,255,.35));
}
`;

document.head.appendChild(imagePreviewStyle);

if (voiceControls && voiceBtn) {
  voiceControls.insertBefore(imageBtn, voiceBtn);
  voiceControls.insertBefore(speakerBtn, voiceBtn);
  voiceControls.insertBefore(attachImageBtn, voiceBtn);

  voiceControls.parentElement.insertBefore(
    imagePreview,
    voiceControls
  );

  voiceControls.appendChild(imageFileInput);
} else if (input?.parentElement) {
  input.parentElement.append(imagePreview, attachImageBtn, imageFileInput);
}

function clearSelectedImage() {
  selectedImageDataUrl = null;
  selectedImageName = "";

  imagePreview.replaceChildren();
  imagePreview.hidden = true;

  imageFileInput.value = "";
}

function showSelectedImage(dataUrl, filename) {
  imagePreview.replaceChildren();

  const thumbnail = document.createElement("img");
  thumbnail.src = dataUrl;
  thumbnail.alt = "Selected image preview";

  const info = document.createElement("div");
  info.className = "nova-preview-info";

  const name = document.createElement("div");
  name.className = "nova-preview-name";
  name.textContent = filename;

  const description = document.createElement("div");
  description.textContent = "Ready for NOVA image analysis";

  info.append(name, description);

  const remove = document.createElement("button");
  remove.className = "nova-preview-remove";
  remove.type = "button";
  remove.textContent = "×";
  remove.title = "Remove image";

  remove.addEventListener("click", clearSelectedImage);

  imagePreview.append(thumbnail, info, remove);
  imagePreview.hidden = false;
}

attachImageBtn.addEventListener("click", () => {
  if (isSending) return;

  if (imageMode) {
    setVoiceStatus("Turn off Image Generation Mode before attaching an image.");
    return;
  }

  imageFileInput.click();
});

imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files?.[0];

  if (!file) return;

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowed.includes(file.type)) {
    alert("Please select a JPG, PNG or WebP image.");
    imageFileInput.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Image size must be 5 MB or less.");
    imageFileInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result !== "string") return;

    selectedImageDataUrl = reader.result;
    selectedImageName = file.name;

    showSelectedImage(selectedImageDataUrl, selectedImageName);

    setVoiceStatus("Image attached. Ask NOVA about it.");
  };

  reader.onerror = () => {
    alert("Could not read this image. Please try another one.");
    clearSelectedImage();
  };

  reader.readAsDataURL(file);
});

imageBtn.addEventListener("click", () => {
  if (isSending) return;

  if (selectedImageDataUrl && !imageMode) {
    setVoiceStatus("Remove the attached image before switching to Image Generation.");
    return;
  }

  imageMode = !imageMode;

  updateImageButton();

  input.placeholder = imageMode
    ? "Describe the image you want NOVA to create..."
    : "Ask NOVA anything...";

  input.focus();
});

function setSpeakerEnabled(value) {
  speakerEnabled = value;

  localStorage.setItem(
    VOICE_OUTPUT_KEY,
    String(value)
  );

  if (!value) {
    speechSynthesis?.cancel();
    setVoiceStatus("NOVA voice is OFF.");
  } else {
    setVoiceStatus("NOVA voice is ON.");
  }

  updateSpeakerButton();
}

speakerBtn.addEventListener("click", () => {
  setSpeakerEnabled(!speakerEnabled);
});

// ==========================================
// PROFILE, THEME
// ==========================================

const profileButton = $("#profile-menu-button");
const profileMenu = $("#profile-menu");

profileButton?.addEventListener("click", () => {
  profileMenu.hidden = !profileMenu.hidden;

  profileButton.setAttribute(
    "aria-expanded",
    String(!profileMenu.hidden)
  );
});

document.addEventListener("click", e => {
  if (
    profileMenu &&
    !profileMenu.contains(e.target) &&
    !profileButton?.contains(e.target)
  ) {
    profileMenu.hidden = true;
    profileButton?.setAttribute("aria-expanded", "false");
  }
});

function loadProfile() {
  const name = localStorage.getItem(PROFILE_NAME_KEY) || "Ayush";

  if ($("#profile-name")) {
    $("#profile-name").textContent = name;
  }

  if ($("#profile-avatar")) {
    $("#profile-avatar").textContent =
      name.trim().charAt(0).toUpperCase() || "U";
  }
}

$("#edit-profile-button")?.addEventListener("click", () => {
  const oldName =
    localStorage.getItem(PROFILE_NAME_KEY) || "Ayush";

  const name = prompt("Enter profile name:", oldName);

  if (name === null) return;

  if (!name.trim()) {
    return alert("Name cannot be empty.");
  }

  localStorage.setItem(
    PROFILE_NAME_KEY,
    name.trim().slice(0, 32)
  );

  loadProfile();
});

$("#add-account-button")?.addEventListener("click", () => {
  alert(
    "Multi-account login is not connected yet. This button is a UI placeholder; no account will be created."
  );
});

function applyTheme() {
  document.body.classList.toggle(
    "light-theme",
    localStorage.getItem(THEME_KEY) === "light"
  );
}

$("#theme-toggle-button")?.addEventListener("click", () => {
  localStorage.setItem(
    THEME_KEY,
    document.body.classList.contains("light-theme")
      ? "dark"
      : "light"
  );

  applyTheme();
});

$("#profile-about-button")?.addEventListener("click", () => {
  alert("NOVA AI — created by Ayush.");
});

applyTheme();
loadProfile();

// ==========================================
// SETTINGS
// ==========================================

function openSettings() {
  if (!settingsOverlay) return;

  settingsOverlay.hidden = false;
  updateSettingsUI();

  if (settingsModelStatus) {
    settingsModelStatus.textContent = "";
  }
}

function closeSettings() {
  if (settingsOverlay) {
    settingsOverlay.hidden = true;
  }
}

function updateSettingsUI() {
  if (voiceOutputToggle) {
    voiceOutputToggle.checked = speakerEnabled;
  }

  if (voiceLanguageSelect) {
    voiceLanguageSelect.value = voiceLanguage;
  }

  if (voiceRateInput) {
    voiceRateInput.value = voiceRate;
  }

  if (voiceRateValue) {
    voiceRateValue.textContent = voiceRate.toFixed(1) + "x";
  }
}

settingsButton?.addEventListener("click", openSettings);
closeSettingsButton?.addEventListener("click", closeSettings);

settingsOverlay?.addEventListener("click", e => {
  if (e.target === settingsOverlay) closeSettings();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeSettings();
});

voiceOutputToggle?.addEventListener("change", () => {
  setSpeakerEnabled(voiceOutputToggle.checked);
});

voiceLanguageSelect?.addEventListener("change", () => {
  voiceLanguage = voiceLanguageSelect.value;

  localStorage.setItem(
    VOICE_LANGUAGE_KEY,
    voiceLanguage
  );

  if (recognition) {
    recognition.lang = voiceLanguage;
  }

  setVoiceStatus("Voice language updated.");
});

voiceRateInput?.addEventListener("input", () => {
  voiceRate = Number(voiceRateInput.value);

  localStorage.setItem(
    VOICE_RATE_KEY,
    String(voiceRate)
  );

  if (voiceRateValue) {
    voiceRateValue.textContent = voiceRate.toFixed(1) + "x";
  }
});

// ==========================================
// MODELS
// ==========================================

function getSelectedModel() {
  return modelSelector?.value || currentModel;
}

async function loadModels(showMessage = false) {
  if (!modelSelector) return;

  if (modelStatus) {
    modelStatus.textContent = "Loading models...";
  }

  if (showMessage && settingsModelStatus) {
    settingsModelStatus.textContent = "Refreshing models...";
  }

  try {
    const response = await fetch("/api/models");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load models.");
    }

    const models = Array.isArray(data)
      ? data
      : data.models || [];

    if (!models.length) {
      throw new Error("No models returned.");
    }

    modelSelector.replaceChildren();

    models.forEach(model => {
      const id = typeof model === "string"
        ? model
        : model.id;

      if (!id) return;

      const option = document.createElement("option");

      option.value = id;

      option.textContent =
        typeof model === "object" && model.name
          ? model.name
          : id;

      modelSelector.appendChild(option);
    });

    const exists = [...modelSelector.options]
      .some(o => o.value === currentModel);

    if (!exists) {
      currentModel =
        modelSelector.options[0]?.value ||
        "openai/gpt-oss-20b";
    }

    modelSelector.value = currentModel;

    localStorage.setItem(MODEL_KEY, currentModel);

    if (modelStatus) {
      modelStatus.textContent = "Models ready";
    }

    if (showMessage && settingsModelStatus) {
      settingsModelStatus.textContent =
        "Model list updated successfully.";
    }

  } catch (error) {
    console.error(error);

    if (!modelSelector.options.length) {
      modelSelector.add(
        new Option("GPT OSS 20B", "openai/gpt-oss-20b")
      );
    }

    modelSelector.value = "openai/gpt-oss-20b";
    currentModel = modelSelector.value;

    if (modelStatus) {
      modelStatus.textContent = "Default model";
    }

    if (showMessage && settingsModelStatus) {
      settingsModelStatus.textContent =
        "Could not refresh models: " + error.message;
    }
  }
}

modelSelector?.addEventListener("change", () => {
  currentModel = modelSelector.value;

  localStorage.setItem(MODEL_KEY, currentModel);

  if (modelStatus) {
    modelStatus.textContent = "Selected";
  }
});

refreshModelsButton?.addEventListener("click", () => {
  loadModels(true);
});

// ==========================================
// GENERATION STATE AND STOP
// ==========================================

function setGeneratingState(active) {
  isSending = active;

  if (sendBtn) sendBtn.disabled = active;
  if (input) input.disabled = active;
  if (imageBtn) imageBtn.disabled = active;
  if (attachImageBtn) attachImageBtn.disabled = active;
  if (stopBtn) stopBtn.hidden = !active;
  if (voiceBtn) voiceBtn.disabled = active;
}

function stopGenerating() {
  if (isSending && currentController) {
    currentController.abort();
    setVoiceStatus("Generation stopped.");
  }
}

stopBtn?.addEventListener("click", stopGenerating);

// ==========================================
// VOICE INPUT
// ==========================================

function updateVoiceButton() {
  if (!voiceBtn) return;

  voiceBtn.textContent = isListening ? "■" : "🎙";

  voiceBtn.classList.toggle(
    "listening",
    isListening
  );

  voiceBtn.title = isListening
    ? "Stop listening"
    : "Talk to NOVA";
}

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.lang = voiceLanguage;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    updateVoiceButton();
    setVoiceStatus("Listening... Speak now.");
  };

  recognition.onresult = e => {
    const transcript =
      e.results[0][0].transcript.trim();

    if (!transcript) {
      return setVoiceStatus(
        "No speech detected. Try again."
      );
    }

    input.value = transcript;

    setVoiceStatus(
      "Processing your voice message..."
    );

    sendMessage();
  };

  recognition.onerror = e => {
    const errors = {
      "not-allowed": "Microphone permission denied.",
      "no-speech": "No speech detected. Please try again.",
      "audio-capture": "Microphone not found.",
      "network": "Voice recognition needs internet."
    };

    setVoiceStatus(
      errors[e.error] || "Voice recognition failed."
    );
  };

  recognition.onend = () => {
    isListening = false;
    updateVoiceButton();
  };

  voiceBtn?.addEventListener("click", () => {
    if (isSending) return;

    if (imageMode) {
      return setVoiceStatus(
        "Turn off Image Mode before using Voice Chat."
      );
    }

    if (selectedImageDataUrl) {
      return setVoiceStatus(
        "Send or remove the attached image before using Voice Chat."
      );
    }

    if (isListening) {
      return recognition.stop();
    }

    speechSynthesis?.cancel();
    recognition.lang = voiceLanguage;

    try {
      recognition.start();
    } catch (e) {
      setVoiceStatus("Could not start microphone.");
    }
  });

} else {
  setVoiceStatus(
    "Voice recognition is not supported. Try Chrome or Edge."
  );

  if (voiceBtn) {
    voiceBtn.disabled = true;
  }
}

// ==========================================
// VOICE OUTPUT
// ==========================================

function speakReply(text) {
  if (
    !speakerEnabled ||
    !("speechSynthesis" in window)
  ) return;

  speechSynthesis.cancel();

  const clean = text
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  const utterance = new SpeechSynthesisUtterance(clean);

  utterance.lang =
    /[\u0900-\u097F]/.test(clean)
      ? "hi-IN"
      : "en-IN";

  utterance.rate = voiceRate;
  utterance.pitch = 1;
  utterance.volume = 1;

  utterance.onstart = () => {
    setVoiceStatus("NOVA is speaking...");
  };

  utterance.onend = () => {
    setVoiceStatus("Voice chat ready.");
  };

  utterance.onerror = () => {
    setVoiceStatus("Voice playback stopped.");
  };

  speechSynthesis.speak(utterance);
}

// ==========================================
// MARKDOWN
// ==========================================

if (window.marked) {
  marked.setOptions({
    gfm: true,
    breaks: true
  });
}

function renderMarkdown(element, content) {
  if (!element) return;

  if (!window.marked || !window.DOMPurify) {
    element.textContent = content;
    return;
  }

  element.innerHTML = DOMPurify.sanitize(
    marked.parse(content),
    { USE_PROFILES: { html: true } }
  );

  element.querySelectorAll("a").forEach(a => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}

// ==========================================
// STORAGE AND HISTORY
// ==========================================

function loadChats() {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

    return Array.isArray(data) ? data : [];

  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(chats)
    );
  } catch (e) {
    console.error("Could not save chats:", e);
  }
}

function createId() {
  return Date.now().toString() +
    Math.random().toString(36).slice(2);
}

function saveCurrentChat() {
  if (!chatHistory.length) return;

  if (!activeChatId) {
    activeChatId = createId();
  }

  let chat = chats.find(
    c => c.id === activeChatId
  );

  if (!chat) {
    const first = chatHistory.find(
      m => m.role === "user"
    );

    chat = {
      id: activeChatId,
      title: first
        ? first.content.slice(0, 35)
        : "New Chat",
      messages: [],
      updatedAt: Date.now()
    };

    chats.unshift(chat);
  }

  chat.messages = chatHistory.map(m => ({
    role: m.role,
    content: m.content,
    ...(m.type ? { type: m.type } : {})
  }));

  chat.updatedAt = Date.now();

  chats.sort((a, b) => b.updatedAt - a.updatedAt);

  chats = chats.slice(0, 100);

  saveChats();
  renderHistory();
}

function setupHistory() {
  const sidebar = $(".sidebar");

  let panel = $("#nova-history-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "nova-history-panel";
    panel.hidden = true;

    sidebar?.appendChild(panel);
  }

  $("#nova-history-button")?.addEventListener("click", () => {
    chats = loadChats();

    panel.hidden = !panel.hidden;

    renderHistory();
  });

  renderHistory();
}

function renderHistory() {
  const panel = $("#nova-history-panel");

  if (!panel) return;

  panel.replaceChildren();

  const header = document.createElement("div");

  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px";

  const title = document.createElement("strong");
  title.textContent = "Your Conversations";

  const refresh = document.createElement("button");
  refresh.textContent = "↻";
  refresh.title = "Refresh history";

  refresh.addEventListener("click", () => {
    chats = loadChats();
    renderHistory();
  });

  header.append(title, refresh);
  panel.append(header);

  if (!chats.length) {
    const p = document.createElement("p");
    p.textContent = "No saved chats yet.";
    panel.append(p);
    return;
  }

  chats.forEach(chat => {
    const row = document.createElement("div");
    row.className = "history-item";

    const name = document.createElement("button");
    name.className = "history-item-title";
    name.textContent = chat.title || "New Chat";

    if (chat.id === activeChatId) {
      name.style.color = "#c49aff";
    }

    name.addEventListener("click", () => {
      openChat(chat.id);
    });

    const rename = document.createElement("button");
    rename.className = "rename-chat";
    rename.textContent = "✎";
    rename.title = "Rename chat";

    rename.addEventListener("click", () => {
      renameChat(chat.id);
    });

    const del = document.createElement("button");
    del.className = "delete-chat";
    del.textContent = "×";
    del.title = "Delete chat";

    del.addEventListener("click", () => {
      deleteChat(chat.id);
    });

    row.append(name, rename, del);
    panel.append(row);
  });
}

function renameChat(id) {
  const chat = chats.find(c => c.id === id);

  if (!chat) return;

  const name = prompt(
    "Enter a new chat name:",
    chat.title || "New Chat"
  );

  if (name === null) return;

  if (!name.trim()) {
    return alert("Chat name cannot be empty.");
  }

  chat.title = name.trim().slice(0, 60);
  chat.updatedAt = Date.now();

  saveChats();
  renderHistory();
}

function deleteChat(id) {
  const chat = chats.find(c => c.id === id);

  if (!chat) return;

  if (!confirm(`Delete "${chat.title || "New Chat"}"?`)) {
    return;
  }

  chats = chats.filter(c => c.id !== id);

  saveChats();

  if (activeChatId === id) {
    createNewChat();
  }

  renderHistory();
}

// ==========================================
// SCROLL AND MESSAGES
// ==========================================

function scrollToMessage(element) {
  if (!element || !scrollArea) return;

  requestAnimationFrame(() => {
    const areaRect = scrollArea.getBoundingClientRect();
    const rect = element.getBoundingClientRect();

    const target =
      scrollArea.scrollTop +
      rect.top -
      areaRect.top -
      18;

    scrollArea.scrollTo({
      top: Math.max(0, target),
      behavior: "smooth"
    });
  });
}

function showConversation() {
  if (welcome) welcome.hidden = true;
  if (messagesBox) messagesBox.hidden = false;
}

function addMessage(role, content, shouldScroll = true, options = {}) {
  showConversation();

  const message = document.createElement("div");

  message.className =
    "message " +
    (role === "user"
      ? "user-message"
      : "assistant-message");

  const heading = document.createElement("strong");

  heading.textContent =
    role === "user"
      ? "You"
      : "✦ NOVA AI";

  const body = document.createElement("div");
  body.className = "message-content";

  if (role === "user") {
    body.textContent = content;
  } else {
    renderMarkdown(body, content);
  }

  message.append(heading, body);

  if (
    role === "assistant" &&
    options.actions !== false
  ) {
    message.append(
      createMessageActions(content, message)
    );
  }

  messagesBox.append(message);

  if (shouldScroll) {
    scrollToMessage(message);
  }

  return message;
}

// User message with an attached image
function addUserImageMessage(
  prompt,
  imageData,
  shouldScroll = true
) {
  const message = addMessage(
    "user",
    prompt,
    shouldScroll
  );

  const body = message.querySelector(".message-content");

  if (imageData && body) {
    const img = document.createElement("img");

    img.src = imageData;
    img.alt = "Attached image";
    img.className = "nova-user-image";

    body.appendChild(img);
  }

  return message;
}

function createMessageActions(content, message) {
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copy = document.createElement("button");
  copy.textContent = "⧉ Copy";

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(content);
      copy.textContent = "✓ Copied";
    } catch {
      copy.textContent = "Copy unavailable";
    }

    setTimeout(() => {
      copy.textContent = "⧉ Copy";
    }, 1500);
  });

  const regenerate = document.createElement("button");
  regenerate.textContent = "↻ Regenerate";

  regenerate.addEventListener("click", () => {
    regenerateResponse(message);
  });

  actions.append(copy, regenerate);

  return actions;
}

function updateStreamingMessage(
  message,
  content,
  streaming = true
) {
  const el = message?.querySelector(".message-content");

  if (!el) return;

  el.classList.toggle(
    "streaming-cursor",
    streaming
  );

  renderMarkdown(el, content);
}

function finishAssistantMessage(message, content) {
  if (!message) return;

  const el = message.querySelector(".message-content");

  if (el) {
    el.classList.remove("streaming-cursor");
    renderMarkdown(el, content);
  }

  message.querySelector(".message-actions")?.remove();

  if (content.trim()) {
    message.append(
      createMessageActions(content, message)
    );
  }
}

// ==========================================
// GENERATED IMAGE AND VIDEO
// ==========================================

function addGeneratedImage(
  prompt,
  imageData,
  shouldScroll = true
) {
  showConversation();

  const message = document.createElement("div");
  message.className = "message assistant-message";

  const heading = document.createElement("strong");
  heading.textContent = "✦ NOVA AI";

  const desc = document.createElement("div");
  desc.className = "message-content";
  desc.textContent = "Your image is ready!";

  const img = document.createElement("img");
  img.className = "generated-image";
  img.src = imageData;
  img.alt = prompt;
  img.loading = "lazy";

  const promptText = document.createElement("p");
  promptText.textContent = "Prompt: " + prompt;

  const link = document.createElement("a");
  link.className = "image-download";
  link.href = imageData;
  link.download = "nova-ai-image.jpg";
  link.textContent = "⬇ Download Image";

  message.append(
    heading,
    desc,
    img,
    promptText,
    link
  );

  messagesBox.append(message);

  if (shouldScroll) {
    scrollToMessage(message);
  }

  return message;
}

function addGeneratedVideo(videoUrl) {
  showConversation();

  const message = document.createElement("div");
  message.className = "message assistant-message";

  const heading = document.createElement("strong");
  heading.textContent = "✦ NOVA AI";

  const body = document.createElement("div");
  body.className = "message-content";

  const video = document.createElement("video");

  video.src = videoUrl;
  video.controls = true;
  video.playsInline = true;

  video.style.cssText =
    "width:100%;max-width:650px;border-radius:12px";

  body.append("Your video is ready!", video);

  message.append(heading, body);
  messagesBox.append(message);

  scrollToMessage(message);
}

// ==========================================
// STREAMING
// ==========================================

function extractStreamText(data) {
  if (typeof data === "string") return data;

  return (
    data?.choices?.[0]?.delta?.content ||
    data?.choices?.[0]?.message?.content ||
    data?.content ||
    data?.token ||
    data?.delta ||
    ""
  );
}

async function streamChat(messages, onToken, signal) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages,
      model: getSelectedModel()
    }),
    signal
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));

    throw new Error(
      data.error || "AI request failed."
    );
  }

  if (!response.body) {
    throw new Error("Streaming is not supported.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullText = "";
  let finished = false;

  function parseBlock(block) {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;

      const raw = line.slice(5).trim();

      if (!raw) continue;

      if (raw === "[DONE]") {
        finished = true;
        continue;
      }

      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const token = extractStreamText(data);

      if (token) {
        fullText += token;
        onToken(token, fullText);
      }

      if (data.done === true) {
        finished = true;
      }

      if (typeof data.reply === "string") {
        fullText = data.reply;
        onToken("", fullText);
      }
    }
  }

  try {
    while (!finished) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, {
        stream: true
      });

      const blocks = buffer.split(/\r?\n\r?\n/);

      buffer = blocks.pop() || "";

      blocks.forEach(parseBlock);
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      parseBlock(buffer);
    }

    return fullText;

  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

// ==========================================
// IMAGE GENERATION
// ==========================================

async function requestImage(prompt, addUserMessage = true) {
  const response = await fetch("/api/image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Image generation failed."
    );
  }

  if (!data.image) {
    throw new Error("No image was returned.");
  }

  addGeneratedImage(prompt, data.image);

  chatHistory.push({
    role: "assistant",
    content: "Generated an image for: " + prompt,
    type: "image"
  });

  saveCurrentChat();
}

async function generateImage() {
  const prompt = input.value.trim();

  if (!prompt || isSending) return;

  setGeneratingState(true);

  input.value = "";

  chatHistory.push({
    role: "user",
    content: "Generate image: " + prompt
  });

  addMessage(
    "user",
    "Generate an image: " + prompt
  );

  saveCurrentChat();

  const loading = addMessage(
    "assistant",
    "NOVA is creating your image... Please wait.",
    true,
    { actions: false }
  );

  loadingMessage = loading;

  try {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Image generation failed."
      );
    }

    if (!data.image) {
      throw new Error("No image was returned.");
    }

    loading.remove();

    addGeneratedImage(prompt, data.image);

    chatHistory.push({
      role: "assistant",
      content: "Generated an image for: " + prompt,
      type: "image"
    });

    saveCurrentChat();

  } catch (error) {
    const message =
      "Image generation failed: " + error.message;

    loading.querySelector(".message-content").textContent =
      message;

    chatHistory.push({
      role: "assistant",
      content: message
    });

    saveCurrentChat();

  } finally {
    loadingMessage = null;
    setGeneratingState(false);
    input.focus();
  }
}

// ==========================================
// IMAGE ANALYSIS
// ==========================================

async function analyzeSelectedImage(userText) {
  if (!selectedImageDataUrl || isSending) return;

  const imageData = selectedImageDataUrl;

  const prompt = userText ||
    "Please describe and analyse this image in detail.";

  clearSelectedImage();

  speechSynthesis?.cancel();

  setGeneratingState(true);

  currentController = new AbortController();

  input.value = "";

  // Base64 image is NOT saved in local chat history.
  chatHistory.push({
    role: "user",
    content: userText || "Please analyse this image.",
    type: "image"
  });

  addUserImageMessage(
    userText || "Please analyse this image.",
    imageData
  );

  saveCurrentChat();

  const loading = addMessage(
    "assistant",
    "NOVA is analysing your image...",
    true,
    { actions: false }
  );

  loadingMessage = loading;

  let reply = "";

  try {
    const response = await fetch("/api/analyze-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: imageData,
        prompt
      }),
      signal: currentController.signal
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Image analysis failed."
      );
    }

    reply = data.reply || "";

    if (!reply.trim()) {
      throw new Error("NOVA returned an empty analysis.");
    }

    finishAssistantMessage(loading, reply);

    chatHistory.push({
      role: "assistant",
      content: reply
    });

    saveCurrentChat();

    speakReply(reply);

    setVoiceStatus("Image analysis completed.");

  } catch (error) {
    if (error.name === "AbortError") {
      loading.querySelector(".message-content").textContent =
        "Image analysis stopped.";

      setVoiceStatus("Image analysis stopped.");

    } else {
      const message =
        "Image analysis failed: " + error.message;

      loading.querySelector(".message-content").textContent =
        message;

      chatHistory.push({
        role: "assistant",
        content: message
      });

      saveCurrentChat();

      setVoiceStatus("Could not analyse the image.");
    }

  } finally {
    currentController = null;
    loadingMessage = null;

    setGeneratingState(false);

    input.focus();
  }
}

// ==========================================
// AUTOMATIC VISUALS
// ==========================================

async function maybeGenerateVisual(question, answer) {
  try {
    const response = await fetch("/api/visual-decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        answer
      })
    });

    if (!response.ok) return;

    const decision = await response.json();

    if (
      !decision.shouldGenerate ||
      !decision.prompt
    ) return;

    setVoiceStatus(
      "NOVA is preparing a helpful visual..."
    );

    try {
      await requestImage(decision.prompt, false);

      setVoiceStatus("Visual added to the answer.");

    } catch (error) {
      console.warn(
        "Automatic image generation skipped:",
        error
      );

      setVoiceStatus(
        "Text answer is ready; automatic image was unavailable."
      );
    }

  } catch (error) {
    console.warn(
      "Visual decision unavailable:",
      error
    );
  }
}

// ==========================================
// SEND MESSAGE
// ==========================================

async function sendMessage() {
  if (!input || isSending) return;

  const userText = input.value.trim();

  // Image generation mode
  if (imageMode) {
    if (!userText) return;
    return generateImage();
  }

  // Attached image analysis
  if (selectedImageDataUrl) {
    return analyzeSelectedImage(userText);
  }

  if (!userText) return;

  speechSynthesis?.cancel();

  setGeneratingState(true);

  currentController = new AbortController();

  input.value = "";

  chatHistory.push({
    role: "user",
    content: userText
  });

  addMessage("user", userText);

  saveCurrentChat();

  const loading = addMessage(
    "assistant",
    "NOVA is thinking...",
    true,
    { actions: false }
  );

  loadingMessage = loading;

  let reply = "";

  try {
    const messages = chatHistory.filter(
      m => m.type !== "image"
    );

    reply = await streamChat(
      messages,
      (token, full) => {
        reply = full;

        updateStreamingMessage(
          loading,
          reply,
          true
        );
      },
      currentController.signal
    );

    if (!reply.trim()) {
      throw new Error("AI returned an empty response.");
    }

    finishAssistantMessage(loading, reply);

    chatHistory.push({
      role: "assistant",
      content: reply
    });

    saveCurrentChat();

    speakReply(reply);

    maybeGenerateVisual(userText, reply);

  } catch (error) {
    if (error.name === "AbortError") {
      if (reply.trim()) {
        finishAssistantMessage(loading, reply);

        chatHistory.push({
          role: "assistant",
          content: reply
        });

        saveCurrentChat();

      } else {
        const el = loading.querySelector(".message-content");

        el.textContent = "Generation stopped.";
        el.classList.remove("streaming-cursor");
      }

      setVoiceStatus("Generation stopped.");

    } else {
      const el = loading.querySelector(".message-content");

      el.textContent = "Error: " + error.message;
      el.classList.remove("streaming-cursor");

      setVoiceStatus(
        "NOVA could not answer. Please try again."
      );
    }

  } finally {
    currentController = null;
    loadingMessage = null;

    setGeneratingState(false);

    input.focus();
  }
}

// ==========================================
// REGENERATE RESPONSE
// ==========================================

async function regenerateResponse(messageElement) {
  if (isSending) return;

  let index = -1;

  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "user") {
      index = i;
      break;
    }
  }

  if (index < 0) {
    return setVoiceStatus(
      "No question found to regenerate."
    );
  }

  if (chatHistory[index].type === "image") {
    return setVoiceStatus(
      "Please attach the image again to regenerate its analysis."
    );
  }

  const messages = chatHistory
    .slice(0, index + 1)
    .filter(m => m.type !== "image");

  setGeneratingState(true);

  currentController = new AbortController();

  const content =
    messageElement.querySelector(".message-content");

  const actions =
    messageElement.querySelector(".message-actions");

  if (actions) actions.hidden = true;

  let reply = "";

  updateStreamingMessage(
    messageElement,
    "NOVA is generating a new response...",
    true
  );

  try {
    reply = await streamChat(
      messages,
      (token, full) => {
        reply = full;

        updateStreamingMessage(
          messageElement,
          reply,
          true
        );
      },
      currentController.signal
    );

    if (reply.trim()) {
      chatHistory = [
        ...messages,
        {
          role: "assistant",
          content: reply
        }
      ];

      finishAssistantMessage(
        messageElement,
        reply
      );

      saveCurrentChat();

      speakReply(reply);

      maybeGenerateVisual(
        messages[messages.length - 1].content,
        reply
      );
    }

  } catch (error) {
    if (error.name === "AbortError") {
      if (reply.trim()) {
        chatHistory = [
          ...messages,
          {
            role: "assistant",
            content: reply
          }
        ];

        finishAssistantMessage(
          messageElement,
          reply
        );

        saveCurrentChat();

      } else {
        content.textContent = "Generation stopped.";
        content.classList.remove("streaming-cursor");
      }

    } else {
      content.textContent =
        "Regeneration failed: " + error.message;

      content.classList.remove("streaming-cursor");
    }

  } finally {
    currentController = null;

    setGeneratingState(false);

    if (actions) actions.hidden = false;

    input.focus();
  }
}

// ==========================================
// OPEN / NEW CHAT
// ==========================================

function openChat(id) {
  const chat = chats.find(c => c.id === id);

  if (!chat) return;

  speechSynthesis?.cancel();

  activeChatId = chat.id;

  chatHistory = Array.isArray(chat.messages)
    ? [...chat.messages]
    : [];

  messagesBox.replaceChildren();

  showConversation();

  chatHistory.forEach(m => {
    if (m.type === "image" && m.role === "user") {
      addMessage(
        "user",
        m.content +
          "\n[Image attached earlier. Original image is not stored.]",
        false
      );

    } else if (
      m.type === "image" &&
      m.role === "assistant"
    ) {
      addMessage(
        "assistant",
        "An image was generated in this conversation. The original image is not stored in chat history.",
        false
      );

    } else {
      addMessage(
        m.role,
        m.content,
        false
      );
    }
  });

  const panel = $("#nova-history-panel");

  if (panel) panel.hidden = true;

  renderHistory();

  if (messagesBox.lastElementChild) {
    scrollToMessage(messagesBox.lastElementChild);
  }
}

function createNewChat() {
  if (isSending) {
    stopGenerating();
  }

  activeChatId = null;
  chatHistory = [];

  speechSynthesis?.cancel();

  if (recognition && isListening) {
    recognition.stop();
  }

  clearSelectedImage();

  setVoiceStatus("");

  messagesBox.replaceChildren();
  messagesBox.hidden = true;

  if (welcome) {
    welcome.hidden = false;
  }

  input.value = "";
  input.disabled = false;

  imageMode = false;

  updateImageButton();

  input.placeholder = "Ask NOVA anything...";

  const panel = $("#nova-history-panel");

  if (panel) panel.hidden = true;

  renderHistory();

  scrollArea?.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  input.focus();
}

newChatBtn?.addEventListener(
  "click",
  createNewChat
);

sendBtn?.addEventListener(
  "click",
  sendMessage
);

input?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ==========================================
// EXPLORE AND SUGGESTION CARDS
// ==========================================

$("#explore-menu-button")?.addEventListener("click", () => {
  document.querySelectorAll(".menu-item").forEach(b => {
    b.classList.remove("active");
  });

  $("#explore-menu-button").classList.add("active");

  const panel = $("#nova-history-panel");

  if (panel) panel.hidden = true;

  closeSettings();

  scrollArea?.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

document.querySelectorAll(".menu-item").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".menu-item").forEach(b => {
      b.classList.remove("active");
    });

    button.classList.add("active");
  });
});

document.querySelectorAll(".suggestion").forEach(card => {
  card.addEventListener("click", () => {
    const heading = $("strong", card);

    if (heading) {
      input.value =
        "Help me with " + heading.textContent;

      input.focus();
    }
  });
});

// ==========================================
// CINEMATIC NOVA ORB
// Click orb to play 10-second animation
// ==========================================

function setupLivingOrb() {
  const canvas = $("#nova-orb");
  const stage = $("#orb-stage");

  if (!canvas || !stage) return;

  const ctx = canvas.getContext("2d");

  if (!ctx) return;

  const size = 440;
  const center = size / 2;
  const radius = 174;

  canvas.width = size;
  canvas.height = size;

  let px = 0;
  let py = 0;

  let sx = 0;
  let sy = 0;

  let rotation = 0;
  let raf = 0;

  let cinematicStart = 0;
  const CINEMATIC_DURATION = 10000;

  let cinematicActive = false;

  const reduced = matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const area = $(".main") || stage;

  stage.style.cursor = "pointer";

  stage.setAttribute("role", "button");
  stage.setAttribute("tabindex", "0");
  stage.setAttribute(
    "aria-label",
    "Play NOVA cinematic animation"
  );

  stage.title = "Click to play NOVA cinematic animation";

  function startCinematic() {
    cinematicStart = performance.now();

    cinematicActive = true;

    stage.classList.add("nova-cinematic-active");

    setVoiceStatus("NOVA cinematic sequence activated.");
  }

  stage.addEventListener("click", e => {
    if (
      e.target.closest("button, a, input, textarea, select")
    ) return;

    startCinematic();
  });

  stage.addEventListener("keydown", e => {
    if (
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      startCinematic();
    }
  });

  area.addEventListener("pointermove", e => {
    const r = area.getBoundingClientRect();

    px = Math.max(
      -1,
      Math.min(
        1,
        ((e.clientX - r.left) / r.width - 0.5) * 2
      )
    );

    py = Math.max(
      -1,
      Math.min(
        1,
        ((e.clientY - r.top) / r.height - 0.5) * 2
      )
    );
  });

  area.addEventListener("pointerleave", () => {
    px = 0;
    py = 0;
  });

  function drawCinematic(time, progress) {
    const p = Math.max(0, Math.min(1, progress));

    const intro = Math.min(1, p * 5);
    const outro = Math.max(0, 1 - Math.max(0, p - 0.82) / 0.18);

    const intensity = Math.sin(p * Math.PI) * outro;

    const cx = center;
    const cy = center;

    // Expanding energy rings
    for (let i = 0; i < 7; i++) {
      const delay = i / 7;

      const local = Math.max(
        0,
        Math.min(1, (p - delay * 0.25) / 0.75)
      );

      const ringRadius =
        radius * (0.65 + local * (1.9 + i * 0.12));

      const alpha =
        (1 - local) * intensity * 0.75;

      ctx.save();

      ctx.translate(cx, cy);
      ctx.rotate(p * 5 + i * 0.8);

      ctx.beginPath();

      ctx.ellipse(
        0,
        0,
        ringRadius,
        ringRadius * (0.28 + i * 0.025),
        0,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle =
        i % 2 === 0
          ? `rgba(190,125,255,${alpha})`
          : `rgba(70,210,255,${alpha})`;

      ctx.lineWidth = 2 + (1 - local) * 3;

      ctx.shadowColor =
        i % 2 === 0 ? "#b66cff" : "#35cfff";

      ctx.shadowBlur = 22;

      ctx.stroke();

      ctx.restore();
    }

    // Energy rays
    for (let i = 0; i < 64; i++) {
      const angle =
        (i / 64) * Math.PI * 2 +
        p * 7;

      const startRadius =
        radius * (0.7 + Math.sin(time * 0.002 + i) * 0.08);

      const length =
        (35 + (i % 7) * 15) * intensity;

      const x1 = cx + Math.cos(angle) * startRadius;
      const y1 = cy + Math.sin(angle) * startRadius;

      const x2 =
        cx + Math.cos(angle) * (startRadius + length);

      const y2 =
        cy + Math.sin(angle) * (startRadius + length);

      ctx.beginPath();

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      ctx.strokeStyle =
        i % 3 === 0
          ? `rgba(90,215,255,${intensity * 0.8})`
          : `rgba(205,155,255,${intensity * 0.8})`;

      ctx.lineWidth = i % 5 === 0 ? 2.5 : 1;

      ctx.shadowBlur = 15;
      ctx.shadowColor = "#a66cff";

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Lightning-like energy paths
    for (let i = 0; i < 9; i++) {
      const angle =
        i * (Math.PI * 2 / 9) +
        p * 4;

      const startX =
        cx + Math.cos(angle) * radius * 0.9;

      const startY =
        cy + Math.sin(angle) * radius * 0.9;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      for (let j = 1; j <= 7; j++) {
        const distance = radius * (0.9 + j * 0.1);

        const wobble =
          Math.sin(time * 0.015 + i * 4 + j * 2) * 12;

        const x =
          cx +
          Math.cos(angle) * distance +
          Math.cos(angle + 1.5) * wobble;

        const y =
          cy +
          Math.sin(angle) * distance +
          Math.sin(angle + 1.5) * wobble;

        ctx.lineTo(x, y);
      }

      ctx.strokeStyle =
        `rgba(190,150,255,${intensity * 0.8})`;

      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#a66cff";
      ctx.shadowBlur = 16;

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Bright central flare
    const flare = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      radius * 1.8
    );

    flare.addColorStop(
      0,
      `rgba(255,255,255,${intensity * 0.48})`
    );

    flare.addColorStop(
      0.25,
      `rgba(160,100,255,${intensity * 0.24})`
    );

    flare.addColorStop(
      1,
      "rgba(80,40,200,0)"
    );

    ctx.fillStyle = flare;

    ctx.fillRect(0, 0, size, size);

    // Cinematic particles
    for (let i = 0; i < 110; i++) {
      const angle =
        i * 2.399 +
        time * 0.0008;

      const distance =
        radius * (
          0.25 +
          ((i * 37) % 120) / 100
        );

      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;

      const twinkle =
        0.3 +
        (Math.sin(time * 0.008 + i) + 1) * 0.3;

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        i % 8 === 0 ? 3 : 1.4,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        `rgba(230,210,255,${twinkle * intensity})`;

      ctx.shadowBlur = 12;
      ctx.shadowColor = "#bd83ff";

      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // NOVA title reveal
    if (p > 0.12 && p < 0.9) {
      const titleAlpha =
        Math.min(1, (p - 0.12) * 8) *
        Math.min(1, (0.9 - p) * 9);

      ctx.save();

      ctx.globalAlpha = titleAlpha * 0.9;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = "bold 28px Arial";

      ctx.shadowColor = "#b77aff";
      ctx.shadowBlur = 24;

      ctx.fillStyle = "#ffffff";

      ctx.fillText(
        "N O V A",
        cx,
        cy + radius + 52
      );

      ctx.font = "12px Arial";

      ctx.shadowBlur = 10;

      ctx.fillStyle = "#c8aaff";

      ctx.fillText(
        "ARTIFICIAL INTELLIGENCE",
        cx,
        cy + radius + 75
      );

      ctx.restore();
    }

    // Intro flash
    if (p < 0.12) {
      const flashAlpha =
        Math.sin((p / 0.12) * Math.PI) *
        0.55;

      ctx.fillStyle =
        `rgba(255,255,255,${flashAlpha})`;

      ctx.fillRect(0, 0, size, size);
    }

    return outro;
  }

  function draw(time) {
    const t = reduced ? 0 : time * 0.00035;

    const pulse = reduced
      ? 1
      : 1 + Math.sin(time * 0.0018) * 0.012;

    sx += (px - sx) * 0.045;
    sy += (py - sy) * 0.045;

    stage.style.translate =
      `${reduced ? 0 : sx * 35}px ${reduced ? 0 : sy * 25}px`;

    if (!reduced) {
      rotation += 0.0035 + Math.abs(sx) * 0.0015;
    }

    ctx.clearRect(0, 0, size, size);

    const r = radius * pulse;

    // Outer glow
    const glow = ctx.createRadialGradient(
      center,
      center,
      r * 0.5,
      center,
      center,
      r * 1.3
    );

    glow.addColorStop(
      0,
      "rgba(143,70,255,.28)"
    );

    glow.addColorStop(
      0.55,
      "rgba(72,53,220,.12)"
    );

    glow.addColorStop(
      1,
      "rgba(30,10,80,0)"
    );

    ctx.fillStyle = glow;

    ctx.beginPath();
    ctx.arc(center, center, r * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Orb body
    const body = ctx.createRadialGradient(
      center - 72 + sx * 12,
      center - 78 + sy * 12,
      5,
      center + 12,
      center + 25,
      r * 1.15
    );

    body.addColorStop(0, "#f7eaff");
    body.addColorStop(0.09, "#c58aff");
    body.addColorStop(0.25, "#8844ec");
    body.addColorStop(0.48, "#4b20a5");
    body.addColorStop(0.73, "#211052");
    body.addColorStop(1, "#08091c");

    ctx.shadowColor = "rgba(153,85,255,.8)";
    ctx.shadowBlur = 38;

    ctx.fillStyle = body;

    ctx.beginPath();
    ctx.arc(center, center, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.save();

    ctx.beginPath();
    ctx.arc(center, center, r - 1, 0, Math.PI * 2);
    ctx.clip();

    // Blue energy
    const blue = ctx.createRadialGradient(
      center + 75 + sx * 28,
      center + 55 + sy * 24,
      5,
      center + 30,
      center + 30,
      r
    );

    blue.addColorStop(
      0,
      "rgba(38,195,255,.85)"
    );

    blue.addColorStop(
      0.35,
      "rgba(45,100,255,.35)"
    );

    blue.addColorStop(
      1,
      "rgba(20,10,60,0)"
    );

    ctx.fillStyle = blue;
    ctx.fillRect(0, 0, size, size);

    // Energy waves
    for (let i = 0; i < 9; i++) {
      const phase =
        rotation * (i % 2 === 0 ? 1 : -0.75) +
        i * 0.75;

      const yBase =
        center +
        Math.sin(phase + t * 2) * 55 +
        (i - 4) * 15;

      const amp = 18 + (i % 3) * 8;

      ctx.beginPath();

      for (
        let x = center - radius;
        x <= center + radius;
        x += 3
      ) {
        const rel = (x - center) / radius;

        const env = Math.sqrt(
          Math.max(0, 1 - rel * rel)
        );

        const y =
          yBase +
          Math.sin(rel * 5 + phase + t * 3) *
            amp *
            env +
          sy * 12;

        if (x === center - radius) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle =
        i % 2 === 0
          ? "rgba(206,160,255,.48)"
          : "rgba(67,202,255,.42)";

      ctx.lineWidth = i % 3 === 0 ? 3 : 1.6;

      ctx.shadowColor =
        i % 2 === 0 ? "#ae68ff" : "#37c5ff";

      ctx.shadowBlur = 13;

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Orb rings
    for (let i = 0; i < 5; i++) {
      const angle =
        rotation * (i % 2 ? -0.65 : 0.8) +
        i * Math.PI / 5;

      ctx.save();

      ctx.translate(center, center);
      ctx.rotate(angle);

      ctx.beginPath();

      ctx.ellipse(
        0,
        0,
        r * 0.88,
        r * (0.20 + i * 0.035),
        0,
        -1.05,
        1.45
      );

      ctx.strokeStyle =
        i % 2
          ? "rgba(70,210,255,.68)"
          : "rgba(222,180,255,.72)";

      ctx.lineWidth = 2.2;

      ctx.shadowColor =
        i % 2 ? "#38c4ff" : "#c47aff";

      ctx.shadowBlur = 17;

      ctx.stroke();

      ctx.restore();
    }

    // Small particles inside orb
    for (let i = 0; i < 48; i++) {
      const angle =
        i * 2.399 +
        rotation * (i % 2 ? 0.4 : -0.3);

      const distance =
        r * (0.15 + ((i * 17) % 72) / 100);

      const x = center + Math.cos(angle) * distance;
      const y = center + Math.sin(angle) * distance * 0.86;

      const twinkle =
        0.3 +
        (Math.sin(time * 0.003 + i) + 1) * 0.3;

      ctx.beginPath();

      ctx.arc(
        x,
        y,
        i % 5 === 0 ? 2.3 : 1.2,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        i % 3 === 0
          ? `rgba(105,220,255,${twinkle})`
          : `rgba(244,221,255,${twinkle})`;

      ctx.fill();
    }

    // Highlight
    const highlight = ctx.createRadialGradient(
      center - 75 + sx * 10,
      center - 88 + sy * 10,
      2,
      center - 40,
      center - 45,
      r * 0.85
    );

    highlight.addColorStop(
      0,
      "rgba(255,255,255,.8)"
    );

    highlight.addColorStop(
      0.14,
      "rgba(245,220,255,.3)"
    );

    highlight.addColorStop(
      0.45,
      "rgba(255,255,255,.04)"
    );

    highlight.addColorStop(
      1,
      "rgba(255,255,255,0)"
    );

    ctx.fillStyle = highlight;

    ctx.beginPath();
    ctx.arc(center, center, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, r - 1, 0, Math.PI * 2);

    ctx.strokeStyle = "rgba(225,195,255,.48)";
    ctx.lineWidth = 2;

    ctx.stroke();

    ctx.restore();

    // Cinematic layer
    if (cinematicActive) {
      const progress =
        (time - cinematicStart) /
        CINEMATIC_DURATION;

      if (progress >= 1) {
        cinematicActive = false;

        stage.classList.remove(
          "nova-cinematic-active"
        );

        setVoiceStatus("NOVA is ready.");
      } else {
        drawCinematic(time, progress);
      }
    }

    raf = requestAnimationFrame(draw);
  }

  function start() {
    if (!raf) {
      raf = requestAnimationFrame(draw);
    }
  }

  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      document.hidden ? stop() : start();
    }
  );

  start();
}

// ==========================================
// INITIALIZATION
// ==========================================

setupSidebarResize();
setupHistory();
setupLivingOrb();

updateVoiceButton();
updateSpeakerButton();
updateImageButton();
updateSettingsUI();

loadModels();

console.log(
  "NOVA AI Ready — Chat, Streaming, Stop, History, Models, Voice, Image Generation, Image Analysis, Auto Visuals, Profile, Theme, Cinematic Orb and Resizable Sidebar."
);
