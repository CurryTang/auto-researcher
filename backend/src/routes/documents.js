const express = require('express');
const router = express.Router();
const documentService = require('../services/document.service');

// GET /api/documents - List all documents with pagination
router.get('/', async (req, res) => {
  try {
    const { page, limit = 20, offset, type, search, tags } = req.query;

    const filters = {
      userId: req.query.userId || 'default_user',
      type,
      search,
      tags: tags ? tags.split(',') : undefined,
    };

    // Support both page-based and offset-based pagination
    const parsedLimit = Math.min(parseInt(limit, 10), 100);
    let pagination;

    if (offset !== undefined) {
      // Offset-based pagination
      pagination = {
        offset: parseInt(offset, 10),
        limit: parsedLimit,
      };
    } else {
      // Page-based pagination (default)
      pagination = {
        page: parseInt(page, 10) || 1,
        limit: parsedLimit,
      };
    }

    const result = await documentService.getDocuments(filters, pagination);
    res.json(result);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/documents/:id - Get single document
router.get('/:id', async (req, res) => {
  try {
    const document = await documentService.getDocumentWithDownloadUrl(req.params.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// GET /api/documents/:id/download - Get download URL for a document
router.get('/:id/download', async (req, res) => {
  try {
    const document = await documentService.getDocumentWithDownloadUrl(req.params.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.downloadUrl) {
      return res.status(404).json({ error: 'No file available for download' });
    }

    res.json({ downloadUrl: document.downloadUrl });
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
});

// GET /api/documents/:id/notes - Get notes URL and content for a document
router.get('/:id/notes', async (req, res) => {
  try {
    const { getDb } = require('../db');
    const s3Service = require('../services/s3.service');
    const db = getDb();

    const result = await db.execute({
      sql: 'SELECT id, title, notes_s3_key, processing_status FROM documents WHERE id = ?',
      args: [req.params.id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    if (!doc.notes_s3_key) {
      // No processed notes yet
      return res.json({
        documentId: doc.id,
        title: doc.title,
        processingStatus: doc.processing_status,
        hasNotes: false,
        notesUrl: null,
        notesContent: null,
      });
    }

    // Get presigned URL for notes
    const notesUrl = await s3Service.generatePresignedDownloadUrl(doc.notes_s3_key);

    // Optionally fetch and return content inline (useful for frontend rendering)
    let notesContent = null;
    if (req.query.inline === 'true') {
      try {
        const buffer = await s3Service.downloadBuffer(doc.notes_s3_key);
        notesContent = buffer.toString('utf-8');
      } catch (error) {
        console.error('Error fetching notes content:', error);
      }
    }

    res.json({
      documentId: doc.id,
      title: doc.title,
      processingStatus: doc.processing_status,
      hasNotes: true,
      notesUrl,
      notesS3Key: doc.notes_s3_key,
      notesContent,
    });
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// GET /api/documents/:id/processing-status - Get detailed processing status
router.get('/:id/processing-status', async (req, res) => {
  try {
    const { getDb } = require('../db');
    const db = getDb();

    const result = await db.execute({
      sql: `SELECT id, title, processing_status, page_count, processing_error,
                   processing_started_at, processing_completed_at
            FROM documents WHERE id = ?`,
      args: [req.params.id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Get queue info if queued
    let queueInfo = null;
    if (doc.processing_status === 'queued') {
      const queueResult = await db.execute({
        sql: 'SELECT priority, retry_count, max_retries, scheduled_at FROM processing_queue WHERE document_id = ?',
        args: [req.params.id],
      });

      if (queueResult.rows.length > 0) {
        const q = queueResult.rows[0];
        queueInfo = {
          priority: q.priority,
          retryCount: q.retry_count,
          maxRetries: q.max_retries,
          scheduledAt: q.scheduled_at,
        };
      }
    }

    res.json({
      documentId: doc.id,
      title: doc.title,
      status: doc.processing_status,
      pageCount: doc.page_count,
      error: doc.processing_error,
      startedAt: doc.processing_started_at,
      completedAt: doc.processing_completed_at,
      queueInfo,
    });
  } catch (error) {
    console.error('Error getting processing status:', error);
    res.status(500).json({ error: 'Failed to get processing status' });
  }
});

// POST /api/documents - Create new document
router.post('/', async (req, res) => {
  try {
    const { title, type, originalUrl, s3Key, s3Url, fileSize, mimeType, tags, notes } =
      req.body;

    if (!title || !s3Key) {
      return res.status(400).json({ error: 'Title and s3Key are required' });
    }

    const document = await documentService.createDocument({
      title,
      type: type || 'other',
      originalUrl,
      s3Key,
      s3Url,
      fileSize,
      mimeType,
      tags: tags || [],
      notes,
      userId: req.body.userId || 'default_user',
    });

    res.status(201).json(document);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// PUT /api/documents/:id - Update document
router.put('/:id', async (req, res) => {
  try {
    const document = await documentService.updateDocument(req.params.id, req.body);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await documentService.deleteDocument(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// PATCH /api/documents/:id/read - Toggle read status
router.patch('/:id/read', async (req, res) => {
  try {
    const { getDb } = require('../db');
    const db = getDb();

    // Get current read status
    const current = await db.execute({
      sql: 'SELECT id, is_read FROM documents WHERE id = ?',
      args: [req.params.id],
    });

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Toggle read status (or set to specific value if provided)
    const currentIsRead = current.rows[0].is_read || 0;
    const newIsRead = req.body.isRead !== undefined ? (req.body.isRead ? 1 : 0) : (currentIsRead ? 0 : 1);

    await db.execute({
      sql: 'UPDATE documents SET is_read = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [newIsRead, req.params.id],
    });

    res.json({
      id: parseInt(req.params.id),
      isRead: newIsRead === 1,
    });
  } catch (error) {
    console.error('Error toggling read status:', error);
    res.status(500).json({ error: 'Failed to update read status' });
  }
});

module.exports = router;
