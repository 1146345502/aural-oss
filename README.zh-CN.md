<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp;
  <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://aural-ai.com">
    <img src="public/images/marketing/logo.png" alt="Aural" width="80" height="80" />
  </a>
</p>

<h1 align="center">Aural</h1>

<p align="center">
  <strong>深度对话，自动洞察。</strong><br/>
  面向语音、文字与视频场景的开源 AI 访谈平台。
</p>

<p align="center">
  <a href="https://aural-ai.com">官方网站</a> &nbsp;·&nbsp;
  <a href="https://youtu.be/Mmn1tjTzuwQ">产品视频</a> &nbsp;·&nbsp;
  <a href="https://aural-ai.com/docs">文档</a> &nbsp;·&nbsp;
  <a href="#部署">部署</a>
</p>

<p align="center">
  <a href="https://github.com/1146345502/aural-oss/actions/workflows/ci.yml"><img src="https://github.com/1146345502/aural-oss/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/1146345502/aural-oss/releases/latest"><img src="https://img.shields.io/github/v/release/1146345502/aural-oss?color=orange" alt="最新版本" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT 许可证" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node 18+" />
  <img src="https://img.shields.io/badge/Next.js-14-black" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e" alt="Supabase" />
</p>

<br/>

<p align="center">
  <a href="https://aural-ai.com">
    <img src="public/images/marketing/hero-screenshots.webp" alt="Aural AI 访谈平台" width="820" />
  </a>
</p>

<p align="center">
  用自然语言描述访谈目标，分享一个链接，Aural 的 AI 即可完成访谈：<br/>
  自动提问、智能追问，并在访谈结束后生成详细分析。
</p>

<p align="center">
  <b><a href="https://aural-ai.com">体验云服务 &rarr;</a></b>
  &nbsp;&nbsp;&nbsp;
  <b><a href="#自托管">自托管指南 &darr;</a></b>
</p>

---

## 核心能力

<table>
  <tr>
    <td width="25%" align="center"><strong>🎙 语音、文字与视频</strong><br/><sub>支持多种访谈渠道，并根据回答实时调整对话</sub></td>
    <td width="25%" align="center"><strong>🧠 AI 生成访谈</strong><br/><sub>描述目标即可生成完整问题、评估标准与推荐设置</sub></td>
    <td width="25%" align="center"><strong>💻 在线编程</strong><br/><sub>通过 Monaco 编辑器和 Excalidraw 白板完成技术评估</sub></td>
    <td width="25%" align="center"><strong>📊 自动分析报告</strong><br/><sub>生成逐题评分、亮点、改进方向和总结</sub></td>
  </tr>
  <tr>
    <td width="25%" align="center"><strong>🛡 防作弊</strong><br/><sub>页面切换、外部粘贴、多屏检测与完整性日志</sub></td>
    <td width="25%" align="center"><strong>👥 团队管理</strong><br/><sub>组织、项目和基于角色的访问控制</sub></td>
    <td width="25%" align="center"><strong>🌐 多语言</strong><br/><sub>内置中英文和可扩展的本地化系统</sub></td>
    <td width="25%" align="center"><strong>🔌 可插拔大模型</strong><br/><sub>支持 OpenAI、Gemini、Kimi、MiniMax 及兼容接口</sub></td>
  </tr>
  <tr>
    <td width="25%" align="center"><strong>🚀 快速模板</strong><br/><sub>技术、行为、研究等多类预置访谈模板</sub></td>
    <td width="25%" align="center"><strong>🗣 模拟面试</strong><br/><sub>语音练习、实时反馈、参考答案和评分追踪</sub></td>
    <td width="25%" align="center"><strong>🔗 分享与预览</strong><br/><sub>分享访谈链接，上线前以候选人视角预览</sub></td>
    <td width="25%" align="center"><strong>🔑 开发者 API</strong><br/><sub>提供 OpenAPI 规范和完整 REST API</sub></td>
  </tr>
</table>

---

## 产品演示

<p align="center">
  <a href="https://youtu.be/Mmn1tjTzuwQ">
    <img src="https://img.youtube.com/vi/Mmn1tjTzuwQ/maxresdefault.jpg" alt="Aural 产品演示" width="720" />
  </a>
  <br/>
  <sub>点击观看三分钟产品演示</sub>
</p>

<details>
<summary><strong>中文产品介绍</strong></summary>
<br/>
<p align="center">
  <a href="https://youtu.be/iPZL9aWXp-Q">
    <img src="https://img.youtube.com/vi/iPZL9aWXp-Q/maxresdefault.jpg" alt="Aural 中文产品介绍" width="720" />
  </a>
</p>
</details>

---

## 产品概览

