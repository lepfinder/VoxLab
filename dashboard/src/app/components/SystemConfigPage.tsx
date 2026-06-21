'use client';

import React, { useState } from 'react';
import {
  Settings,
  Key,
  History,
  Bot,
  Palette,
  Sun,
  Moon,
  Check,
  Server
} from 'lucide-react';

import Tokens from './Tokens';
import Logs from './Logs';
import LLMConfigPage from './LLMConfigPage';
import ModelsTab from './ModelsTab';

export type SystemConfigTab = 'general' | 'tokens' | 'logs' | 'llm' | 'models';

interface Props {
  tokens: any[];
  onCreateToken: (name: string) => void;
  onDeleteToken: (token: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  defaultTab?: SystemConfigTab;
}

const TABS: { id: SystemConfigTab; label: string; icon: any }[] = [
  { id: 'general', label: '通用', icon: Palette },
  { id: 'tokens', label: 'API-Token 管理', icon: Key },
  { id: 'logs', label: '调用日志', icon: History },
  { id: 'llm', label: 'LLM 配置', icon: Bot },
  { id: 'models', label: '模型管理', icon: Server },
];

export default function SystemConfigPage({
  tokens,
  onCreateToken,
  onDeleteToken,
  isDarkMode,
  onToggleDarkMode,
  defaultTab = 'general',
}: Props) {
  const [activeTab, setActiveTab] = useState<SystemConfigTab>(defaultTab);

  // 当 defaultTab 发生改变时，同步更新 activeTab 状态，支持外部跳转
  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">系统配置</h2>
        <p className="text-sm text-[var(--muted-text)]">
          管理 Token、调用日志、外接 LLM 供应商，以及通用主题设置
        </p>
      </div>

      <div className="flex gap-6 min-h-[calc(100vh-12rem)]">
        {/* 左侧 Tab 导航 */}
        <div className="w-[200px] shrink-0">
          <div className="sticky top-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-3 shadow-sm space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all ${activeTab === tab.id
                    ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
                  }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 min-w-0">
          {activeTab === 'general' && (
            <GeneralTab isDarkMode={isDarkMode} onToggleDarkMode={onToggleDarkMode} />
          )}
          {activeTab === 'tokens' && (
            <Tokens tokens={tokens} onCreateToken={onCreateToken} onDeleteToken={onDeleteToken} />
          )}
          {activeTab === 'logs' && <Logs />}
          {activeTab === 'llm' && <LLMConfigPage embedded />}
          {activeTab === 'models' && <ModelsTab />}
        </div>
      </div>
    </div>
  );
}

function GeneralTab({
  isDarkMode,
  onToggleDarkMode,
}: {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>(isDarkMode ? 'dark' : 'light');

  const applyTheme = (mode: 'light' | 'dark') => {
    setTheme(mode);
    if ((mode === 'dark') !== isDarkMode) onToggleDarkMode();
  };

  return (
    <div className="space-y-6">
      {/* 主题外观 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Palette size={18} /> 主题外观
        </h3>
        <p className="text-xs text-[var(--muted-text)] mb-5">切换深色 / 浅色模式</p>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <ThemeCard
            active={theme === 'light'}
            onClick={() => applyTheme('light')}
            label="浅色"
            icon={<Sun size={18} />}
            previewClass="bg-white border-slate-200 text-slate-900"
            blockClass="bg-slate-100 text-slate-800"
          />
          <ThemeCard
            active={theme === 'dark'}
            onClick={() => applyTheme('dark')}
            label="深色"
            icon={<Moon size={18} />}
            previewClass="bg-slate-900 border-slate-700 text-slate-100"
            blockClass="bg-slate-800 text-slate-200"
          />
        </div>
      </div>

      {/* 其他通用设置占位（后续可扩展） */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Settings size={18} /> 系统
        </h3>
        <p className="text-xs text-[var(--muted-text)]">
          更多通用设置（语言、时区、缓存等）将陆续加入。
        </p>
      </div>
    </div>
  );
}

function ThemeCard({
  active,
  onClick,
  label,
  icon,
  previewClass,
  blockClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  previewClass: string;
  blockClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left rounded-2xl border-2 p-4 transition-all ${active
          ? 'border-blue-600 shadow-lg shadow-blue-500/20'
          : 'border-[var(--card-border)] hover:border-blue-500/40'
        }`}
    >
      {active && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
          <Check size={12} />
        </span>
      )}
      {/* 缩略预览 */}
      <div className={`rounded-xl border p-3 mb-3 ${previewClass}`}>
        <div className="text-xs font-semibold mb-2">{label}</div>
        <div className="space-y-1.5">
          <div className={`h-1.5 rounded ${blockClass}`} style={{ width: '70%' }} />
          <div className={`h-1.5 rounded ${blockClass}`} style={{ width: '90%' }} />
          <div className={`h-1.5 rounded ${blockClass}`} style={{ width: '40%' }} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
    </button>
  );
}
