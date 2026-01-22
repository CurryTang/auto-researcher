const express = require('express');
const router = express.Router();

const documentsRouter = require('./documents');
const uploadRouter = require('./upload');
const tagsRouter = require('./tags');

router.use('/documents', documentsRouter);
router.use('/upload', uploadRouter);
router.use('/tags', tagsRouter);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
