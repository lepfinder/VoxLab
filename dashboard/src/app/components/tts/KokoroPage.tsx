'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import ApiExample from '../shared/ApiExample';

interface KokoroPageProps {
  selectedKey: string;
}

const VOICES = [
  { label: '🇺🇸 🚺 Heart ❤️', value: 'af_heart' },
  { label: '🇺🇸 🚺 Bella 🔥', value: 'af_bella' },
  { label: '🇺🇸 🚺 Nicole 🎧', value: 'af_nicole' },
  { label: '🇺🇸 🚺 Aoede', value: 'af_aoede' },
  { label: '🇺🇸 🚺 Kore', value: 'af_kore' },
  { label: '🇺🇸 🚺 Sarah', value: 'af_sarah' },
  { label: '🇺🇸 🚺 Nova', value: 'af_nova' },
  { label: '🇺🇸 🚺 Sky', value: 'af_sky' },
  { label: '🇺🇸 🚺 Alloy', value: 'af_alloy' },
  { label: '🇺🇸 🚺 Jessica', value: 'af_jessica' },
  { label: '🇺🇸 🚺 River', value: 'af_river' },
  { label: '🇺🇸 🚹 Michael', value: 'am_michael' },
  { label: '🇺🇸 🚹 Fenrir', value: 'am_fenrir' },
  { label: '🇺🇸 🚹 Puck', value: 'am_puck' },
  { label: '🇺🇸 🚹 Echo', value: 'am_echo' },
  { label: '🇺🇸 🚹 Eric', value: 'am_eric' },
  { label: '🇺🇸 🚹 Liam', value: 'am_liam' },
  { label: '🇺🇸 🚹 Onyx', value: 'am_onyx' },
  { label: '🇺🇸 🚹 Santa', value: 'am_santa' },
  { label: '🇺🇸 🚹 Adam', value: 'am_adam' },
  { label: '🇬🇧 🚺 Emma', value: 'bf_emma' },
  { label: '🇬🇧 🚺 Isabella', value: 'bf_isabella' },
  { label: '🇬🇧 🚺 Alice', value: 'bf_alice' },
  { label: '🇬🇧 🚺 Lily', value: 'bf_lily' },
  { label: '🇬🇧 🚹 George', value: 'bm_george' },
  { label: '🇬🇧 🚹 Fable', value: 'bm_fable' },
  { label: '🇬🇧 🚹 Lewis', value: 'bm_lewis' },
  { label: '🇬🇧 🚹 Daniel', value: 'bm_daniel' },
  { label: '🇨🇳 🚺 小贝', value: 'zf_xiaobei' },
  { label: '🇨🇳 🚺 小妮', value: 'zf_xiaoni' },
  { label: '🇨🇳 🚺 小晓', value: 'zf_xiaoxiao' },
  { label: '🇨🇳 🚺 小艺', value: 'zf_xiaoyi' },
  { label: '🇨🇳 🚹 云健', value: 'zm_yunjian' },
  { label: '🇨🇳 🚹 云希', value: 'zm_yunxi' },
  { label: '🇨🇳 🚹 云夏', value: 'zm_yunxia' },
  { label: '🇨🇳 🚹 云扬', value: 'zm_yunyang' },
];

export default function KokoroPage({ selectedKey }: KokoroPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('af_heart');
  const [text, setText] = useState('你好，欢迎使用 VoxLab 语音合成服务。今天天气真不错，适合出去走走。');

  const handleTest = async (file?: File, inputText?: string) => {
    const input = inputText || text;
    if (!input || !selectedKey) return;

    setIsLoading(true);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    try {
      const res = await fetch('/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedKey}`
        },
        body: JSON.stringify({
          model: 'kokoro',
          input: input,
          voice: selectedVoice
        })
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

  const curlCode = `curl http://localhost:8001/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kokoro",
    "input": "${text || '你好，这是 Kokoro 语音合成测试'}",
    "voice": "${selectedVoice}"
  }' --output output.wav`;

  return (
    <ModelLayout
      name="Kokoro"
      description="轻量级高质量语音合成模型，支持多语言多音色，生成自然流畅的语音"
      features={['多语言', '36种音色', '高质量', '快速推理', '低资源占用']}
      modelId="hexgrad/Kokoro-82M"
      framework="PyTorch"
      useCases={['语音助手', '有声书', '多语言合成', '实时 TTS']}
      githubUrl="https://github.com/hexgrad/kokoro"
      model="kokoro"
    >
      {/* 音色选择 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">音色选择</h3>
        <div className="flex flex-wrap gap-2">
          {VOICES.map(voice => (
            <button
              key={voice.value}
              onClick={() => setSelectedVoice(voice.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedVoice === voice.value
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-[var(--background)] text-[var(--muted-text)] hover:text-[var(--foreground)] border border-[var(--card-border)]'
              }`}
            >
              {voice.label}
            </button>
          ))}
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
          onClick={() => handleTest(undefined, text)}
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
