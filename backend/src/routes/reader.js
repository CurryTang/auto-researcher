const express = require('express');
const router = express.Router();
const queueService = require('../services/queue.service');
const schedulerService = require('../services/scheduler.service');
const readerService = require('../services/reader.service');

/**
 * GET /api/reader/queue/status
 * Get the current queue status and rate limit info
 */
router.get('/queue/status', async (req, res) => {
  try {
    const status = await queueService.getQueueStatus();
    const schedulerStatus = schedulerService.getStatus();

    res.json({
      ...status,
      scheduler: schedulerStatus,
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

/**
 * POST /api/reader/queue/:documentId
 * Manually add a document to the processing queue
 */
router.post('/queue/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { priority = 0 } = req.body;

    const result = await queueService.enqueueDocument(parseInt(documentId), priority);

    res.json(result);
  } catch (error) {
    console.error('Error enqueueing document:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/reader/queue/:documentId
 * Remove a document from the processing queue
 */
router.delete('/queue/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { getDb } = require('../db');
    const db = getDb();

    // Remove from queue
    await db.execute({
      sql: 'DELETE FROM processing_queue WHERE document_id = ?',
      args: [parseInt(documentId)],
    });

    // Reset document status to pending
    await db.execute({
      sql: "UPDATE documents SET processing_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND processing_status = 'queued'",
      args: [parseInt(documentId)],
    });

    res.json({ success: true, documentId: parseInt(documentId) });
  } catch (error) {
    console.error('Error removing document from queue:', error);
    res.status(500).json({ error: 'Failed to remove document from queue' });
  }
});

/**
 * POST /api/reader/process/:documentId
 * Trigger immediate processing of a document (bypasses scheduler, respects rate limit)
 */
router.post('/process/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { provider, promptTemplateId } = req.body;

    // Check rate limit
    const canProcess = await queueService.canProcessMore();
    if (!canProcess) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Maximum documents per hour reached. Please try again later.',
      });
    }

    // Get document info
    const { getDb } = require('../db');
    const db = getDb();

    const docResult = await db.execute({
      sql: 'SELECT id, title, s3_key, file_size, mime_type, processing_status FROM documents WHERE id = ?',
      args: [parseInt(documentId)],
    });

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    if (doc.processing_status === 'processing') {
      return res.status(400).json({ error: 'Document is already being processed' });
    }

    if (doc.processing_status === 'completed') {
      return res.status(400).json({ error: 'Document has already been processed' });
    }

    // Mark as processing
    await db.execute({
      sql: "UPDATE documents SET processing_status = 'processing', processing_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [parseInt(documentId)],
    });

    // Record in history
    await db.execute({
      sql: "INSERT INTO processing_history (document_id, status, started_at) VALUES (?, 'processing', CURRENT_TIMESTAMP)",
      args: [parseInt(documentId)],
    });

    // Process the document
    try {
      const result = await readerService.processDocument(
        {
          documentId: parseInt(documentId),
          title: doc.title,
          s3Key: doc.s3_key,
          fileSize: doc.file_size,
          mimeType: doc.mime_type,
        },
        { provider, promptTemplateId }
      );

      // Mark as completed
      await queueService.markCompleted(parseInt(documentId), result.notesS3Key, result.pageCount);

      res.json({
        success: true,
        documentId: parseInt(documentId),
        notesS3Key: result.notesS3Key,
        pageCount: result.pageCount,
      });
    } catch (error) {
      // Mark as failed
      await queueService.markFailed(parseInt(documentId), error, false);

      res.status(500).json({
        error: 'Processing failed',
        message: error.message,
      });
    }
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

/**
 * POST /api/reader/scan
 * Trigger an immediate scan for new documents
 */
router.post('/scan', async (req, res) => {
  try {
    const result = await schedulerService.runImmediateScan();
    res.json(result);
  } catch (error) {
    console.error('Error running scan:', error);
    res.status(500).json({ error: 'Failed to run scan' });
  }
});

/**
 * GET /api/reader/templates
 * List all prompt templates
 */
router.get('/templates', async (req, res) => {
  try {
    const userId = req.query.userId || 'default_user';
    const templates = await readerService.listPromptTemplates(userId);
    res.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * GET /api/reader/templates/:id
 * Get a specific prompt template
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { getDb } = require('../db');
    const db = getDb();

    const result = await db.execute({
      sql: 'SELECT * FROM prompt_templates WHERE id = ?',
      args: [parseInt(req.params.id)],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt,
      isDefault: row.is_default === 1,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * POST /api/reader/templates
 * Create a new prompt template
 */
router.post('/templates', async (req, res) => {
  try {
    const { name, description, systemPrompt, userPrompt, isDefault, userId } = req.body;

    if (!name || !userPrompt) {
      return res.status(400).json({ error: 'Name and userPrompt are required' });
    }

    const template = await readerService.createPromptTemplate({
      name,
      description,
      systemPrompt,
      userPrompt,
      isDefault,
      userId,
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PUT /api/reader/templates/:id
 * Update a prompt template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const { name, description, systemPrompt, userPrompt, isDefault } = req.body;

    const template = await readerService.updatePromptTemplate(parseInt(req.params.id), {
      name,
      description,
      systemPrompt,
      userPrompt,
      isDefault,
    });

    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/reader/templates/:id
 * Delete a prompt template
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    await readerService.deletePromptTemplate(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * GET /api/reader/history
 * Get processing history
 */
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { getDb } = require('../db');
    const db = getDb();

    let sql = `
      SELECT ph.*, d.title as document_title
      FROM processing_history ph
      JOIN documents d ON ph.document_id = d.id
    `;
    const args = [];

    if (status) {
      sql += ' WHERE ph.status = ?';
      args.push(status);
    }

    sql += ' ORDER BY ph.started_at DESC LIMIT ? OFFSET ?';
    args.push(parseInt(limit), offset);

    const result = await db.execute({ sql, args });

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM processing_history';
    if (status) {
      countSql += ' WHERE status = ?';
    }

    const countResult = await db.execute({
      sql: countSql,
      args: status ? [status] : [],
    });

    res.json({
      history: result.rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        durationMs: row.duration_ms,
        modelUsed: row.model_used,
        errorMessage: row.error_message,
      })),
      total: countResult.rows[0].count,
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit)),
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

module.exports = router;