Aural 是一个可自主执行结构化访谈的 AI 平台。创建访谈并分享链接后，AI 会负责提问、追问和对话控制，并在会话结束后生成结构化分析。

### 创建访谈

用自然语言描述目标，AI 会生成问题、评估标准和推荐设置；你也可以通过编辑器手动构建访谈。

<p align="center">
  <img src="public/images/docs/interview-new-ai.webp" alt="通过自然语言生成访谈" width="720" />
</p>

支持开放题、单选题、多选题、Monaco 在线编程题和 Excalidraw 白板题。

<p align="center">
  <img src="public/images/docs/interview-edit-content.webp" alt="访谈问题编辑器" width="720" />
</p>

### 配置与分享

可设置 AI 人设、语气、追问深度、语言和沟通方式，并通过公开链接或仅限邀请模式控制访问。

<p align="center">
  <img src="public/images/docs/interview-edit-settings.webp" alt="访谈配置与分享设置" width="720" />
</p>

### 模拟面试

将任意访谈转换为模拟面试工作区。添加职位和简历上下文，通过文字或语音练习，获取流式 AI 反馈、追问辅导、参考答案与历史评分，并把优秀答案收藏到答案库。

<p align="center">
  <img src="public/images/docs/practices-context.webp" alt="模拟面试上下文" width="720" />
</p>

<p align="center">
  <img src="public/images/docs/practices-session.webp" alt="模拟面试与 AI 反馈" width="720" />
</p>

### 邀请候选人

支持手动添加候选人、通过 Excel 批量导入，以及上传 PDF 简历后由 AI 提取候选人信息。每位候选人会获得唯一邀请链接。

<p align="center">
  <img src="public/images/docs/sessions-add-dropdown.webp" alt="候选人导入方式" width="720" />
</p>

### 执行访谈

候选人可通过文字、语音或视频完成访谈。AI 会根据回答实时调整追问深度、语气和方向，并支持在线编程与白板。

<p align="center">
  <img src="public/images/docs/interview-session.webp" alt="实时 AI 访谈" width="720" />
</p>

### 防作弊与结果分析

防作弊模式可以要求摄像头、麦克风和屏幕共享，并记录页面离开、外部粘贴和多屏等事件。访谈完成后，系统生成逐题评分、优势、改进建议和整体总结。

<p align="center">
  <img src="public/images/docs/session-report.webp" alt="访谈分析报告" width="720" />
</p>

### 常见使用场景

