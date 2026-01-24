const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const config = require('../config');

const MATHPIX_API_URL = 'https://api.mathpix.com/v3';

/**
 * Check if Mathpix is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!(config.mathpix?.appId && config.mathpix?.appKey);
}

/**
 * Get Mathpix headers for API requests
 * @returns {object}
 */
function getHeaders() {
  return {
    'app_id': config.mathpix.appId,
    'app_key': config.mathpix.appKey,
  };
}

/**
 * Convert a PDF to markdown using Mathpix
 * @param {string|Buffer} input - Path to PDF file or PDF buffer
 * @returns {Promise<{markdown: string, pdfId: string}>}
 */
async function convertPdfToMarkdown(input) {
  if (!isConfigured()) {
    throw new Error('Mathpix is not configured. Set MATHPIX_APP_ID and MATHPIX_APP_KEY.');
  }

  let fileBuffer;
  let filename = 'document.pdf';

  if (Buffer.isBuffer(input)) {
    fileBuffer = input;
  } else {
    fileBuffer = await fs.readFile(input);
    filename = path.basename(input);
  }

  // Step 1: Upload PDF
  const formData = new FormData();
  formData.append('file', fileBuffer, {
    filename,
    contentType: 'application/pdf',
  });
  formData.append('options_json', JSON.stringify({
    conversion_formats: { md: true },
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
  }));

  console.log('[Mathpix] Uploading PDF for conversion...');

  const uploadResponse = await fetch(`${MATHPIX_API_URL}/pdf`, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Mathpix upload failed: ${error}`);
  }

  const uploadResult = await uploadResponse.json();
  const pdfId = uploadResult.pdf_id;

  if (!pdfId) {
    throw new Error('Mathpix upload did not return a pdf_id');
  }

  console.log(`[Mathpix] PDF uploaded, ID: ${pdfId}`);

  // Step 2: Poll for completion
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes
  const pollIntervalMs = 5000; // 5 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const statusResponse = await fetch(`${MATHPIX_API_URL}/pdf/${pdfId}`, {
      headers: getHeaders(),
    });

    if (!statusResponse.ok) {
      const error = await statusResponse.text();
      throw new Error(`Mathpix status check failed: ${error}`);
    }

    const status = await statusResponse.json();

    if (status.status === 'completed') {
      console.log('[Mathpix] Conversion completed');
      break;
    } else if (status.status === 'error') {
      throw new Error(`Mathpix conversion failed: ${status.error || 'Unknown error'}`);
    }

    console.log(`[Mathpix] Conversion status: ${status.status}, waiting...`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Step 3: Download markdown result
  const mdResponse = await fetch(`${MATHPIX_API_URL}/pdf/${pdfId}.md`, {
    headers: getHeaders(),
  });

  if (!mdResponse.ok) {
    const error = await mdResponse.text();
    throw new Error(`Mathpix markdown download failed: ${error}`);
  }

  const markdown = await mdResponse.text();

  console.log(`[Mathpix] Downloaded markdown (${markdown.length} chars)`);

  return { markdown, pdfId };
}

/**
 * Get the status of a PDF conversion
 * @param {string} pdfId - Mathpix PDF ID
 * @returns {Promise<object>}
 */
async function getConversionStatus(pdfId) {
  if (!isConfigured()) {
    throw new Error('Mathpix is not configured');
  }

  const response = await fetch(`${MATHPIX_API_URL}/pdf/${pdfId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mathpix status check failed: ${error}`);
  }

  return response.json();
}

module.exports = {
  isConfigured,
  convertPdfToMarkdown,
  getConversionStatus,
};
