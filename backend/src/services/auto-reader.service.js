const { getDb } = require('../db');
const config = require('../config');
const pdfService = require('./pdf.service');
const geminiCliService = require('./gemini-cli.service');
const claudeCodeService = require('./claude-code.service');
const s3Service = require('./s3.service');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Auto Reader Service - Multi-pass deep reading mode
 *
 * Based on docs/skill.md and docs/note_templates.md
 *
 * Paper Reading (3 passes):
 * 1. 鸟瞰扫描: Basic info, filter pages, 5C evaluation
 * 2. 内容理解: Method overview, experiments, key figures
 * 3. 深度理解: Math framework, method details, generate figures
 *
 * Code Analysis (if has code, 3 rounds):
 * 1. 仓库概览: Structure, entry points, dependencies
 * 2. 数据接口: Data format, data flow, config system
 * 3. 核心实现: Key methods, implementation details, reproduce guide
 */

// ============== PROMPTS FOR PAPER READING ==============

const PAPER_PASS_1_PROMPT = `你是一位专业的学术论文阅读助手。这是第一轮阅读（鸟瞰扫描）。

## 任务
1. 读取标题、摘要、引言
2. 扫描章节标题（不读内容）
3. 读结论
4. 扫描参考文献

## 输出要求
- 只输出JSON代码块，不要包含任何开场白或说明性文字
- 不要说"我已完成..."之类的话

请直接按以下JSON格式输出：

\`\`\`json
{
  "title": "论文完整标题",
  "paper_type": "实证/理论/系统/综述",
  "venue": "发表venue（如果能识别）",
  "has_code": true/false,
  "code_url": "https://github.com/... 或 null",
  "core_contribution": "用1-2句话概括核心贡献",
  "key_pages": "如 p3-5方法, p6-8实验",
  "skip_pages": "如 p9-10附录, p2相关工作详细",
  "key_figures": [1, 3, 5],
  "five_c": {
    "category": "论文类型分类",
    "context": "相关工作和理论基础",
    "correctness": "假设是否合理",
    "contributions": "主要贡献列表",
    "clarity": "写作质量评价"
  },
  "initial_impression": "对论文的第一印象，是否值得深入"
}
\`\`\``;

const PAPER_PASS_2_PROMPT = `你是一位专业的学术论文阅读助手。这是第二轮阅读（内容理解）。

## 背景信息
第一轮笔记：
{previous_notes}

## 任务
聚焦阅读第一轮标记的关键页面，把握论文内容但不深入细节。

## 输出要求
- 直接输出Markdown内容，不要包含任何开场白或说明性文字
- 不要使用<details>或<summary>标签
- 不要说"我已完成..."之类的话
- **重要**: 对于每个关键图表，必须用ASCII字符画出文本图来复现其内容

请直接输出以下Markdown格式：

### 核心问题
[论文要解决什么问题？为什么这个问题重要？]

### 方法概述
[用自己的话描述方法，不超过一段]

### 关键图表解读

对于每个重要的图表，请按以下格式输出：

**Figure X: [图标题]**

[这个图说明了什么，1-2句话]

\`\`\`
[用ASCII字符画复现图的内容，例如：]

        ┌──────────┐     ┌──────────┐     ┌──────────┐
        │  Input   │────▶│ Encoder  │────▶│  Output  │
        └──────────┘     └──────────┘     └──────────┘
              │                                 ▲
              │          ┌──────────┐          │
              └─────────▶│ Decoder  │──────────┘
                         └──────────┘
\`\`\`

**Table Y: [表标题]**

[这个表的关键发现]

\`\`\`
[用ASCII字符画复现表格，例如：]

+------------+--------+--------+--------+
| Method     | BLEU   | ROUGE  | F1     |
+------------+--------+--------+--------+
| Baseline   | 32.1   | 45.2   | 38.5   |
| Ours       | 45.3   | 58.7   | 51.2   |
| Ours+      | 48.2   | 61.3   | 54.1   |
+------------+--------+--------+--------+
\`\`\`

### 实验设置
- **数据集**:
- **基线方法**:
- **评估指标**:

### 主要结果
[结果总结，关键数字]

### 存疑点
- [ ] [不理解的点1]
- [ ] [不理解的点2]

### 待追读文献
- [ ] [重要参考文献1]
- [ ] [重要参考文献2]`;

