'use client';

import React, { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface ModelTabsProps {
  model: string;
  children: React.ReactNode;
}

const TABS = [
  { id: 'test', label: '模型测试' },
  { id: 'docs', label: '模型文档' },
];

export default function ModelTabs({ model, children }: ModelTabsProps) {
  const [activeTab, setActiveTab] = useState('test');

  return (
    <div>
      {/* Tab 切换 */}
      <div className="flex gap-1 bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-1 mb-6">
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
  );
}
