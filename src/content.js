const EDITABLE_SELECTOR = [
  "textarea",
  "input:not([type])",
  "input[type='text']",
  "input[type='search']",
  "input[type='email']",
  "input[type='url']",
  "[contenteditable='true']",
  "[role='textbox']",
  ".ProseMirror",
  ".ql-editor",
  "[data-slate-editor='true']"
].join(",");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PROMPT_FLOW_CONTEXT") {
    sendResponse({ ok: true, context: collectPageContext() });
    return;
  }

  if (message?.type !== "PROMPT_FLOW_FILL") return;

  const target = findBestEditable();
  if (!target) {
    sendResponse({ ok: false, reason: "NO_EDITABLE_FOUND" });
    return;
  }

  fillEditable(target, message.text || "", message.mode || "replace");
  sendResponse({ ok: true });
});

function collectPageContext() {
  const target = findBestEditable();
  return {
    title: document.title,
    url: location.href,
    description: getMetaDescription(),
    visibleText: getVisiblePageText(),
    focusedInput: target ? describeEditable(target) : null,
    nearbyInputs: Array.from(document.querySelectorAll(EDITABLE_SELECTOR))
      .filter(isEditable)
      .filter(isVisible)
      .slice(0, 8)
      .map(describeEditable)
  };
}

function findBestEditable() {
  const active = document.activeElement;
  if (isEditable(active)) return active;

  const candidates = Array.from(document.querySelectorAll(EDITABLE_SELECTOR))
    .filter(isEditable)
    .filter(isVisible)
    .map((element) => ({
      element,
      score: scoreEditable(element)
    }))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.element || null;
}

function isEditable(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.isContentEditable) return true;
  if (element.getAttribute?.("role") === "textbox") return true;
  return element.matches?.(EDITABLE_SELECTOR);
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function scoreEditable(element) {
  const rect = element.getBoundingClientRect();
  const viewportBonus = rect.top >= 0 && rect.top <= window.innerHeight ? 1000 : 0;
  const activeBonus = document.activeElement === element ? 5000 : 0;
  const semanticBonus =
    element.tagName === "TEXTAREA" || element.isContentEditable ? 500 : 0;
  return activeBonus + viewportBonus + semanticBonus + rect.width * rect.height;
}

function describeEditable(element) {
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute("type") || "",
    role: element.getAttribute("role") || "",
    id: element.id || "",
    name: element.getAttribute("name") || "",
    ariaLabel: element.getAttribute("aria-label") || "",
    placeholder: element.getAttribute("placeholder") || "",
    label: findLabelText(element),
    nearbyText: getNearbyText(element),
    currentValue: getEditableText(element).slice(0, 500),
    viewport: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  };
}

function getMetaDescription() {
  return document.querySelector("meta[name='description']")?.content?.trim() || "";
}

function getVisiblePageText() {
  const elements = document.body?.querySelectorAll("h1,h2,h3,p,label,button,[aria-label]") || [];
  const text = Array.from(elements)
    .filter(isVisible)
    .map((element) => {
      const aria = element.getAttribute("aria-label");
      return aria || element.innerText || element.textContent || "";
    })
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 3500);
}

function findLabelText(element) {
  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const label = ariaLabelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText || "")
      .join(" ")
      .trim();
    if (label) return label.slice(0, 300);
  }

  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.innerText) return label.innerText.trim().slice(0, 300);
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.innerText) return wrappingLabel.innerText.trim().slice(0, 300);

  return "";
}

function getNearbyText(element) {
  const container =
    element.closest("form, section, article, main, [role='dialog'], [class]") ||
    element.parentElement;
  const text = container?.innerText || container?.textContent || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 900);
}

function getEditableText(element) {
  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    return element.innerText || element.textContent || "";
  }

  return element.value || "";
}

function fillEditable(element, text, mode) {
  element.focus();

  if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    fillContentEditable(element, text, mode);
    return;
  }

  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? element.value.length;
  const nextValue =
    mode === "append"
      ? `${element.value}${element.value ? "\n" : ""}${text}`
      : element.value.slice(0, start) + text + element.value.slice(end);

  setNativeValue(element, nextValue);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  element.dispatchEvent(new Event("change", { bubbles: true }));

  const cursor = mode === "append" ? nextValue.length : start + text.length;
  if (typeof element.setSelectionRange === "function") {
    element.setSelectionRange(cursor, cursor);
  }
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const prototypeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  const instanceSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;

  if (prototypeSetter && instanceSetter !== prototypeSetter) {
    prototypeSetter.call(element, value);
    return;
  }

  if (instanceSetter) {
    instanceSetter.call(element, value);
    return;
  }

  element.value = value;
}

function fillContentEditable(element, text, mode) {
  if (mode === "append" && element.textContent.trim()) {
    element.textContent = `${element.textContent}\n${text}`;
  } else {
    element.textContent = text;
  }

  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  placeCaretAtEnd(element);
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