const PAPER_PASS_3_PROMPT = `你是一位专业的学术论文阅读助手。这是第三轮阅读（深度理解）。

## 背景信息
之前的笔记：
{previous_notes}

## 任务
深入方法细节，构建数学框架。

## 输出要求
- 直接输出Markdown内容，不要包含任何开场白或说明性文字
- 不要使用<details>或<summary>标签
- 不要说"我已完成..."之类的话
- 数学公式使用 $...$ 或 $$...$$ 格式
- **重要**: 必须用ASCII字符画出完整的方法架构图和数据流程图

请直接输出以下Markdown格式：

---

## 深度解析

### 数学框架

**问题形式化**

设输入空间 $\\mathcal{X}$，输出空间 $\\mathcal{Y}$，目标是学习映射...
[具体问题定义]

**关键公式**

$$
[核心公式，使用 LaTeX 格式]
$$

### 方法架构图

用ASCII字符画出完整的系统架构：

\`\`\`
[画出方法的完整架构图，展示各组件之间的关系，例如：]

                         ┌─────────────────────────────────────┐
                         │           System Overview           │
                         └─────────────────────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
            ▼                             ▼                             ▼
    ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
    │   Module A    │           │   Module B    │           │   Module C    │
    │  (功能描述)   │──────────▶│  (功能描述)   │──────────▶│  (功能描述)   │
    └───────────────┘           └───────────────┘           └───────────────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          ▼
                                  ┌───────────────┐
                                  │    Output     │
                                  └───────────────┘
\`\`\`

### 数据流程图

\`\`\`
[画出数据如何在系统中流动，例如：]

Input Data ──▶ Preprocessing ──▶ Feature Extraction ──▶ Model ──▶ Output
     │              │                    │                │
     │              ▼                    ▼                ▼
     │         [处理细节]           [特征类型]        [模型结构]
     │
     └──▶ Augmentation ──┘
\`\`\`

### 方法深度解析

[详细方法描述，每个组件的作用，关键设计选择]

### 创新点分析

1. **[创新点1]**: [意义和价值]
2. **[创新点2]**: [意义和价值]

### 局限性与假设

- **隐含假设**: [论文未明说但必须成立的假设]
- **适用范围**: [方法在什么条件下有效]
- **潜在问题**: [可能的失效场景]

### 相关工作对比

- **[相关工作1]**: [区别和联系]
- **[相关工作2]**: [区别和联系]

### 未来工作想法

1. [想法1]
2. [想法2]

### 核心流程总结

用一段文字描述论文的核心流程：从输入到输出，经过哪些关键步骤，每步做什么。`;

// ============== PROMPT FOR CODE ANALYSIS (SINGLE ROUND) ==============

const CODE_ANALYSIS_PROMPT = `You are a code analysis assistant. Analyze the repository content provided below.

IMPORTANT RULES:
- DO NOT use any tools or function calls
- DO NOT try to read additional files
- ONLY analyze the content already provided in this prompt
- Respond in Chinese
- Keep your response under 500 words

Based on the file contents provided below, output your analysis in this format:

## 基本信息
- 语言/框架: [from README or code files]
- 入口文件: [main entry point]
- 核心目录: [key directories]

## 运行命令
- 安装: [installation command]
- 训练: [training command if ML project]

## 核心模型
- 模型类: [main model class and file]
- 关键实现: [1-2 key technical points]

## 复现注意
- [1-2 important notes for reproduction]`;

class AutoReaderService {
  constructor() {
    this.processingDir = config.reader?.tmpDir || path.join(__dirname, '..', '..', 'processing');
    this.ensureProcessingDir();
  }

  async ensureProcessingDir() {
    try {
      await fs.mkdir(this.processingDir, { recursive: true });
    } catch (e) {
      // Directory exists or cannot be created
    }
  }

