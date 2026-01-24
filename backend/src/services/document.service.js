const { getDb } = require('../db');
const s3Service = require('./s3.service');

/**
 * Convert database row to document object
 */
function rowToDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    originalUrl: row.original_url,
    s3Key: row.s3_key,
    s3Url: row.s3_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    tags: JSON.parse(row.tags || '[]'),
    notes: row.notes,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Processing status fields
    processingStatus: row.processing_status || 'pending',
    notesS3Key: row.notes_s3_key,
    pageCount: row.page_count,
    processingError: row.processing_error,
    processingStartedAt: row.processing_started_at,
    processingCompletedAt: row.processing_completed_at,
  };
}

/**
 * Create a new document
 * @param {Object} data - Document data
 * @returns {Promise<Object>}
 */
async function createDocument(data) {
  const db = getDb();
  const tags = JSON.stringify(data.tags || []);

  const result = await db.execute({
    sql: `INSERT INTO documents (title, type, original_url, s3_key, s3_url, file_size, mime_type, tags, notes, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.title,
      data.type || 'other',
      data.originalUrl || null,
      data.s3Key,
      data.s3Url || null,
      data.fileSize || null,
      data.mimeType || 'application/pdf',
      tags,
      data.notes || null,
      data.userId || 'default_user',
    ],
  });

  const id = Number(result.lastInsertRowid);
  return getDocumentById(id);
}

/**
 * Get documents with filtering and pagination
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options (supports page or offset)
 * @returns {Promise<{documents: Object[], total: number, page: number, totalPages: number}>}
 */
async function getDocuments(filters = {}, pagination = {}) {
  const db = getDb();
  const { userId = 'default_user', type, search, tags } = filters;
  const { page = 1, limit = 20 } = pagination;

  // Support both page-based and offset-based pagination
  const offset = pagination.offset !== undefined
    ? pagination.offset
    : (page - 1) * limit;

  let whereClauses = ['user_id = ?'];
  let args = [userId];

  if (type) {
    whereClauses.push('type = ?');
    args.push(type);
  }

  if (search) {
    whereClauses.push('(title LIKE ? OR notes LIKE ?)');
    args.push(`%${search}%`, `%${search}%`);
  }

  if (tags && tags.length > 0) {
    const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ');
    whereClauses.push(`(${tagConditions})`);
    tags.forEach(tag => args.push(`%"${tag}"%`));
  }

  const whereClause = whereClauses.join(' AND ');

  // Get total count
  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM documents WHERE ${whereClause}`,
    args: args,
  });
  const total = Number(countResult.rows[0].count);

  // Get documents
  const result = await db.execute({
    sql: `SELECT * FROM documents WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  const documents = result.rows.map(rowToDocument);

  return {
    documents,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a single document by ID
 * @param {number} id - Document ID
 * @returns {Promise<Object|null>}
 */
async function getDocumentById(id) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM documents WHERE id = ?',
    args: [id],
  });

  return rowToDocument(result.rows[0]);
}

/**
 * Update a document
 * @param {number} id - Document ID
 * @param {Object} data - Updated data
 * @returns {Promise<Object|null>}
 */
async function updateDocument(id, data) {
  const db = getDb();
  const allowedUpdates = ['title', 'type', 'tags', 'notes'];
  const updates = [];
  const args = [];

  for (const key of allowedUpdates) {
    if (data[key] !== undefined) {
      updates.push(`${key} = ?`);
      args.push(key === 'tags' ? JSON.stringify(data[key]) : data[key]);
    }
  }

  if (updates.length === 0) {
    return getDocumentById(id);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  args.push(id);

  await db.execute({
    sql: `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`,
    args: args,
  });

  return getDocumentById(id);
}

/**
 * Delete a document and its S3 file
 * @param {number} id - Document ID
 * @returns {Promise<boolean>}
 */
async function deleteDocument(id) {
  const db = getDb();
  const document = await getDocumentById(id);

  if (!document) {
    return false;
  }

  // Delete from S3
  if (document.s3Key) {
    try {
      await s3Service.deleteObject(document.s3Key);
    } catch (error) {
      console.error('Failed to delete S3 object:', error);
    }
  }

  await db.execute({
    sql: 'DELETE FROM documents WHERE id = ?',
    args: [id],
  });

  return true;
}

/**
 * Get document with fresh presigned download URL
 * @param {number} id - Document ID
 * @returns {Promise<Object|null>}
 */
async function getDocumentWithDownloadUrl(id) {
  const document = await getDocumentById(id);

  if (!document || !document.s3Key) {
    return document;
  }

  const downloadUrl = await s3Service.generatePresignedDownloadUrl(document.s3Key);
  return { ...document, downloadUrl };
}

module.exports = {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  getDocumentWithDownloadUrl,
};
