// Configuration - will be loaded from storage
let API_BASE_URL = 'http://138.68.5.132:3000/api';
let storedPresets = [];
let currentPreset = null; // Currently detected preset

// DOM Elements
const titleInput = document.getElementById('title');
const urlInput = document.getElementById('url');
const typeSelect = document.getElementById('type');
const notesInput = document.getElementById('notes');
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileName');
const fileInfoDiv = document.getElementById('fileInfo');
const uploadLabel = document.getElementById('uploadLabel');
const saveAsPdfBtn = document.getElementById('saveAsPdf');
const statusDiv = document.getElementById('status');

// Tag elements
const tagInput = document.getElementById('tagInput');
const addTagBtn = document.getElementById('addTagBtn');
const selectedTagsContainer = document.getElementById('selectedTags');
const tagSuggestions = document.getElementById('tagSuggestions');
const availableTagsContainer = document.getElementById('availableTags');

let selectedFile = null;
let allTags = [];
let selectedTags = [];
let currentArxivInfo = null; // Keep for backward compatibility
let currentOpenReviewInfo = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Load settings first (API URL and presets)
  await loadStoredSettings();

  await Promise.all([
    loadCurrentTabInfo(),
    loadTags(),
    checkForPresets(), // Check all presets, not just arXiv
  ]);
  setupTagListeners();
  setupFileListeners();
});

