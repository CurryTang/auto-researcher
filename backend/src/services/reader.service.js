const { getDb } = require('../db');
const config = require('../config');
const pdfService = require('./pdf.service');
const geminiCliService = require('./gemini-cli.service');
const mathpixService = require('./mathpix.service');
const llmService = require('./llm.service');
const s3Service = require('./s3.service');

/**
 * Default prompt template for paper summary
 */
const DEFAULT_PROMPT = `You are an expert academic research assistant. Your task is to summarize research papers clearly and concisely.

Please summarize the following research paper. Include:

## Summary
A brief 2-3 sentence overview of the paper.

## Key Contributions
- List the main contributions (3-5 bullet points)

## Methodology
Brief description of the methods used.

## Results
Key findings and results.

## Limitations
Any limitations mentioned or observed.

## Relevance
Why this paper might be important for researchers.`;

class ReaderService {
  /**
   * Process a document through the AI reader pipeline
   * @param {object} item - Queue item with document info
   * @param {object} options - Processing options
   * @returns {Promise<{notesS3Key: string, pageCount: number}>}
   */
  async processDocument(item, options = {}) {
    const { documentId, s3Key, title } = item;
    let tempFilePath = null;

    try {
      console.log(`[Reader] Starting to process document: ${title} (ID: ${documentId})`);

      // Step 1: Prepare PDF (download, truncate if needed)
      const pdfInfo = await pdfService.preparePdfForProcessing(s3Key);
      tempFilePath = pdfInfo.filePath;

      console.log(`[Reader] PDF prepared: ${pdfInfo.pageCount} pages, ${pdfInfo.fileSizeMb.toFixed(2)} MB, truncated: ${pdfInfo.wasTruncated}, needsMathpix: ${pdfInfo.needsMathpix}`);

      // Step 2: Get prompt template
      const prompt = await this.getPromptTemplate(options.promptTemplateId);

      // Step 3: Read the document
      let result;

      if (pdfInfo.needsMathpix) {
        // Large PDF: Convert with Mathpix first
        result = await this.readWithMathpix(pdfInfo.buffer, prompt);
      } else {
        // Normal PDF: Direct AI reading
        result = await this.readWithAI(pdfInfo.filePath, prompt, options);
      }

      console.log(`[Reader] AI reading complete, output length: ${result.text.length} chars`);

      // Step 4: Save notes to S3
      const notesS3Key = await this.saveNotesToS3(documentId, result.text, title);

      console.log(`[Reader] Notes saved to S3: ${notesS3Key}`);

      return {
        notesS3Key,
        pageCount: pdfInfo.pageCount,
        originalPageCount: pdfInfo.originalPageCount,
        wasTruncated: pdfInfo.wasTruncated,
        usedMathpix: pdfInfo.needsMathpix,
      };
    } finally {
      // Cleanup temp file
      if (tempFilePath) {
        await pdfService.cleanupTmpFile(tempFilePath);
      }
    }
  }

  /**
   * Read a document using Gemini CLI (primary method)
   * @param {string} filePath - Path to PDF file
   * @param {string} prompt - The prompt to use
   * @param {object} options - Additional options
   * @returns {Promise<{text: string}>}
   */
  async readWithAI(filePath, prompt, options = {}) {
    const provider = options.provider || config.reader?.defaultProvider || 'gemini-cli';

    if (provider === 'gemini-cli') {
      // Try Gemini CLI first
      const cliAvailable = await geminiCliService.isAvailable();

      if (cliAvailable) {
        console.log('[Reader] Using Gemini CLI');
        return await geminiCliService.readDocument(filePath, prompt);
      } else {
        console.log('[Reader] Gemini CLI not available, falling back to API');
      }
    }

    // Fallback to LLM API
    const configuredProviders = llmService.getConfiguredProviders();

    if (configuredProviders.length === 0) {
      throw new Error('No AI providers available. Install Gemini CLI or configure an LLM API key.');
    }

    // For API fallback, we need to extract text from PDF first
    // This is a simplified approach - in production, you might use pdf-parse or similar
    throw new Error('API fallback for direct PDF reading not yet implemented. Please install Gemini CLI or use Mathpix for large PDFs.');
  }

