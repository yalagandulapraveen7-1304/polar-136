import React from 'react';

export default function MarkdownMessage({ content = '' }) {
  if (!content) return null;

  // 1. Normalize malformed asterisks (e.g. **** -> ** **, ***Item -> • **Item)
  let normalized = content
    .replace(/\*{4,}/g, '** **');

  const lines = normalized.split('\n');

  return (
    <div className="space-y-1.5 text-slate-800 leading-relaxed font-sans text-xs sm:text-sm">
      {lines.map((line, lineIdx) => {
        let trimmed = line.trim();

        if (!trimmed) {
          return <div key={lineIdx} className="h-1.5" />;
        }

        // Determine if line is a bullet item
        let isBullet = false;
        let indentLevel = 0;

        if (line.startsWith('    *') || line.startsWith('    -') || line.startsWith('    •')) {
          indentLevel = 2;
          isBullet = true;
          trimmed = trimmed.replace(/^[*•\-]\s*/, '');
        } else if (line.startsWith('  *') || line.startsWith('  -') || line.startsWith('  •')) {
          indentLevel = 1;
          isBullet = true;
          trimmed = trimmed.replace(/^[*•\-]\s*/, '');
        } else if (trimmed.startsWith('***')) {
          isBullet = true;
          trimmed = '**' + trimmed.slice(3);
        } else if (trimmed.startsWith('* **') || trimmed.startsWith('- **') || trimmed.startsWith('• **')) {
          isBullet = true;
          trimmed = trimmed.replace(/^[*•\-]\s*/, '');
        } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          isBullet = true;
          trimmed = trimmed.replace(/^[*•\-]\s*/, '');
        }

        // Heading detection (### or ## or #)
        let isHeading = false;
        let headingText = trimmed;
        if (trimmed.startsWith('### ')) {
          isHeading = true;
          headingText = trimmed.slice(4);
        } else if (trimmed.startsWith('## ')) {
          isHeading = true;
          headingText = trimmed.slice(3);
        } else if (trimmed.startsWith('# ')) {
          isHeading = true;
          headingText = trimmed.slice(2);
        } else if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
          isHeading = true;
          headingText = trimmed.slice(2, -2);
        }

        if (isHeading) {
          return (
            <div
              key={lineIdx}
              className="font-black text-[#127694] tracking-tight text-xs sm:text-sm pt-2 pb-0.5 border-b border-[#bcecfc]/50 first:pt-0"
            >
              {renderInlineSpans(headingText)}
            </div>
          );
        }

        const inlineContent = renderInlineSpans(trimmed);

        if (isBullet) {
          return (
            <div
              key={lineIdx}
              className={`flex items-start gap-2 ${
                indentLevel === 2 ? 'pl-6' : indentLevel === 1 ? 'pl-3' : 'pl-1'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#0699C6] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">{inlineContent}</div>
            </div>
          );
        }

        return (
          <div key={lineIdx} className="leading-snug">
            {inlineContent}
          </div>
        );
      })}
    </div>
  );
}

function renderInlineSpans(text) {
  if (!text) return null;

  const tokens = text.split(/(`[^`]+`|\*\*[^\*]+\*\*|\*[\w\s\:\/\.\,\-\+\%]+\*)/g);

  return tokens.map((token, i) => {
    if (!token) return null;

    if (token.startsWith('`') && token.endsWith('`') && token.length > 1) {
      return (
        <code
          key={i}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-200/80 text-[#0699C6] font-bold"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    if (token.startsWith('**') && token.endsWith('**') && token.length > 3) {
      return (
        <strong key={i} className="font-extrabold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith('*') && token.endsWith('*') && token.length > 2 && !token.startsWith('**')) {
      return (
        <em key={i} className="italic text-slate-700">
          {token.slice(1, -1)}
        </em>
      );
    }

    return <span key={i}>{token}</span>;
  });
}