'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';

interface Speaker {
  id: string;
  name: string;
  description: string;
  avatar: string;
  system_prompt: string;
  asr_provider: string;
  tts_provider: string;
  tts_voice: string;
  vad_provider: string;
  is_preset: number;
}

export default function SpeakersPage() {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<Partial<Speaker> | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [asrProvider, setAsrProvider] = useState('sensevoice');
  const [ttsProvider, setTtsProvider] = useState('kokoro');
  const [ttsVoice, setTtsVoice] = useState('');
  const [vadProvider, setVadProvider] = useState('silero');

  const fetchSpeakers = async () => {
    try {
      const res = await fetch('/admin/speakers');
      const data = await res.json();
      setSpeakers(data);
    } catch (e) {
      console.error('获取发音人失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpeakers();
  }, []);

  const handleOpenAdd = () => {
    setEditingSpeaker(null);
    setName('');
    setDescription('');
    setSystemPrompt('');
    setAsrProvider('sensevoice');
    setTtsProvider('kokoro');
    setTtsVoice('am_nicole');
    setVadProvider('silero');
    setShowModal(true);
  };

  const handleOpenEdit = (sp: Speaker) => {
    setEditingSpeaker(sp);
    setName(sp.name);
    setDescription(sp.description);
    setSystemPrompt(sp.system_prompt);
    setAsrProvider(sp.asr_provider);
    setTtsProvider(sp.tts_provider);
    setTtsVoice(sp.tts_voice);
    setVadProvider(sp.vad_provider);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim() || !ttsVoice.trim()) {
      alert('请填写必要字段（名称、系统指令、TTS 音色）');
      return;
    }

    const payload: Partial<Speaker> = {
      id: editingSpeaker?.id || undefined,
      name,
      description,
      avatar: editingSpeaker?.avatar || 'default',
      system_prompt: systemPrompt,
      asr_provider: asrProvider,
      tts_provider: ttsProvider,
      tts_voice: ttsVoice,
      vad_provider: vadProvider,
    };

    try {
      const res = await fetch('/admin/speakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        fetchSpeakers();
      } else {
        alert('保存失败');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个发音人吗？')) return;
    try {
      const res = await fetch(`/admin/speakers/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchSpeakers();
      } else {
        const data = await res.json();
        alert(data.detail || '删除失败');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">发音人管理</h1>
          <p className="text-[var(--muted-text)] text-sm">
            在这里您可以定制包含 ASR、LLM 指令、TTS 发音及 VAD 在内的综合发音人性格
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} />
          新建发音人
        </button>
      </header>

      {loading ? (
        <div className="text-center py-12 text-[var(--muted-text)]">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {speakers.map((sp) => (
            <div
              key={sp.id}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/30 hover:shadow-lg transition-all duration-300 relative group overflow-hidden"
            >
              {/* 预置发音人徽章 */}
              {sp.is_preset === 1 && (
                <div className="absolute top-0 right-0 bg-blue-600/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl border-l border-b border-blue-500/10 flex items-center gap-1">
                  <UserCheck size={10} />
                  系统预置
                </div>
              )}

              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-lg text-blue-600">
                    {sp.name.slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{sp.name}</h3>
                    <p className="text-xs text-[var(--muted-text)] line-clamp-1">{sp.description || '暂无描述'}</p>
                  </div>
                </div>

                <div className="space-y-2 my-4 text-xs">
                  <div className="bg-[var(--background)] px-3 py-2 rounded-lg border border-[var(--card-border)] line-clamp-2 italic text-[var(--muted-text)]">
                    &ldquo;{sp.system_prompt}&rdquo;
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--muted-text)] font-mono">
                    <span className="bg-gray-500/5 px-2 py-1 rounded">ASR: {sp.asr_provider}</span>
                    <span className="bg-gray-500/5 px-2 py-1 rounded">VAD: {sp.vad_provider}</span>
                    <span className="bg-blue-500/5 text-blue-600 dark:text-blue-400 px-2 py-1 rounded col-span-2">
                      TTS: {sp.tts_provider} ({sp.tts_voice})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t border-[var(--card-border)] pt-4 mt-2">
                <button
                  onClick={() => handleOpenEdit(sp)}
                  className="flex-1 py-2 bg-[var(--background)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <Edit2 size={13} />
                  编辑
                </button>
                {sp.is_preset !== 1 && (
                  <button
                    onClick={() => handleDelete(sp.id)}
                    className="px-3 py-2 text-red-500 hover:bg-red-500/10 border border-transparent rounded-xl transition-all active:scale-95"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 弹窗模式 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-up">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Sparkles className="text-blue-500" size={20} />
              {editingSpeaker ? '编辑发音人' : '新建发音人'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  发音人名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如: 晴奈"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  简介描述
                </label>
                <input
                  type="text"
                  placeholder="简单一句话介绍发音人性格或声音"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  系统指令 (System Prompt) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="在这里定义发音人的说话风格、背景角色与口吻偏好..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    ASR 识别引擎
                  </label>
                  <select
                    value={asrProvider}
                    onChange={(e) => setAsrProvider(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="sensevoice">SenseVoice</option>
                    <option value="qwen">Qwen ASR</option>
                    <option value="vosk">Vosk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    VAD 检测算法
                  </label>
                  <select
                    value={vadProvider}
                    onChange={(e) => setVadProvider(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="silero">Silero VAD</option>
                    <option value="webrtc">WebRTC VAD</option>
                    <option value="energy">Energy VAD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    TTS 发声引擎
                  </label>
                  <select
                    value={ttsProvider}
                    onChange={(e) => setTtsProvider(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="kokoro">Kokoro</option>
                    <option value="edge">Edge TTS</option>
                    <option value="qwen">Qwen TTS</option>
                    <option value="voxcpm">VoxCPM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    音色名称 (Voice) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="如: am_nicole, zh-CN-YunxiNeural"
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 bg-[var(--background)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-xl text-sm font-semibold transition-all active:scale-95"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                >
                  保存发音人
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