  /**
   * Read a document using Mathpix conversion + AI
   * @param {Buffer} pdfBuffer - PDF buffer
   * @param {string} prompt - The prompt to use
   * @returns {Promise<{text: string}>}
   */
  async readWithMathpix(pdfBuffer, prompt) {
    if (!mathpixService.isConfigured()) {
      throw new Error('Mathpix is not configured. Cannot process large PDFs without Mathpix API keys.');
    }

    console.log('[Reader] Converting PDF with Mathpix...');

    // Convert PDF to markdown
    const { markdown } = await mathpixService.convertPdfToMarkdown(pdfBuffer);

    console.log(`[Reader] Mathpix conversion complete, markdown length: ${markdown.length} chars`);

    // Check if Gemini CLI is available for markdown processing
    const cliAvailable = await geminiCliService.isAvailable();

    if (cliAvailable) {
      console.log('[Reader] Using Gemini CLI for markdown processing');
      return await geminiCliService.readMarkdown(markdown, prompt);
    }

    // Fallback to LLM API
    console.log('[Reader] Using LLM API for markdown processing');
    return await llmService.generateWithFallback(markdown, prompt);
  }

  /**
   * Get a prompt template from the database
   * @param {number|null} templateId - Template ID (null for default)
   * @returns {Promise<string>}
   */
  async getPromptTemplate(templateId = null) {
    const db = getDb();

    let query;
    let args = [];

    if (templateId) {
      query = 'SELECT system_prompt, user_prompt FROM prompt_templates WHERE id = ?';
      args = [templateId];
    } else {
      query = "SELECT system_prompt, user_prompt FROM prompt_templates WHERE is_default = 1 AND user_id = 'default_user' LIMIT 1";
    }

    const result = await db.execute({ sql: query, args });

    if (result.rows.length === 0) {
      return DEFAULT_PROMPT;
    }

    const template = result.rows[0];
    let prompt = '';

    if (template.system_prompt) {
      prompt += template.system_prompt + '\n\n';
    }

    prompt += template.user_prompt;

    return prompt;
  }

  /**
   * Save generated notes to S3
   * @param {number} documentId - Document ID
   * @param {string} notesContent - Markdown notes content
   * @param {string} title - Document title
   * @returns {Promise<string>} - S3 key
   */
  async saveNotesToS3(documentId, notesContent, title) {
    const timestamp = Date.now();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const s3Key = `default_user/notes/${timestamp}-${documentId}-${sanitizedTitle}.md`;

    // Add metadata header to notes
    const fullNotes = `---
document_id: ${documentId}
title: ${title}
generated_at: ${new Date().toISOString()}
---

${notesContent}`;

    const buffer = Buffer.from(fullNotes, 'utf-8');
    await s3Service.uploadBuffer(buffer, s3Key, 'text/markdown');

    return s3Key;
  }

  /**
   * List all available prompt templates
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async listPromptTemplates(userId = 'default_user') {
    const db = getDb();

    const result = await db.execute({
      sql: `SELECT id, name, description, is_default, created_at
            FROM prompt_templates
            WHERE user_id = ?
            ORDER BY is_default DESC, name ASC`,
      args: [userId],
    });

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
    }));
  }

  /**
   * Create a new prompt template
   * @param {object} data - Template data
   * @returns {Promise<object>}
   */
  async createPromptTemplate(data) {
    const db = getDb();

    const result = await db.execute({
      sql: `INSERT INTO prompt_templates (name, description, system_prompt, user_prompt, is_default, user_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        data.name,
        data.description || null,
        data.systemPrompt || null,
        data.userPrompt,
        data.isDefault ? 1 : 0,
        data.userId || 'default_user',
      ],
    });

    return {
      id: Number(result.lastInsertRowid),
      ...data,
    };
  }

  /**
   * Update a prompt template
   * @param {number} id - Template ID
   * @param {object} data - Updated data
   * @returns {Promise<object>}
   */
  async updatePromptTemplate(id, data) {
    const db = getDb();

    await db.execute({
      sql: `UPDATE prompt_templates
            SET name = COALESCE(?, name),
                description = COALESCE(?, description),
                system_prompt = COALESCE(?, system_prompt),
                user_prompt = COALESCE(?, user_prompt),
                is_default = COALESCE(?, is_default),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [
        data.name || null,
        data.description || null,
        data.systemPrompt || null,
        data.userPrompt || null,
        data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : null,
        id,
      ],
    });

    return { id, ...data };
  }

  /**
   * Delete a prompt template
   * @param {number} id - Template ID
   */
  async deletePromptTemplate(id) {
    const db = getDb();

    await db.execute({
      sql: 'DELETE FROM prompt_templates WHERE id = ?',
      args: [id],
    });
  }
}

module.exports = new ReaderService();
