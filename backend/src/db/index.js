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

  // Add processing columns to documents table (migration-safe)
  const processingColumns = [
    { name: 'processing_status', definition: "TEXT DEFAULT 'pending'" },
    { name: 'notes_s3_key', definition: 'TEXT' },
    { name: 'page_count', definition: 'INTEGER' },
    { name: 'processing_error', definition: 'TEXT' },
    { name: 'processing_started_at', definition: 'DATETIME' },
    { name: 'processing_completed_at', definition: 'DATETIME' },
    { name: 'is_read', definition: 'INTEGER DEFAULT 0' },
    // Auto-reader mode columns
    { name: 'reader_mode', definition: "TEXT DEFAULT 'vanilla'" },
    { name: 'code_notes_s3_key', definition: 'TEXT' },
    { name: 'has_code', definition: 'INTEGER DEFAULT 0' },
    { name: 'code_url', definition: 'TEXT' },
  ];

  for (const col of processingColumns) {
    try {
      await db.execute(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.definition}`);
    } catch (err) {
      // Column already exists, ignore
    }
  }

  // Create processing queue table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS processing_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL UNIQUE,
      priority INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_processing_queue_scheduled ON processing_queue(scheduled_at)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON processing_queue(priority DESC, scheduled_at ASC)
  `);

  // Create prompt templates table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      user_prompt TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      user_id TEXT DEFAULT 'default_user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default prompt template if not exists
  const existingTemplate = await db.execute(`
    SELECT id FROM prompt_templates WHERE name = 'Vanilla Summary' AND user_id = 'default_user'
  `);

  if (existingTemplate.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO prompt_templates (name, description, system_prompt, user_prompt, is_default, user_id)
            VALUES (?, ?, ?, ?, 1, 'default_user')`,
      args: [
        'Vanilla Summary',
        'Basic paper summary with key points',
        'You are an expert academic research assistant. Your task is to summarize research papers clearly and concisely.',
        `Please summarize the following research paper. Include:

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
Why this paper might be important for researchers.`
      ]
    });
  }

  // Create processing history table for rate limiting
  await db.execute(`
    CREATE TABLE IF NOT EXISTS processing_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      duration_ms INTEGER,
      model_used TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_processing_history_started ON processing_history(started_at DESC)
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
