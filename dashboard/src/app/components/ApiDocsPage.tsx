'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import MarkdownIt from 'markdown-it';

// 自定义插件：给 h2/h3 加 id
function anchorPlugin(md: MarkdownIt) {
  const headingOpen = md.renderer.rules.heading_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.heading_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const level = parseInt(token.tag.replace('h', ''), 10);
    if (level >= 2 && level <= 3) {
      // 找到对应的 inline token（下一个 token）
      const inlineToken = tokens[idx + 1];
      if (inlineToken && inlineToken.children) {
        const text = inlineToken.children
          .filter(c => c.type === 'text' || c.type === 'code_inline')
          .map(c => c.content)
          .join('')
          .trim();
        const id = text
          .toLowerCase()
          .replace(/[^\w\s一-鿿]/g, '')
          .replace(/\s+/g, '-');
        token.attrSet('id', id);
      }
    }
    return headingOpen.call(this, tokens, idx, options, env, self);
  };
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});
md.use(anchorPlugin);

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function parseToc(content: string): TocItem[] {
  const lines = content.split('\n');
  const items: TocItem[] = [];
  const slugMap: Record<string, number> = {};

  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (!m) continue;
    const level = m[1].length - 1; // ##=1, ###=2
    const raw = m[2].trim();
    let slug = raw
      .toLowerCase()
      .replace(/[^\w\s一-鿿]/g, '')
      .replace(/\s+/g, '-');
    if (slugMap[slug] !== undefined) {
      slugMap[slug]++;
      slug += `-${slugMap[slug]}`;
    } else {
      slugMap[slug] = 0;
    }
    items.push({ id: slug, text: raw, level });
  }
  return items;
}

function buildTocHtml(items: TocItem[], activeId: string, onNavigate: (id: string) => void) {
  const h2Items = items.filter(i => i.level === 1);
  return (
    <nav className="space-y-0.5">
      {h2Items.map(item => {
        const idx = items.indexOf(item);
        const kids: TocItem[] = [];
        for (let j = idx + 1; j < items.length; j++) {
          if (items[j].level <= item.level) break;
          kids.push(items[j]);
        }

        return (
          <div key={item.id}>
            <button
              onClick={() => onNavigate(item.id)}
              className={`w-full text-left px-2 py-1 rounded-md text-[13px] transition-colors ${
                activeId === item.id
                  ? 'text-blue-600 dark:text-blue-400 font-medium bg-blue-600/10'
                  : 'text-[var(--muted-text)] hover:text-[var(--foreground)]'
              }`}
            >
              {item.text}
            </button>
            {kids.length > 0 && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--card-border)] pl-2">
                {kids.map(child => (
                  <button
                    key={child.id}
                    onClick={() => onNavigate(child.id)}
                    className={`w-full text-left px-2 py-0.5 rounded-md text-[12px] transition-colors ${
                      activeId === child.id
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-[var(--muted-text)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {child.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function ApiDocsPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const mainElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    fetch('/admin/api-docs')
      .then(res => {
        if (!res.ok) throw new Error('文档加载失败');
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
  }, []);

  const tocItems = useMemo(() => parseToc(content), [content]);

  const html = useMemo(() => md.render(content), [content]);

  // 找到 <main> 滚动容器
  useEffect(() => {
    if (!loading) {
      mainElRef.current = document.querySelector('main.overflow-y-auto');
    }
  }, [loading]);

  // scroll spy — 监听 main 容器
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    const headings = contentRef.current.querySelectorAll('h2[id], h3[id]');
    let current = '';
    for (const h of Array.from(headings)) {
      const rect = h.getBoundingClientRect();
      if (rect.top < 120) current = h.id;
    }
    if (current) setActiveId(current);
  }, []);

  useEffect(() => {
    const container = mainElRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll, loading]);

  const navigate = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const container = mainElRef.current;
    if (!container) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // 手动计算：目标元素相对视口的位置 → 容器应滚动到的位置
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - 16;
    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="ml-3 text-[var(--muted-text)] text-sm">加载文档中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-[var(--muted-text)]">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-8 relative">
      {/* 左侧：文档内容 */}
      <div ref={contentRef} className="flex-1 min-w-0 md-content prose prose-invert max-w-none">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {/* 右侧：目录 */}
      {tocItems.length > 0 && (
        <aside className="w-52 shrink-0 hidden lg:block">
          <div className="sticky top-6">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-text)] mb-3 px-2">
              目录
            </h4>
            {buildTocHtml(tocItems, activeId, navigate)}
          </div>
        </aside>
      )}
    </div>
  );
}

