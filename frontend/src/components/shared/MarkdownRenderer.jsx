import { useState, useEffect, useRef } from 'react';
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
export function preprocessMermaidCode(code) {
  if (!code) return code;

  code = code.replace(/^(\s*subgraph\s+)([^"'\[\n]+?)(\s*)$/gm, (match, prefix, name, suffix) => {
    const trimmedName = name.trim();
    if (/^\w+$/.test(trimmedName)) return match;
    if ((trimmedName.startsWith('"') && trimmedName.endsWith('"')) ||
        (trimmedName.startsWith("'") && trimmedName.endsWith("'"))) return match;
    return `${prefix}"${trimmedName}"${suffix}`;
  });

  code = code.replace(/^(\s*)(\w+)\[([^\]"]+)\]/gm, (match, indent, nodeId, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `${indent}${nodeId}["${label}"]`;
    }
    return match;
  });

  code = code.replace(/^(\s*)(\w+)\(\(([^)"]+)\)\)/gm, (match, indent, nodeId, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `${indent}${nodeId}(("${label}"))`;
    }
    return match;
  });

  code = code.replace(/\|([^|"]+)\|/g, (match, label) => {
    if (/\s/.test(label) || /[^\x00-\x7F]/.test(label)) {
      return `|"${label}"|`;
    }
    return match;
  });

  return code;
}

// Mermaid diagram component
export function MermaidDiagram({ code }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code) return;
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      try {
        const processedCode = preprocessMermaidCode(code);
        const tempContainer = document.createElement('div');
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);
        const { svg } = await mermaid.render(id, processedCode, tempContainer);
        tempContainer.remove();
        setSvg(svg);
        setError(null);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(err.message);
        document.querySelectorAll(`#d${id}, [id^="dmermaid-"]`).forEach(el => el.remove());
      }
    };
    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-fallback">
        <details>
          <summary>Diagram (click to view source)</summary>
          <pre className="code-block language-mermaid"><code>{code}</code></pre>
        </details>
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
export function parseFrontmatter(content) {
  if (!content) return { metadata: null, content: '' };

  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) return { metadata: null, content };

  const frontmatter = match[1];
  const markdownContent = content.slice(match[0].length);

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

// Clean notes content
export function cleanNotesContent(content) {
  if (!content) return content;

  content = content.replace(/^>\s*(阅读状态|论文链接|代码链接|最后更新).*$/gm, '');
  content = content.replace(/<details>\s*<summary>原始输出<\/summary>[\s\S]*?<\/details>/g, '');
  content = content.replace(/##\s*原始输出[\s\S]*?(?=\n##|\n---|\Z)/g, '');
  content = content.replace(/\n{4,}/g, '\n\n\n');

  return content;
}

// Shared markdown components for ReactMarkdown
export const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    if (language === 'mermaid' && !inline) {
      return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
    }

    if (!inline && language) {
      return (
        <pre className={`code-block language-${language}`}>
          <code {...props}>{children}</code>
        </pre>
      );
    }

    return <code className="inline-code" {...props}>{children}</code>;
  },
};

// Reusable MarkdownContent component
export default function MarkdownContent({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
