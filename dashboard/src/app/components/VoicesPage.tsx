'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Edit2, ShieldAlert, Sparkles, AlertTriangle, FileText, MoreHorizontal, Copy } from 'lucide-react';
import VoicePreviewButton, { buildDefaultText } from './VoicePreviewButton';

interface Voice {
  id: string;
  name: string;
  description: string;
  tts_provider: string;
  tts_voice: string;
  tts_model?: string | null;
  reference_audio?: string;
  language: string;
  preview_text?: string | null;
  is_preset: number;
}

const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: '英文',
  ja: '日文',
  ko: '韩文',
};

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [deletingVoice, setDeletingVoice] = useState<Voice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 卡片 "..." 菜单：点击外部 / ESC 关闭
  useEffect(() => {
    if (!menuOpenId) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpenId]);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ttsProvider, setTtsProvider] = useState('kokoro');
  const [voiceType, setVoiceType] = useState<'standard' | 'clone'>('clone');
  const [ttsVoiceParam, setTtsVoiceParam] = useState('');
  const [ttsModel, setTtsModel] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('zh');
  const [previewText, setPreviewText] = useState('');

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
    setTtsModel('');
    setReferenceFile(null);
    setLanguage('zh');
    setPreviewText('');
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
    setTtsModel(v.tts_model || '');
    setReferenceFile(null);
    setLanguage(v.language || 'zh');
    setPreviewText(v.preview_text || '');
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
    formData.append('preview_text', previewText.trim());
    if (ttsProvider === 'openrouter' && voiceType === 'standard') {
      formData.append('tts_model', ttsModel.trim());
    }
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

  /** 复制音色基础参数 + OpenAI 兼容接口调用示例，供第三方直接接入 */
  const handleCopyUsage = async (v: Voice) => {
    const sampleText = (v.preview_text || '').trim() || buildDefaultText(v.language || 'zh', v.name);
    const body: Record<string, string | boolean> = {
      model: v.tts_provider,
      voice: v.id,
      input: sampleText,
      response_format: "mp3",
    };
    if (v.tts_provider === 'openrouter') body.cache = true;
    const lines = [
      `【音色】${v.name}`,
      v.description ? `简介: ${v.description}` : null,
      `音色 ID (voice): ${v.id}`,
      `引擎 (model): ${v.tts_provider}`,
      v.tts_model ? `TTS 模型: ${v.tts_model}` : null,
      `底层音色参数: ${v.tts_voice}`,
      `语言: ${v.language || 'zh'}`,
      '',
      '【调用示例】voice 直接传音色 ID，服务端自动路由到底层引擎',
      'curl http://localhost:8001/api/v1/audio/speech \\',
      '  -H "Authorization: Bearer <YOUR_TOKEN>" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '${JSON.stringify(body, null, 2)}' \\`,
      '  --output voice.mp3',
      '',
      '接口详情见管理后台「API 文档 → 3. 语音合成 (TTS) 接口」，Token 在「Token 管理」生成',
    ].filter((l): l is string => l !== null);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {voices.map((v) => (
            <div
              key={v.id}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex flex-col hover:border-blue-500/30 transition-colors relative"
            >
              <div className="flex items-start gap-3">
                <VoicePreviewButton
                  voice={v}
                  defaultText={buildDefaultText(v.language || 'zh', v.name)}
                />
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3 className="font-semibold truncate">{v.name}</h3>
                  <p className="text-xs text-[var(--muted-text)] line-clamp-1">{v.description || '暂无描述'}</p>
                </div>
                <div ref={menuOpenId === v.id ? menuRef : undefined} className="relative shrink-0">
                  <button
                    onClick={() => setMenuOpenId(menuOpenId === v.id ? null : v.id)}
                    title="更多操作"
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                      menuOpenId === v.id
                        ? 'bg-[var(--foreground)]/10 text-[var(--foreground)]'
                        : 'text-[var(--muted-text)] hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menuOpenId === v.id && (
                    <div className="absolute right-0 top-8 z-30 w-28 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl py-1">
                      <button
                        onClick={() => { setMenuOpenId(null); handleOpenEdit(v); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                      >
                        <Edit2 size={13} />
                        编辑
                      </button>
                      <button
                        onClick={() => { setMenuOpenId(null); handleCopyUsage(v); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                      >
                        <Copy size={13} />
                        复制
                      </button>
                      <button
                        onClick={() => { setMenuOpenId(null); handleClickDelete(v); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={13} />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[11px] text-[var(--muted-text)]">
                <div className="flex gap-1.5 min-w-0">
                  <span className="shrink-0 font-semibold">服务商:</span>
                  <span className="font-mono truncate" title={`${v.tts_provider}${v.tts_model ? ` · ${v.tts_model}` : ''}`}>
                    {v.tts_provider}{v.tts_model ? ` · ${v.tts_model}` : ''}
                  </span>
                </div>
                <div className="flex gap-1.5 min-w-0">
                  <span className="shrink-0 font-semibold">底层参数/ID:</span>
                  <span className="font-mono truncate" title={v.tts_voice}>{v.tts_voice}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="shrink-0 font-semibold">语言:</span>
                  <span>
                    {LANG_LABELS[v.language] || v.language}{v.language && LANG_LABELS[v.language] ? ` (${v.language})` : ''}
                    {v.reference_audio && <span className="ml-2 text-purple-500">克隆</span>}
                    {(v.preview_text || '').trim() && (
                      <span title="已配置试听文本" className="inline-flex ml-2 opacity-70 align-middle">
                        <FileText size={10} />
                      </span>
                    )}
                  </span>
                </div>
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

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={12} />
                  试听文本 <span className="text-[9px] font-normal normal-case tracking-normal text-[var(--muted-text)]">（选填，留空则按语言使用默认文案）</span>
                </label>
                <textarea
                  rows={2}
                  placeholder={buildDefaultText(language, name || 'XXX')}
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
                <p className="text-[10px] text-[var(--muted-text)] mt-1.5">
                  点击音色卡片的喇叭图标即可试听，将以此处文本生成语音
                </p>
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
                    <option value="openrouter">OpenRouter</option>
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
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                      底层音色参数名 *
                    </label>
                    <input
                      type="text"
                      required={voiceType === 'standard'}
                      placeholder="如 am_nicole, zh-CN-YunxiNeural, alloy 等"
                      value={ttsVoiceParam}
                      onChange={(e) => setTtsVoiceParam(e.target.value)}
                      className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  {ttsProvider === 'openrouter' && (
                    <div>
                      <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                        TTS 模型
                      </label>
                      <input
                        type="text"
                        placeholder="如 openai/gpt-4o-mini-tts，留空则用语音供应商默认模型"
                        value={ttsModel}
                        onChange={(e) => setTtsModel(e.target.value)}
                        className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <p className="text-[10px] text-[var(--muted-text)] mt-1.5">
                        OpenRouter 音色与模型绑定（不同模型的音色列表不同），请确认该音色属于此模型
                      </p>
                    </div>
                  )}
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
      {copiedToast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm shadow-xl">
          已复制音色参数与 API 调用示例
        </div>
      )}
    </div>
  );
}
