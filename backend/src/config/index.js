require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  turso: {
    url: process.env.TURSO_DATABASE_URL || 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN || '',
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'auto-reader-documents',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  // Document Reader Configuration
  reader: {
    enabled: process.env.READER_ENABLED !== 'false', // Enabled by default
    scanIntervalMs: parseInt(process.env.READER_SCAN_INTERVAL_MS) || 30 * 60 * 1000, // 30 minutes
    processIntervalMs: parseInt(process.env.READER_PROCESS_INTERVAL_MS) || 60 * 1000, // 1 minute
    maxPerHour: parseInt(process.env.READER_MAX_PER_HOUR) || 5,
    maxPageCount: parseInt(process.env.READER_MAX_PAGE_COUNT) || 40,
    maxFileSizeMb: parseInt(process.env.READER_MAX_FILE_SIZE_MB) || 5,
    defaultProvider: process.env.READER_DEFAULT_PROVIDER || 'gemini-cli',
    // Use project directory for tmp files - Gemini CLI can only access files within project
    // Using 'processing' instead of 'tmp' to avoid .gitignore issues
    tmpDir: process.env.READER_TMP_DIR || path.join(__dirname, '..', '..', 'processing'),
  },

  // Mathpix API (for large PDF conversion)
  mathpix: {
    appId: process.env.MATHPIX_APP_ID,
    appKey: process.env.MATHPIX_APP_KEY,
  },

  // Gemini CLI Configuration
  geminiCli: {
    path: process.env.GEMINI_CLI_PATH || 'gemini',
  },

  // Claude Code CLI Configuration
  claudeCli: {
    path: process.env.CLAUDE_CLI_PATH || 'claude',
    model: process.env.CLAUDE_CLI_MODEL || '',  // Empty = use default (Opus 4.5)
    apiKey: process.env.ANTHROPIC_API_KEY,
  },

  // LLM API Configuration (for fallback)
  llm: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    },
    qwen: {
      apiKey: process.env.QWEN_API_KEY,
      model: process.env.QWEN_MODEL || 'qwen-max',
      baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    },
  },
};
