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

module.exports = router;
