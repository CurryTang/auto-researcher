// Auto Reader Content Script
// Extracts metadata from web pages

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMetadata') {
    const metadata = extractPageMetadata();
    sendResponse(metadata);
  }
  if (request.action === 'getArxivInfo') {
    const arxivInfo = extractArxivInfo();
    sendResponse(arxivInfo);
  }
  return true;
});

// Check if current page is arXiv
function isArxivPage() {
  return window.location.hostname.includes('arxiv.org');
}

// Extract arXiv paper ID from URL
function extractArxivId() {
  const url = window.location.href;
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

// Extract arXiv-specific info from the page
function extractArxivInfo() {
  if (!isArxivPage()) {
    return { isArxiv: false };
  }

  const arxivId = extractArxivId();
  if (!arxivId) {
    return { isArxiv: false };
  }

  const info = {
    isArxiv: true,
    arxivId: arxivId,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    title: '',
    authors: [],
    abstract: '',
    categories: [],
  };

  // Try to extract from abstract page
  if (window.location.pathname.includes('/abs/')) {
    // Title from h1.title
    const titleEl = document.querySelector('h1.title');
    if (titleEl) {
      info.title = titleEl.textContent.replace(/^Title:\s*/i, '').trim();
    }

    // Authors from div.authors
    const authorsEl = document.querySelector('div.authors');
    if (authorsEl) {
      const authorLinks = authorsEl.querySelectorAll('a');
      info.authors = Array.from(authorLinks).map(a => a.textContent.trim());
    }

    // Abstract from blockquote.abstract
    const abstractEl = document.querySelector('blockquote.abstract');
    if (abstractEl) {
      info.abstract = abstractEl.textContent.replace(/^Abstract:\s*/i, '').trim();
    }

    // Categories from div.subjects
    const subjectsEl = document.querySelector('td.subjects');
    if (subjectsEl) {
      info.categories = subjectsEl.textContent.trim().split(';').map(s => s.trim());
    }
  }

  // For PDF pages, we only have the ID
  if (window.location.pathname.includes('/pdf/')) {
    info.title = `arXiv:${arxivId}`;
  }

  return info;
}

// Extract metadata from the current page
function extractPageMetadata() {
  const metadata = {
    title: '',
    description: '',
    author: '',
    publishDate: '',
    ogImage: '',
    type: 'other',
  };

  // Get title - try various sources
  metadata.title = getTitle();

  // Get description
  metadata.description = getDescription();

  // Get author
  metadata.author = getAuthor();

  // Get publish date
  metadata.publishDate = getPublishDate();

  // Get og:image
  metadata.ogImage = getMetaContent('og:image');

  // Detect content type
  metadata.type = detectContentType();

  return metadata;
}

// Get page title from various sources
function getTitle() {
  // Try og:title first
  const ogTitle = getMetaContent('og:title');
  if (ogTitle) return ogTitle;

  // Try Twitter title
  const twitterTitle = getMetaContent('twitter:title');
  if (twitterTitle) return twitterTitle;

  // Try article headline (Schema.org)
  const headline = document.querySelector('[itemprop="headline"]');
  if (headline) return headline.textContent.trim();

  // Fall back to document title
  return document.title || '';
}

// Get page description
function getDescription() {
  // Try og:description
  const ogDesc = getMetaContent('og:description');
  if (ogDesc) return ogDesc;

  // Try meta description
  const metaDesc = getMetaContent('description');
  if (metaDesc) return metaDesc;

  // Try Twitter description
  const twitterDesc = getMetaContent('twitter:description');
  if (twitterDesc) return twitterDesc;

  // Try to get first paragraph
  const firstPara = document.querySelector('article p, main p, .content p');
  if (firstPara) {
    const text = firstPara.textContent.trim();
    return text.length > 300 ? text.substring(0, 300) + '...' : text;
  }

  return '';
}

// Get author information
function getAuthor() {
  // Try meta author
  const metaAuthor = getMetaContent('author');
  if (metaAuthor) return metaAuthor;

  // Try article:author
  const articleAuthor = getMetaContent('article:author');
  if (articleAuthor) return articleAuthor;

  // Try Schema.org author
  const schemaAuthor = document.querySelector('[itemprop="author"]');
  if (schemaAuthor) return schemaAuthor.textContent.trim();

  // Try common author selectors
  const authorSelectors = [
    '.author-name',
    '.byline',
    '[rel="author"]',
    '.post-author',
    '.article-author',
  ];

  for (const selector of authorSelectors) {
    const element = document.querySelector(selector);
    if (element) return element.textContent.trim();
  }

  return '';
}

// Get publish date
function getPublishDate() {
  // Try article:published_time
  const pubTime = getMetaContent('article:published_time');
  if (pubTime) return pubTime;

  // Try datePublished
  const datePublished = getMetaContent('datePublished');
  if (datePublished) return datePublished;

  // Try Schema.org datePublished
  const schemaDate = document.querySelector('[itemprop="datePublished"]');
  if (schemaDate) {
    return schemaDate.getAttribute('content') || schemaDate.textContent.trim();
  }

  // Try time element
  const timeElement = document.querySelector('time[datetime]');
  if (timeElement) return timeElement.getAttribute('datetime');

  return '';
}

// Get meta tag content by name or property
function getMetaContent(name) {
  const meta = document.querySelector(
    `meta[name="${name}"], meta[property="${name}"], meta[itemprop="${name}"]`
  );
  return meta ? meta.getAttribute('content') || '' : '';
}

// Detect content type based on page characteristics
function detectContentType() {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();

  // Academic papers
  if (
    hostname.includes('arxiv.org') ||
    hostname.includes('scholar.google') ||
    hostname.includes('semanticscholar') ||
    hostname.includes('doi.org') ||
    hostname.includes('ieee.org') ||
    hostname.includes('acm.org') ||
    hostname.includes('nature.com') ||
    hostname.includes('sciencedirect.com') ||
    hostname.includes('springer.com') ||
    hostname.includes('pubmed') ||
    hostname.includes('researchgate.net')
  ) {
    return 'paper';
  }

  // Books
  if (
    hostname.includes('goodreads.com') ||
    hostname.includes('amazon.com/dp') ||
    hostname.includes('books.google.com') ||
    url.includes('/book/') ||
    url.includes('/ebook/')
  ) {
    return 'book';
  }

  // Blogs
  if (
    hostname.includes('medium.com') ||
    hostname.includes('dev.to') ||
    hostname.includes('hashnode') ||
    hostname.includes('substack.com') ||
    hostname.includes('wordpress.com') ||
    hostname.includes('blogger.com') ||
    hostname.includes('ghost.io') ||
    url.includes('/blog/') ||
    url.includes('/post/') ||
    url.includes('/article/') ||
    document.querySelector('article')
  ) {
    return 'blog';
  }

  // Check og:type
  const ogType = getMetaContent('og:type');
  if (ogType === 'article') return 'blog';
  if (ogType === 'book') return 'book';

  return 'other';
}

// Notify that content script is ready
console.log('Auto Reader content script loaded');
