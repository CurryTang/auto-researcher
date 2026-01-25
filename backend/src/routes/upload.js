const express = require('express');
const router = express.Router();
const multer = require('multer');
const s3Service = require('../services/s3.service');
const documentService = require('../services/document.service');
const converterService = require('../services/converter.service');
const arxivService = require('../services/arxiv.service');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/epub+zip',
      'text/plain',
      'text/html',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, EPUB, TXT, and HTML are allowed.'));
    }
  },
});

// POST /api/upload/presigned - Get presigned URL for direct upload
router.post('/presigned', async (req, res) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const userId = req.body.userId || 'default_user';
    const key = s3Service.generateS3Key(filename, userId);

    const { uploadUrl } = await s3Service.generatePresignedUploadUrl(key, contentType);

    res.json({
      uploadUrl,
      key,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// POST /api/upload/direct - Direct file upload through server
router.post('/direct', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, type, tags, notes } = req.body;
    const userId = req.body.userId || 'default_user';

    // Generate S3 key and upload
    const key = s3Service.generateS3Key(req.file.originalname, userId);
    const { location } = await s3Service.uploadBuffer(
      req.file.buffer,
      key,
      req.file.mimetype
    );

    // Create document record
    const document = await documentService.createDocument({
      title: title || req.file.originalname,
      type: type || 'other',
      s3Key: key,
      s3Url: location,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      tags: tags ? JSON.parse(tags) : [],
      notes,
      userId,
    });

    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// POST /api/upload/webpage - Convert webpage to PDF and save
router.post('/webpage', async (req, res) => {
  try {
    const { url, title, type, tags, notes } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const userId = req.body.userId || 'default_user';

    // Convert webpage to PDF
    const { buffer, title: pageTitle } = await converterService.convertUrlToPdf(url);

    // Generate filename from title
    const filename = `${(title || pageTitle).slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Upload to S3
    const key = s3Service.generateS3Key(filename, userId);
    const { location } = await s3Service.uploadBuffer(buffer, key, 'application/pdf');

    // Create document record
    const document = await documentService.createDocument({
      title: title || pageTitle,
      type: type || 'blog',
      originalUrl: url,
      s3Key: key,
      s3Url: location,
      fileSize: buffer.length,
      mimeType: 'application/pdf',
      tags: tags || [],
      notes,
      userId,
    });

    res.status(201).json(document);
  } catch (error) {
    console.error('Error converting webpage:', error);
    res.status(500).json({ error: 'Failed to convert webpage to PDF' });
  }
});

// POST /api/upload/arxiv - Fetch arXiv paper PDF and save
router.post('/arxiv', async (req, res) => {
  try {
    const { url, paperId, title, tags, notes } = req.body;

    // Get paper ID from URL or directly
    let arxivId = paperId;
    if (!arxivId && url) {
      arxivId = arxivService.parseArxivUrl(url);
    }

    if (!arxivId) {
      return res.status(400).json({ error: 'Invalid arXiv URL or paper ID' });
    }

    const userId = req.body.userId || 'default_user';

    // Fetch metadata from arXiv API
    console.log(`Fetching arXiv metadata for ${arxivId}...`);
    const metadata = await arxivService.fetchMetadata(arxivId);

    // Fetch PDF from arXiv
    console.log(`Fetching arXiv PDF for ${arxivId}...`);
    const pdfBuffer = await arxivService.fetchPdf(arxivId);

    // Generate filename from title
    const paperTitle = title || metadata.title;
    const filename = `arxiv_${arxivId.replace('/', '_')}_${paperTitle.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Upload to S3
    const key = s3Service.generateS3Key(filename, userId);
    const { location } = await s3Service.uploadBuffer(pdfBuffer, key, 'application/pdf');

    // Try to find code repository URL
    console.log(`Searching for code URL for ${arxivId}...`);
    const codeUrl = await arxivService.findCodeUrl(arxivId, metadata.abstract);

    // Build notes with metadata
    const fullNotes = [
      notes || '',
      `Authors: ${metadata.authors.join(', ')}`,
      `Category: ${metadata.primaryCategory}`,
      `Published: ${metadata.published}`,
      codeUrl ? `Code: ${codeUrl}` : '',
      '',
      `Abstract: ${metadata.abstract}`,
    ].filter(Boolean).join('\n');

    // Create document record
    const document = await documentService.createDocument({
      title: paperTitle,
      type: 'paper',
      originalUrl: metadata.absUrl,
      s3Key: key,
      s3Url: location,
      fileSize: pdfBuffer.length,
      mimeType: 'application/pdf',
      tags: tags || [],
      notes: fullNotes,
      userId,
    });

    // Update document with code URL if found
    if (codeUrl) {
      await documentService.updateDocument(document.id, {
        codeUrl: codeUrl,
        hasCode: true,
      });
      document.codeUrl = codeUrl;
      document.hasCode = true;
    }

    res.status(201).json({
      ...document,
      arxivMetadata: metadata,
    });
  } catch (error) {
    console.error('Error fetching arXiv paper:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch arXiv paper' });
  }
});

// GET /api/upload/arxiv/metadata - Get arXiv paper metadata without downloading
router.get('/arxiv/metadata', async (req, res) => {
  try {
    const { url, paperId } = req.query;

    let arxivId = paperId;
    if (!arxivId && url) {
      arxivId = arxivService.parseArxivUrl(url);
    }

    if (!arxivId) {
      return res.status(400).json({ error: 'Invalid arXiv URL or paper ID' });
    }

    const metadata = await arxivService.fetchMetadata(arxivId);
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching arXiv metadata:', error);
    res.status(500).json({ error: 'Failed to fetch arXiv metadata' });
  }
});

module.exports = router;
