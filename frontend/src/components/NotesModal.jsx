import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';

// Initialize mermaid with better unicode support
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: {
    htmlLabels: true,
    useMaxWidth: true,
  },
});

// Pre-process mermaid code to fix common issues
function preprocessMermaidCode(code) {
  if (!code) return code;

  // Quote subgraph names - but skip if already has ["label"] syntax
  // Match: subgraph name (without brackets or quotes)
  code = code.replace(/^(\s*subgraph\s+)(\w+)(\s*$)/gm, (match, prefix, name, suffix) => {
    // Simple identifier without spaces - leave as is
    return match;
  });

  // For subgraph with spaces but no bracket label: subgraph My Name -> subgraph "My Name"
  // But NOT: subgraph name["label"] - that's already valid
  code = code.replace(/^(\s*subgraph\s+)([^"'\[\n]+?)(\s*)$/gm, (match, prefix, name, suffix) => {
    const trimmedName = name.trim();
    // Skip if it's a simple identifier (no spaces/special chars)
    if (/^\w+$/.test(trimmedName)) {
      return match;
    }
    // Skip if already quoted
    if ((trimmedName.startsWith('"') && trimmedName.endsWith('"')) ||
        (trimmedName.startsWith("'") && trimmedName.endsWith("'"))) {
      return match;
    }
    // Quote it
    return `${prefix}"${trimmedName}"${suffix}`;
  });

  // Fix node labels in square brackets: A[Label With Space] -> A["Label With Space"]
  // But skip if already quoted: A["label"]
  code = code.replace(/(\w+)\[([^\]"]+)\]/g, (match, nodeId, label) => {
    // If label contains spaces or non-ASCII, quote it
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `${nodeId}["${label}"]`;
    }
    return match;
  });

  // Fix node labels in double parentheses (circles): A((Label)) -> A(("Label"))
  code = code.replace(/(\w+)\(\(([^)"]+)\)\)/g, (match, nodeId, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `${nodeId}(("${label}"))`;
    }
    return match;
  });

  // Fix node labels in single parentheses: A(Label With Space) -> A("Label With Space")
  code = code.replace(/(\w+)\(([^()"]+)\)(?!\))/g, (match, nodeId, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `${nodeId}("${label}")`;
    }
    return match;
  });

  // Fix edge labels: |Label| patterns - quote if has spaces/non-ASCII
  // But skip if already quoted: |"label"|
  code = code.replace(/\|([^|"]+)\|/g, (match, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `|"${label}"|`;
    }
    return match;
  });

  // Fix edge labels with dashes: --Label--> patterns (not already quoted)
  code = code.replace(/--([^"\s|>][^>]*?)-->/g, (match, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `--"${label.trim()}"-->`;
    }
    return match;
  });

  return code;
}

// Mermaid diagram component
function MermaidDiagram({ code }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code) return;
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const processedCode = preprocessMermaidCode(code);
        const { svg } = await mermaid.render(id, processedCode);
        setSvg(svg);
        setError(null);
      } catch (err) {
        console.error('Mermaid render error:', err);
        console.error('Original code:', code);
        setError(err.message);
      }
    };
    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-error">
        <p>Diagram rendering failed</p>
        <pre>{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content) {
  if (!content) return { metadata: null, content: '' };

  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) return { metadata: null, content };

  const frontmatter = match[1];
  const markdownContent = content.slice(match[0].length);

  // Parse simple YAML (key: value pairs)
  const metadata = {};
  frontmatter.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      metadata[key] = value;
    }
  });

  return { metadata, content: markdownContent };
}

