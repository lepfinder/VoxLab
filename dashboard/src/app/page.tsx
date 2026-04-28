"use client";

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Key, 
  History, 
  Settings, 
  Plus, 
  Trash2, 
  Activity, 
  Cpu, 
  Zap,
  Moon,
  Sun
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [tokens, setTokens] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ count: 0, tokens: 0 });
  const [availableModels, setAvailableModels] = useState({ chat: [], audio: {} });
  const [newTokenName, setNewTokenName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Playground state
  const [playgroundMode, setPlaygroundMode] = useState('chat'); // chat, asr, tts
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [audioResult, setAudioResult] = useState(null);
  const [asrAudioUrl, setAsrAudioUrl] = useState(null);
  const [asrResult, setAsrResult] = useState('');

  const API_BASE = '/v1/admin';

  useEffect(() => {
    fetchData();
    fetchModels();
    const timer = setInterval(() => {
      fetchData();
      fetchModels();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/models`);
      const data = await res.json();
      setAvailableModels(data);
      
      // 初始加载或刷新后，确保有一个选中的模型
      if (playgroundMode === 'chat' && !selectedModel && data.chat?.length > 0) {
        setSelectedModel(data.chat[0]);
      } else if (playgroundMode === 'asr' && !selectedModel && data.audio.asr?.length > 0) {
        setSelectedModel(data.audio.asr[0]);
      } else if (playgroundMode === 'tts' && !selectedModel && data.audio.tts?.length > 0) {
        setSelectedModel(data.audio.tts[0].id);
        setSelectedVoice(data.audio.tts[0].voices[0]);
      }
    } catch (e) { console.error("Fetch models error:", e); }
  };

  // 根据模式自动切换默认模型和音色
  useEffect(() => {
    if (!availableModels.chat) return;

    if (playgroundMode === 'chat') {
      if (!availableModels.chat.includes(selectedModel)) {
        setSelectedModel(availableModels.chat[0] || '');
      }
    } else if (playgroundMode === 'asr') {
      if (!availableModels.audio.asr?.includes(selectedModel)) {
        setSelectedModel(availableModels.audio.asr?.[0] || '');
      }
    } else if (playgroundMode === 'tts') {
      const ttsModels = availableModels.audio.tts || [];
      const currentModelData = ttsModels.find(m => (typeof m === 'string' ? m : m.id) === selectedModel);
      
      if (!currentModelData && ttsModels.length > 0) {
        const first = ttsModels[0];
        const firstId = typeof first === 'string' ? first : first.id;
        setSelectedModel(firstId);
        setSelectedVoice(typeof first === 'string' ? '' : (first.voices?.[0] || ''));
      } else if (currentModelData && typeof currentModelData !== 'string') {
        if (!selectedVoice || !currentModelData.voices?.includes(selectedVoice)) {
          setSelectedVoice(currentModelData.voices?.[0] || '');
        }
      }
      if (!prompt) setPrompt('你好，我是 HomeCore AI，很高兴为你服务。');
    }
  }, [playgroundMode, availableModels]);

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

  const sendMessage = async () => {
    if (!prompt || !selectedModel || !selectedKey) return;
    
    const userMsg = { role: 'user', content: prompt };
    setChatHistory(prev => [...prev, userMsg]);
    setPrompt('');
    setIsTyping(true);

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false
        })
      });
      
      const data = await res.json();
      const aiMsg = { 
        role: 'assistant', 
        content: data.choices[0].message.content,
        usage: data.usage 
      };
      setChatHistory(prev => [...prev, aiMsg]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'error', content: '请求失败，请检查模型状态或 API Key' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleASR = async (file) => {
    if (!file || !selectedKey) return;
    setIsTyping(true);
    setAsrResult('转录中...');
    
    // 生成预览链接
    if (asrAudioUrl) URL.revokeObjectURL(asrAudioUrl);
    setAsrAudioUrl(URL.createObjectURL(file));
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', selectedModel);

    try {
      const res = await fetch('/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${selectedKey}` },
        body: formData
      });
      const data = await res.json();
      setAsrResult(data.text);
    } catch (e) {
      setAsrResult('转录失败');
    } finally {
      setIsTyping(false);
    }
  };

  const handleTTS = async () => {
    if (!prompt || !selectedKey) return;
    setIsTyping(true);
    if (audioResult) URL.revokeObjectURL(audioResult);
    setAudioResult(null);

    try {
      const res = await fetch('/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          input: prompt,
          voice: selectedVoice
        })
      });
      
      if (!res.ok) throw new Error();
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioResult(url);
    } catch (e) {
      alert('合成失败');
    } finally {
      setIsTyping(false);
    }
  };

  const generateCurl = () => {
    const host = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8001';
    const auth = ` -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}"`;
    
    if (playgroundMode === 'chat') {
      return `curl ${host}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
 ${auth} \\
  -d '{
    "model": "${selectedModel}",
    "messages": [{"role": "user", "content": "${prompt.replace(/"/g, '\\"') || '你好'}"}],
    "stream": false
  }'`;
    } else if (playgroundMode === 'asr') {
      return `curl ${host}/v1/audio/transcriptions \\
 ${auth} \\
  -F "file=@/path/to/your/audio.wav" \\
  -F "model=${selectedModel}"`;
    } else if (playgroundMode === 'tts') {
      return `curl ${host}/v1/audio/speech \\
  -H "Content-Type: application/json" \\
 ${auth} \\
  -d '{
    "model": "${selectedModel}",
    "input": "${prompt.replace(/"/g, '\\"') || '你好'}",
    "voice": "${selectedVoice}"
  }' --output out.wav`;
    }
    return '';
  };

  const createToken = async () => {
    if (!newTokenName) return;
    await fetch(`${API_BASE}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTokenName })
    });
    setNewTokenName('');
    fetchData();
  };

  const deleteToken = async (token) => {
    if (!confirm('确定要删除这个 Token 吗？')) return;
    await fetch(`${API_BASE}/tokens/${token}`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div className={`flex h-screen overflow-hidden ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
        {/* Sidebar */}
        <aside className="w-64 border-r border-[var(--card-border)] flex flex-col p-6 bg-[var(--sidebar-bg)] transition-colors duration-300">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <Cpu size={20} />
            </div>
            <span className="font-bold text-xl tracking-tight">HomeCore AI</span>
          </div>
          
          <nav className="flex-1 space-y-2">
            <NavItem 
              active={activeTab === 'overview'} 
              onClick={() => setActiveTab('overview')}
              icon={<LayoutDashboard size={20}/>}
              label="概览"
            />
            <NavItem 
              active={activeTab === 'tokens'} 
              onClick={() => setActiveTab('tokens')}
              icon={<Key size={20}/>}
              label="Token 管理"
            />
            <NavItem 
              active={activeTab === 'logs'} 
              onClick={() => setActiveTab('logs')}
              icon={<History size={20}/>}
              label="调用日志"
            />
            <NavItem 
              active={activeTab === 'playground'} 
              onClick={() => setActiveTab('playground')}
              icon={<Activity size={20}/>}
              label="模型测试"
            />
          </nav>
          
          <div className="mt-auto pt-6 border-t border-[var(--card-border)]">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-all"
            >
              {isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}
              {isDarkMode ? '浅色模式' : '深色模式'}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 pb-24 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <header className="mb-10 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-bold mb-2">
                  {activeTab === 'overview' ? '系统概览' : activeTab === 'tokens' ? 'Token 管理' : activeTab === 'logs' ? '调用日志' : '模型测试'}
                </h1>
                <p className="text-[var(--muted-text)] text-sm">监控你的本地 AI 服务运行状态</p>
              </div>
              <div className="flex items-center gap-2 bg-green-500/10 text-green-500 px-3 py-1.5 rounded-full text-xs font-bold border border-green-500/20">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                系统运行中
              </div>
            </header>

            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard 
                    title="总请求数" 
                    value={stats.count || 0} 
                    icon={<Activity className="text-blue-500"/>}
                    trend="+12%"
                  />
                  <StatCard 
                    title="总 Token 消耗" 
                    value={stats.tokens || 0} 
                    icon={<Zap className="text-yellow-500"/>}
                    trend="+5.4%"
                  />
                  <StatCard 
                    title="平均响应" 
                    value="1.2s" 
                    icon={<Activity className="text-purple-500"/>}
                    trend="-0.2s"
                  />
                </div>

                {/* Chart */}
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold mb-6">调用趋势</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={logs.slice(0, 20).reverse()}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#222" : "#eee"} vertical={false} />
                        <XAxis dataKey="created_at" hide />
                        <YAxis stroke="#999" fontSize={12} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: isDarkMode ? '#111' : '#fff', 
                            border: `1px solid ${isDarkMode ? '#333' : '#eee'}`, 
                            borderRadius: '12px',
                            color: isDarkMode ? '#fff' : '#000'
                          }}
                        />
                        <Area type="monotone" dataKey="duration" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tokens' && (
              <div className="space-y-6">
                <div className="flex gap-4 mb-8">
                  <input 
                    type="text" 
                    placeholder="输入 Token 名称" 
                    className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm text-[var(--foreground)]"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                  />
                  <button 
                    onClick={createToken}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                  >
                    <Plus size={20}/>
                    创建 Token
                  </button>
                </div>

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
                        onClick={() => deleteToken(token.token)}
                        className="text-[var(--muted-text)] hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={20}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[var(--foreground)]/5 text-[var(--muted-text)] text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold">时间</th>
                      <th className="px-6 py-4 font-semibold">模型</th>
                      <th className="px-6 py-4 font-semibold">接口</th>
                      <th className="px-6 py-4 font-semibold">状态</th>
                      <th className="px-6 py-4 font-semibold">耗时</th>
                      <th className="px-6 py-4 font-semibold text-right">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--card-border)]">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-[var(--foreground)]/[0.02] transition-colors">
                        <td className="px-6 py-4 text-xs text-[var(--muted-text)]">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-medium">{log.model}</td>
                        <td className="px-6 py-4 text-sm text-blue-600 dark:text-blue-400 font-mono">{log.endpoint}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status_code < 400 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                            {log.status_code}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--foreground)]/70">{log.duration.toFixed(2)}s</td>
                        <td className="px-6 py-4 text-sm text-right font-mono text-orange-500">{log.total_tokens || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'playground' && (
              <div className="flex flex-col h-[calc(100vh-200px)]">
                {/* Playground Sub-tabs */}
                <div className="flex gap-2 mb-6 bg-[var(--card-bg)] p-1 rounded-xl border border-[var(--card-border)] w-fit shadow-sm">
                  <button 
                    onClick={() => setPlaygroundMode('chat')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${playgroundMode === 'chat' ? 'bg-blue-600 text-white shadow-md' : 'text-[var(--muted-text)] hover:bg-[var(--foreground)]/5'}`}
                  >
                    智能对话
                  </button>
                  <button 
                    onClick={() => setPlaygroundMode('asr')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${playgroundMode === 'asr' ? 'bg-blue-600 text-white shadow-md' : 'text-[var(--muted-text)] hover:bg-[var(--foreground)]/5'}`}
                  >
                    音频转文字 (ASR)
                  </button>
                  <button 
                    onClick={() => setPlaygroundMode('tts')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${playgroundMode === 'tts' ? 'bg-blue-600 text-white shadow-md' : 'text-[var(--muted-text)] hover:bg-[var(--foreground)]/5'}`}
                  >
                    文字转音频 (TTS)
                  </button>
                </div>

                {/* Playground Settings */}
                <div className="flex gap-4 mb-6 bg-[var(--card-bg)] border border-[var(--card-border)] p-4 rounded-2xl shadow-sm">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-[var(--muted-text)] mb-2 uppercase">测试模型</label>
                    <select 
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
                    >
                      {playgroundMode === 'chat' && availableModels.chat.map(m => <option key={m} value={m}>{m}</option>)}
                      {playgroundMode === 'asr' && availableModels.audio.asr?.map(m => <option key={m} value={m}>{m}</option>)}
                      {playgroundMode === 'tts' && availableModels.audio.tts?.map(m => {
                        const id = typeof m === 'string' ? m : m.id;
                        return <option key={id} value={id}>{id}</option>;
                      })}
                    </select>
                  </div>
                  {playgroundMode === 'tts' && (
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-[var(--muted-text)] mb-2 uppercase">测试音色 (Voice)</label>
                      <select 
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
                      >
                        {(() => {
                          const ttsModels = availableModels.audio.tts || [];
                          const modelData = ttsModels.find(m => (typeof m === 'string' ? m : m.id) === selectedModel);
                          if (typeof modelData === 'string' || !modelData?.voices) {
                            return <option value="">默认 (Default)</option>;
                          }
                          return modelData.voices.map(v => (
                            <option key={v} value={v}>{v}</option>
                          ));
                        })()}
                      </select>
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-[var(--muted-text)] mb-2 uppercase">测试 API Key</label>
                    <select 
                      value={selectedKey}
                      onChange={(e) => setSelectedKey(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
                    >
                      {tokens.map(t => <option key={t.token} value={t.token}>{t.name} ({t.token.slice(0, 8)}...)</option>)}
                    </select>
                  </div>
                </div>

                {/* Mode Specific Views */}
                {playgroundMode === 'chat' && (
                  <>
                    <div className="flex-1 overflow-y-auto mb-6 space-y-4 pr-2">
                      {chatHistory.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-[var(--muted-text)] opacity-40">
                          <Activity size={48} className="mb-4" />
                          <p>选择聊天模型并开始对话</p>
                        </div>
                      )}
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            msg.role === 'user' 
                              ? 'bg-blue-600 text-white shadow-lg' 
                              : msg.role === 'error'
                              ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                              : 'bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm'
                          }`}>
                            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                            {msg.usage && (
                              <div className="text-[10px] mt-2 opacity-50 border-t border-white/10 pt-1">
                                Tokens: {msg.usage.total_tokens} (P: {msg.usage.prompt_tokens} C: {msg.usage.completion_tokens})
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isTyping && <TypingIndicator />}
                    </div>

                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        placeholder="输入测试指令..." 
                        className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm text-[var(--foreground)]"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      />
                      <button 
                        onClick={sendMessage}
                        disabled={isTyping}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20"
                      >
                        发送
                      </button>
                    </div>
                  </>
                )}

                {playgroundMode === 'asr' && (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-8 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-10">
                    <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center text-blue-500">
                      <Cpu size={40} />
                    </div>
                    <div className="text-center max-w-md">
                      <h3 className="text-xl font-bold mb-2">上传音频文件进行转录</h3>
                      <p className="text-[var(--muted-text)] text-sm mb-6">支持 wav, mp3, flac 等常见音频格式</p>
                      
                      <input 
                        type="file" 
                        id="asr-upload" 
                        hidden 
                        onChange={(e) => handleASR(e.target.files[0])}
                      />
                      <label 
                        htmlFor="asr-upload"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold transition-all cursor-pointer shadow-lg shadow-blue-500/20"
                      >
                        <Plus size={20}/>
                        选择并上传音频
                      </label>
                    </div>

                    {asrAudioUrl && (
                      <div className="w-full mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-center gap-4">
                        <span className="text-sm font-bold text-blue-600">已上传音频:</span>
                        <audio src={asrAudioUrl} controls className="flex-1 h-8" />
                      </div>
                    )}

                    <div className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-4">
                      <label className="block text-xs font-bold text-[var(--muted-text)] mb-2 uppercase">转录结果</label>
                      <div className="text-[var(--foreground)] min-h-[60px]">
                        {asrResult || <span className="text-[var(--muted-text)] italic">等待上传音频...</span>}
                      </div>
                    </div>
                    {isTyping && <TypingIndicator />}
                  </div>
                )}

                {playgroundMode === 'tts' && (
                  <div className="flex-1 flex flex-col space-y-6">
                    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-8 shadow-sm">
                      <label className="block text-xs font-bold text-[var(--muted-text)] mb-4 uppercase">输入要合成的文本</label>
                      <textarea 
                        className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-4 h-40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)] text-lg leading-relaxed"
                        placeholder="你好，我是 HomeCore AI，很高兴为你服务。"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                      />
                      <div className="flex justify-between items-center mt-6">
                        <div className="text-xs text-[var(--muted-text)]">
                          支持中文、英文等多语言合成
                        </div>
                        <button 
                          onClick={handleTTS}
                          disabled={isTyping || !prompt}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                        >
                          {isTyping ? '合成中...' : '开始合成'}
                          <Zap size={18} />
                        </button>
                      </div>
                    </div>

                    {audioResult && (
                      <div className="bg-blue-600/5 border border-blue-600/20 rounded-2xl p-6 flex flex-col items-center">
                        <h4 className="font-bold mb-4 text-blue-600 dark:text-blue-400">合成结果预览</h4>
                        <audio src={audioResult} controls className="w-full h-10" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* CURL 调试信息 */}
            <div className="mt-24 pt-12 border-t border-[var(--card-border)]">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-4 w-1 bg-blue-500 rounded-full"></div>
                <h3 className="text-sm font-bold text-[var(--muted-text)] uppercase tracking-wider">开发调试 (cURL Example)</h3>
              </div>
              <div className="bg-black/80 rounded-2xl p-6 border border-white/10 font-mono text-sm text-blue-300 relative group overflow-x-auto">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generateCurl());
                    alert('已复制到剪贴板');
                  }}
                  className="absolute right-4 top-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/50 hover:text-white transition-all"
                  title="复制命令"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                <pre className="whitespace-pre-wrap">{generateCurl()}</pre>
              </div>
              <p className="mt-3 text-xs text-[var(--muted-text)]">
                提示：以上命令会根据你当前选中的模型和 API Key 实时生成。
              </p>
            </div>
            
            {/* 底部物理占位符 */}
            <div className="h-40 w-full" />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick = () => {} }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border ${
        active 
          ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border-blue-600/20' 
          : 'text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ title, value, icon, trend }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 hover:border-blue-500/30 transition-all shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-blue-500/5 rounded-lg">{icon}</div>
        <span className={`text-xs font-bold ${trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
          {trend}
        </span>
      </div>
      <div className="text-sm text-[var(--muted-text)] mb-1">{title}</div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

const TypingIndicator = () => (
  <div className="flex space-x-2 p-4 bg-[var(--card-bg)] rounded-2xl rounded-bl-none w-fit border border-[var(--card-border)] shadow-sm">
    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
  </div>
);
