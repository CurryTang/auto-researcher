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

## 需要收集的信息

请按以下JSON格式输出：

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

请输出以下Markdown格式：

### 核心问题
[论文要解决什么问题？为什么这个问题重要？]

### 方法概述
[用自己的话描述方法，不超过一段]

### 关键图表解读

**Figure X**: [这个图说明了什么]

**Table Y**: [这个表的关键发现]

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
深入方法细节，构建数学框架，生成可视化图表。

请输出以下Markdown格式：

### 数学框架

#### 问题形式化
设输入空间 $\\mathcal{X}$，输出空间 $\\mathcal{Y}$，目标是学习映射...
[具体问题定义]

#### 方法形式化
[用数学语言重新表述方法]

#### 关键公式
$$
[核心公式]
$$

### 方法深度解析
[详细方法描述，每个组件的作用，关键设计选择]

### 创新点分析
1. **[创新点1]**: [意义和价值]
2. **[创新点2]**: [意义和价值]

### 局限性与假设
- **隐含假设**: [论文未明说但必须成立的假设]
- **适用范围**: [方法在什么条件下有效]
- **潜在问题**: [可能的失效场景]

### 与其他工作的联系

| 相关工作 | 区别 | 联系 |
|---------|------|------|
| [工作1] | | |
| [工作2] | | |

### 未来工作想法
1. [想法1]
2. [想法2]

### 论文结构图 (Excalidraw JSON)
请生成一个展示论文整体结构和逻辑流程的图：问题定义 → 方法核心模块 → 实验验证 → 主要结论

\`\`\`excalidraw-paper_outline
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    // 在这里生成完整的Excalidraw元素JSON
  ]
}
\`\`\`

### 方法流程图 (Excalidraw JSON)
请生成一个详细展示方法的图：输入 → 每个处理步骤 → 中间表示 → 输出

\`\`\`excalidraw-paper_method
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    // 在这里生成完整的Excalidraw元素JSON
  ]
}
\`\`\``;

// ============== PROMPTS FOR CODE ANALYSIS ==============

const CODE_ROUND_1_PROMPT = `你是代码阅读助手。分析这个仓库的基本结构。

任务：
1. 读README.md了解项目
2. 找出入口文件和核心目录

输出格式：
### 基本信息
- 语言/框架:
- 入口文件:
- 核心目录:

### 运行命令
- 安装:
- 训练:

### 主要依赖
- (列出3-5个关键依赖)`;

const CODE_ROUND_2_PROMPT = `基于上轮分析，找出数据处理逻辑。

{previous_notes}

任务：找出数据加载和预处理代码

输出格式：
### 数据处理
- 数据集类: (类名和文件路径)
- 数据格式: (输入数据的格式)

### 模型接口
- 输入: (Tensor形状)
- 输出: (Tensor形状)

### 关键配置
- (列出重要的超参数)`;