  /**
   * Process a document in auto_reader mode (multi-pass)
   */
  async processDocument(item, options = {}) {
    const { documentId, s3Key, title } = item;
    // Use provided codeUrl if available (from request or document)
    let providedCodeUrl = item.codeUrl;
    let tempFilePath = null;
    const notesFilePath = path.join(this.processingDir, `${documentId}_notes.md`);

    try {
      await this.ensureProcessingDir();
      console.log(`[AutoReader] Starting multi-pass processing: ${title} (ID: ${documentId})`);

      // Step 1: Prepare PDF
      const pdfInfo = await pdfService.preparePdfForProcessing(s3Key);
      tempFilePath = pdfInfo.filePath;

      console.log(`[AutoReader] PDF prepared: ${pdfInfo.pageCount} pages`);

      // Initialize notes file with template header
      await this.initNotesFile(notesFilePath, title, documentId);

      // Step 2: Pass 1 - 鸟瞰扫描
      console.log('[AutoReader] === 第一轮：鸟瞰扫描 ===');
      const pass1Result = await this.executePass(tempFilePath, PAPER_PASS_1_PROMPT, notesFilePath, 1);

      // Parse pass 1 result and format according to template
      const pass1Data = this.parsePass1Result(pass1Result.text);
      await this.appendPass1Notes(notesFilePath, pass1Data, pass1Result.text);

      // Use detected code URL or provided one
      let hasCode = pass1Data.has_code || !!providedCodeUrl;
      let codeUrl = pass1Data.code_url || providedCodeUrl;

      // Step 3: Pass 2 - 内容理解
      console.log('[AutoReader] === 第二轮：内容理解 ===');
      const currentNotes = await fs.readFile(notesFilePath, 'utf-8');
      const pass2Prompt = PAPER_PASS_2_PROMPT.replace('{previous_notes}', currentNotes);
      const pass2Result = await this.executePass(tempFilePath, pass2Prompt, notesFilePath, 2);
      await this.appendToNotesFile(notesFilePath, '\n\n---\n\n## 第二轮笔记\n\n' + pass2Result.text);

      // Step 4: Pass 3 - 深度理解
      console.log('[AutoReader] === 第三轮：深度理解 ===');
      const updatedNotes = await fs.readFile(notesFilePath, 'utf-8');
      const pass3Prompt = PAPER_PASS_3_PROMPT.replace('{previous_notes}', updatedNotes);
      const pass3Result = await this.executePass(tempFilePath, pass3Prompt, notesFilePath, 3);
      await this.appendToNotesFile(notesFilePath, '\n\n' + pass3Result.text);

      // Step 5: Generate final paper notes (Mermaid diagrams render natively in markdown)
      let finalNotes = await fs.readFile(notesFilePath, 'utf-8');

      // Step 8: If has code, fetch README for basic code info (non-fatal)
      let codeReadme = null;
      if (hasCode && codeUrl) {
        console.log(`[AutoReader] === 获取代码README: ${codeUrl} ===`);
        try {
          codeReadme = await this.fetchGitHubReadme(codeUrl);
          if (codeReadme) {
            // Add code overview section to paper notes (without blockquote formatting)
            finalNotes += '\n\n---\n\n## 代码仓库概览\n\n';
            finalNotes += `**仓库地址**: [${codeUrl}](${codeUrl})\n\n`;
            finalNotes += codeReadme;
            finalNotes += '\n\n*点击"代码分析"按钮获取详细的代码解读*\n';
          }
        } catch (readmeError) {
          console.log(`[AutoReader] README fetch failed (non-fatal):`, readmeError.message);
        }
      }

      // Step 6: Upload paper notes to S3
      const paperNotesS3Key = await this.uploadNotesToS3(finalNotes, documentId, title, 'paper_notes');
      console.log(`[AutoReader] Paper notes uploaded to S3: ${paperNotesS3Key}`);
      console.log(`[AutoReader] Processing complete for: ${title}`);

      return {
        notesS3Key: paperNotesS3Key,
        codeNotesS3Key: null,  // Code notes only available via manual trigger
        pageCount: pdfInfo.pageCount,
        hasCode,
        codeUrl,
        readerMode: 'auto_reader',
      };
    } finally {
      // Cleanup
      if (tempFilePath) {
        await pdfService.cleanupTmpFile(tempFilePath);
      }
      try {
        await fs.unlink(notesFilePath);
      } catch (e) { /* ignore */ }
    }
  }

