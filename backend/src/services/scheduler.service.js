const config = require('../config');
const queueService = require('./queue.service');

class SchedulerService {
  constructor() {
    this.scanInterval = null;
    this.processInterval = null;
    this.cleanupInterval = null;
    this.readerService = null; // Injected later to avoid circular dependency
    this.isRunning = false;
  }

  // Inject reader service (called after all services are loaded)
  setReaderService(readerService) {
    this.readerService = readerService;
  }

  // Start all schedulers
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    if (!config.reader?.enabled) {
      console.log('[Scheduler] Reader is disabled, not starting scheduler');
      return;
    }

    console.log('[Scheduler] Starting document processing scheduler...');

    const scanIntervalMs = config.reader?.scanIntervalMs || 30 * 60 * 1000; // 30 minutes
    const processIntervalMs = config.reader?.processIntervalMs || 60 * 1000; // 1 minute
    const cleanupIntervalMs = 15 * 60 * 1000; // 15 minutes

    // Run initial scan immediately
    this.scanForNewDocuments();

    // Schedule periodic scans
    this.scanInterval = setInterval(() => {
      this.scanForNewDocuments();
    }, scanIntervalMs);

    // Schedule periodic processing checks
    this.processInterval = setInterval(() => {
      this.processNextInQueue();
    }, processIntervalMs);

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleJobs();
    }, cleanupIntervalMs);

    this.isRunning = true;
    console.log(`[Scheduler] Started with scan interval ${scanIntervalMs / 1000 / 60} min, process interval ${processIntervalMs / 1000} sec`);
  }

  // Stop all schedulers
  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  // Scan for new documents and add them to the queue
  async scanForNewDocuments() {
    try {
      console.log('[Scheduler] Scanning for new documents...');

      const pendingDocs = await queueService.findPendingDocuments(20);

      if (pendingDocs.length === 0) {
        console.log('[Scheduler] No new documents to process');
        return { queued: 0 };
      }

      let queued = 0;
      for (const doc of pendingDocs) {
        try {
          await queueService.enqueueDocument(doc.id);
          queued++;
          console.log(`[Scheduler] Queued document: ${doc.title} (ID: ${doc.id})`);
        } catch (error) {
          console.error(`[Scheduler] Failed to queue document ${doc.id}:`, error.message);
        }
      }

      console.log(`[Scheduler] Queued ${queued} documents for processing`);
      return { queued };
    } catch (error) {
      console.error('[Scheduler] Error scanning for documents:', error);
      return { queued: 0, error: error.message };
    }
  }

  // Process the next document in the queue
  async processNextInQueue() {
    if (!this.readerService) {
      console.warn('[Scheduler] Reader service not set, skipping processing');
      return;
    }

    try {
      // Check if we can process more
      const canProcess = await queueService.canProcessMore();
      if (!canProcess) {
        console.log('[Scheduler] Rate limit reached, waiting...');
        return { processed: false, reason: 'rate_limit' };
      }

      // Get next document
      const item = await queueService.dequeueNext();
      if (!item) {
        // No documents in queue
        return { processed: false, reason: 'queue_empty' };
      }

      console.log(`[Scheduler] Processing document: ${item.title} (ID: ${item.documentId})`);

      try {
        // Process the document
        const result = await this.readerService.processDocument(item);

        // Mark as completed with extra data for auto_reader mode
        const extraData = {};
        if (result.codeNotesS3Key) {
          extraData.codeNotesS3Key = result.codeNotesS3Key;
        }
        if (result.hasCode !== undefined) {
          extraData.hasCode = result.hasCode;
        }

        await queueService.markCompleted(item.documentId, result.notesS3Key, result.pageCount, extraData);

        console.log(`[Scheduler] Successfully processed document: ${item.title}`);
        return { processed: true, documentId: item.documentId };
      } catch (error) {
        console.error(`[Scheduler] Failed to process document ${item.documentId}:`, error);

        // Determine if error is recoverable
        const isRecoverable = this.isRecoverableError(error);
        const retryResult = await queueService.markFailed(item.documentId, error, isRecoverable);

        if (retryResult.retried) {
          console.log(`[Scheduler] Document ${item.documentId} will be retried (attempt ${retryResult.retryCount})`);
        }

        return { processed: false, error: error.message, retried: retryResult.retried };
      }
    } catch (error) {
      console.error('[Scheduler] Error in process loop:', error);
      return { processed: false, error: error.message };
    }
  }

  // Cleanup stale jobs
  async cleanupStaleJobs() {
    try {
      const cleaned = await queueService.cleanupStaleJobs(30);
      if (cleaned > 0) {
        console.log(`[Scheduler] Cleaned up ${cleaned} stale jobs`);
      }
    } catch (error) {
      console.error('[Scheduler] Error cleaning up stale jobs:', error);
    }
  }

  // Determine if an error is recoverable (should retry)
  isRecoverableError(error) {
    const message = error.message?.toLowerCase() || '';

    // Non-recoverable errors
    const nonRecoverable = [
      'invalid pdf',
      'corrupted',
      'unsupported format',
      'api key invalid',
      'unauthorized',
      'file not found',
      'document not found',
    ];

    for (const phrase of nonRecoverable) {
      if (message.includes(phrase)) {
        return false;
      }
    }

    // Recoverable errors (network issues, timeouts, rate limits)
    return true;
  }

  // Manual trigger for immediate scan
  async runImmediateScan() {
    console.log('[Scheduler] Running immediate scan...');
    return await this.scanForNewDocuments();
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasReaderService: !!this.readerService,
      scanIntervalMs: config.reader?.scanIntervalMs || 30 * 60 * 1000,
      processIntervalMs: config.reader?.processIntervalMs || 60 * 1000,
    };
  }
}

module.exports = new SchedulerService();