- **技术招聘**：使用在线编辑器和白板完成编程与系统设计面试
- **用户研究**：通过 AI 追问挖掘更深层的需求和洞察
- **行为面试**：规模化执行自然的语音访谈
- **面试练习**：在正式面试前获得即时 AI 反馈

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Next.js 14](https://nextjs.org/)（App Router） |
| 语言 | TypeScript |
| 数据库 | [Supabase](https://supabase.com/)（PostgreSQL、Auth、Storage、RLS） |
| API | [tRPC](https://trpc.io/) |
| AI / LLM | OpenAI、Google Gemini、Moonshot Kimi、MiniMax，可插拔提供商系统 |
| 语音 | WebSocket 中继服务（火山引擎豆包、Azure OpenAI Realtime） |
| UI | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + [Radix](https://radix-ui.com/) |
| 代码编辑器 | [Monaco Editor](https://microsoft.github.io/monaco-editor/) |
| 白板 | [Excalidraw](https://excalidraw.com/) |
| 图表 | [Recharts](https://recharts.org/) |

---

## 架构

```text
┌──────────────────────────────────────────────────────────────┐
│                          浏览器                              │
│  ┌───────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ 管理面板  │  │ 访谈编辑器   │  │ 会话界面               │ │
│  │           │  │              │  │（文字 / 语音 / 视频）  │ │
│  └─────┬─────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│        └───────────┬───┘         ┌───────────┘               │
│                    │             │ WebSocket                 │
└────────────────────┼─────────────┼───────────────────────────┘
                     │ tRPC / REST │
                     ▼             ▼
┌────────────────────────┐  ┌──────────────────┐
│    Next.js 服务端      │  │  语音中继服务   │
│  ┌──────────────────┐  │  │  ┌────────────┐  │
│  │ tRPC 路由        │  │  │  │ 火山引擎   │  │
│  ├──────────────────┤  │  │  │ 豆包 S2S   │  │
│  │ REST API 路由    │  │  │  ├────────────┤  │
│  ├──────────────────┤  │  │  │ Azure OAI  │  │
│  │ AI 提供商注册表  │  │  │  │ Realtime   │  │
│  └──────────────────┘  │  │  └────────────┘  │
└────────────┬───────────┘  └──────────────────┘
             │
             ▼
┌────────────────────────┐
│        Supabase        │
│  Auth / PostgreSQL     │
│  RLS / Storage         │
└────────────────────────┘
```

### 关键模块

| 模块 | 位置 | 作用 |
|------|------|------|
| App Router | `src/app/` | 登录、管理面板、文档、公开访谈和模拟面试页面 |
| tRPC 路由 | `src/server/routers/` | 访谈、会话、分析、组织、项目、候选人和权限控制 |
| REST API | `src/app/api/` | AI、模拟面试、语音、认证、会话生命周期和文件上传接口 |
| 开发者 API | `src/app/api/v1/` | 访谈、问题、会话和候选人的 REST API；OpenAPI 规范位于 `/api/v1/openapi.json` |
| AI 提供商系统 | `src/lib/ai/` | 提供商注册、任务模型选择和提示词模板 |
| 语音中继 | `server/` | 浏览器与语音模型之间的独立 WebSocket 中继服务 |
| 模拟面试 | `src/components/prep/`、`src/lib/prep/` | 上下文、回答、反馈、答案库、评分和练习历史 |
| Supabase | `src/lib/supabase/` | 客户端、服务端、管理端工具和数据隔离 |

---

## 部署

你可以直接使用 Aural 云服务，也可以在自己的基础设施上部署完整平台。

### 云服务

无需安装即可开始创建访谈：**[前往 aural-ai.com &rarr;](https://aural-ai.com)**

### 自托管

#### 前置要求

- Node.js 18+ 和 npm
- Supabase 云项目，或通过 `supabase start` 启动的本地项目
- 至少一个 LLM API 密钥：OpenAI、Google Gemini、Kimi 或 MiniMax
- 如需语音访谈或语音练习，还需火山引擎豆包或 Azure OpenAI 语音凭据

#### 1. 克隆并安装

```bash
git clone https://github.com/1146345502/aural-oss.git
cd aural-oss
npm install
```

#### 2. 配置 Supabase

**方式 A：Supabase Cloud**

1. 在 [supabase.com](https://supabase.com/) 创建项目
2. 复制项目 URL 和密钥

**方式 B：本地 Supabase**

需要先安装并启动 [Docker](https://docs.docker.com/get-docker/)。

```bash
npx supabase start
```

该命令会拉取 Docker 镜像、启动所有服务，并自动应用 `supabase/migrations/` 中的迁移。

#### 3. 执行数据库迁移

- 本地 Supabase：`supabase start` 会自动执行迁移
- Supabase Cloud：运行以下命令

```bash
npx supabase db push
```

也可以从 `supabase/migrations/` 手动执行迁移。

#### 4. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，至少配置：

- Supabase URL 和密钥
- 一个 LLM 提供商密钥；主应用推荐 `OPENAI_API_KEY`，中继摘要和备用生成推荐 `GEMINI_API_KEY`
- 如需语音功能，配置推荐的 `DOUBAO_*` 或备用的 `AZURE_OPENAI_*`
- 可选的 `JINA_READER_API_KEY`，用于提高被反爬保护拦截的职位描述 URL 导入额度

本地 Supabase 密钥对应关系：

| Supabase CLI 输出 | `.env.local` 变量 |
|-------------------|-----------------------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_URL` |
| Publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` 和 `SUPABASE_ANON_KEY` |
| Secret key | `SUPABASE_SERVICE_ROLE_KEY` |
| Database URL | `DATABASE_URL` |

#### 5. 启动开发环境

```bash
# Next.js 开发服务器
npm run dev

# 推荐的火山引擎豆包语音中继
npm run dev:voice

# 或启动 Azure OpenAI Realtime 备用中继
npm run dev:openai-voice
```

打开 [http://localhost:3000/register](http://localhost:3000/register) 注册，或访问 [http://localhost:3000/login](http://localhost:3000/login) 登录。

---

## 项目结构

```text
aural-oss/
├── src/
│   ├── app/                # Next.js 页面和 API 路由
│   ├── components/         # 领域组件和 UI 组件
│   │   ├── interview/      # 访谈编辑器
│   │   ├── prep/           # 模拟面试、反馈与答案库
│   │   ├── session/        # 文字、语音、视频和防作弊
│   │   └── ui/             # shadcn/ui 基础组件
│   ├── hooks/              # React Hooks
│   ├── lib/                # AI、Supabase、语音和共享工具
│   ├── server/             # tRPC 路由
│   └── content/            # 产品文档内容
├── server/                 # WebSocket 语音中继
├── supabase/               # 数据库迁移和配置
├── tests/                  # 单元与功能测试
└── public/                 # 静态资源
```

---

## 模拟面试模块

模拟面试模块允许访谈创建者和候选人在不产生真实候选人会话的情况下练习。它是开源应用的一部分，不依赖私有计费或用量控制服务。

| 区域 | 位置 | 说明 |
|------|------|------|
| 练习列表 | `src/app/(dashboard)/practices/` | 查看所有访谈的练习历史和快速入口 |
| 访谈练习页 | `src/app/(dashboard)/interviews/[id]/prep/` | 按访谈管理上下文、统计与练习入口 |
| 练习会话 | `src/app/(dashboard)/practices/[sessionId]/` | 可恢复的文字或语音练习流程 |
| UI 组件 | `src/components/prep/` | 上下文、回答卡片、流式反馈、提示和语音输入 |
| API | `src/server/routers/prep.ts`、`src/app/api/prep/` | 数据操作、反馈、追问、提示和离开接口 |
| 数据模型 | `supabase/migrations/004_interview_prep.sql`、`supabase/migrations/005_account_delete_and_answer_bank.sql` | 练习上下文、会话、答题记录、个人答案库和 RLS 策略 |

---

## AI 提供商系统

Aural 需要至少配置一个 LLM 提供商。默认按 OpenAI → Gemini → Kimi → MiniMax 的顺序选择第一个可用提供商。

| 提供商 | 环境变量 | 默认模型 | 获取密钥 |
|--------|----------|----------|----------|
| OpenAI（推荐） | `OPENAI_API_KEY` | `gpt-4o-mini` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | `GEMINI_API_KEY` | `gemini-3.1-flash-lite` | [aistudio.google.com](https://aistudio.google.com/) |
| Moonshot Kimi | `KIMI_API_KEY` | `moonshot-v1-8k` | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| MiniMax | `MINIMAX_API_KEY` | `MiniMax-Text-01` | [platform.minimaxi.com](https://platform.minimaxi.com/) |

通过设置 `OPENAI_BASE_URL`，还可以接入 Ollama、LiteLLM 等 OpenAI 兼容接口。

---

## 语音中继

Aural 通过独立 WebSocket 服务支持实时 AI 语音访谈。

### 推荐：火山引擎豆包（`server/voice-relay.ts`）

豆包中继提供更低延迟、自然的语音对话、中文支持、上下文摘要和自动重连。

```bash
npm run dev:voice
```

必需变量：`DOUBAO_APP_ID` + `DOUBAO_ACCESS_TOKEN`，或 `DOUBAO_API_KEY`。

### 备用：Azure OpenAI Realtime（`server/openai-voice-relay.ts`）

```bash
npm run dev:openai-voice
```

必需变量：`AZURE_OPENAI_ENDPOINT`、`AZURE_OPENAI_API_KEY`、`AZURE_OPENAI_DEPLOYMENT`。

两个中继可以同时运行。前端会根据 `NEXT_PUBLIC_VOICE_RELAY_PRIMARY` 选择首选服务，并在连接失败时自动切换。

---

## 开发者 API

Aural 提供管理访谈、问题、会话和候选人的 REST API。所有请求使用 `dlv_` 开头的开发者 API 密钥：

```text
Authorization: Bearer dlv_your_key_here
```

可在管理面板的 **设置 > API 密钥** 中创建密钥。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET/POST` | `/api/v1/interviews` | 查询或创建访谈 |
| `GET/PATCH/DELETE` | `/api/v1/interviews/{id}` | 获取、更新或归档访谈 |
| `POST` | `/api/v1/interviews/{id}/publish` | 发布访谈并生成分享链接 |
| `GET/POST` | `/api/v1/interviews/{id}/questions` | 查询或添加问题 |
| `GET` | `/api/v1/interviews/{id}/sessions` | 查询访谈会话 |
| `GET/POST` | `/api/v1/interviews/{id}/candidates` | 查询或创建候选人 |
| `GET` | `/api/v1/usage` | 获取当前用量 |
| `GET` | `/api/v1/openapi.json` | OpenAPI 3.1 规范 |

默认限流为每个 API 密钥每分钟 60 次请求。

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Next.js 开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run test:web` | 运行 Web 测试 |
| `npm run test:functional` | 运行基于 Playwright 的功能测试 |
| `npm run dev:voice` | 启动豆包语音中继 |
| `npm run dev:openai-voice` | 启动 Azure OpenAI 备用语音中继 |
| `npm run db:types` | 重新生成 Supabase TypeScript 类型 |

---

## 参与贡献

欢迎提交贡献：

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交修改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

---

## 许可证

本项目采用 MIT 许可证，详情请参阅 [LICENSE](LICENSE)。

---

<p align="center">
  <sub>由 <a href="https://aural-ai.com">AuraTerra Nexus</a> 构建——倾听每一个声音，捕捉每一份洞察。</sub>
</p>
