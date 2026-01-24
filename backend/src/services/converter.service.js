const puppeteer = require('puppeteer');

/**
 * Convert a webpage URL to PDF
 * @param {string} url - URL of the webpage to convert
 * @param {Object} options - PDF options
 * @returns {Promise<{buffer: Buffer, title: string}>}
 */
async function convertUrlToPdf(url, options = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();

    // Set a reasonable viewport
    await page.setViewport({ width: 1200, height: 800 });

    // Navigate to the URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle0', // Wait until no network activity for 500ms
      timeout: 60000,
    });

    // Wait a bit more for any late-loading content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get page title with fallback
    let title = 'Untitled';
    try {
      title = await page.title();
    } catch (e) {
      console.warn('Could not get page title:', e.message);
    }

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm',
      },
      ...options,
    });

    return {
      buffer: pdfBuffer,
      title: title || 'Untitled',
    };
  } finally {
    await browser.close();
  }
}

/**
 * Extract metadata from a webpage
 * @param {string} url - URL of the webpage
 * @returns {Promise<{title: string, description: string, ogImage: string}>}
 */
async function extractWebpageMetadata(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const metadata = await page.evaluate(() => {
      const getMetaContent = (name) => {
        const meta =
          document.querySelector(`meta[name="${name}"]`) ||
          document.querySelector(`meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : '';
      };

      return {
        title: document.title || '',
        description:
          getMetaContent('description') || getMetaContent('og:description') || '',
        ogImage: getMetaContent('og:image') || '',
      };
    });

    return metadata;
  } finally {
    await browser.close();
  }
}

module.exports = {
  convertUrlToPdf,
  extractWebpageMetadata,
};
