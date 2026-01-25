const { spawn } = require('child_process');
const config = require('../config');

// Default timeout for Gemini CLI (5 minutes)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Check if Gemini CLI is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  return new Promise((resolve) => {
    const geminiPath = config.geminiCli?.path || 'gemini';

    const proc = spawn(geminiPath, ['--version'], {
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
 * Read a document using Gemini CLI
 * @param {string} filePath - Path to the PDF file
 * @param {string} prompt - The prompt to use
 * @param {object} options - Additional options
 * @returns {Promise<{text: string, raw: object}>}
 */
async function readDocument(filePath, prompt, options = {}) {
  const geminiPath = config.geminiCli?.path || 'gemini';
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const model = config.geminiCli?.model || 'gemini-2.5-flash';

  return new Promise((resolve, reject) => {
    // Build the full prompt with file reference using @ syntax
    // Gemini CLI uses @filepath to attach files to the prompt
    const fullPrompt = `${prompt}\n\n@${filePath}`;

    // Use positional prompt with model flag
    const args = ['-m', model, fullPrompt];

    console.log(`[Gemini CLI] Running: ${geminiPath} -m ${model} with prompt referencing: ${filePath}`);

    const proc = spawn(geminiPath, args, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
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
      if (code === 0) {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(stdout);
          resolve({
            text: parsed.text || parsed.response || parsed.content || stdout,
            raw: parsed,
          });
        } catch {
          // Not JSON, return as plain text
          resolve({
            text: stdout.trim(),
            raw: null,
          });
        }
      } else {
        reject(new Error(`Gemini CLI exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (error) => {
      if (error.code === 'ETIMEDOUT') {
        reject(new Error('Gemini CLI timeout'));
      } else if (error.code === 'ENOENT') {
        reject(new Error(`Gemini CLI not found at path: ${geminiPath}`));
      } else {
        reject(error);
      }
    });

    // Handle timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Gemini CLI timeout'));
    }, timeoutMs);
  });
}

/**
 * Read a document with a system prompt and user prompt
 * @param {string} filePath - Path to the PDF file
 * @param {string} systemPrompt - System prompt for context
 * @param {string} userPrompt - User prompt with the actual request
 * @param {object} options - Additional options
 * @returns {Promise<{text: string, raw: object}>}
 */
async function readWithPrompts(filePath, systemPrompt, userPrompt, options = {}) {
  // Combine system and user prompts
  let fullPrompt = '';

  if (systemPrompt) {
    fullPrompt += `${systemPrompt}\n\n`;
  }

  fullPrompt += userPrompt;

  return readDocument(filePath, fullPrompt, options);
}

/**
 * Read markdown content (for Mathpix-converted files)
 * @param {string} markdownContent - Markdown content to analyze
 * @param {string} prompt - The prompt to use
 * @param {object} options - Additional options
 * @returns {Promise<{text: string, raw: object}>}
 */
async function readMarkdown(markdownContent, prompt, options = {}) {
  const geminiPath = config.geminiCli?.path || 'gemini';
  const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
  const model = config.geminiCli?.model || 'gemini-2.5-flash';

  return new Promise((resolve, reject) => {
    const fullPrompt = `${prompt}\n\n---\n\nDocument content:\n\n${markdownContent}`;

    const args = ['-m', model, fullPrompt];

    console.log(`[Gemini CLI] Running with markdown content (${markdownContent.length} chars), model: ${model}`);

    const proc = spawn(geminiPath, args, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
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
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout);
          resolve({
            text: parsed.text || parsed.response || parsed.content || stdout,
            raw: parsed,
          });
        } catch {
          resolve({
            text: stdout.trim(),
            raw: null,
          });
        }
      } else {
        reject(new Error(`Gemini CLI exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (error) => {
      if (error.code === 'ETIMEDOUT') {
        reject(new Error('Gemini CLI timeout'));
      } else if (error.code === 'ENOENT') {
        reject(new Error(`Gemini CLI not found at path: ${geminiPath}`));
      } else {
        reject(error);
      }
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Gemini CLI timeout'));
    }, timeoutMs);
  });
}

module.exports = {
  isAvailable,
  readDocument,
  readWithPrompts,
  readMarkdown,
};