// Load stored settings (API URL and presets)
async function loadStoredSettings() {
  try {
    const result = await chrome.storage.local.get(['apiBaseUrl', 'presets']);

    if (result.apiBaseUrl) {
      // Migrate from localhost to production URL
      if (result.apiBaseUrl.includes('localhost')) {
        API_BASE_URL = 'http://138.68.5.132:3000/api';
        // Save the new URL
        await chrome.storage.local.set({ apiBaseUrl: API_BASE_URL });
      } else {
        API_BASE_URL = result.apiBaseUrl;
      }
    }

    if (result.presets && result.presets.length > 0) {
      storedPresets = result.presets;
    } else {
      // Use default presets
      storedPresets = getDefaultPresets();
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Default presets (same as in settings.js)
function getDefaultPresets() {
  return [
    {
      id: 'arxiv',
      name: 'arXiv',
      icon: '📄',
      color: '#b31b1b',
      type: 'paper',
      patterns: ['arxiv.org/abs/*', 'arxiv.org/pdf/*'],
      endpoint: '/upload/arxiv',
      enabled: true,
    },
    {
      id: 'openreview',
      name: 'OpenReview',
      icon: '📋',
      color: '#3c6e71',
      type: 'paper',
      patterns: ['openreview.net/forum?id=*', 'openreview.net/pdf?id=*'],
      endpoint: '/upload/openreview',
      enabled: true,
    },
    {
      id: 'ieee',
      name: 'IEEE Xplore',
      icon: '🔬',
      color: '#00629b',
      type: 'paper',
      patterns: ['ieeexplore.ieee.org/document/*', 'ieeexplore.ieee.org/abstract/*'],
      endpoint: '',
      enabled: true,
    },
    {
      id: 'medium',
      name: 'Medium',
      icon: '✍️',
      color: '#00ab6c',
      type: 'blog',
      patterns: ['medium.com/*', '*.medium.com/*'],
      endpoint: '',
      enabled: true,
    },
  ];
}

// Check if current URL matches any preset pattern
function matchesPresetPattern(url, pattern) {
  // Convert pattern to regex
  // Escape special chars, then convert * to .*
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(regexPattern, 'i');
  return regex.test(url);
}

// Check all presets and show UI for matching ones
async function checkForPresets() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    // Find first matching enabled preset
    for (const preset of storedPresets) {
      if (!preset.enabled) continue;

      for (const pattern of preset.patterns) {
        if (matchesPresetPattern(tab.url, pattern)) {
          currentPreset = preset;

          // Special handling for arXiv (has dedicated endpoint)
          if (preset.id === 'arxiv') {
            await handleArxivPreset(tab);
          } else if (preset.id === 'openreview') {
            await handleOpenReviewPreset(tab);
          } else {
            // Generic preset handling
            showPresetBanner(preset);
            typeSelect.value = preset.type;
          }
          return;
        }
      }
    }
  } catch (error) {
    console.error('Failed to check presets:', error);
  }
}

// Handle arXiv preset specifically (has special API endpoint)
async function handleArxivPreset(tab) {
  // Try to get arXiv info from content script
  try {
    const arxivInfo = await chrome.tabs.sendMessage(tab.id, { action: 'getArxivInfo' });
    if (arxivInfo && arxivInfo.isArxiv) {
      currentArxivInfo = arxivInfo;
      showArxivMode(arxivInfo);
    }
  } catch (e) {
    // Content script not available, try to parse URL directly
    const arxivId = parseArxivUrlFromPopup(tab.url);
    if (arxivId) {
      currentArxivInfo = { isArxiv: true, arxivId, pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf` };
      fetchArxivMetadata(arxivId);
    }
  }
}

// Handle OpenReview preset specifically
async function handleOpenReviewPreset(tab) {
  // Try to get OpenReview info from content script
  try {
    const openReviewInfo = await chrome.tabs.sendMessage(tab.id, { action: 'getOpenReviewInfo' });
    if (openReviewInfo && openReviewInfo.isOpenReview) {
      currentOpenReviewInfo = openReviewInfo;
      showOpenReviewMode(openReviewInfo);
    }
  } catch (e) {
    // Content script not available, try to parse URL directly
    const paperId = parseOpenReviewUrlFromPopup(tab.url);
    if (paperId) {
      currentOpenReviewInfo = {
        isOpenReview: true,
        paperId,
        pdfUrl: `https://openreview.net/pdf?id=${paperId}`,
        forumUrl: `https://openreview.net/forum?id=${paperId}`
      };
      showOpenReviewMode(currentOpenReviewInfo);
    }
  }
}

// Show generic preset banner (for presets without special endpoints)
function showPresetBanner(preset) {
  if (document.getElementById('presetBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'presetBanner';
  banner.className = 'preset-banner';
  banner.style.background = `linear-gradient(135deg, ${preset.color} 0%, ${adjustColor(preset.color, -20)} 100%)`;
  banner.innerHTML = `
    <div class="preset-badge">
      <span class="preset-icon">${preset.icon}</span>
      <span>${preset.name} Detected</span>
    </div>
  `;

  const header = document.querySelector('header');
  header.after(banner);
}

// Adjust color brightness
function adjustColor(color, amount) {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Load current tab info
async function loadCurrentTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      titleInput.value = tab.title || '';
      urlInput.value = tab.url || '';

      // Try to get enhanced metadata from content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getMetadata' });
        if (response) {
          if (response.title) titleInput.value = response.title;
          if (response.description) notesInput.value = response.description;
        }
      } catch (e) {
        // Content script might not be loaded, use tab info
      }

      // Auto-detect type based on URL
      typeSelect.value = detectContentType(tab.url);
    }
  } catch (error) {
    console.error('Failed to get tab info:', error);
  }
}

// Load tags from API
async function loadTags() {
  try {
    const response = await fetch(`${API_BASE_URL}/tags`);
    if (response.ok) {
      const data = await response.json();
      allTags = data.tags || [];
      renderAvailableTags();
    }
  } catch (error) {
    console.error('Failed to load tags:', error);
  }
}

