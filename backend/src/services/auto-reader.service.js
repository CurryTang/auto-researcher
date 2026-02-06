const { getDb } = require('../db');
const config = require('../config');
const pdfService = require('./pdf.service');
const geminiCliService = require('./gemini-cli.service');
const codexCliService = require('./codex-cli.service');
const googleApiService = require('./google-api.service');
const claudeCodeService = require('./claude-code.service');
const s3Service = require('./s3.service');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { cleanLLMResponse } = require('../utils/clean-llm-response');

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

/**
 * 新的3阶段阅读模板:
 *
 * Prompt 1: 三分钟综述 - 快速理解论文要点
 *   - 领域：研究领域和子方向
 *   - 问题：解决什么问题，为什么重要
 *   - 贡献：核心贡献点
 *   - 数据：使用的数据集/实验环境
 *   - 结果：主要结论和数字
 *
 * Prompt 2: 方法深挖 + 审稿人模式提问
 *   - 方法详细拆解
 *   - 以审稿人视角提出质疑
 *   - 关键图表分析
 *
 * Prompt 3: 第一性原理理论框架 + 有效性分析 + 下一步
 *   - 从第一性原理构建理论框架
 *   - 分析方法的有效性边界
 *   - 探索改进方向和下一步
 */

const PAPER_PASS_1_PROMPT = `你是一位资深的学术论文阅读专家。请在3分钟内快速完成对这篇论文的概览。

## 任务：三分钟综述

快速阅读标题、摘要、引言第一段、结论，以及扫描章节标题和关键图表标题。

## 输出要求
- 只输出JSON代码块，不要包含任何开场白或说明性文字
- 简洁精准，每项不超过2句话

请直接按以下JSON格式输出：

\`\`\`json
{
  "title": "论文完整标题",
  "paper_type": "实证/理论/系统/综述",
  "venue": "发表venue（如果能识别）",
  "has_code": true,
  "code_url": "https://github.com/... 或 null",

  "三分钟综述": {
    "领域": "研究属于什么领域？什么子方向？",
    "问题": "论文要解决什么问题？为什么这个问题重要/困难？",
    "贡献": "核心贡献是什么？（1-3点）",
    "数据": "用了什么数据集/实验环境？规模如何？",
    "结果": "主要结论是什么？关键数字（如准确率提升X%）"
  },

  "key_figures": [1, 3, 5],
  "key_pages": "如 p3-5方法, p6-8实验",
  "initial_verdict": "值得深入/快速跳过/待定，并说明原因"
}
\`\`\``;

const PAPER_PASS_2_PROMPT = `你是一位资深的学术论文审稿人。请深入分析这篇论文的方法，并以审稿人的严格视角提出质疑。

## 背景信息
第一轮笔记：
{previous_notes}

## 任务：方法深挖 + 审稿人模式提问

仔细阅读方法部分、实验部分和关键图表。以审稿人的批判性思维分析论文。

## 输出要求
- 直接输出Markdown内容，不要包含任何开场白
- 不要使用<details>或<summary>标签
- **重要**: 必须为核心方法绘制清晰的架构图

请直接输出以下Markdown格式：

---

## 方法深挖

### 方法拆解

将论文方法分解为清晰的步骤：

**Step 1: [步骤名称]**
- 输入：[什么数据]
- 操作：[具体做什么]
- 输出：[产生什么]

**Step 2: [步骤名称]**
...

### 核心技术图解

\`\`\`mermaid
flowchart TB
    subgraph 输入["输入"]
        A[原始数据]
    end
    subgraph 核心方法["核心方法"]
        B[模块1]
        C[模块2]
        D[模块3]
    end
    subgraph 输出["输出"]
        E[结果]
    end
    A --> B --> C --> D --> E
\`\`\`

### 关键设计选择
- **为什么选择X而不是Y？** [分析]
- **这个设计的trade-off是什么？** [分析]

---

## 审稿人模式：批判性提问

扮演一个严格的审稿人，对论文提出质疑：

### 方法层面的质疑
1. **[质疑1]**: [具体问题]
   - 论文的回答/解释：[如果有]
   - 我的评估：[是否充分]

2. **[质疑2]**: [具体问题]
   ...

### 实验层面的质疑
1. **基线选择是否合理？** [分析]
2. **数据集是否有bias？** [分析]
3. **评估指标是否全面？** [分析]

### 论文未回答的问题
- [ ] [问题1]
- [ ] [问题2]
- [ ] [问题3]

---

## 实验结果分析

### 主要实验结果

复现关键结果表格：
| Method | Metric1 | Metric2 | Metric3 |
|--------|---------|---------|---------|
| Baseline1 | - | - | - |
| Baseline2 | - | - | - |
| **Ours** | **-** | **-** | **-** |

### 消融实验解读
[每个消融实验说明了什么？哪个组件贡献最大？]

### 结果的可信度评估
- [ ] 是否有多次运行的variance报告？
- [ ] 是否有统计显著性检验？
- [ ] 实验规模是否足够？`;

