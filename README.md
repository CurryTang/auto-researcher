# Auto Reader

Your personal AI research assistant that automatically reads, summarizes, and organizes academic papers.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)

**[English](#english-version) | [中文文档](#中文文档)**

---

# English Version

## Features

- **One-Click Paper Saving** - Chrome extension to save papers from arXiv, OpenReview, and any PDF
- **AI-Powered Summaries** - Multi-pass deep reading generates comprehensive notes
- **Code Analysis** - Automatically analyzes associated GitHub repositories
- **Beautiful Diagrams** - Auto-generated Mermaid diagrams for architectures and workflows
- **Math Support** - Full LaTeX rendering with KaTeX
- **Read Tracking** - Mark papers as read/unread, filter your library
- **Full-Text Search** - Find papers by title, tags, and content

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/CurryTang/auto-researcher.git
cd auto-researcher
```

### 2. Set Up Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials (see Configuration)
npm start
```

### 3. Set Up Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Install Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` folder

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Backend    │────▶│  Gemini AI   │
│  Extension   │     │    API       │     │   Analysis   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    ▼                    │
       │             ┌──────────────┐            │
       │             │   Database   │            │
       │             │   (Turso)    │            │
       │             └──────────────┘            │
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────┐
│                    Web Interface                      │
│         View Papers, Notes, Diagrams, Code           │
└──────────────────────────────────────────────────────┘
```

### Paper Processing Pipeline

1. **Save** - Chrome extension captures paper metadata and PDF
2. **Queue** - Paper is added to processing queue
3. **Analyze** - Gemini AI performs 3-pass deep reading:
   - Pass 1: Bird's eye scan (structure, key pages)
   - Pass 2: Content understanding (methods, results)
   - Pass 3: Deep analysis (math, diagrams)
4. **Store** - Notes saved to cloud storage
5. **View** - Beautiful rendered notes with diagrams and math

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - How to deploy to production
- [Usage Guide](docs/USAGE.md) - How to use the application
- [Configuration Guide](docs/CONFIGURATION.md) - All configuration options
- [S3 Setup Guide](docs/S3_SETUP_GUIDE.md) - AWS S3 configuration

## Tech Stack

**Frontend:**
- React 18
- Vite
- React Markdown + KaTeX + Mermaid
- GitHub Pages hosting

**Backend:**
- Node.js + Express
- Turso (SQLite cloud)
- AWS S3
- PM2 process manager

**AI:**
- Google Gemini CLI (paper analysis)
- Claude Code CLI (code analysis)

## Configuration

Key environment variables:

```bash
# Required
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=your-bucket

# Authentication
ADMIN_TOKEN=your-admin-token  # For write operations

# Optional
READER_MAX_PER_HOUR=5        # Papers processed per hour
RATE_LIMIT_MAX=200           # API rate limit
```

See [Configuration Guide](docs/CONFIGURATION.md) for all options.

## Development

```bash
# Backend (with hot reload)
cd backend && npm run dev

# Frontend (with hot reload)
cd frontend && npm run dev
```

## Deployment

Quick deploy using the included script:

```bash
./scripts/deploy.sh deploy
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

## Updates

### Recommended Deployment Architecture

Our DigitalOcean server is a low-cost instance ($8/month), which cannot handle multi-user scenarios well. The recommended deployment approach is to use the cloud server as a **lightweight proxy**, and then use [FRP](https://github.com/fatedier/frp) (Fast Reverse Proxy) to forward user requests to a local powerful PC for actual AI processing.

```
┌──────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│  Users   │────▶│  Cloud Server ($8)  │────▶│  Local Powerful PC   │
│          │     │  (Proxy via FRP)     │     │  (AI Processing)     │
└──────────┘     └─────────────────────┘     └──────────────────────┘
```

This way, the cloud server only handles routing and lightweight API requests, while all heavy AI workloads (Gemini CLI, Codex CLI, Claude Code) run on your local machine with better hardware.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Gemini](https://deepmind.google/technologies/gemini/) for paper analysis
- [Mermaid](https://mermaid.js.org/) for diagram rendering
- [KaTeX](https://katex.org/) for math rendering

---

# 中文文档

## 功能特点

- **一键保存论文** - Chrome 扩展支持从 arXiv、OpenReview 等网站保存论文
- **AI 智能摘要** - 多轮深度阅读生成全面笔记
- **代码分析** - 自动分析关联的 GitHub 仓库
- **精美图表** - 自动生成 Mermaid 架构图和流程图
- **数学公式支持** - 使用 KaTeX 完整渲染 LaTeX
- **阅读追踪** - 标记论文已读/未读状态，筛选你的文库
- **全文搜索** - 按标题、标签和内容查找论文

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/CurryTang/auto-researcher.git
cd auto-researcher
```

### 2. 设置后端

```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env 填入你的凭证（参见配置指南）
npm start
```

### 3. 设置前端

```bash
cd frontend
npm install
npm run dev
```

### 4. 安装 Chrome 扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"，选择 `extension/` 文件夹

## 工作原理

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   浏览器      │────▶│   后端       │────▶│  Gemini AI   │
│   扩展       │     │   API        │     │   分析       │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    ▼                    │
       │             ┌──────────────┐            │
       │             │   数据库      │            │
       │             │   (Turso)    │            │
       │             └──────────────┘            │
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────┐
│                    网页界面                           │
│         查看论文、笔记、图表、代码                      │
└──────────────────────────────────────────────────────┘
```

### 论文处理流程

1. **保存** - Chrome 扩展捕获论文元数据和 PDF
2. **排队** - 论文加入处理队列
3. **分析** - Gemini AI 进行 3 轮深度阅读：
   - 第1轮：鸟瞰扫描（结构、关键页面）
   - 第2轮：内容理解（方法、结果）
   - 第3轮：深度分析（数学、图表）
4. **存储** - 笔记保存到云存储
5. **查看** - 精美渲染的笔记，包含图表和数学公式

## 文档

- [部署指南](docs/DEPLOYMENT_CN.md) - 如何部署到生产环境
- [使用指南](docs/USAGE_CN.md) - 如何使用应用
- [配置指南](docs/CONFIGURATION_CN.md) - 所有配置选项
- [S3 设置指南](docs/S3_SETUP_GUIDE.md) - AWS S3 配置

## 技术栈

**前端：**
- React 18
- Vite
- React Markdown + KaTeX + Mermaid
- GitHub Pages 托管

**后端：**
- Node.js + Express
- Turso (SQLite 云端)
- AWS S3
- PM2 进程管理

**AI：**
- Google Gemini CLI（论文分析）
- Claude Code CLI（代码分析）

## 配置

主要环境变量：

```bash
# 必需
TURSO_DATABASE_URL=libsql://你的数据库.turso.io
TURSO_AUTH_TOKEN=你的令牌
AWS_ACCESS_KEY_ID=你的密钥ID
AWS_SECRET_ACCESS_KEY=你的密钥
AWS_S3_BUCKET=你的存储桶

# 认证
ADMIN_TOKEN=你的管理员令牌  # 用于写操作

# 可选
READER_MAX_PER_HOUR=5        # 每小时处理论文数
RATE_LIMIT_MAX=200           # API 速率限制
```

详见[配置指南](docs/CONFIGURATION_CN.md)。

## 开发

```bash
# 后端（支持热重载）
cd backend && npm run dev

# 前端（支持热重载）
cd frontend && npm run dev
```

## 部署

使用部署脚本快速部署：

```bash
./scripts/deploy.sh deploy
```

详见[部署指南](docs/DEPLOYMENT_CN.md)。

## 更新

### 推荐部署架构

我们的 DigitalOcean 服务器是低配实例（$8/月），无法很好地应对多用户场景。推荐的部署方式是将云服务器作为**轻量代理**，然后使用 [FRP](https://github.com/fatedier/frp)（快速反向代理）将用户请求转发到本地高性能 PC 进行实际的 AI 处理。

```
┌──────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│   用户    │────▶│  云服务器 ($8)       │────▶│  本地高性能 PC        │
│          │     │  (FRP 代理)          │     │  (AI 处理)           │
└──────────┘     └─────────────────────┘     └──────────────────────┘
```

这样，云服务器只处理路由和轻量 API 请求，而所有繁重的 AI 工作负载（Gemini CLI、Codex CLI、Claude Code）都在本地硬件更强的机器上运行。

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)。

## 致谢

- [Gemini](https://deepmind.google/technologies/gemini/) 提供论文分析
- [Mermaid](https://mermaid.js.org/) 提供图表渲染
- [KaTeX](https://katex.org/) 提供数学公式渲染
