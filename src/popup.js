const titleInput = document.getElementById("titleInput");
const promptInput = document.getElementById("promptInput");
const promptList = document.getElementById("promptList");
const saveButton = document.getElementById("saveButton");
const fillButton = document.getElementById("fillButton");
const deleteButton = document.getElementById("deleteButton");
const newPromptButton = document.getElementById("newPromptButton");
const generateButton = document.getElementById("generateButton");
const apiKeyInput = document.getElementById("apiKeyInput");
const modelInput = document.getElementById("modelInput");
const baseUrlInput = document.getElementById("baseUrlInput");
const providerSelect = document.getElementById("providerSelect");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const statusElement = document.getElementById("status");

let prompts = [];
let selectedId = null;

init();

async function init() {
  const stored = await chrome.storage.local.get([
    "prompts",
    "lastPromptText",
    "apiProvider",
    "apiKey",
    "apiModel",
    "apiBaseUrl",
    "openaiApiKey",
    "openaiModel"
  ]);
  prompts = Array.isArray(stored.prompts) ? stored.prompts : [];
  selectedId = prompts[0]?.id || null;
  providerSelect.value = stored.apiProvider || "mimo";
  apiKeyInput.value = stored.apiKey || stored.openaiApiKey || "";
  modelInput.value = stored.apiModel || stored.openaiModel || getDefaultModel(providerSelect.value);
  baseUrlInput.value = stored.apiBaseUrl || getDefaultBaseUrl(providerSelect.value);
  render();
  loadSelectedPrompt();
}

saveSettingsButton.addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiProvider: providerSelect.value,
    apiKey: apiKeyInput.value.trim(),
    apiModel: modelInput.value.trim() || getDefaultModel(providerSelect.value),
    apiBaseUrl: baseUrlInput.value.trim() || getDefaultBaseUrl(providerSelect.value)
  });
  setStatus("API 设置已保存。");
});

providerSelect.addEventListener("change", () => {
  modelInput.value = getDefaultModel(providerSelect.value);
  baseUrlInput.value = getDefaultBaseUrl(providerSelect.value);
});

saveButton.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  const text = promptInput.value.trim();

  if (!title || !text) {
    setStatus("标题和 Prompt 都要填写。");
    return;
  }

  if (!selectedId) selectedId = crypto.randomUUID();

  const existingIndex = prompts.findIndex((prompt) => prompt.id === selectedId);
  const nextPrompt = { id: selectedId, title, text };
  if (existingIndex >= 0) {
    prompts[existingIndex] = nextPrompt;
  } else {
    prompts.unshift(nextPrompt);
  }

  await chrome.storage.local.set({ prompts, lastPromptText: text });
  render();
  setStatus("已保存。");
});

fillButton.addEventListener("click", async () => {
  const text = promptInput.value.trim();
  if (!text) {
    setStatus("先选择或输入一个 Prompt。");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("没有找到当前标签页。");
    return;
  }

  await chrome.storage.local.set({ lastPromptText: text });

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "PROMPT_FLOW_FILL",
      text,
      mode: "replace"
    });
    setStatus(response?.ok ? "已填入当前页面。" : "没找到可输入区域，请先点一下输入框。");
  } catch (error) {
    setStatus("当前页面暂不允许注入，请刷新页面后再试。");
  }
});

generateButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("没有找到当前标签页。");
    return;
  }

  generateButton.disabled = true;
  setStatus("正在读取页面上下文...");

  try {
    const contextResponse = await chrome.tabs.sendMessage(tab.id, {
      type: "PROMPT_FLOW_CONTEXT"
    });

    if (!contextResponse?.ok) {
      setStatus("无法读取当前页面，请刷新后再试。");
      return;
    }

    setStatus("正在调用 API 生成...");
    const generationResponse = await chrome.runtime.sendMessage({
      type: "PROMPT_FLOW_GENERATE",
      payload: {
        userGoal: promptInput.value.trim(),
        context: contextResponse.context
      }
    });

    if (!generationResponse?.ok) {
      setStatus(generationResponse?.error || "生成失败。");
      return;
    }

    promptInput.value = generationResponse.text;
    await chrome.storage.local.set({ lastPromptText: generationResponse.text });
    await chrome.tabs.sendMessage(tab.id, {
      type: "PROMPT_FLOW_FILL",
      text: generationResponse.text,
      mode: "replace"
    });
    setStatus("已根据页面生成并填入。");
  } catch (error) {
    setStatus(error?.message || "生成失败，请检查 API Key 和页面权限。");
  } finally {
    generateButton.disabled = false;
  }
});

deleteButton.addEventListener("click", async () => {
  if (!selectedId) return;
  prompts = prompts.filter((prompt) => prompt.id !== selectedId);
  selectedId = prompts[0]?.id || null;
  await chrome.storage.local.set({ prompts });
  render();
  loadSelectedPrompt();
  setStatus("已删除。");
});

newPromptButton.addEventListener("click", () => {
  selectedId = crypto.randomUUID();
  titleInput.value = "";
  promptInput.value = "";
  render();
  titleInput.focus();
  setStatus("新建 Prompt。");
});

function render() {
  promptList.replaceChildren(
    ...prompts.map((prompt) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "prompt-card";
      card.setAttribute("aria-selected", String(prompt.id === selectedId));
      card.addEventListener("click", () => {
        selectedId = prompt.id;
        loadSelectedPrompt();
        render();
      });

      const title = document.createElement("div");
      title.className = "prompt-title";
      title.textContent = prompt.title;

      const preview = document.createElement("div");
      preview.className = "prompt-preview";
      preview.textContent = prompt.text;

      card.append(title, preview);
      return card;
    })
  );
}

function loadSelectedPrompt() {
  const selected = prompts.find((prompt) => prompt.id === selectedId);
  titleInput.value = selected?.title || "";
  promptInput.value = selected?.text || "";
}

function setStatus(message) {
  statusElement.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusElement.textContent = "";
  }, 2400);
}

function getDefaultModel(provider) {
  if (provider === "mimo") return "MiMo-V2.5-Pro";
  return "gpt-5.5";
}

function getDefaultBaseUrl(provider) {
  if (provider === "mimo") return "https://token-plan-cn.xiaomimimo.com/v1";
  return "https://api.openai.com/v1";
}
