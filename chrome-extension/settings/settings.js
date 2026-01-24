// Default presets that ship with the extension
const DEFAULT_PRESETS = [
  {
    id: 'arxiv',
    name: 'arXiv',
    icon: '📄',
    color: '#b31b1b',
    type: 'paper',
    patterns: [
      'arxiv.org/abs/*',
      'arxiv.org/pdf/*',
    ],
    endpoint: '/upload/arxiv',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'ieee',
    name: 'IEEE Xplore',
    icon: '🔬',
    color: '#00629b',
    type: 'paper',
    patterns: [
      'ieeexplore.ieee.org/document/*',
      'ieeexplore.ieee.org/abstract/*',
    ],
    endpoint: '',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'acm',
    name: 'ACM Digital Library',
    icon: '📚',
    color: '#0077b5',
    type: 'paper',
    patterns: [
      'dl.acm.org/doi/*',
    ],
    endpoint: '',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'semanticscholar',
    name: 'Semantic Scholar',
    icon: '🎓',
    color: '#1857b6',
    type: 'paper',
    patterns: [
      'semanticscholar.org/paper/*',
    ],
    endpoint: '',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'medium',
    name: 'Medium',
    icon: '✍️',
    color: '#00ab6c',
    type: 'blog',
    patterns: [
      'medium.com/*',
      '*.medium.com/*',
    ],
    endpoint: '',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'substack',
    name: 'Substack',
    icon: '📰',
    color: '#ff6719',
    type: 'blog',
    patterns: [
      '*.substack.com/*',
    ],
    endpoint: '',
    enabled: true,
    isDefault: true,
  },
];

// DOM Elements
const apiUrlInput = document.getElementById('apiUrl');
const presetsListEl = document.getElementById('presetsList');
const addPresetBtn = document.getElementById('addPresetBtn');
const resetPresetsBtn = document.getElementById('resetPresetsBtn');
const saveBtn = document.getElementById('saveBtn');
const backBtn = document.getElementById('backBtn');

// Modal elements
const presetModal = document.getElementById('presetModal');
const modalTitle = document.getElementById('modalTitle');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const deletePresetBtn = document.getElementById('deletePresetBtn');

// Preset form elements
const presetNameInput = document.getElementById('presetName');
const presetIconInput = document.getElementById('presetIcon');
const presetColorInput = document.getElementById('presetColor');
const presetColorTextInput = document.getElementById('presetColorText');
const presetTypeSelect = document.getElementById('presetType');
const presetPatternsInput = document.getElementById('presetPatterns');
const presetEndpointInput = document.getElementById('presetEndpoint');
const presetEnabledInput = document.getElementById('presetEnabled');

let presets = [];
let editingPresetId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['apiBaseUrl', 'presets']);

  // Load API URL
  apiUrlInput.value = result.apiBaseUrl || 'http://138.68.5.132:3000/api';

  // Load presets (use defaults if none saved)
  if (result.presets && result.presets.length > 0) {
    presets = result.presets;
  } else {
    presets = [...DEFAULT_PRESETS];
  }

  renderPresets();
}

// Save settings to storage
async function saveSettings() {
  await chrome.storage.local.set({
    apiBaseUrl: apiUrlInput.value.trim(),
    presets: presets,
  });
  showToast('Settings saved!', 'success');
}

// Setup event listeners
function setupEventListeners() {
  // Save button
  saveBtn.addEventListener('click', saveSettings);

  // Back button
  backBtn.addEventListener('click', () => {
    window.close();
  });

  // Add preset button
  addPresetBtn.addEventListener('click', () => {
    openModal(null);
  });

  // Reset presets button
  resetPresetsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all presets to defaults? Custom presets will be lost.')) {
      presets = [...DEFAULT_PRESETS];
      renderPresets();
      showToast('Presets reset to defaults', 'success');
    }
  });

  // Modal close buttons
  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);

  // Close modal on backdrop click
  presetModal.addEventListener('click', (e) => {
    if (e.target === presetModal) {
      closeModal();
    }
  });

  // Save preset button
  savePresetBtn.addEventListener('click', savePreset);

  // Delete preset button
  deletePresetBtn.addEventListener('click', deletePreset);

  // Sync color inputs
  presetColorInput.addEventListener('input', () => {
    presetColorTextInput.value = presetColorInput.value;
  });

  presetColorTextInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(presetColorTextInput.value)) {
      presetColorInput.value = presetColorTextInput.value;
    }
  });
}

