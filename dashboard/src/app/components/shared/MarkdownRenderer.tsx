'use client';

import React, { useState, useEffect, useMemo } from 'react';
import MarkdownIt from 'markdown-it';

interface MarkdownRendererProps {
  model: string;
  filename?: string;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

export default function MarkdownRenderer({ model, filename = 'index.md' }: MarkdownRendererProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/admin/docs/${model}/${filename}`)
      .then(res => {
        if (!res.ok) throw new Error('文档未找到');
        return res.text();
      })
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [model, filename]);

  const html = useMemo(() => md.render(content), [content]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="ml-3 text-[var(--muted-text)] text-sm">加载文档中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-[var(--muted-text)]">
        <p className="text-sm">{error}</p>
        <p className="text-xs mt-2 opacity-60">请在 docs/models/{model}/ 目录下添加 {filename} 文件</p>
      </div>
    );
  }

  return (
    <div
      className="md-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