  /**
   * Parse pass 1 JSON result
   */
  parsePass1Result(text) {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
    } catch (e) {
      console.warn('[AutoReader] Could not parse pass 1 JSON:', e.message);
    }
    return {
      title: '',
      paper_type: '未知',
      venue: '未知',
      has_code: false,
      code_url: null,
      core_contribution: '',
      key_pages: '',
      skip_pages: '',
      key_figures: [],
      five_c: {
        category: '',
        context: '',
        correctness: '',
        contributions: '',
        clarity: '',
      },
      initial_impression: '',
    };
  }

  /**
   * Append pass 1 notes in template format
   */
  async appendPass1Notes(filePath, data, rawText) {
    const notes = `
## 概览

- **类型**: ${data.paper_type || '未知'} | ${data.venue || ''}
- **代码**: ${data.has_code ? `[${data.code_url || '有'}](${data.code_url || '#'})` : '无'}
- **关键图表**: ${data.key_figures?.length > 0 ? 'Figure ' + data.key_figures.join(', ') : '待分析'}

### 核心贡献

${data.core_contribution || ''}

### 5C 评估

- **Category**: ${data.five_c?.category || ''}
- **Context**: ${data.five_c?.context || ''}
- **Correctness**: ${data.five_c?.correctness || ''}
- **Contributions**: ${data.five_c?.contributions || ''}
- **Clarity**: ${data.five_c?.clarity || ''}

### 初步印象

${data.initial_impression || ''}

`;
    await this.appendToNotesFile(filePath, notes);
  }

  /**
   * Append reading log to notes (disabled - no longer needed)
   */
  async appendReadingLog(filePath) {
    // Reading log disabled - not useful for users
  }

  /**
   * Execute a single reading pass
   */
  async executePass(pdfPath, prompt, notesFilePath, passNumber) {
    console.log(`[AutoReader] Executing pass ${passNumber}...`);

    const result = await geminiCliService.readDocument(pdfPath, prompt);

    console.log(`[AutoReader] Pass ${passNumber} complete, output: ${result.text.length} chars`);

    return result;
  }

  /**
   * Initialize the notes file with template header
   */
  async initNotesFile(filePath, title, documentId) {
    const header = `# ${title}

`;
    await fs.writeFile(filePath, header, 'utf-8');
  }

  /**
   * Append content to notes file
   */
  async appendToNotesFile(filePath, content) {
    await fs.appendFile(filePath, content, 'utf-8');
  }

  /**
   * Extract excalidraw figures and convert to PNG
   */
  async extractAndConvertFigures(text, documentId) {
    const figures = [];
    // Match both naming conventions: excalidraw-name and excalidraw-paper_name/code_name
    const excalidrawPattern = /```excalidraw-(\w+)\s*([\s\S]*?)\s*```/g;
    let match;

    while ((match = excalidrawPattern.exec(text)) !== null) {
      const figureName = match[1];
      let figureJson = match[2].trim();

      // Try to parse as JSON
      try {
        // Sometimes the JSON is wrapped in code blocks
        if (figureJson.startsWith('{')) {
          const parsed = JSON.parse(figureJson);

          const excalidrawPath = path.join(this.processingDir, `${documentId}_${figureName}.excalidraw`);
          const pngPath = path.join(this.processingDir, `${documentId}_${figureName}.png`);

          await fs.writeFile(excalidrawPath, JSON.stringify(parsed, null, 2), 'utf-8');

          // Convert to PNG using the convert.py script
          const converted = await this.convertExcalidrawToPng(excalidrawPath, pngPath);

          figures.push({
            name: figureName,
            excalidrawPath,
            pngPath: converted ? pngPath : null,
            json: parsed,
          });
        }
      } catch (e) {
        console.warn(`[AutoReader] Could not parse excalidraw figure ${figureName}:`, e.message);
        figures.push({
          name: figureName,
          excalidrawPath: null,
          pngPath: null,
          json: null,
          error: e.message,
        });
      }
    }

    return figures;
  }

  /**
   * Convert excalidraw file to PNG
   */
  async convertExcalidrawToPng(excalidrawPath, pngPath) {
    return new Promise((resolve) => {
      const convertScript = path.join(__dirname, '..', '..', '..', 'docs', 'convert.py');

      const proc = spawn('python3', [convertScript, excalidrawPath, pngPath]);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[AutoReader] Converted figure: ${pngPath}`);
          resolve(true);
        } else {
          console.warn(`[AutoReader] Figure conversion failed: ${stderr}`);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        console.warn(`[AutoReader] Figure conversion error: ${err.message}`);
        resolve(false);
      });
    });
  }

  /**
   * Generate final paper notes with embedded figures
   */
  async generateFinalPaperNotes(notesFilePath, figures, title, documentId) {
    let notes = await fs.readFile(notesFilePath, 'utf-8');

    // Add figure references section (only for successful conversions)
    const successfulFigures = figures.filter(f => f.pngPath);
    if (successfulFigures.length > 0) {
      notes += '\n\n---\n\n## 图表\n\n';
      for (const figure of successfulFigures) {
        const figureTitle = this.getFigureTitle(figure.name);
        notes += `### ${figureTitle}\n\n`;
        notes += `![${figureTitle}](figures/${documentId}_${figure.name}.png)\n\n`;
      }
    }

    return notes;
  }

  /**
   * Get human-readable figure title
   */
  getFigureTitle(name) {
    const titles = {
      'paper_outline': '论文结构图',
      'paper_method': '方法流程图',
      'repo_structure': '仓库结构图',
      'code_method': '代码架构图',
      // Legacy names
      'outline': '论文大纲图',
      'method': '方法流程图',
      'structure': '代码架构图',
      'implementation': '实现流程图',
    };
    return titles[name] || name;
  }

  /**
   * Analyze code repository
   */
  async analyzeCodeRepository(codeUrl, documentId, title) {
    const repoDir = path.join(this.processingDir, `repo_${documentId}`);
    const codeNotesPath = path.join(this.processingDir, `${documentId}_code_notes.md`);

    try {
      // Clone repository (skip LFS)
      console.log(`[AutoReader] Cloning repository: ${codeUrl}`);
      await this.cloneRepository(codeUrl, repoDir);
      console.log(`[AutoReader] Repository cloned to: ${repoDir}`);

      const now = new Date();
      // Initialize code notes with template header (no blockquote)
      await fs.writeFile(codeNotesPath, `---
title: ${title} - 代码分析
document_id: ${documentId}
code_url: ${codeUrl}
generated_at: ${now.toISOString()}
---

# ${title} - 代码笔记

**仓库地址**: [${codeUrl}](${codeUrl})

`, 'utf-8');

      // Use Claude Code CLI for code analysis (single comprehensive round)
      console.log('[AutoReader] Using Claude Code CLI for code analysis');

      // Single round: Comprehensive analysis
      console.log('[AutoReader] === 代码分析 ===');
      const repoStructure = await this.getRepoStructure(repoDir);
      const analysisPrompt = CODE_ANALYSIS_PROMPT + '\n\n## 代码目录结构:\n```\n' + repoStructure + '\n```';
      const analysisResult = await claudeCodeService.analyzeRepository(repoDir, analysisPrompt);
      await this.appendToNotesFile(codeNotesPath, '---\n\n' + analysisResult.text);

      // Extract and convert code figures
      const allText = analysisResult.text;
      const codeFigures = await this.extractAndConvertFigures(allText, `${documentId}_code`);

      // Add reading log
      const dateStr = new Date().toISOString().split('T')[0];
      await this.appendToNotesFile(codeNotesPath, `
---

## 阅读日志

| 日期 | 备注 |
|-----|------|
| ${dateStr} | 自动处理完成 |
`);

      // Generate final code notes
      const finalCodeNotes = await this.generateFinalCodeNotes(codeNotesPath, codeFigures, title, documentId);

      return finalCodeNotes;
    } finally {
      // Cleanup repo directory
      try {
        await fs.rm(repoDir, { recursive: true, force: true });
      } catch (e) { /* ignore */ }
      try {
        await fs.unlink(codeNotesPath);
      } catch (e) { /* ignore */ }
    }
  }

  /**
   * Clone a repository (skip LFS)
   */
  async cloneRepository(url, targetDir) {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', [
        'clone',
        '--depth', '1',
        '--single-branch',
        url,
        targetDir,
      ], {
        env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' },
      });

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Git clone failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Get repository structure using tree command
   */
  async getRepoStructure(repoDir) {
    return new Promise((resolve) => {
      // Try tree first for better output
      const treeProc = spawn('tree', ['-L', '3', '--noreport'], {
        cwd: repoDir,
      });

      let treeOutput = '';
      let treeError = false;

      treeProc.stdout.on('data', (data) => {
        treeOutput += data.toString();
      });

      treeProc.on('error', () => {
        treeError = true;
      });

      treeProc.on('close', (code) => {
        if (code === 0 && !treeError && treeOutput) {
          resolve(treeOutput.substring(0, 5000));
          return;
        }

        // Fallback to find
        const proc = spawn('find', ['.', '-type', 'f', '(',
          '-name', '*.py', '-o',
          '-name', '*.js', '-o',
          '-name', '*.ts', '-o',
          '-name', '*.json', '-o',
          '-name', '*.yaml', '-o',
          '-name', '*.yml', '-o',
          '-name', '*.md', '-o',
          '-name', 'requirements*.txt',
          ')', '-not', '-path', '*/.*'], {
          cwd: repoDir,
        });

        let output = '';
        proc.stdout.on('data', (data) => {
          output += data.toString();
        });

        proc.on('close', () => {
          // Limit to first 100 files
          const files = output.trim().split('\n').slice(0, 100);
          resolve(files.join('\n'));
        });

        proc.on('error', () => {
          resolve('Could not read repository structure');
        });
      });
    });
  }

  /**
   * Fetch README from GitHub repository
   * @param {string} codeUrl - GitHub repository URL
   * @returns {Promise<string|null>} - README content in markdown
   */
  async fetchGitHubReadme(codeUrl) {
    try {
      // Parse GitHub URL to get owner/repo
      const match = codeUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        console.log(`[AutoReader] Not a GitHub URL: ${codeUrl}`);
        return null;
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');

      // Try to fetch README via GitHub API
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;

      const https = require('https');

      return new Promise((resolve) => {
        const req = https.get(apiUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'auto-researcher'
          },
          timeout: 10000
        }, (res) => {
          if (res.statusCode !== 200) {
            console.log(`[AutoReader] README fetch failed: ${res.statusCode}`);
            resolve(null);
            return;
          }

          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            // Truncate if too long
            const maxLen = 3000;
            if (data.length > maxLen) {
              data = data.substring(0, maxLen) + '\n\n... (README 已截断)';
            }
            resolve(data);
          });
        });

        req.on('error', (err) => {
          console.log(`[AutoReader] README fetch error: ${err.message}`);
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          console.log(`[AutoReader] README fetch timeout`);
          resolve(null);
        });
      });
    } catch (e) {
      console.log(`[AutoReader] README fetch exception: ${e.message}`);
      return null;
    }
  }


  /**
   * Generate final code notes with embedded figures
   */
  async generateFinalCodeNotes(notesFilePath, figures, title, documentId) {
    let notes = await fs.readFile(notesFilePath, 'utf-8');

    if (figures.length > 0) {
      notes += '\n\n---\n\n## 图表\n\n';
      for (const figure of figures) {
        const figureTitle = this.getFigureTitle(figure.name);
        if (figure.pngPath) {
          notes += `### ${figureTitle}\n\n`;
          notes += `![${figureTitle}](figures/${documentId}_code_${figure.name}.png)\n\n`;
        }
      }
    }

    return notes;
  }

  /**
   * Upload notes to S3
   */
  async uploadNotesToS3(notes, documentId, title, type) {
    const timestamp = Date.now();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const s3Key = `default_user/notes/${timestamp}-${documentId}-${sanitizedTitle}_${type}.md`;

    const buffer = Buffer.from(notes, 'utf-8');
    await s3Service.uploadBuffer(buffer, s3Key, 'text/markdown');

    return s3Key;
  }

  /**
   * Upload figure to S3
   */
  async uploadFigureToS3(pngPath, documentId, figureName) {
    try {
      const buffer = await fs.readFile(pngPath);
      const s3Key = `default_user/figures/${documentId}_${figureName}.png`;
      await s3Service.uploadBuffer(buffer, s3Key, 'image/png');
      return s3Key;
    } catch (e) {
      console.warn(`[AutoReader] Could not upload figure ${figureName}:`, e.message);
      return null;
    }
  }
}

module.exports = new AutoReaderService();