// Parse arXiv URL to get paper ID
function parseArxivUrlFromPopup(url) {
  const patterns = [
    /arxiv\.org\/abs\/(\d+\.\d+(?:v\d+)?)/i,
    /arxiv\.org\/pdf\/(\d+\.\d+(?:v\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].replace('.pdf', '');
  }
  return null;
}

// Parse OpenReview URL to get paper ID
function parseOpenReviewUrlFromPopup(url) {
  const pdfMatch = url.match(/openreview\.net\/pdf\?id=([^&#]+)/i);
  if (pdfMatch) return pdfMatch[1];

  const forumMatch = url.match(/openreview\.net\/forum\?id=([^&#]+)/i);
  if (forumMatch) return forumMatch[1];

  return null;
}

// Fetch arXiv metadata from backend
async function fetchArxivMetadata(arxivId) {
  try {
    const response = await fetch(`${API_BASE_URL}/upload/arxiv/metadata?paperId=${arxivId}`);
    if (response.ok) {
      const metadata = await response.json();
      currentArxivInfo = {
        isArxiv: true,
        arxivId: metadata.id,
        title: metadata.title,
        authors: metadata.authors,
        abstract: metadata.abstract,
        pdfUrl: metadata.pdfUrl,
        absUrl: metadata.absUrl,
      };
      showArxivMode(currentArxivInfo);
    }
  } catch (error) {
    console.error('Failed to fetch arXiv metadata:', error);
  }
}

// Show arXiv-specific UI
function showArxivMode(arxivInfo) {
  // Update title
  if (arxivInfo.title) {
    titleInput.value = arxivInfo.title;
  }

  // Set type to paper
  typeSelect.value = 'paper';

  // Add authors and abstract to notes
  if (arxivInfo.authors && arxivInfo.authors.length > 0) {
    const authorsStr = `Authors: ${arxivInfo.authors.join(', ')}`;
    if (arxivInfo.abstract) {
      notesInput.value = `${authorsStr}\n\nAbstract: ${arxivInfo.abstract}`;
    } else {
      notesInput.value = authorsStr;
    }
  }

  // Show arXiv banner and button
  showArxivBanner(arxivInfo);
}

// Show arXiv detection banner
function showArxivBanner(arxivInfo) {
  // Check if banner already exists
  if (document.getElementById('arxivBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'arxivBanner';
  banner.className = 'arxiv-banner';
  banner.innerHTML = `
    <div class="arxiv-badge">
      <span class="arxiv-icon">📄</span>
      <span>arXiv Paper Detected</span>
    </div>
    <div class="arxiv-id">arXiv:${arxivInfo.arxivId}</div>
    <button type="button" id="saveArxivPdf" class="btn btn-arxiv">
      Save arXiv PDF
    </button>
  `;

  // Insert after header
  const header = document.querySelector('header');
  header.after(banner);

  // Add click handler for arXiv save button
  document.getElementById('saveArxivPdf').addEventListener('click', saveArxivPaper);
}

// Show OpenReview-specific UI
function showOpenReviewMode(openReviewInfo) {
  // Update title
  if (openReviewInfo.title) {
    titleInput.value = openReviewInfo.title;
  }

  // Set type to paper
  typeSelect.value = 'paper';

  // Add authors and abstract to notes
  let notesContent = '';
  if (openReviewInfo.authors && openReviewInfo.authors.length > 0) {
    notesContent = `Authors: ${openReviewInfo.authors.join(', ')}`;
  }
  if (openReviewInfo.venue) {
    notesContent += `\n\nVenue: ${openReviewInfo.venue}`;
  }
  if (openReviewInfo.abstract) {
    notesContent += `\n\nAbstract: ${openReviewInfo.abstract}`;
  }
  if (notesContent) {
    notesInput.value = notesContent;
  }

  // Show OpenReview banner and button
  showOpenReviewBanner(openReviewInfo);
}

// Show OpenReview detection banner
function showOpenReviewBanner(openReviewInfo) {
  // Check if banner already exists
  if (document.getElementById('openreviewBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'openreviewBanner';
  banner.className = 'arxiv-banner'; // Reuse arXiv banner style
  banner.style.background = 'linear-gradient(135deg, #3c6e71 0%, #2d5457 100%)';
  banner.innerHTML = `
    <div class="arxiv-badge">
      <span class="arxiv-icon">📋</span>
      <span>OpenReview Paper Detected</span>
    </div>
    <div class="arxiv-id">ID: ${openReviewInfo.paperId}</div>
    <button type="button" id="saveOpenReviewPdf" class="btn btn-arxiv">
      Save OpenReview PDF
    </button>
  `;

  // Insert after header
  const header = document.querySelector('header');
  header.after(banner);

  // Add click handler for OpenReview save button
  document.getElementById('saveOpenReviewPdf').addEventListener('click', saveOpenReviewPaper);
}

// Save arXiv paper (fetch PDF and upload)
async function saveArxivPaper() {
  if (!currentArxivInfo || !currentArxivInfo.arxivId) {
    showStatus('No arXiv paper detected', 'error');
    return;
  }

  const data = getFormData();

  setLoading(true, 'Fetching arXiv PDF...');

  try {
    const response = await fetch(`${API_BASE_URL}/upload/arxiv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId: currentArxivInfo.arxivId,
        title: data.title || currentArxivInfo.title,
        tags: data.tags,
        notes: data.notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save arXiv paper');
    }

    showStatus('arXiv paper saved successfully!', 'success');
    resetForm();
  } catch (error) {
    console.error('arXiv save error:', error);
    showStatus(error.message || 'Failed to save arXiv paper', 'error');
  } finally {
    setLoading(false);
  }
}

// Save OpenReview paper (fetch PDF and upload)
async function saveOpenReviewPaper() {
  if (!currentOpenReviewInfo || !currentOpenReviewInfo.paperId) {
    showStatus('No OpenReview paper detected', 'error');
    return;
  }

  const data = getFormData();

  setLoading(true, 'Fetching OpenReview PDF...');

  try {
    const response = await fetch(`${API_BASE_URL}/upload/openreview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId: currentOpenReviewInfo.paperId,
        pdfUrl: currentOpenReviewInfo.pdfUrl,
        title: data.title || currentOpenReviewInfo.title || `OpenReview:${currentOpenReviewInfo.paperId}`,
        tags: data.tags,
        notes: data.notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save OpenReview paper');
    }

    showStatus('OpenReview paper saved successfully!', 'success');
    resetForm();
  } catch (error) {
    console.error('OpenReview save error:', error);
    showStatus(error.message || 'Failed to save OpenReview paper', 'error');
  } finally {
    setLoading(false);
  }
}

// Setup tag event listeners
function setupTagListeners() {
  // Tag input for filtering/creating
  tagInput.addEventListener('input', () => {
    const query = tagInput.value.trim().toLowerCase();
    renderSuggestions(query);
  });

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = tagInput.value.trim();
      if (query) {
        addOrCreateTag(query);
      }
    }
  });

  // Add tag button
  addTagBtn.addEventListener('click', () => {
    const query = tagInput.value.trim();
    if (query) {
      addOrCreateTag(query);
    }
  });

  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!tagInput.contains(e.target) && !tagSuggestions.contains(e.target)) {
      tagSuggestions.innerHTML = '';
      tagSuggestions.classList.remove('has-suggestions');
    }
  });
}

// Setup file input listeners
function setupFileListeners() {
  // File input handler - just preview, don't upload yet
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedFile = file;
      fileNameDisplay.textContent = file.name;
      fileInfoDiv.style.display = 'flex';
      uploadLabel.style.display = 'none';

      // Disable URL field when file is selected
      urlInput.disabled = true;
      urlInput.style.opacity = '0.5';

      // Auto-fill title from filename if empty
      if (!titleInput.value) {
        titleInput.value = file.name.replace(/\.[^/.]+$/, '');
      }

      // Update button text and enable it
      saveAsPdfBtn.textContent = 'Upload File';
      saveAsPdfBtn.disabled = false;
    }
  });

  // Clear file button
  const clearFileBtn = document.getElementById('clearFile');
  if (clearFileBtn) {
    clearFileBtn.addEventListener('click', clearSelectedFile);
  }

  // URL input change listener - enable/disable button based on URL
  urlInput.addEventListener('input', updateSaveButtonState);

  // Initial button state
  updateSaveButtonState();
}

// Update save button state based on URL and file selection
function updateSaveButtonState() {
  if (selectedFile) {
    // File is selected - button should be enabled
    saveAsPdfBtn.disabled = false;
    saveAsPdfBtn.textContent = 'Upload File';
  } else {
    // No file - check if URL is present
    const hasUrl = urlInput.value.trim().length > 0;
    saveAsPdfBtn.disabled = !hasUrl;
    saveAsPdfBtn.textContent = 'Save as PDF';
  }
}

// Clear selected file
function clearSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  fileNameDisplay.textContent = '';
  fileInfoDiv.style.display = 'none';
  uploadLabel.style.display = 'flex';

  // Re-enable URL field
  urlInput.disabled = false;
  urlInput.style.opacity = '1';

  // Update button state based on URL
  updateSaveButtonState();
}

// Render tag suggestions dropdown
function renderSuggestions(query) {
  tagSuggestions.innerHTML = '';

  if (!query) {
    tagSuggestions.classList.remove('has-suggestions');
    return;
  }

  const filtered = allTags.filter(tag =>
    tag.name.toLowerCase().includes(query) &&
    !selectedTags.some(st => st.name === tag.name)
  );

  if (filtered.length === 0 && !allTags.some(t => t.name.toLowerCase() === query.toLowerCase())) {
    // Show "Create new tag" option
    const createItem = document.createElement('div');
    createItem.className = 'suggestion-item create-new';
    createItem.innerHTML = `+ Create tag "${query}"`;
    createItem.addEventListener('click', () => createNewTag(query));
    tagSuggestions.appendChild(createItem);
  }

  filtered.slice(0, 5).forEach(tag => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
      <span class="color-dot" style="background: ${tag.color}"></span>
      <span>${tag.name}</span>
    `;
    item.addEventListener('click', () => selectTag(tag));
    tagSuggestions.appendChild(item);
  });

  if (tagSuggestions.children.length > 0) {
    tagSuggestions.classList.add('has-suggestions');
  } else {
    tagSuggestions.classList.remove('has-suggestions');
  }
}

// Render available tags as clickable chips
function renderAvailableTags() {
  availableTagsContainer.innerHTML = '';

  // Filter out already selected tags
  const unselectedTags = allTags.filter(tag =>
    !selectedTags.some(st => st.name === tag.name)
  );

  unselectedTags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'available-tag';
    chip.innerHTML = `
      <span class="color-dot" style="background: ${tag.color}"></span>
      <span>${tag.name}</span>
    `;
    chip.addEventListener('click', () => {
      selectTag(tag);
    });
    availableTagsContainer.appendChild(chip);
  });
}

// Render selected tags
function renderSelectedTags() {
  selectedTagsContainer.innerHTML = '';

  selectedTags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.style.background = tag.color;
    chip.innerHTML = `
      <span>${tag.name}</span>
      <span class="remove-tag">×</span>
    `;
    chip.querySelector('.remove-tag').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTag(tag);
    });
    selectedTagsContainer.appendChild(chip);
  });

  // Update available tags to show selection state
  renderAvailableTags();
}

// Select a tag
function selectTag(tag) {
  if (!selectedTags.some(st => st.name === tag.name)) {
    selectedTags.push(tag);
    renderSelectedTags();
  }
  tagInput.value = '';
  tagSuggestions.innerHTML = '';
  tagSuggestions.classList.remove('has-suggestions');
}

// Remove a tag
function removeTag(tag) {
  selectedTags = selectedTags.filter(st => st.name !== tag.name);
  renderSelectedTags();
}

// Create a new tag
async function createNewTag(name) {
  try {
    const response = await fetch(`${API_BASE_URL}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (response.ok) {
      const tag = await response.json();
      allTags.push(tag);
      selectTag(tag);
    }
  } catch (error) {
    console.error('Failed to create tag:', error);
    showStatus('Failed to create tag', 'error');
  }
}

// Add existing tag or create new one
async function addOrCreateTag(name) {
  const existingTag = allTags.find(t => t.name.toLowerCase() === name.toLowerCase());

  if (existingTag) {
    selectTag(existingTag);
  } else {
    await createNewTag(name);
  }
}

// Detect content type from URL
function detectContentType(url) {
  if (!url) return 'other';

  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('arxiv.org') ||
      lowerUrl.includes('openreview.net') ||
      lowerUrl.includes('scholar.google') ||
      lowerUrl.includes('semanticscholar') ||
      lowerUrl.includes('doi.org') ||
      lowerUrl.includes('ieee.org') ||
      lowerUrl.includes('acm.org')) {
    return 'paper';
  }

  if (lowerUrl.includes('medium.com') ||
      lowerUrl.includes('dev.to') ||
      lowerUrl.includes('blog') ||
      lowerUrl.includes('substack.com')) {
    return 'blog';
  }

  return 'other';
}

