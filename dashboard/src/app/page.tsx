'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import Tokens from './components/Tokens';
import Logs from './components/Logs';
import SenseVoicePage from './components/asr/SenseVoicePage';
import QwenASRPage from './components/asr/QwenASRPage';
import VoskPage from './components/asr/VoskPage';
import KokoroPage from './components/tts/KokoroPage';
import QwenTTSPage from './components/tts/QwenTTSPage';
import VoxCPMPage from './components/tts/VoxCPMPage';
import OmniPage from './components/tts/OmniPage';
import EdgePage from './components/tts/EdgePage';
import ConversationPage from './components/ConversationPage';
import SystemConfigPage from './components/SystemConfigPage';

// 页面标题映射
const PAGE_TITLES: Record<string, string> = {
  overview: '系统概览',
  conversation: '实时对话',
  'asr-sensevoice': 'SenseVoice',
  'asr-qwen': 'Qwen ASR',
  'asr-vosk': 'Vosk',
  'tts-kokoro': 'Kokoro',
  'tts-qwen': 'Qwen TTS',
  'tts-voxcpm': 'VoxCPM',
  'tts-omni': 'OmniVoice',
  'tts-edge': 'Edge TTS',
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [tokens, setTokens] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ count: 0, tokens: 0 });
  const [selectedKey, setSelectedKey] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const API_BASE = '/admin';

  // 获取数据
  const fetchData = async () => {
    try {
      const [tokensRes, logsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/tokens`),
        fetch(`${API_BASE}/logs`),
        fetch(`${API_BASE}/stats`)
      ]);
      const tokenData = await tokensRes.json();
      setTokens(tokenData);
      if (tokenData.length > 0 && !selectedKey) setSelectedKey(tokenData[0].token);
      setLogs(await logsRes.json());
      setStats(await statsRes.json());
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, []);

  // Token 操作
  const handleCreateToken = async (name: string) => {
    await fetch(`${API_BASE}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    fetchData();
  };

  const handleDeleteToken = async (token: string) => {
    await fetch(`${API_BASE}/tokens/${token}`, { method: 'DELETE' });
    fetchData();
  };

  // 渲染内容
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview stats={stats} logs={logs} isDarkMode={isDarkMode} />;
      case 'tokens':
        return <Tokens tokens={tokens} onCreateToken={handleCreateToken} onDeleteToken={handleDeleteToken} />;
      case 'logs':
        return <Logs logs={logs} />;
      case 'conversation':
        return <ConversationPage selectedKey={selectedKey} onJumpToConfig={() => setActiveTab('system-config')} />;
      case 'system-config':
        return (
          <SystemConfigPage
            tokens={tokens}
            onCreateToken={handleCreateToken}
            onDeleteToken={handleDeleteToken}
            logs={logs}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            defaultTab="general"
          />
        );
      case 'asr-sensevoice':
        return <SenseVoicePage selectedKey={selectedKey} />;
      case 'asr-qwen':
        return <QwenASRPage selectedKey={selectedKey} />;
      case 'asr-vosk':
        return <VoskPage selectedKey={selectedKey} />;
      case 'tts-kokoro':
        return <KokoroPage selectedKey={selectedKey} />;
      case 'tts-qwen':
        return <QwenTTSPage selectedKey={selectedKey} />;
      case 'tts-voxcpm':
        return <VoxCPMPage selectedKey={selectedKey} />;
      case 'tts-omni':
        return <OmniPage selectedKey={selectedKey} />;
      case 'tts-edge':
        return <EdgePage selectedKey={selectedKey} />;
      default:
        return <Overview stats={stats} logs={logs} isDarkMode={isDarkMode} />;
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
        {/* 侧边栏 */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto p-8 pb-24 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            {/* 页面标题 - 仅在非模型/非配置页显示 */}
            {!activeTab.startsWith('asr-')
              && !activeTab.startsWith('tts-')
              && activeTab !== 'system-config' && (
              <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2">
                  {PAGE_TITLES[activeTab] || 'VoxLab'}
                </h1>
                <p className="text-[var(--muted-text)] text-sm">
                  {activeTab === 'overview' ? '监控你的本地 AI 服务运行状态' : ''}
                </p>
              </header>
            )}

            {/* 页面内容 */}
            {renderContent()}

            {/* 底部占位 */}
            <div className="h-40 w-full" />
          </div>
        </main>
      </div>
    </div>
  );
}
