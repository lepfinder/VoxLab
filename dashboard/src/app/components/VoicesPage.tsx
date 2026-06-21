'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, ShieldAlert, Sparkles, Volume2, Globe, Music, Layers, AlertTriangle } from 'lucide-react';

interface Voice {
  id: string;
  name: string;
  description: string;
  tts_provider: string;
  tts_voice: string;
  reference_audio?: string;
  language: string;
  is_preset: number;
}

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [deletingVoice, setDeletingVoice] = useState<Voice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ttsProvider, setTtsProvider] = useState('kokoro');
  const [voiceType, setVoiceType] = useState<'standard' | 'clone'>('clone');
  const [ttsVoiceParam, setTtsVoiceParam] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('zh');

  const fetchVoices = async () => {
    try {
      const res = await fetch('/admin/voices');
      const data = await res.json();
      setVoices(data);
    } catch (e) {
      console.error('获取音色列表失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  const handleOpenAdd = () => {
    setEditingVoice(null);
    setName('');
    setDescription('');
    setTtsProvider('kokoro');
    setVoiceType('clone');
    setTtsVoiceParam('');
    setReferenceFile(null);
    setLanguage('zh');
    setShowModal(true);
  };

  const handleOpenEdit = (v: Voice) => {
    setEditingVoice(v);
    setName(v.name);
    setDescription(v.description || '');
    setTtsProvider(v.tts_provider);
    
    // Check if it's cloned voice
    const isCloned = v.tts_voice === 'clone' || !!v.reference_audio;
    setVoiceType(isCloned ? 'clone' : 'standard');
    setTtsVoiceParam(isCloned ? '' : v.tts_voice);
    setReferenceFile(null);
    setLanguage(v.language || 'zh');
    setShowModal(true);
  };

  const handleSaveVoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('请填写音色名称');
      return;
    }
    // If not editing, voice clone must have a file. If editing, file is optional.
    if (voiceType === 'clone' && !referenceFile && !editingVoice) {
      alert('声音克隆必须上传参考音频文件');
      return;
    }
    if (voiceType === 'standard' && !ttsVoiceParam.trim()) {
      alert('标准音色必须填写底层音色参数名');
      return;
    }

    const formData = new FormData();
    if (editingVoice) {
      formData.append('id', editingVoice.id);
    }
    formData.append('name', name);
    formData.append('description', description);
    formData.append('tts_provider', ttsProvider);
    formData.append('tts_voice', voiceType === 'clone' ? 'clone' : ttsVoiceParam);
    formData.append('language', language);
    if (referenceFile) {
      formData.append('file', referenceFile);
    }

    try {
      const res = await fetch('/admin/voices', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setShowModal(false);
        fetchVoices();
      } else {
        const errorData = await res.json();
        alert(errorData.detail || '保存音色失败');
      }
    } catch (e) {
      console.error(e);
      alert('保存音色异常');
    }
  };

  const handleClickDelete = (v: Voice) => {
    setDeletingVoice(v);
  };

  const confirmDelete = async () => {
    if (!deletingVoice) return;
    setDeleting(true);
    try {
      const res = await fetch(`/admin/voices/${deletingVoice.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeletingVoice(null);
        fetchVoices();
      } else {
        const errorData = await res.json();
        alert(errorData.detail || '删除失败');
      }
    } catch (e) {
      console.error(e);
      alert('删除异常');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">音色管理</h1>
          <p className="text-[var(--muted-text)] text-sm">
            在这里您可以查看系统音色，或通过声音克隆、对接其他 TTS 服务商来自定义属于您的声音资产
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} />
          新建音色
        </button>
      </header>

      {loading ? (
        <div className="text-center py-12 text-[var(--muted-text)]">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {voices.map((v) => (
            <div
              key={v.id}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/30 hover:shadow-lg transition-all duration-300 relative group overflow-hidden"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg bg-blue-500/10 border border-blue-500/20 text-blue-600">
                    <Volume2 size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{v.name}</h3>
                    <p className="text-xs text-[var(--muted-text)] line-clamp-1">{v.description || '暂无描述'}</p>
                  </div>
                </div>

                <div className="space-y-2 my-4 text-xs">
                  <div className="flex flex-col gap-1.5 font-mono text-[10px] text-[var(--muted-text)]">
                    <span className="flex items-center gap-1">
                      <Layers size={12} className="opacity-70" />
                      <strong>服务商:</strong> {v.tts_provider}
                    </span>
                    <span className="flex items-center gap-1">
                      <Music size={12} className="opacity-70" />
                      <strong>底层参数/ID:</strong> {v.tts_voice}
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe size={12} className="opacity-70" />
                      <strong>语言:</strong> {v.language === 'zh' ? '中文 (zh)' : v.language === 'en' ? '英文 (en)' : v.language}
                    </span>
                    {v.reference_audio && (
                      <span className="bg-purple-500/5 text-purple-600 dark:text-purple-400 px-2 py-1 rounded w-fit mt-1 break-all line-clamp-2">
                        克隆参考文件: {v.reference_audio}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t border-[var(--card-border)] pt-4 mt-2">
                <button
                  onClick={() => handleOpenEdit(v)}
                  className="flex-1 py-2 bg-[var(--background)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <Edit2 size={13} />
                  编辑
                </button>
                <button
                  onClick={() => handleClickDelete(v)}
                  className="flex-1 py-2 bg-[var(--background)] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 border border-[var(--card-border)] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 text-[var(--muted-text)]"
                >
                  <Trash2 size={13} />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New/Edit Voice Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-up">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Sparkles className="text-blue-500" size={20} />
              {editingVoice ? '编辑音色' : '新建音色'}
            </h2>
            <form onSubmit={handleSaveVoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1.5 uppercase tracking-wider">
                  音色类型
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={voiceType === 'clone'}
                      onChange={() => {
                        setVoiceType('clone');
                        setTtsProvider('kokoro'); // Kokoro supports cloning well in our workspace
                      }}
                      className="accent-blue-600"
                    />
                    <span>声音克隆 (上传参考音频)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={voiceType === 'standard'}
                      onChange={() => setVoiceType('standard')}
                      className="accent-blue-600"
                    />
                    <span>标准/内置音色 (配置底层参数)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  音色名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如: 晓晓克隆、自定义男声"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  描述信息
                </label>
                <input
                  type="text"
                  placeholder="一句话描述该音色的特色或用途"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    TTS 服务商
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
                    <option value="omni">OmniVoice</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    主语言
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="zh">中文 (zh)</option>
                    <option value="en">英文 (en)</option>
                    <option value="ja">日文 (ja)</option>
                    <option value="ko">韩文 (ko)</option>
                  </select>
                </div>
              </div>

              {voiceType === 'standard' ? (
                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    底层音色参数名 *
                  </label>
                  <input
                    type="text"
                    required={voiceType === 'standard'}
                    placeholder="如 am_nicole, zh-CN-YunxiNeural 等"
                    value={ttsVoiceParam}
                    onChange={(e) => setTtsVoiceParam(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1.5 uppercase tracking-wider">
                    参考音频文件 (WAV/MP3) {editingVoice ? '(选填，留空保持原音频)' : '*'}
                  </label>
                  <input
                    type="file"
                    accept="audio/*"
                    required={voiceType === 'clone' && !editingVoice}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setReferenceFile(e.target.files[0]);
                      }
                    }}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-sm focus:outline-none"
                  />
                  <p className="text-[10px] text-[var(--muted-text)] mt-1.5 flex items-start gap-1">
                    <ShieldAlert size={12} className="mt-0.5 text-amber-500 shrink-0" />
                    请上传时长在 5-15 秒左右的高清无杂音说话片段以获得最佳克隆效果。
                  </p>
                </div>
              )}

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
                  保存音色
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingVoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="text-red-500" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-1 text-red-500">确认删除音色</h2>
                <p className="text-sm text-[var(--muted-text)] leading-relaxed">
                  确定要删除音色「<span className="font-semibold text-[var(--foreground)]">{deletingVoice.name}</span>」吗？
                </p>
                <p className="text-xs text-[var(--muted-text)] mt-2 flex items-start gap-1">
                  <ShieldAlert size={12} className="mt-0.5 shrink-0 text-amber-500" />
                  删除后无法恢复，已关联该音色的发音人配置可能会失效。
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-[var(--card-border)]">
              <button
                onClick={() => setDeletingVoice(null)}
                disabled={deleting}
                className="px-5 py-2 bg-[var(--background)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-xl text-sm font-semibold transition-all active:scale-95"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-5 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