const CODE_ROUND_3_PROMPT = `基于上轮分析，深入核心模型实现。

{previous_notes}

任务：找出核心模型类的实现细节

输出格式：
### 核心模型
- 类名: (文件路径)
- forward方法: (简述做什么)

### 关键实现
- (描述1-2个关键技术点)

### 复现注意
- (列出复现时需要注意的点)`;

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
      await this.appendToNotesFile(notesFilePath, '\n\n---\n\n## 第三轮笔记\n\n' + pass3Result.text);

      // Step 5: Extract and convert excalidraw figures
      const figures = await this.extractAndConvertFigures(pass3Result.text, documentId);

      // Step 6: Add reading log
      await this.appendReadingLog(notesFilePath);

      // Step 7: Generate final paper_notes.md with embedded figures
      const finalNotes = await this.generateFinalPaperNotes(notesFilePath, figures, title, documentId);

      // Step 8: Upload paper notes to S3 FIRST (before code analysis which can fail)
      const paperNotesS3Key = await this.uploadNotesToS3(finalNotes, documentId, title, 'paper_notes');
      console.log(`[AutoReader] Paper notes uploaded to S3: ${paperNotesS3Key}`);

      // Upload paper figures to S3
      for (const figure of figures) {
        if (figure.pngPath) {
          await this.uploadFigureToS3(figure.pngPath, documentId, figure.name);
        }
      }

      // Step 9: If has code, analyze it (non-fatal - paper notes already saved)
      let codeNotes = null;
      let codeNotesS3Key = null;
      if (hasCode && codeUrl) {
        console.log(`[AutoReader] === 分析代码仓库: ${codeUrl} ===`);
        try {
          codeNotes = await this.analyzeCodeRepository(codeUrl, documentId, title);
          if (codeNotes) {
            codeNotesS3Key = await this.uploadNotesToS3(codeNotes, documentId, title, 'code_notes');
            console.log(`[AutoReader] Code notes uploaded to S3: ${codeNotesS3Key}`);
          }
        } catch (codeError) {
          console.log(`[AutoReader] Code analysis failed (non-fatal):`, codeError);
          console.log(`[AutoReader] Error message: ${codeError?.message || codeError}`);
          // Continue without code notes - paper notes are already saved
        }
      }

      console.log(`[AutoReader] Processing complete for: ${title}`);

      return {
        notesS3Key: paperNotesS3Key,
        codeNotesS3Key,
        pageCount: pdfInfo.pageCount,
        hasCode,
        codeUrl,
        figures: figures.map(f => f.name),
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
## 元信息

| 属性 | 内容 |
|-----|------|
| 论文类型 | ${data.paper_type || '未知'} |
| 发表venue | ${data.venue || '未知'} |
| 是否有代码 | ${data.has_code ? '有' : '无'} |
| 代码链接 | ${data.code_url || '无'} |
| 关键页面 | ${data.key_pages || ''} |
| 可跳过页面 | ${data.skip_pages || ''} |

### 5C评估

- **Category**: ${data.five_c?.category || ''}
- **Context**: ${data.five_c?.context || ''}
- **Correctness**: ${data.five_c?.correctness || ''}
- **Contributions**: ${data.five_c?.contributions || ''}
- **Clarity**: ${data.five_c?.clarity || ''}

---

## 第一轮笔记

### 核心贡献
${data.core_contribution || ''}

### 主要图表
${data.key_figures?.length > 0 ? '关键图表: Figure ' + data.key_figures.join(', ') : '待分析'}

### 初步印象
${data.initial_impression || ''}

<details>
<summary>原始输出</summary>

${rawText}

</details>
`;
    await this.appendToNotesFile(filePath, notes);
  }

  /**
   * Append reading log to notes
   */
  async appendReadingLog(filePath) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const log = `
---

## 阅读日志

| 日期 | 轮次 | 耗时 | 备注 |
|-----|------|------|------|
| ${dateStr} | 1-3 | Auto | 自动处理完成 |
`;
    await this.appendToNotesFile(filePath, log);
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
    const now = new Date();
    const header = `---
title: ${title}
document_id: ${documentId}
mode: auto_reader
generated_at: ${now.toISOString()}
language: zh-CN
---

# ${title}

> 阅读状态：处理中
> 最后更新：${now.toISOString()}
> 论文链接：[待填写]
> 代码链接：[待分析]

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

    // Update reading status
    notes = notes.replace('阅读状态：处理中', '阅读状态：第3轮完成');

    // Add figure references section
    if (figures.length > 0) {
      notes += '\n\n---\n\n## 图表\n\n';
      for (const figure of figures) {
        const figureTitle = this.getFigureTitle(figure.name);
        if (figure.pngPath) {
          notes += `### ${figureTitle}\n\n`;
          notes += `![${figureTitle}](figures/${documentId}_${figure.name}.png)\n\n`;
        } else {
          notes += `### ${figureTitle}\n\n`;
          notes += `*图表生成失败*\n\n`;
        }
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
      // Initialize code notes with template header
      await fs.writeFile(codeNotesPath, `---
title: ${title} - 代码分析
document_id: ${documentId}
code_url: ${codeUrl}
generated_at: ${now.toISOString()}
---

# ${title} - 代码笔记

> 阅读状态：处理中
> 最后更新：${now.toISOString()}
> 仓库地址：${codeUrl}
> 对应论文：${title}

`, 'utf-8');

      // Use Claude Code CLI for code analysis (3 rounds)
      console.log('[AutoReader] Using Claude Code CLI for code analysis');

      // Round 1: 仓库概览 (with repo structure context)
      console.log('[AutoReader] === 第一轮：仓库概览 ===');
      const repoStructure = await this.getRepoStructure(repoDir);
      const round1Prompt = CODE_ROUND_1_PROMPT + '\n\n## 代码目录结构:\n```\n' + repoStructure + '\n```';
      const round1Result = await claudeCodeService.analyzeRepository(repoDir, round1Prompt);
      await this.appendToNotesFile(codeNotesPath, '---\n\n## 第一轮：仓库概览\n\n' + round1Result.text);

      // Round 2: 数据接口
      console.log('[AutoReader] === 第二轮：数据接口 ===');
      const currentCodeNotes = await fs.readFile(codeNotesPath, 'utf-8');
      const round2Prompt = CODE_ROUND_2_PROMPT.replace('{previous_notes}', currentCodeNotes);
      const round2Result = await claudeCodeService.analyzeRepository(repoDir, round2Prompt);
      await this.appendToNotesFile(codeNotesPath, '\n\n---\n\n## 第二轮：数据接口\n\n' + round2Result.text);

      // Round 3: 核心实现
      console.log('[AutoReader] === 第三轮：核心实现 ===');
      const updatedCodeNotes = await fs.readFile(codeNotesPath, 'utf-8');
      const round3Prompt = CODE_ROUND_3_PROMPT.replace('{previous_notes}', updatedCodeNotes);
      const round3Result = await claudeCodeService.analyzeRepository(repoDir, round3Prompt);
      await this.appendToNotesFile(codeNotesPath, '\n\n---\n\n## 第三轮：核心实现\n\n' + round3Result.text);

      // Extract and convert code figures
      const allText = round1Result.text + round3Result.text;
      const codeFigures = await this.extractAndConvertFigures(allText, `${documentId}_code`);

      // Add reading log
      const dateStr = new Date().toISOString().split('T')[0];
      await this.appendToNotesFile(codeNotesPath, `
---

## 阅读日志

| 日期 | 轮次 | 耗时 | 备注 |
|-----|------|------|------|
| ${dateStr} | 1-3 | Auto | 自动处理完成 |
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
   * Generate final code notes with embedded figures
   */
  async generateFinalCodeNotes(notesFilePath, figures, title, documentId) {
    let notes = await fs.readFile(notesFilePath, 'utf-8');

    // Update reading status
    notes = notes.replace('阅读状态：处理中', '阅读状态：第3轮完成');

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
