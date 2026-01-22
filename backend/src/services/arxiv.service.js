const https = require('https');
const http = require('http');

/**
 * Parse arXiv URL to extract paper ID
 * Supports formats:
 * - https://arxiv.org/abs/2505.10960
 * - https://arxiv.org/pdf/2505.10960
 * - https://arxiv.org/abs/2505.10960v1
 * - https://arxiv.org/pdf/2505.10960v2.pdf
 * @param {string} url - arXiv URL
 * @returns {string|null} Paper ID or null if not an arXiv URL
 */
function parseArxivUrl(url) {
  const patterns = [
    /arxiv\.org\/abs\/(\d+\.\d+(?:v\d+)?)/i,
    /arxiv\.org\/pdf\/(\d+\.\d+(?:v\d+)?)/i,
    /arxiv\.org\/abs\/([a-z-]+\/\d+(?:v\d+)?)/i,
    /arxiv\.org\/pdf\/([a-z-]+\/\d+(?:v\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1].replace('.pdf', '');
    }
  }

  return null;
}

/**
 * Check if URL is an arXiv URL
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isArxivUrl(url) {
  return /arxiv\.org\/(abs|pdf)\//.test(url);
}

/**
 * Get the PDF download URL for an arXiv paper
 * @param {string} paperId - arXiv paper ID
 * @returns {string}
 */
function getPdfUrl(paperId) {
  return `https://arxiv.org/pdf/${paperId}.pdf`;
}

/**
 * Get the abstract page URL for an arXiv paper
 * @param {string} paperId - arXiv paper ID
 * @returns {string}
 */
function getAbsUrl(paperId) {
  return `https://arxiv.org/abs/${paperId}`;
}

/**
 * Fetch paper metadata from arXiv API
 * @param {string} paperId - arXiv paper ID
 * @returns {Promise<{title: string, authors: string[], abstract: string, categories: string[], published: string}>}
 */
async function fetchMetadata(paperId) {
  const apiUrl = `http://export.arxiv.org/api/query?id_list=${paperId}`;

  return new Promise((resolve, reject) => {
    http.get(apiUrl, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          // Parse XML response
          const titleMatch = data.match(/<title>([\s\S]*?)<\/title>/g);
          const title = titleMatch && titleMatch[1]
            ? titleMatch[1].replace(/<\/?title>/g, '').trim().replace(/\s+/g, ' ')
            : `arXiv:${paperId}`;

          const authorsMatch = data.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g);
          const authors = authorsMatch
            ? authorsMatch.map(a => {
                const nameMatch = a.match(/<name>([\s\S]*?)<\/name>/);
                return nameMatch ? nameMatch[1].trim() : '';
              }).filter(Boolean)
            : [];

          const abstractMatch = data.match(/<summary>([\s\S]*?)<\/summary>/);
          const abstract = abstractMatch
            ? abstractMatch[1].trim().replace(/\s+/g, ' ')
            : '';

          const categoryMatch = data.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);
          const primaryCategory = categoryMatch ? categoryMatch[1] : '';

          const publishedMatch = data.match(/<published>([\s\S]*?)<\/published>/);
          const published = publishedMatch ? publishedMatch[1].trim() : '';

          resolve({
            id: paperId,
            title,
            authors,
            abstract,
            primaryCategory,
            published,
            pdfUrl: getPdfUrl(paperId),
            absUrl: getAbsUrl(paperId),
          });
        } catch (error) {
          reject(new Error('Failed to parse arXiv metadata'));
        }
      });

      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Fetch PDF buffer from arXiv
 * @param {string} paperId - arXiv paper ID
 * @returns {Promise<Buffer>}
 */
async function fetchPdf(paperId) {
  const pdfUrl = getPdfUrl(paperId);

  const fetchWithRedirect = (url, redirectCount = 0) => {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
        },
      };

      const request = https.get(url, options, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }
          // Handle relative URLs
          const fullUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://arxiv.org${redirectUrl}`;
          console.log(`Redirecting to: ${fullUrl}`);
          fetchWithRedirect(fullUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch PDF: HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Verify it's a PDF (starts with %PDF)
          if (buffer.length > 4 && buffer.slice(0, 4).toString() === '%PDF') {
            resolve(buffer);
          } else {
            reject(new Error('Downloaded file is not a valid PDF'));
          }
        });
        response.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(120000, () => {
        request.destroy();
        reject(new Error('PDF download timeout'));
      });
    });
  };

  return fetchWithRedirect(pdfUrl);
}

module.exports = {
  parseArxivUrl,
  isArxivUrl,
  getPdfUrl,
  getAbsUrl,
  fetchMetadata,
  fetchPdf,
};