// Save as PDF - handles both file upload and webpage conversion
saveAsPdfBtn.addEventListener('click', async () => {
  const data = getFormData();

  // If file is selected, upload it
  if (selectedFile) {
    await uploadFile(data);
    return;
  }

  // If on arXiv page, use arXiv endpoint
  if (currentArxivInfo && currentArxivInfo.isArxiv && currentArxivInfo.arxivId) {
    await saveArxivPaper();
    return;
  }

  // If on OpenReview page, use OpenReview endpoint
  if (currentOpenReviewInfo && currentOpenReviewInfo.isOpenReview && currentOpenReviewInfo.paperId) {
    await saveOpenReviewPaper();
    return;
  }

  // Otherwise convert webpage to PDF
  if (!validateForm(data, true)) return;

  setLoading(true, 'Converting to PDF...');

  try {
    const response = await fetch(`${API_BASE_URL}/upload/webpage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: data.url,
        title: data.title,
        type: data.type,
        tags: data.tags,
        notes: data.notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to convert');
    }

    showStatus('Page saved as PDF!', 'success');
    resetForm();
  } catch (error) {
    console.error('PDF conversion error:', error);
    showStatus('Failed to convert page. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
});

// Upload file function
async function uploadFile(data) {
  if (!selectedFile) return;

  if (!data.title) {
    showStatus('Please enter a title', 'error');
    return;
  }

  setLoading(true, 'Uploading file...');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', data.title);
    formData.append('type', data.type);
    formData.append('tags', JSON.stringify(data.tags));
    formData.append('notes', data.notes || '');

    const response = await fetch(`${API_BASE_URL}/upload/direct`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to upload');
    }

    showStatus('File uploaded successfully!', 'success');
    resetForm();
    clearSelectedFile();
  } catch (error) {
    console.error('Upload error:', error);
    showStatus(error.message || 'Failed to upload file. Please try again.', 'error');
  } finally {
    setLoading(false);
  }
}

// Get form data
function getFormData() {
  return {
    title: titleInput.value.trim(),
    url: urlInput.value.trim(),
    type: typeSelect.value,
    tags: selectedTags.map(t => t.name),
    notes: notesInput.value.trim(),
  };
}

// Reset form after successful save
function resetForm() {
  selectedTags = [];
  renderSelectedTags();
  notesInput.value = '';
}

// Validate form
function validateForm(data, requireUrl) {
  if (!data.title) {
    showStatus('Please enter a title', 'error');
    return false;
  }

  if (requireUrl && !data.url) {
    showStatus('Please enter a URL', 'error');
    return false;
  }

  if (data.url && !isValidUrl(data.url)) {
    showStatus('Please enter a valid URL', 'error');
    return false;
  }

  return true;
}

// URL validation
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }
}

// Set loading state
function setLoading(loading, message = 'Loading...') {
  saveAsPdfBtn.disabled = loading;

  // Also disable arXiv button if it exists
  const arxivBtn = document.getElementById('saveArxivPdf');
  if (arxivBtn) {
    arxivBtn.disabled = loading;
  }

  // Also disable OpenReview button if it exists
  const openReviewBtn = document.getElementById('saveOpenReviewPdf');
  if (openReviewBtn) {
    openReviewBtn.disabled = loading;
  }

  if (loading) {
    showStatus(message, 'loading');
  }
}

// View Library link
document.getElementById('viewLibrary').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: `${API_BASE_URL.replace('/api', '')}/library` });
});

// Settings link - open settings page
document.getElementById('settings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
});
