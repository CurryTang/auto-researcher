const { createClient } = require('@libsql/client');
const config = require('../config');

let db = null;

async function initDatabase() {
  db = createClient({
    url: config.turso.url,
    authToken: config.turso.authToken,
  });

  // Create documents table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'other' CHECK(type IN ('paper', 'book', 'blog', 'other')),
      original_url TEXT,
      s3_key TEXT NOT NULL,
      s3_url TEXT,
      file_size INTEGER,
      mime_type TEXT DEFAULT 'application/pdf',
      tags TEXT DEFAULT '[]',
      notes TEXT,
      user_id TEXT DEFAULT 'default_user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create tags table for managing available tags
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6b7280',
      user_id TEXT DEFAULT 'default_user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster queries
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)
  `);

  console.log('Database initialized');
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

module.exports = {
  initDatabase,
  getDb,
};
