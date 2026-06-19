'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import ApiExample from '../shared/ApiExample';

interface VoxCPMPageProps {
  selectedKey: string;
}

export default function VoxCPMPage({ selectedKey }: VoxCPMPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [instruct, setInstruct] = useState('');
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
          model: 'voxcpm',
          input: text,
          voice: 'default'
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
    "model": "voxcpm",
    "input": "${text || '你好，这是 VoxCPM 语音合成测试'}",
    "voice": "default"
  }' --output output.wav`;

  return (
    <ModelLayout
      name="VoxCPM"
      description="清华 OpenBMB 开源的语音合成模型，支持通过指令控制语音情感和风格"
      features={['情感控制', '指令驱动', '高质量', '中文优化']}
      modelId="openbmb/VoxCPM2"
      framework="PyTorch"
      useCases={['情感语音合成', '有声书', '虚拟助手', '多风格播报']}
      githubUrl="https://github.com/OpenBMB/VoxCPM"
      model="voxcpm"
    >
      {/* 参数说明 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">情感控制</h3>
        <div className="mb-4">
          <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
            情感指令 (Instruct)
          </label>
          <input
            type="text"
            value={instruct}
            onChange={(e) => setInstruct(e.target.value)}
            placeholder="如：开心的、严肃的、温柔的"
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
          />
          <p className="text-xs text-[var(--muted-text)] mt-2">
            描述期望的情感或风格，如"开心的"、"严肃的"、"温柔的"等
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['开心的', '严肃的', '温柔的', '激动的', '平静的', '悲伤的'].map(emotion => (
            <button
              key={emotion}
              onClick={() => setInstruct(emotion)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background)] text-[var(--muted-text)] border border-[var(--card-border)] hover:border-blue-500/30 hover:text-blue-600 transition-all"
            >
              {emotion}
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
    </ModelLayout>
  );
}