// Clean notes content - remove blockquotes with status info and raw output sections
function cleanNotesContent(content) {
  if (!content) return content;

  // Remove blockquotes that contain status info (阅读状态, 论文链接, etc.)
  content = content.replace(/^>\s*(阅读状态|论文链接|代码链接|最后更新).*$/gm, '');

  // Remove <details> sections with 原始输出
  content = content.replace(/<details>\s*<summary>原始输出<\/summary>[\s\S]*?<\/details>/g, '');

  // Remove any remaining raw output sections
  content = content.replace(/##\s*原始输出[\s\S]*?(?=\n##|\n---|\Z)/g, '');

  // Clean up multiple consecutive empty lines
  content = content.replace(/\n{4,}/g, '\n\n\n');

  return content;
}

function NotesModal({ document, apiUrl, initialTab = 'paper', onClose }) {
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab); // 'paper' or 'code'
  const [isMaximized, setIsMaximized] = useState(false);

  // Parse the paper notes content to separate frontmatter
  const parsedPaperNotes = useMemo(() => {
    if (!notes?.notesContent) return null;
    const parsed = parseFrontmatter(notes.notesContent);
    parsed.content = cleanNotesContent(parsed.content);
    return parsed;
  }, [notes?.notesContent]);

  // Parse the code notes content to separate frontmatter
  const parsedCodeNotes = useMemo(() => {
    if (!notes?.codeNotesContent) return null;
    const parsed = parseFrontmatter(notes.codeNotesContent);
    parsed.content = cleanNotesContent(parsed.content);
    return parsed;
  }, [notes?.codeNotesContent]);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/documents/${document.id}/notes?inline=true`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch notes');
        }

        setNotes(data);
        // Respect initialTab, but fallback if the requested tab has no content
        if (initialTab === 'code' && data.hasCodeNotes) {
          setActiveTab('code');
        } else if (initialTab === 'paper' && data.hasNotes) {
          setActiveTab('paper');
        } else if (data.hasCodeNotes && !data.hasNotes) {
          setActiveTab('code');
        } else if (data.hasNotes) {
          setActiveTab('paper');
        }
      } catch (err) {
        console.error('Error fetching notes:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [document.id, apiUrl]);

  // Handle click outside to close
  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const getReaderModeBadge = (mode) => {
    if (mode === 'auto_reader') {
      return <span className="reader-mode-badge auto-reader">Auto Reader</span>;
    }
    return <span className="reader-mode-badge vanilla">Vanilla</span>;
  };

  // Custom components for ReactMarkdown to handle mermaid and code blocks
  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      // Render mermaid diagrams
      if (language === 'mermaid' && !inline) {
        return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
      }

      // Regular code blocks
      if (!inline && language) {
        return (
          <pre className={`code-block language-${language}`}>
            <code {...props}>{children}</code>
          </pre>
        );
      }

      // Inline code
      return <code className="inline-code" {...props}>{children}</code>;
    },
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className={`notes-modal ${isMaximized ? 'maximized' : ''}`}>
        <div className="notes-modal-header">
          <div className="header-title-row">
            <h2>Notes: {document.title}</h2>
            {notes?.readerMode && getReaderModeBadge(notes.readerMode)}
          </div>
          <div className="header-actions">
            <button
              className="maximize-btn"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? '⊖' : '⊕'}
            </button>
            <button className="close-btn" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {/* Tabs for paper/code notes */}
        {notes && (notes.hasNotes || notes.hasCodeNotes) && (
          <div className="notes-tabs">
            <button
              className={`notes-tab ${activeTab === 'paper' ? 'active' : ''}`}
              onClick={() => setActiveTab('paper')}
              disabled={!notes.hasNotes}
            >
              Paper Notes
            </button>
            <button
              className={`notes-tab ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}
              disabled={!notes.hasCodeNotes}
            >
              Code Notes
              {notes.hasCodeNotes && <span className="code-badge">Available</span>}
            </button>
          </div>
        )}

        {/* Code URL info */}
        {notes?.codeUrl && (
          <div className="code-url-info">
            <span className="code-label">Code Repository:</span>
            <a href={notes.codeUrl} target="_blank" rel="noopener noreferrer" className="code-link">
              {notes.codeUrl}
            </a>
          </div>
        )}

        <div className="notes-modal-content">
          {loading && (
            <div className="notes-loading">
              <div className="spinner"></div>
              <p>Loading notes...</p>
            </div>
          )}

          {error && (
            <div className="notes-error">
              <p>Error: {error}</p>
            </div>
          )}

          {notes && !notes.hasNotes && !notes.hasCodeNotes && (
            <div className="notes-empty">
              <p>No notes available yet.</p>
              <p className="notes-status">
                Processing status: <strong>{notes.processingStatus}</strong>
              </p>
              {notes.processingStatus === 'pending' && (
                <p className="hint">This document will be processed automatically.</p>
              )}
              {notes.processingStatus === 'queued' && (
                <p className="hint">This document is in the processing queue.</p>
              )}
              {notes.processingStatus === 'processing' && (
                <p className="hint">This document is currently being processed...</p>
              )}
              {notes.processingStatus === 'failed' && (
                <p className="hint error">Processing failed. Please try again later.</p>
              )}
            </div>
          )}

          {/* Paper Notes Tab */}
          {activeTab === 'paper' && notes && notes.hasNotes && parsedPaperNotes && (
            <div className="notes-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {parsedPaperNotes.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Code Notes Tab */}
          {activeTab === 'code' && notes && notes.hasCodeNotes && parsedCodeNotes && (
            <div className="notes-markdown code-notes">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {parsedCodeNotes.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Empty state for selected tab */}
          {activeTab === 'paper' && notes && !notes.hasNotes && notes.hasCodeNotes && (
            <div className="notes-empty">
              <p>No paper notes available.</p>
              <p className="hint">Switch to Code Notes tab to view code analysis.</p>
            </div>
          )}

          {activeTab === 'code' && notes && !notes.hasCodeNotes && notes.hasNotes && (
            <div className="notes-empty">
              <p>No code notes available.</p>
              {notes.hasCode ? (
                <p className="hint">Code analysis is being processed or encountered an error.</p>
              ) : (
                <p className="hint">This paper does not have associated code.</p>
              )}
            </div>
          )}
        </div>

        <div className="notes-modal-footer">
          {activeTab === 'paper' && notes && notes.notesUrl && (
            <a
              href={notes.notesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-notes-btn"
            >
              Download Paper Notes (.md)
            </a>
          )}
          {activeTab === 'code' && notes && notes.codeNotesUrl && (
            <a
              href={notes.codeNotesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-notes-btn"
            >
              Download Code Notes (.md)
            </a>
          )}
          <button className="close-modal-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotesModal;
