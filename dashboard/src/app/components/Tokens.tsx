'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface Token {
  token: string;
  name: string;
  created_at: string;
}

interface TokensProps {
  tokens: Token[];
  onCreateToken: (name: string) => void;
  onDeleteToken: (token: string) => void;
}

export default function Tokens({ tokens, onCreateToken, onDeleteToken }: TokensProps) {
  const [newTokenName, setNewTokenName] = useState('');

  const handleCreate = () => {
    if (!newTokenName.trim()) return;
    onCreateToken(newTokenName);
    setNewTokenName('');
  };

  return (
    <div className="space-y-6">
      {/* 创建 Token */}
      <div className="flex gap-4 mb-8">
        <input
          type="text"
          placeholder="输入 Token 名称"
          className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm text-[var(--foreground)]"
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <Plus size={20} />
          创建 Token
        </button>
      </div>

      {/* Token 列表 */}
      <div className="grid gap-4">
        {tokens.map(token => (
          <div key={token.token} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex items-center justify-between group hover:border-blue-500/30 transition-all shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="font-semibold text-lg">{token.name}</span>
                <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">Active</span>
              </div>
              <code className="text-blue-600 dark:text-blue-400 font-mono text-sm bg-blue-500/5 px-2 py-1 rounded">{token.token}</code>
              <div className="text-[var(--muted-text)] text-xs mt-2">创建于: {new Date(token.created_at).toLocaleString()}</div>
            </div>
            <button
              onClick={() => {
                if (confirm('确定要删除这个 Token 吗？')) {
                  onDeleteToken(token.token);
                }
              }}
              className="text-[var(--muted-text)] hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
