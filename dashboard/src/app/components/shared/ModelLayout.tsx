'use client';

import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface ModelLayoutProps {
  name: string;
  description: string;
  features: string[];
  modelId: string;
  framework?: string;
  useCases?: string[];
  githubUrl?: string;
  docUrl?: string;
  blogUrl?: string;
  model: string; // docs folder name
  children: React.ReactNode; // test tab content
}

const TABS = [
  { id: 'test', label: '模型测试' },
  { id: 'docs', label: '模型文档' },
];

export default function ModelLayout({
  name,
  description,
  features,
  modelId,
  framework,
  useCases,
  githubUrl,
  docUrl,
  blogUrl,
  model,
  children,
}: ModelLayoutProps) {
  const [activeTab, setActiveTab] = useState('test');

  return (
    <div>
      {/* Header - 全宽横跨 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">{name}</h2>
        <p className="text-sm text-[var(--muted-text)]">{description}</p>
      </div>

      {/* 下方两栏 */}
      <div className="flex gap-6 min-h-[calc(100vh-10rem)]">
        {/* 左侧边栏 - 模型信息 */}
        <div className="w-[260px] shrink-0">
          <div className="sticky top-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">

          {/* 模型 ID */}
          <div className="mb-3">
            <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
              模型 ID
            </label>
            {modelId.includes('/') ? (
              <a
                href={`https://huggingface.co/${modelId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-mono hover:underline break-all"
              >
                {modelId}
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              <code className="text-xs text-blue-600 dark:text-blue-400 font-mono break-all">
                {modelId}
              </code>
            )}
          </div>

          {/* 框架 */}
          {framework && (
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
                推理框架
              </label>
              <span className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                <Zap size={12} />
                {framework}
              </span>
            </div>
          )}

          {/* 特点 */}
          <div className="mb-3">
            <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1.5 block">
              特点
            </label>
            <div className="flex flex-wrap gap-1.5">
              {features.map((f, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-green-600/10 text-green-600 dark:text-green-400">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* 适用场景 */}
          {useCases && useCases.length > 0 && (
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1.5 block">
                适用场景
              </label>
              <div className="flex flex-wrap gap-1.5">
                {useCases.map((u, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-orange-600/10 text-orange-600 dark:text-orange-400">
                    {u}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 官方文档 */}
          {docUrl && (
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
                官方文档
              </label>
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                <span>Read the Docs</span>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

          {/* 官方博客 */}
          {blogUrl && (
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
                官方博客
              </label>
              <a
                href={blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                <span>View Blog</span>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

          {/* GitHub 链接 */}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mt-2"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>查看源码</span>
            </a>
          )}
        </div>
      </div>

      {/* 右侧主区域 */}
      <div className="flex-1 min-w-0">
        {/* Tab 切换 */}
        <div className="flex gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-1 mb-5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-[var(--muted-text)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        {activeTab === 'test' && children}
        {activeTab === 'docs' && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
            <MarkdownRenderer model={model} />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
