'use client';

import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface ApiExampleProps {
  code: string;
  title?: string;
  language?: string;
}

export default function ApiExample({ code, title = 'cURL 示例', language = 'bash' }: ApiExampleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--foreground)]/5 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-[var(--muted-text)]" />
          <span className="text-sm font-semibold text-[var(--muted-text)]">{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background)] border border-[var(--card-border)] hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-600 transition-all"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-500" />
              <span className="text-green-500">已复制</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              复制
            </>
          )}
        </button>
      </div>

      {/* 代码区域 */}
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-[var(--foreground)] whitespace-pre-wrap break-words">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
