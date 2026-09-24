# AI 漫剧工作台

> 阅读语言：中文 | [English](README_EN.md)

一个运行在**本地**的 AI 漫剧（动态漫画 / 短剧）创作工作台。从小说剧情原文出发，串联「剧本 → 分镜 → 图像 / 视频 / 配音生成 → 合成成片」的完整流程，前端为单页应用，后端为轻量本地 Node 服务，仅监听 `127.0.0.1`，所有数据留在本机。

> 本项目用于学习交流。使用前请自行准备兼容 OpenAI 格式接口的 AI 服务 API Key。

## 效果演示

工作台生成能力示例（由本项目产出的真实素材）：

| 角色资产设定（多视角一致性） | 分镜首帧画面 |
| :---: | :---: |
| ![资产](docs/demo-asset.jpg) | ![分镜](docs/demo-shot.jpg) |

---

## 功能概览

- **剧本创作**：输入剧情原文 / 大纲，调用文本模型生成分镜剧本。
- **分镜管理**：结构化分镜卡片（景别、运镜、画面描述、对白、情绪、时长等），支持手动增删与确认保存。
- **资产管理**：角色 / 场景 / 道具等资产图生成与 `@引用`，保障画面一致性。
- **图像 / 视频生成**：调用图像、视频模型生成分镜首尾帧、片段。
- **配音与音效**：文本转语音（TTS）生成旁白 / 角色音轨。
- **合成导出**：基于内置 ffmpeg 将视频片段、配音、字幕合成为成片 MP4。

## 技术栈

- **后端**：原生 Node.js `http` 服务（无第三方框架依赖），`server.js`
- **前端**：单文件 `index.html`（原生 JS，无构建步骤）
- **本地数据**：JSON 配置 + `projects/` 目录存储项目产物
- **工具链**：`ffmpeg`（视频合成）、Python venv + edge-tts（配音）

## 目录结构

```
ai漫剧工作台/
├── server.js                 # 本地服务（仅监听 127.0.0.1:8765，托管前端 + 文件读写/合成 API）
├── index.html                # 工作台前端（单页应用）
├── 启动工作台.bat             # Windows 一键启动（调用 node server.js）
├── 停止工作台.bat             # Windows 一键停止
├── modelConfig.example.json  # 模型 / API Key 配置示例（复制为 modelConfig.json 后填自己的 Key）
├── .gitignore
└── README.md
```

运行时会自动在本地生成（已在 `.gitignore` 中排除，不会上传）：
`modelConfig.json`、`settings.json`、`projects.json`、`projects/`、`server.pid`、`tools/`（内置工具链）。

## 环境要求

| 依赖 | 用途 | 获取方式 |
|---|---|---|
| **Node.js ≥ 18** | 运行本地服务 | https://nodejs.org |
| **ffmpeg** | 视频合成 | 放入项目 `tools/ffmpeg.exe`（Windows），或安装到系统 PATH |
| **Python + edge-tts**（可选） | TTS 配音 | `pip install edge-tts`，或配置到 `tools/py` 虚拟环境 |

> `tools/`（含 ffmpeg.exe、Python 虚拟环境，约 80+ MB 且为 Windows 平台相关二进制）**未包含在本仓库中**。请按上表在本地自备 ffmpeg 后放入 `tools/ffmpeg.exe`，或安装到系统 PATH 供程序回退调用。

## 快速开始

1. 安装 Node.js（≥ 18）。
2. 克隆仓库：
   ```bash
   git clone <你的仓库地址>
   cd ai漫剧工作台
   ```
3. 准备 ffmpeg：下载 ffmpeg 可执行文件并放到 `tools/ffmpeg.exe`（或将 ffmpeg 加入系统 PATH）。
4. 启动服务（Windows）：双击 `启动工作台.bat`；或命令行：
   ```bash
   node server.js
   ```
5. 浏览器会自动打开 `http://127.0.0.1:8765`。
6. 进入「设置 → 模型配置」，**添加供应商并填入你自己的 API Key**（兼容 OpenAI 格式的文本 / 图像 / 视频模型服务）。
   - 也可将 `modelConfig.example.json` 复制为 `modelConfig.json` 后填写 `key` 字段。

## 安全说明

- 服务仅监听 `127.0.0.1`，不对外开放；文件读写 API 限制在项目目录内。
- **切勿将含真实 API Key 的 `modelConfig.json` / `projects.json` 提交到公开仓库。** 本仓库已通过 `.gitignore` 默认排除这些本地配置文件。
- 示例配置中的 `key` 字段留空，请各自填入自己的凭据。

## 许可

学习参考用途。如需正式开源许可（MIT / Apache 等）请告知，可在仓库补充 `LICENSE` 文件。
