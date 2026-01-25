const { spawn } = require('child_process');
const config = require('../config');
const path = require('path');
const fs = require('fs').promises;

// Default timeout for Claude Code CLI (10 minutes for Opus 4.5)
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// Maximum characters to include from each file (reduced for faster processing)
const MAX_FILE_CHARS = 5000;

/**
 * Claude Code CLI Service
 * Runs Claude Code in headless mode for code repository analysis
 */

/**
 * Check if Claude Code CLI is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  return new Promise((resolve) => {
    const claudePath = config.claudeCli?.path || 'claude';

    const proc = spawn(claudePath, ['--version'], {
      timeout: 5000,
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Read key repository files for context
 * @param {string} repoDir - Repository directory
 * @returns {Promise<string>} - Combined file contents
 */
async function readKeyFiles(repoDir) {
  const keyFiles = [
    'README.md',
    'README.rst',
    'README',
    'requirements.txt',
    'setup.py',
    'pyproject.toml',
    'package.json',
    'Cargo.toml',
    'go.mod',
  ];

  let context = '';

  for (const file of keyFiles) {
    try {
      const filePath = path.join(repoDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const truncated = content.substring(0, MAX_FILE_CHARS);
      context += `\n\n### File: ${file}\n\`\`\`\n${truncated}\n\`\`\``;
      if (content.length > MAX_FILE_CHARS) {
        context += `\n(truncated, original ${content.length} chars)`;
      }
    } catch (e) {
      // File doesn't exist, skip
    }
  }

  return context;
}

/**
 * Find Python/JS source files in the repository
 * @param {string} repoDir - Repository directory
 * @returns {Promise<string[]>} - List of source file paths
 */
async function findSourceFiles(repoDir) {
  return new Promise((resolve) => {
    const proc = spawn('find', [
      '.', '-type', 'f',
      '(', '-name', '*.py', '-o', '-name', '*.js', '-o', '-name', '*.ts', ')',
      '-not', '-path', '*/.*',
      '-not', '-path', '*node_modules*',
      '-not', '-path', '*__pycache__*',
    ], { cwd: repoDir });

    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.on('close', () => {
      const files = output.trim().split('\n').filter(Boolean).slice(0, 20);
      resolve(files);
    });
    proc.on('error', () => { resolve([]); });
  });
}

/**
 * Read specific source files (up to limit)
 * @param {string} repoDir - Repository directory
 * @param {string[]} files - List of files to read
 * @param {number} totalLimit - Total character limit
 * @returns {Promise<string>} - Combined file contents
 */
async function readSourceFiles(repoDir, files, totalLimit = 10000) {
  let context = '';
  let totalChars = 0;

  for (const file of files) {
    if (totalChars >= totalLimit) break;

    try {
      const filePath = path.join(repoDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const remaining = totalLimit - totalChars;
      const truncated = content.substring(0, Math.min(content.length, remaining, 3000));
      context += `\n\n### File: ${file}\n\`\`\`\n${truncated}\n\`\`\``;
      totalChars += truncated.length;
    } catch (e) {
      // Skip files that can't be read
    }
  }

  return context;
}

/**
 * Analyze a code repository using Claude Code CLI
 * Uses workaround: reads files manually and passes content in prompt with tools disabled
 * (Due to Claude Code CLI bug with duplicate tool_use IDs)
 * @param {string} repoDir - Path to the cloned repository
 * @param {string} prompt - The analysis prompt
 * @param {object} options - Additional options
 * @returns {Promise<{text: string, raw: object}>}
 */
async function analyzeRepository(repoDir, prompt, options = {}) {
  const claudePath = config.claudeCli?.path || 'claude';
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const model = config.claudeCli?.model || '';  // Empty = use default (Opus 4.5)

  // Read key files and source files to include in prompt
  console.log(`[Claude Code] Reading repository files from: ${repoDir}`);
  const keyFilesContent = await readKeyFiles(repoDir);
  const sourceFiles = await findSourceFiles(repoDir);
  const sourceFilesContent = await readSourceFiles(repoDir, sourceFiles);

  // Build full prompt with file contents
  const fullPrompt = `${prompt}

## 仓库文件内容

以下是仓库中的关键文件内容，请基于这些内容进行分析：
${keyFilesContent}

## 源代码文件
${sourceFilesContent}`;

  console.log(`[Claude Code] Prompt size: ${fullPrompt.length} chars`);

  return new Promise((resolve, reject) => {
    // Claude Code CLI with tools disabled to avoid tool_use ID bug
    const args = [
      '-p', fullPrompt,
      '--print',
      '--tools', '',  // Disable tools to avoid duplicate tool_use ID bug
    ];

    // Only add model flag if specified
    if (model) {
      args.push('--model', model);
    }

    console.log(`[Claude Code] Running in: ${repoDir} with model: ${model || 'default (Opus 4.5)'}`);

    // Build environment with API key if available
    const spawnEnv = {
      ...process.env,
      CI: 'true',
    };

    // Pass ANTHROPIC_API_KEY if configured (for authentication)
    if (config.claudeCli?.apiKey) {
      spawnEnv.ANTHROPIC_API_KEY = config.claudeCli.apiKey;
    }

    const proc = spawn(claudePath, args, {
      cwd: repoDir,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      env: spawnEnv,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 || stdout.length > 0) {
        resolve({
          text: stdout.trim(),
          raw: null,
          exitCode: code,
        });
      } else {
        reject(new Error(`Claude Code exited with code ${code}: ${stderr || 'No output'}`));
      }
    });

    proc.on('error', (error) => {
      if (error.code === 'ETIMEDOUT') {
        reject(new Error('Claude Code timeout'));
      } else if (error.code === 'ENOENT') {
        reject(new Error(`Claude Code not found at path: ${claudePath}`));
      } else {
        reject(error);
      }
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude Code timeout'));
    }, timeoutMs);

    proc.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

/**
 * Analyze code with file context
 * @param {string} repoDir - Repository directory
 * @param {string} prompt - Analysis prompt
 * @param {string[]} contextFiles - List of files to read for context
 * @param {object} options - Additional options
 * @returns {Promise<{text: string}>}
 */
async function analyzeWithContext(repoDir, prompt, contextFiles = [], options = {}) {
  // Build prompt with file references
  let fullPrompt = prompt;

  if (contextFiles.length > 0) {
    fullPrompt += '\n\n请特别关注以下文件：\n';
    for (const file of contextFiles) {
      fullPrompt += `- ${file}\n`;
    }
  }

  return analyzeRepository(repoDir, fullPrompt, options);
}

/**
 * Run multi-round code analysis
 * Each round builds on the previous notes
 * @param {string} repoDir - Repository directory
 * @param {object[]} rounds - Array of {prompt, name} for each round
 * @param {object} options - Additional options
 * @returns {Promise<{rounds: object[], finalNotes: string}>}
 */
async function multiRoundAnalysis(repoDir, rounds, options = {}) {
  const results = [];
  let accumulatedNotes = '';

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    console.log(`[Claude Code] Round ${i + 1}/${rounds.length}: ${round.name}`);

    // Inject previous notes into prompt if placeholder exists
    let prompt = round.prompt;
    if (prompt.includes('{previous_notes}')) {
      prompt = prompt.replace('{previous_notes}', accumulatedNotes || '(这是第一轮分析)');
    }

    try {
      const result = await analyzeRepository(repoDir, prompt, {
        ...options,
        // Allow read-only tools for code analysis
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
      });

      results.push({
        name: round.name,
        text: result.text,
        success: true,
      });

      accumulatedNotes += `\n\n## ${round.name}\n\n${result.text}`;
    } catch (error) {
      console.error(`[Claude Code] Round ${i + 1} failed:`, error.message);
      results.push({
        name: round.name,
        text: `分析失败: ${error.message}`,
        success: false,
        error: error.message,
      });
    }
  }

  return {
    rounds: results,
    finalNotes: accumulatedNotes,
  };
}

module.exports = {
  isAvailable,
  analyzeRepository,
  analyzeWithContext,
  multiRoundAnalysis,
};