const PAPER_PASS_3_PROMPT = `你是一位追求第一性原理的理论研究者。请从基础原理出发，构建对这篇论文的深度理解。

## 背景信息
之前的笔记：
{previous_notes}

## 任务：第一性原理分析 + 有效性边界 + 下一步

从最基本的原理出发理解论文，分析方法的有效性边界，并思考改进方向。

## 输出要求
- 直接输出Markdown内容，不要包含任何开场白
- 数学公式使用 $...$ 或 $$...$$ 格式
- 不要使用<details>或<summary>标签

请直接输出以下Markdown格式：

---

## 第一性原理分析

### 从第一性原理看问题

**问题的本质是什么？**
[不用论文的术语，用最基础的语言描述问题]

**为什么这个问题困难？**
[从信息论/计算复杂度/统计学习等基础理论分析]

### 理论框架构建

**问题形式化**

设 $\\mathcal{X}$ 为输入空间，$\\mathcal{Y}$ 为输出空间...

$$
[核心目标函数或优化问题]
$$

**论文方法的本质**

[用一句话概括：论文本质上是在做什么？]

**方法的理论依据**

论文方法有效的前提假设是：
1. [假设1]
2. [假设2]

这些假设对应的理论依据是...

---

## 有效性分析

### 方法在什么条件下有效？

\`\`\`mermaid
graph LR
    subgraph 有效条件
        A[条件1: ...]
        B[条件2: ...]
        C[条件3: ...]
    end
    subgraph 失效场景
        D[场景1: ...]
        E[场景2: ...]
    end
\`\`\`

### 有效性边界

| 维度 | 有效区间 | 边界情况 | 完全失效 |
|------|----------|----------|----------|
| 数据规模 | - | - | - |
| 数据分布 | - | - | - |
| 计算资源 | - | - | - |
| 场景复杂度 | - | - | - |

### 与其他方法的理论对比

**方法A vs 本文方法**
- 假设差异：[...]
- 适用场景差异：[...]
- 理论保证差异：[...]

---

## 下一步：改进方向

### 短期改进（工程优化）
1. **[改进点1]**: [具体建议]
2. **[改进点2]**: [具体建议]

### 中期改进（方法增强）
1. **[研究方向1]**: [为什么值得探索]
2. **[研究方向2]**: [为什么值得探索]

### 长期愿景（理论突破）
[如果解决了什么理论问题，这个领域会有质的飞跃？]

### 我的研究启发

基于这篇论文，对我自己研究的启发：
- [启发1]
- [启发2]

---

## 总结

### 一句话总结
[用一句话概括论文：谁用什么方法解决了什么问题，核心idea是什么]

### 论文定位图

\`\`\`mermaid
graph TB
    subgraph 领域图谱
        A[传统方法] --> B[论文方法]
        B --> C[可能的未来]
        D[相关方向1] -.-> B
        E[相关方向2] -.-> B
    end
\`\`\`

### 值得关注的后续论文
- [ ] [论文1] - [关注原因]
- [ ] [论文2] - [关注原因]`;

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
    const { documentId, s3Key, title, analysisProvider } = item;
    // Use provided codeUrl if available (from request or document)
    let providedCodeUrl = item.codeUrl;
    let tempFilePath = null;
    const notesFilePath = path.join(this.processingDir, `${documentId}_notes.md`);
    // Resolve which provider service to use
    this._currentProvider = this._resolveProvider(analysisProvider);

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
      await this.appendToNotesFile(notesFilePath, '\n\n---\n\n## 第二轮笔记\n\n' + cleanLLMResponse(pass2Result.text));

      // Step 4: Pass 3 - 深度理解
      console.log('[AutoReader] === 第三轮：深度理解 ===');
      const updatedNotes = await fs.readFile(notesFilePath, 'utf-8');
      const pass3Prompt = PAPER_PASS_3_PROMPT.replace('{previous_notes}', updatedNotes);
      const pass3Result = await this.executePass(tempFilePath, pass3Prompt, notesFilePath, 3);
      await this.appendToNotesFile(notesFilePath, '\n\n' + cleanLLMResponse(pass3Result.text));

      // Step 5: Generate final paper notes (Mermaid diagrams render natively in markdown)
      let finalNotes = await fs.readFile(notesFilePath, 'utf-8');

      // Step 8: If has code, fetch README and summarize it (non-fatal)
      if (hasCode && codeUrl) {
        console.log(`[AutoReader] === 获取并摘要代码README: ${codeUrl} ===`);
        try {
          const codeReadme = await this.fetchGitHubReadme(codeUrl);
          if (codeReadme) {
            // Summarize README using Gemini CLI
            const readmeSummary = await this.summarizeReadme(codeReadme, codeUrl, title);
            if (readmeSummary) {
              finalNotes += '\n\n---\n\n## 代码仓库概览\n\n';
              finalNotes += `**仓库地址**: [${codeUrl}](${codeUrl})\n\n`;
              finalNotes += readmeSummary;
              finalNotes += '\n\n*点击"代码分析"按钮获取详细的代码解读*\n';
            }
          }
        } catch (readmeError) {
          console.log(`[AutoReader] README processing failed (non-fatal):`, readmeError.message);
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
   * Parse pass 1 JSON result (new 3-stage format)
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
      '三分钟综述': {
        '领域': '',
        '问题': '',
        '贡献': '',
        '数据': '',
        '结果': '',
      },
      key_figures: [],
      key_pages: '',
      initial_verdict: '',
    };
  }

  /**
   * Append pass 1 notes in new 3-stage template format
   */
  async appendPass1Notes(filePath, data, rawText) {
    const summary = data['三分钟综述'] || {};
    const notes = `
## 概览

- **类型**: ${data.paper_type || '未知'} | ${data.venue || ''}
- **代码**: ${data.has_code ? `[${data.code_url || '有'}](${data.code_url || '#'})` : '无'}
- **关键图表**: ${data.key_figures?.length > 0 ? 'Figure ' + data.key_figures.join(', ') : '待分析'}
- **重点页面**: ${data.key_pages || ''}

---

## 三分钟综述

### 领域
${summary['领域'] || ''}

### 问题
${summary['问题'] || ''}

### 贡献
${summary['贡献'] || ''}

### 数据
${summary['数据'] || ''}

### 结果
${summary['结果'] || ''}

---

### 初步判断

${data.initial_verdict || ''}

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
  /**
   * Resolve provider service from provider name
   */
  _resolveProvider(providerName) {
    switch (providerName) {
      case 'codex-cli': return codexCliService;
      case 'google-api': return googleApiService;
      case 'gemini-cli':
      default: return geminiCliService;
    }
  }

  async executePass(pdfPath, prompt, notesFilePath, passNumber) {
    const provider = this._currentProvider || geminiCliService;
    const providerName = this._currentProvider === codexCliService ? 'Codex CLI'
      : this._currentProvider === googleApiService ? 'Google API' : 'Gemini CLI';
    console.log(`[AutoReader] Executing pass ${passNumber} with ${providerName}...`);

    const result = await provider.readDocument(pdfPath, prompt);

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
   * Summarize README content using Gemini CLI
   * @param {string} readmeContent - Raw README content
   * @param {string} codeUrl - Repository URL
   * @param {string} paperTitle - Paper title for context
   * @returns {Promise<string|null>} - Summarized README
   */
  async summarizeReadme(readmeContent, codeUrl, paperTitle) {
    try {
      const prompt = `你是一位代码仓库分析专家。请根据以下README内容，为这个与论文"${paperTitle}"相关的代码仓库生成一个简洁但信息丰富的概览。

## README内容：
${readmeContent}

## 输出要求：
- 用中文输出
- 直接输出Markdown内容，不要包含任何开场白
- 提取最关键的信息，不要冗余

请按以下格式输出：

### 项目简介
[1-2句话描述项目是什么，解决什么问题]

### 核心特性
- [特性1]
- [特性2]
- [特性3]

### 快速开始
\`\`\`bash
[最简单的安装和运行命令，如果README中有的话]
\`\`\`

### 架构概览
\`\`\`
[用ASCII字符画出项目的核心架构，根据README内容推断]
例如:
Input --> Module A --> Module B --> Output
           |              |
           +-- SubModule --+
\`\`\`

### 与论文的关系
[说明这个代码仓库与论文的对应关系，哪些部分实现了论文中的方法]`;

      // Write prompt to temp file
      const promptPath = path.join(this.processingDir, `readme_prompt_${Date.now()}.txt`);
      await fs.writeFile(promptPath, prompt, 'utf-8');

      try {
        // Use current provider to summarize
        const provider = this._currentProvider || geminiCliService;
        const result = provider.runWithPromptFile
          ? await provider.runWithPromptFile(promptPath, { timeout: 60000 })
          : await provider.readMarkdown(prompt, '', { timeout: 60000 });
        return cleanLLMResponse(result.text);
      } finally {
        // Cleanup prompt file
        try {
          await fs.unlink(promptPath);
        } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.log(`[AutoReader] README summarization failed: ${error.message}`);
      // Fall back to truncated raw README
      return readmeContent.length > 1500
        ? readmeContent.substring(0, 1500) + '\n\n... (README 已截断)'
        : readmeContent;
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
