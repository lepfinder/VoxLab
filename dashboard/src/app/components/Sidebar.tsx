'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Key,
  History,
  Mic,
  Volume2,
  Moon,
  Sun,
  ChevronDown,
  Cpu
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

// 菜单配置
const MENU_ITEMS = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'tokens', label: 'Token 管理', icon: Key },
  { id: 'logs', label: '调用日志', icon: History },
];

const ASR_PROVIDERS = [
  { id: 'asr-sensevoice', label: 'SenseVoice', description: '快速 + 声纹提取' },
  { id: 'asr-qwen', label: 'Qwen ASR', description: 'Apple Silicon 优化' },
  { id: 'asr-vosk', label: 'Vosk', description: '轻量离线' },
];

const TTS_PROVIDERS = [
  { id: 'tts-kokoro', label: 'Kokoro', description: '多语言多音色' },
  { id: 'tts-qwen', label: 'Qwen TTS', description: '三种模式' },
  { id: 'tts-voxcpm', label: 'VoxCPM', description: '情感控制' },
  { id: 'tts-omni', label: 'OmniVoice', description: '基础 TTS' },
  { id: 'tts-edge', label: 'Edge TTS', description: '云端免费' },
];

export default function Sidebar({ activeTab, onTabChange, isDarkMode, onToggleDarkMode }: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState({
    asr: true,
    tts: true,
  });

  const toggleGroup = (group: 'asr' | 'tts') => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <aside className="w-64 border-r border-[var(--card-border)] flex flex-col p-6 bg-[var(--sidebar-bg)] transition-colors duration-300">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
          <Cpu size={20} />
        </div>
        <span className="font-bold text-xl tracking-tight">VoxLab</span>
      </div>

      {/* 主菜单 */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {MENU_ITEMS.map(item => (
          <NavItem
            key={item.id}
            active={activeTab === item.id}
            onClick={() => onTabChange(item.id)}
            icon={<item.icon size={20} />}
            label={item.label}
          />
        ))}

        {/* ASR 分组 */}
        <div className="pt-4">
          <GroupHeader
            icon={<Mic size={18} />}
            label="ASR 语音识别"
            expanded={expandedGroups.asr}
            onClick={() => toggleGroup('asr')}
          />
          {expandedGroups.asr && (
            <div className="ml-4 mt-1 space-y-1">
              {ASR_PROVIDERS.map(provider => (
                <SubNavItem
                  key={provider.id}
                  active={activeTab === provider.id}
                  onClick={() => onTabChange(provider.id)}
                  label={provider.label}
                  description={provider.description}
                />
              ))}
            </div>
          )}
        </div>

        {/* TTS 分组 */}
        <div className="pt-2">
          <GroupHeader
            icon={<Volume2 size={18} />}
            label="TTS 语音合成"
            expanded={expandedGroups.tts}
            onClick={() => toggleGroup('tts')}
          />
          {expandedGroups.tts && (
            <div className="ml-4 mt-1 space-y-1">
              {TTS_PROVIDERS.map(provider => (
                <SubNavItem
                  key={provider.id}
                  active={activeTab === provider.id}
                  onClick={() => onTabChange(provider.id)}
                  label={provider.label}
                  description={provider.description}
                />
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* 底部：深色模式切换 */}
      <div className="mt-auto pt-6 border-t border-[var(--card-border)]">
        <button
          onClick={onToggleDarkMode}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-all"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          {isDarkMode ? '浅色模式' : '深色模式'}
        </button>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400'
          : 'text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function GroupHeader({ icon, label, expanded, onClick }: { icon: React.ReactNode; label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        {icon}
        {label}
      </div>
      <ChevronDown
        size={14}
        className={`transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
      />
    </button>
  );
}

function SubNavItem({ active, onClick, label, description }: { active: boolean; onClick: () => void; label: string; description: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-col items-start px-3 py-2 rounded-lg text-left transition-colors ${
        active
          ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400'
          : 'text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[10px] opacity-60">{description}</span>
    </button>
  );
}
