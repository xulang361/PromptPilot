const DEFAULT_PROMPTS = [
  {
    id: "product-demo",
    title: "产品试用描述",
    text: "请基于以下产品场景，生成一个清晰、具体、可执行的测试输入：目标用户是跨境 SaaS 创业者，需要快速评估这个 AI 工具是否适合提升内容生产效率。"
  },
  {
    id: "seo-landing",
    title: "出海落地页 SEO",
    text: "请为一个面向海外用户的 AI 工具落地页生成英文文案，包含 headline、subheadline、3 个核心卖点、FAQ 和 CTA。语气专业、简洁、偏转化。"
  },
  {
    id: "workflow-test",
    title: "Prompt 工作流测试",
    text: "请把这个任务拆成可复用的 prompt 工作流：输入、处理步骤、输出格式、质量检查标准。输出用 Markdown 表格。"
  }
];

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "fill-last-prompt",
      title: "填入上次使用的 Prompt",
      contexts: ["editable", "page"]
    });
  });

  const { prompts } = await chrome.storage.local.get("prompts");
  if (!Array.isArray(prompts) || prompts.length === 0) {
    await chrome.storage.local.set({
      prompts: DEFAULT_PROMPTS,
      lastPromptText: DEFAULT_PROMPTS[0].text
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "fill-last-prompt" || !tab?.id) return;
  await fillLastPrompt(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-last-prompt") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await fillLastPrompt(tab.id);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PROMPT_FLOW_GENERATE") return;

  generatePrompt(message.payload)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) => {
      console.warn("Prompt Flow Autofill: generation failed", error);
      sendResponse({ ok: false, error: normalizeError(error) });
    });

  return true;
});

async function fillLastPrompt(tabId) {
  const { lastPromptText, prompts } = await chrome.storage.local.get([
    "lastPromptText",
    "prompts"
  ]);
  const fallback = Array.isArray(prompts) && prompts[0] ? prompts[0].text : "";
  const text = lastPromptText || fallback;
  if (!text) return;

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PROMPT_FLOW_FILL",
      text,
      mode: "replace"
    });
  } catch (error) {
    console.warn("Prompt Flow Autofill: failed to fill prompt", error);
  }
}

async function generatePrompt(payload = {}) {
  const {
    apiProvider,
    apiKey,
    apiModel,
    apiBaseUrl,
    openaiApiKey,
    openaiModel
  } = await chrome.storage.local.get([
    "apiProvider",
    "apiKey",
    "apiModel",
    "apiBaseUrl",
    "openaiApiKey",
    "openaiModel"
  ]);
  const provider = apiProvider || "openai";
  const key = apiKey || openaiApiKey;
  const model = apiModel || openaiModel || getDefaultModel(provider);
  const baseUrl = normalizeBaseUrl(apiBaseUrl || getDefaultBaseUrl(provider));

  if (!key) {
    throw new Error("请先保存 API Key。");
  }

  const text =
    provider === "mimo"
      ? await generateWithChatCompletions({ key, model, baseUrl, payload })
      : await generateWithOpenAIResponses({ key, model, payload });

  await chrome.storage.local.set({ lastPromptText: text });
  return text;
}

async function generateWithOpenAIResponses({ key, model, payload }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      instructions: buildGenerationInstructions(),
      input: buildGenerationInput(payload),
      max_output_tokens: 700,
      store: false
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI API 请求失败：${response.status}`);
  }

  const text = extractOutputText(data).trim();
  if (!text) {
    throw new Error("OpenAI 没有返回可填入的文本。");
  }

  return text;
}

async function generateWithChatCompletions({ key, model, baseUrl, payload }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildGenerationInstructions() },
        { role: "user", content: buildGenerationInput(payload) }
      ],
      max_completion_tokens: 700,
      temperature: 0.7,
      top_p: 0.95
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Mimo API 请求失败：${response.status}`);
  }

  const text = extractChatCompletionText(data).trim();
  if (!text) {
    throw new Error("Mimo 没有返回可填入的文本。");
  }

  return text;
}

function buildGenerationInstructions() {
  return [
    "You generate text that will be pasted into an input field on an AI tool website.",
    "Infer the target input type from page context, focused field metadata, labels, placeholders, nearby text, URL, and user goal.",
    "Return only the final text to paste. Do not include explanations, headings, code fences, or surrounding quotes.",
    "Avoid entering credentials, private personal data, payment data, or anything that looks like a login/signup field.",
    "If the field appears to be for image, video, SEO, landing page, workflow, product, or chat prompts, produce a practical high-quality prompt tailored to that context.",
    "Prefer English output for overseas/AI SaaS contexts unless the user goal clearly asks for Chinese."
  ].join(" ");
}

function buildGenerationInput(payload) {
  const context = payload.context || {};

  return JSON.stringify(
    {
      userGoal: payload.userGoal || "",
      page: {
        title: context.title,
        url: context.url,
        description: context.description,
        visibleText: context.visibleText
      },
      focusedInput: context.focusedInput,
      nearbyInputs: context.nearbyInputs
    },
    null,
    2
  );
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("\n");
}

function extractChatCompletionText(data) {
  return (data.choices || [])
    .map((choice) => choice.message?.content || "")
    .filter(Boolean)
    .join("\n");
}

function getDefaultModel(provider) {
  if (provider === "mimo") return "MiMo-V2.5-Pro";
  return "gpt-5.5";
}

function getDefaultBaseUrl(provider) {
  if (provider === "mimo") return "https://token-plan-cn.xiaomimimo.com/v1";
  return "https://api.openai.com/v1";
}

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function normalizeError(error) {
  return error?.message || "生成失败，请稍后再试。";
}
