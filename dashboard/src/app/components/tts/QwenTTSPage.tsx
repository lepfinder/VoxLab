'use client';

import React, { useState } from 'react';
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefAudioBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setRefAudioBase64(null);
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
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                参考音频文本 (Ref Text)
              </label>
              <input
                type="text"
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="（选填）参考音频里说话的具体文字内容，这有助于提高克隆的声学稳定性"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
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
            <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 block">
              合成结果
            </label>
            <audio src={audioUrl} controls className="w-full h-10" />
          </div>
        )}
      </div>

      <ApiExample code={curlCode} />
    </ModelLayout>
  );
}
