const { spawn } = require('child_process');
const config = require('../config');
const path = require('path');

// Default timeout for Claude Code CLI (10 minutes per round - needs time for multiple file reads)
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

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
 * Analyze a code repository using Claude Code CLI
 * @param {string} repoDir - Path to the cloned repository
 * @param {string} prompt - The analysis prompt
 * @param {object} options - Additional options
 * @returns {Promise<{text: string, raw: object}>}
 */
async function analyzeRepository(repoDir, prompt, options = {}) {
  const claudePath = config.claudeCli?.path || 'claude';
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const model = config.claudeCli?.model || 'claude-haiku-4-5';

  return new Promise((resolve, reject) => {
    // Claude Code CLI uses -p for prompt and --print for non-interactive output
    const args = [
      '-p', prompt,
      '--print',  // Non-interactive, prints result and exits
      '--model', model,  // Use specified model
    ];

    // Add --allowedTools if specified (for restricting tool usage)
    if (options.allowedTools) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    console.log(`[Claude Code] Running in: ${repoDir} with model: ${model}`);
    console.log(`[Claude Code] Prompt: ${prompt.substring(0, 100)}...`);

    const proc = spawn(claudePath, args, {
      cwd: repoDir,  // Run in the repository directory
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      env: {
        ...process.env,
        // Ensure non-interactive mode
        CI: 'true',
      },
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
        // Claude Code may exit with non-zero but still produce output
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

    // Handle timeout
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
