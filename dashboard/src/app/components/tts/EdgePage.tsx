'use client';

import React, { useState } from 'react';
import ModelCard from '../shared/ModelCard';
import ApiExample from '../shared/ApiExample';

interface EdgePageProps {
  selectedKey: string;
}

const VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女)', lang: '中文' },
  { id: 'zh-CN-YunxiNeural', label: '云希 (男)', lang: '中文' },
  { id: 'zh-CN-YunjianNeural', label: '云健 (男)', lang: '中文' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓伊 (女)', lang: '中文' },
  { id: 'en-US-GuyNeural', label: 'Guy (男)', lang: '英文' },
  { id: 'en-US-JennyNeural', label: 'Jenny (女)', lang: '英文' },
];

export default function EdgePage({ selectedKey }: EdgePageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [text, setText] = useState('你好，欢迎使用 VoxLab 语音合成服务。今天天气真不错，适合出去走走。');

  const handleTest = async () => {
    if (!text.trim() || !selectedKey) return;

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
          model: 'edge-tts',
          input: text,
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
    "model": "edge-tts",
    "input": "${text || '你好，这是 Edge TTS 语音合成测试'}",
    "voice": "${selectedVoice}"
  }' --output output.mp3`;

  return (
    <div>
      <ModelCard
        name="Edge TTS"
        description="微软 Edge 浏览器提供的云端语音合成服务，免费且高质量，支持多种语言和音色"
        features={['云端免费', '多语言', '多音色', '高质量', '无需本地资源']}
        modelId="Microsoft Edge TTS"
        framework="Edge TTS API"
        useCases={['云端合成', '多语言场景', '高质量语音', '无 GPU 环境']}
      />

      {/* 音色选择 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">音色选择</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {VOICES.map(v => (
            <button
              key={v.id}
              onClick={() => setSelectedVoice(v.id)}
              className={`p-3 rounded-xl text-left transition-all border ${
                selectedVoice === v.id
                  ? 'bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                  : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="font-semibold text-sm">{v.label}</div>
              <div className="text-xs opacity-70 mt-1">{v.lang}</div>
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
    </div>
  );
}
