const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');

const documentsRouter = require('./documents');
const uploadRouter = require('./upload');
const tagsRouter = require('./tags');
const readerRouter = require('./reader');
const codeAnalysisRouter = require('./code-analysis');

router.use('/documents', documentsRouter);
router.use('/upload', uploadRouter);
router.use('/tags', tagsRouter);
router.use('/reader', readerRouter);
router.use('/code-analysis', codeAnalysisRouter);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth verification endpoint
router.get('/auth/verify', verifyToken);

module.exports = router;
