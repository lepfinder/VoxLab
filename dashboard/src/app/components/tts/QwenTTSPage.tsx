'use client';

import React, { useState } from 'react';
import { BookmarkPlus, CheckCircle2, Sparkles, X } from 'lucide-react';
import ModelLayout from '../shared/ModelLayout';
import ApiExample from '../shared/ApiExample';

interface QwenTTSPageProps {
  selectedKey: string;
}

const MODES = [
  { id: 'design', label: 'Voice Design', description: '通过文字描述生成音色' },
  { id: 'custom', label: 'Custom Voice', description: '使用预设音色' },
  { id: 'clone', label: 'Voice Clone', description: '克隆参考音频的音色' },
];

const CUSTOM_VOICES = ['serena', 'vivian', 'uncle_fu', 'ryan', 'aiden', 'ono_anna', 'sohee', 'eric', 'dylan'];

export default function QwenTTSPage({ selectedKey }: QwenTTSPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mode, setMode] = useState('design');
  const [voice, setVoice] = useState('serena');
  const [instruct, setInstruct] = useState('A clear and natural speech.');
  const [text, setText] = useState('好了各位，往后退，往后退！我有个天大的好消息要宣布：Qwen-TTS正式开源啦！');
  
  // Clone states
  const [refText, setRefText] = useState('');
  const [refAudioBase64, setRefAudioBase64] = useState<string | null>(null);
  const [refAudioUrl, setRefAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Save voice modal states
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveGender, setSaveGender] = useState('female');
  const [saveLang, setSaveLang] = useState('zh');
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // 1. 设置本地试听 URL
      if (refAudioUrl) URL.revokeObjectURL(refAudioUrl);
      setRefAudioUrl(URL.createObjectURL(file));

      // 2. 转为 Base64 传递给克隆 API
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefAudioBase64(reader.result as string);
      };
      reader.readAsDataURL(file);

      // 3. 自动发起 ASR 转录
      setIsTranscribing(true);
      setRefText('正在自动识别音频文字，请稍候...');
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'sensevoice');

        const res = await fetch('/api/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${selectedKey}`
          },
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          setRefText(data.text || '');
        } else {
          setRefText('');
        }
      } catch (err) {
        console.error('Auto ASR transcription failed:', err);
        setRefText('');
      } finally {
        setIsTranscribing(false);
      }
    } else {
      setRefAudioBase64(null);
      setRefText('');
      if (refAudioUrl) {
        URL.revokeObjectURL(refAudioUrl);
        setRefAudioUrl(null);
      }
    }
  };

  const handleOpenSaveModal = () => {
    setSaveName('');
    setSaveDesc('');
    setSaveGender('female');
    setSaveLang('zh');
    setShowSaveModal(true);
  };

  const handleSaveToVoices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) {
      alert('请填写音色名称');
      return;
    }
    if (!refAudioBase64) {
      alert('请先上传声音克隆的参考音频文件');
      return;
    }

    setIsSavingVoice(true);
    try {
      const formData = new FormData();
      formData.append('name', saveName.trim());
      formData.append('description', saveDesc.trim() || '通过通义千问 Qwen TTS 克隆生成的固定音色');
      formData.append('tts_provider', 'qwen');
      formData.append('tts_voice', 'clone');
      formData.append('language', saveLang);
      formData.append('gender', saveGender);
      formData.append('preview_text', text.trim());
      formData.append('ref_text', refText.trim());
      formData.append('instruct', instruct.trim());
      formData.append('ref_audio_base64', refAudioBase64);

      const res = await fetch('/admin/voices', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '保存音色失败');
      }

      const savedVoice = await res.json();
      setShowSaveModal(false);
      setSaveSuccessMsg(`音色「${savedVoice.name}」已成功保存到音色管理！外部调用传 voice: "${savedVoice.id}" 即可`);
      setTimeout(() => setSaveSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setIsSavingVoice(false);
    }
  };

  const handleTest = async () => {
    if (!text.trim() || !selectedKey) return;

    setIsLoading(true);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    try {
      const body: any = {
        model: 'qwen',
        input: text,
        voice: mode === 'custom' ? voice : 'None',
        instruct: instruct
      };

      if (mode === 'clone') {
        if (!refAudioBase64) {
          alert('请上传声音克隆的参考音频文件');
          setIsLoading(false);
          return;
        }
        body.ref_audio = refAudioBase64;
        body.ref_text = refText;
      }

      const res = await fetch('/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedKey}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('合成失败');

      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      alert('合成失败');
    } finally {
      setIsLoading(false);
    }
  };

  const curlCode = mode === 'clone' 
    ? `curl http://localhost:8001/api/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen",
    "input": "${text || '你好，这是 Qwen TTS 测试'}",
    "voice": "None",
    "ref_audio": "data:audio/wav;base64,UklGR...",
    "ref_text": "${refText}"
  }' --output output.wav`
    : `curl http://localhost:8001/api/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen",
    "input": "${text || '你好，这是 Qwen TTS 测试'}",
    "voice": "${mode === 'custom' ? voice : 'None'}",
    "instruct": "${instruct}"
  }' --output output.wav`;

  return (
    <ModelLayout
      name="Qwen TTS"
      description="通义千问语音合成模型，支持三种模式：通过文字描述生成音色、使用预设音色、克隆参考音频音色"
      features={['三种模式', '音色克隆', '指令控制', '流式输出', '高质量']}
      modelId="mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"
      framework="MLX (macOS) / PyTorch (Linux)"
      useCases={['个性化语音', '音色克隆', '多风格合成', '有声书']}
      githubUrl="https://github.com/QwenLM/Qwen3-TTS"
      blogUrl="https://qwen.ai/blog?id=qwen3tts-0115"
      model="qwen-tts"
    >
      {/* 模式选择 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">合成模式</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`p-4 rounded-xl text-left transition-all border ${
                mode === m.id
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                  : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="font-semibold mb-1">{m.label}</div>
              <div className="text-xs opacity-70">{m.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 参数配置 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">参数配置</h3>

        {mode === 'custom' && (
          <div className="mb-4">
            <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
              选择音色
            </label>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_VOICES.map(v => (
                <button
                  key={v}
                  onClick={() => setVoice(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    voice === v
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--background)] text-[var(--muted-text)] border border-[var(--card-border)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'clone' && (
          <div className="space-y-4 mb-4">
            <div>
              <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                参考音频文件 (WAV/MP3) *
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-sm focus:outline-none text-[var(--foreground)]"
              />
              {refAudioUrl && (
                <div className="mt-2 p-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider block">
                      参考音频在线试听
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenSaveModal}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white transition-all border border-blue-500/20"
                    >
                      <BookmarkPlus size={13} />
                      保存为固定音色
                    </button>
                  </div>
                  <audio src={refAudioUrl} controls className="w-full h-8" />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                参考音频文本 (Ref Text)
              </label>
              <input
                type="text"
                value={refText}
                disabled={isTranscribing}
                onChange={(e) => setRefText(e.target.value)}
                placeholder={isTranscribing ? "正在自动通过 SenseVoice 识别参考音频文字，请稍候..." : "（选填）参考音频里说话的具体文字内容，这有助于提高克隆的声学稳定性"}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)] disabled:opacity-60 disabled:cursor-wait"
              />
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
            语气指令 (Instruct)
          </label>
          <input
            type="text"
            value={instruct}
            onChange={(e) => setInstruct(e.target.value)}
            placeholder="描述语音风格，如: A cheerful young female voice"
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
          />
          <p className="text-xs text-[var(--muted-text)] mt-2">
            用英文描述期望的语音风格，如语速、情感、音色特点等
          </p>
        </div>
      </div>

      {/* 测试面板 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">在线测试</h3>
        <div className="mb-4">
          <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
            输入文本
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要合成的文本..."
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-4 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)] resize-none"
          />
        </div>
        <button
          onClick={handleTest}
          disabled={isLoading || !text.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              合成中...
            </>
          ) : (
            <>开始合成</>
          )}
        </button>
        {audioUrl && (
          <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                合成结果
              </label>
              {mode === 'clone' && refAudioBase64 && (
                <button
                  type="button"
                  onClick={handleOpenSaveModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-sm shadow-blue-500/20 active:scale-95"
                >
                  <BookmarkPlus size={14} />
                  一键保存为固定音色资产
                </button>
              )}
            </div>
            <audio src={audioUrl} controls className="w-full h-10" />
          </div>
        )}
      </div>

      <ApiExample code={curlCode} />

      {/* 一键保存为固定音色弹窗 */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="text-blue-500" size={18} />
                保存为固定音色资产
              </h2>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-[var(--muted-text)] hover:text-[var(--foreground)]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[var(--muted-text)] mb-4">
              将当前的参考音频、台词文本和语气指令保存至「音色管理」，生成专属音色 ID。外部系统通过标准 API 只需指定该 ID 即可随时复用。
            </p>

            <form onSubmit={handleSaveToVoices} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  音色名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如: 温暖闺蜜、专属客服小王"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  音色描述
                </label>
                <input
                  type="text"
                  placeholder="一句话说明该音色的风格或用途"
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    主语言
                  </label>
                  <select
                    value={saveLang}
                    onChange={(e) => setSaveLang(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="zh">中文 (zh)</option>
                    <option value="en">英文 (en)</option>
                    <option value="ja">日文 (ja)</option>
                    <option value="ko">韩文 (ko)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                    声线性别
                  </label>
                  <select
                    value={saveGender}
                    onChange={(e) => setSaveGender(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  >
                    <option value="female">女声</option>
                    <option value="male">男声</option>
                    <option value="">未标注</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  已固化的参考台词 (REF TEXT)
                </label>
                <textarea
                  rows={2}
                  value={refText}
                  onChange={(e) => setRefText(e.target.value)}
                  placeholder="参考音频人物所说的台词"
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-xs focus:outline-none resize-none opacity-85"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--muted-text)] mb-1 uppercase tracking-wider">
                  已固化的语气指令 (INSTRUCT)
                </label>
                <input
                  type="text"
                  value={instruct}
                  onChange={(e) => setInstruct(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-2 text-xs focus:outline-none opacity-85"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 bg-[var(--background)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-xl text-sm font-semibold transition-all active:scale-95"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingVoice}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/20 flex items-center gap-2"
                >
                  {isSavingVoice ? '保存中...' : '确认存入音色管理'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 成功浮层 Toast */}
      {saveSuccessMsg && (
        <div className="fixed bottom-6 right-6 z-[60] bg-emerald-600 text-white rounded-xl px-4 py-3 text-sm shadow-xl flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}
    </ModelLayout>
  );
}
