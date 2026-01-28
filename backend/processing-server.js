/**
 * Desktop Processing Server
 *
 * This server runs on your desktop and handles all heavy LLM processing.
 * It receives requests from the DO server via FRP tunnel.
 *
 * Usage:
 *   node processing-server.js
 */

require('dotenv').config();
const express = require('express');
const config = require('./src/config');

// Import processing services
const readerService = require('./src/services/reader.service');
const codeAnalysisService = require('./src/services/code-analysis.service');
const llmService = require('./src/services/llm.service');
const geminiCliService = require('./src/services/gemini-cli.service');
const pdfService = require('./src/services/pdf.service');

const app = express();
const PORT = process.env.PROCESSING_PORT || 3001;

// Middleware
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Desktop Processing Server',
    timestamp: new Date().toISOString(),
    geminiCliAvailable: geminiCliService.isAvailable ? 'checking...' : false,
  });
});

// Check Gemini CLI availability for health endpoint
geminiCliService.isAvailable().then((available) => {
  console.log(`[Processing] Gemini CLI available: ${available}`);
});

/**
 * Process a document (PDF to notes)
 * POST /api/process/document
 * Body: { item: {...}, options: {...} }
 */
app.post('/api/process/document', async (req, res) => {
  try {
    const { item, options } = req.body;

    if (!item || !item.documentId) {
      return res.status(400).json({ error: 'Invalid request: missing item or documentId' });
    }

    console.log(`[Processing] Document request: ${item.title} (ID: ${item.documentId})`);

    const result = await readerService.processDocument(item, options);

    res.json(result);
  } catch (error) {
    console.error('[Processing] Document processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Analyze code repository
 * POST /api/process/code-analysis
 * Body: { documentId, codeUrl, title }
 */
app.post('/api/process/code-analysis', async (req, res) => {
  try {
    const { documentId, codeUrl, title } = req.body;

    if (!documentId || !codeUrl) {
      return res.status(400).json({ error: 'Invalid request: missing documentId or codeUrl' });
    }

    console.log(`[Processing] Code analysis request: ${title} (${codeUrl})`);

    const result = await codeAnalysisService.performAnalysis(documentId, codeUrl, title);

    res.json(result);
  } catch (error) {
    console.error('[Processing] Code analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate LLM completion
 * POST /api/process/llm
 * Body: { content, prompt, provider }
 */
app.post('/api/process/llm', async (req, res) => {
  try {
    const { content, prompt, provider = 'gemini' } = req.body;

    if (!content || !prompt) {
      return res.status(400).json({ error: 'Invalid request: missing content or prompt' });
    }

    console.log(`[Processing] LLM request: ${provider}, content length: ${content.length}`);

    const result = await llmService.generateCompletion(content, prompt, provider);

    res.json(result);
  } catch (error) {
    console.error('[Processing] LLM generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Read PDF with Gemini CLI
 * POST /api/process/read-pdf
 * Body: { filePath, prompt }
 */
app.post('/api/process/read-pdf', async (req, res) => {
  try {
    const { filePath, prompt } = req.body;

    if (!filePath || !prompt) {
      return res.status(400).json({ error: 'Invalid request: missing filePath or prompt' });
    }

    console.log(`[Processing] PDF read request: ${filePath}`);

    const result = await geminiCliService.readDocument(filePath, prompt);

    res.json(result);
  } catch (error) {
    console.error('[Processing] PDF reading error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[Processing] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function startServer() {
  try {
    // Clean up temp files on startup
    await pdfService.cleanupAllTmpFiles();
    console.log('[Processing] Cleaned up temp files');

    app.listen(PORT, '127.0.0.1', () => {
      console.log(`[Processing] Desktop Processing Server running on port ${PORT}`);
      console.log(`[Processing] Ready to accept requests from DO server via FRP`);
      console.log(`[Processing] Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('[Processing] Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Processing] Shutting down gracefully...');
  await pdfService.cleanupAllTmpFiles();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Processing] Received SIGTERM, shutting down...');
  await pdfService.cleanupAllTmpFiles();
  process.exit(0);
});

startServer();