// Render presets list
function renderPresets() {
  if (presets.length === 0) {
    presetsListEl.innerHTML = `
      <div class="empty-state">
        <p>No presets configured</p>
        <p>Click "Add Preset" to create one</p>
      </div>
    `;
    return;
  }

  presetsListEl.innerHTML = presets.map(preset => `
    <div class="preset-card ${preset.enabled ? '' : 'disabled'}" data-id="${preset.id}">
      <div class="preset-icon" style="background: ${preset.color}20; color: ${preset.color}">
        ${preset.icon}
      </div>
      <div class="preset-info">
        <div class="preset-name">${escapeHtml(preset.name)}</div>
        <div class="preset-patterns">${escapeHtml(preset.patterns[0])}${preset.patterns.length > 1 ? ` +${preset.patterns.length - 1} more` : ''}</div>
      </div>
      <div class="preset-status">
        <div class="preset-toggle ${preset.enabled ? 'active' : ''}" data-action="toggle" data-id="${preset.id}"></div>
        <button class="preset-edit-btn" data-action="edit" data-id="${preset.id}">✏️</button>
      </div>
    </div>
  `).join('');

  // Add click handlers
  presetsListEl.querySelectorAll('[data-action="toggle"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePreset(el.dataset.id);
    });
  });

  presetsListEl.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(el.dataset.id);
    });
  });

  presetsListEl.querySelectorAll('.preset-card').forEach(el => {
    el.addEventListener('click', () => {
      openModal(el.dataset.id);
    });
  });
}

// Toggle preset enabled state
function togglePreset(id) {
  const preset = presets.find(p => p.id === id);
  if (preset) {
    preset.enabled = !preset.enabled;
    renderPresets();
  }
}

// Open modal for editing or creating a preset
function openModal(presetId) {
  editingPresetId = presetId;

  if (presetId) {
    // Edit existing preset
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    modalTitle.textContent = 'Edit Preset';
    presetNameInput.value = preset.name;
    presetIconInput.value = preset.icon;
    presetColorInput.value = preset.color;
    presetColorTextInput.value = preset.color;
    presetTypeSelect.value = preset.type;
    presetPatternsInput.value = preset.patterns.join('\n');
    presetEndpointInput.value = preset.endpoint || '';
    presetEnabledInput.checked = preset.enabled;

    deletePresetBtn.style.display = 'block';
  } else {
    // Create new preset
    modalTitle.textContent = 'Add Preset';
    presetNameInput.value = '';
    presetIconInput.value = '📄';
    presetColorInput.value = '#2563eb';
    presetColorTextInput.value = '#2563eb';
    presetTypeSelect.value = 'other';
    presetPatternsInput.value = '';
    presetEndpointInput.value = '';
    presetEnabledInput.checked = true;

    deletePresetBtn.style.display = 'none';
  }

  presetModal.classList.remove('hidden');
  presetNameInput.focus();
}

// Close modal
function closeModal() {
  presetModal.classList.add('hidden');
  editingPresetId = null;
}

// Save preset from modal
function savePreset() {
  const name = presetNameInput.value.trim();
  const icon = presetIconInput.value.trim() || '📄';
  const color = presetColorInput.value;
  const type = presetTypeSelect.value;
  const patterns = presetPatternsInput.value
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);
  const endpoint = presetEndpointInput.value.trim();
  const enabled = presetEnabledInput.checked;

  // Validation
  if (!name) {
    showToast('Please enter a preset name', 'error');
    presetNameInput.focus();
    return;
  }

  if (patterns.length === 0) {
    showToast('Please enter at least one URL pattern', 'error');
    presetPatternsInput.focus();
    return;
  }

  if (editingPresetId) {
    // Update existing preset
    const index = presets.findIndex(p => p.id === editingPresetId);
    if (index !== -1) {
      presets[index] = {
        ...presets[index],
        name,
        icon,
        color,
        type,
        patterns,
        endpoint,
        enabled,
      };
    }
  } else {
    // Create new preset
    const id = 'custom_' + Date.now();
    presets.push({
      id,
      name,
      icon,
      color,
      type,
      patterns,
      endpoint,
      enabled,
      isDefault: false,
    });
  }

  renderPresets();
  closeModal();
  showToast(editingPresetId ? 'Preset updated' : 'Preset added', 'success');
}

// Delete preset
function deletePreset() {
  if (!editingPresetId) return;

  const preset = presets.find(p => p.id === editingPresetId);
  if (!preset) return;

  if (confirm(`Are you sure you want to delete "${preset.name}"?`)) {
    presets = presets.filter(p => p.id !== editingPresetId);
    renderPresets();
    closeModal();
    showToast('Preset deleted', 'success');
  }
}

// Show toast notification
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
