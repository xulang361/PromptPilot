# PromptPilot

一个面向 AI 工具试用者、AI 出海站长和 Prompt 工作流用户的 Chrome 插件：根据当前页面上下文生成合适的输入内容，并一键填入网页输入框。

## 当前能力

- 在插件弹窗里保存常用 Prompt。
- 一键把 Prompt 填入当前网页的输入框。
- 接入 OpenAI / Mimo API，根据当前页面上下文生成适合输入框的内容。
- 自动识别常见输入区域：`textarea`、文本 `input`、`contenteditable`、`role="textbox"`、ProseMirror、Quill、Slate。
- 右键菜单和快捷键 `Alt+Shift+P` 可填入上次使用的 Prompt。

## 本地安装

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择这个目录：

   `/Users/leo/Documents/Codex/2026-05-21/chrome-ai-ai-ai-prompt-chrome`

## 使用方式

1. 打开任意 AI 工具页面。
2. 点击页面里的输入框，或保持目标输入框在可见区域。
3. 打开插件弹窗，选择 Prompt。
4. 点击「填入当前页面」。

如果某些网页第一次无法填入，刷新页面后再试。Chrome 不允许插件注入扩展商店、浏览器内部页面和少数受保护页面。

## API 生成

1. 打开插件弹窗里的「API 设置」。
2. 选择供应商。
3. 填入你的 API Key。
4. 填入模型。
   - Mimo Base URL：`https://token-plan-cn.xiaomimimo.com/v1`
   - Mimo 默认模型：`MiMo-V2.5-Pro`
   - OpenAI 默认：`gpt-5.5`
4. 在文本框里写一个生成目标，例如「生成适合这个 AI 图片工具的英文测试 prompt」。
5. 点击「根据页面生成」。

插件会采集当前页面标题、URL、描述、可见文本、目标输入框的 placeholder、label、附近文案等上下文，然后调用模型 API 生成最终要填入的文本。

注意：当前原型把 API Key 存在 Chrome 本地存储中，只适合自用验证。Mimo 后台提示不要把 API Key 暴露在浏览器或其他客户端代码中，且套餐仅限兼容编程/智能体工具交互式使用。准备长期使用、上架或商业化时，请先确认供应商条款，并改成合规的服务端或官方支持的接入方式。
