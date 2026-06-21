'use client';

import React, { useState, useEffect } from 'react';
import ModelLayout from '../shared/ModelLayout';
import ApiExample from '../shared/ApiExample';

interface VoxCPMPageProps {
  selectedKey: string;
}

export default function VoxCPMPage({ selectedKey }: VoxCPMPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [text, setText] = useState('你好，欢迎使用 VoxLab 语音合成服务。今天天气真不错，适合出去走走。');

  // 模式状态：design (情感控制) | clone (声音克隆)
  const [mode, setMode] = useState<'design' | 'clone'>('design');

  // 声音设计模式状态
  const [instruct, setInstruct] = useState('');

  // 声音克隆模式状态
  const [refText, setRefText] = useState('');
  const [refAudioBase64, setRefAudioBase64] = useState<string | null>(null);
  const [refAudioUrl, setRefAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

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

  const handleTest = async () => {
    if (!text.trim() || !selectedKey) return;
    if (mode === 'clone' && !refAudioBase64) {
      alert('请先上传用于声音克隆的参考音频！');
      return;
    }

    setIsLoading(true);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    try {
      const payload: any = {
        model: 'voxcpm',
        input: text,
        voice: 'default'
      };

      if (mode === 'clone') {
        payload.ref_audio = refAudioBase64;
        payload.ref_text = refText;
      } else {
        payload.instruct = instruct;
      }

      const res = await fetch('/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedKey}`
        },
        body: JSON.stringify(payload)
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

  const curlCode = React.useMemo(() => {
    if (mode === 'clone') {
      return `curl http://localhost:8001/api/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "voxcpm",
    "input": "${text || '你好，这是 VoxCPM 语音克隆测试'}",
    "voice": "default",
    "ref_audio": "data:audio/wav;base64,UklGR...",
    "ref_text": "${refText}"
  }' --output output.wav`;
    }

    return `curl http://localhost:8001/api/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "voxcpm",
    "input": "${text || '你好，这是 VoxCPM 语音合成测试'}",
    "voice": "default",
    "instruct": "${instruct}"
  }' --output output.wav`;
  }, [mode, selectedKey, text, instruct, refText]);

  return (
    <ModelLayout
      name="VoxCPM"
      description="清华 OpenBMB 开源的语音合成模型，支持通过“情感控制 (Voice Design)”或“声音克隆 (Voice Cloning)”两种模式来定制情感和声音风格。"
      features={['情感控制', '指令驱动', '音色克隆', '高质量', '中文优化']}
      modelId="openbmb/VoxCPM2"
      framework="PyTorch"
      useCases={['情感语音合成', '音色克隆', '有声书', '虚拟助手', '多风格播报']}
      githubUrl="https://github.com/OpenBMB/VoxCPM"
      docUrl="https://voxcpm.readthedocs.io/zh-cn/latest/quickstart.html#"
      model="voxcpm"
    >
      {/* 模式选择 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">合成模式</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => setMode('design')}
            className={`p-4 rounded-xl text-left transition-all border ${
              mode === 'design'
                ? 'bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
            }`}
          >
            <div className="font-semibold mb-1">情感控制 (Voice Design)</div>
            <div className="text-xs opacity-70">通过英文/中文括号内的文字描述情感或风格，来生成对应的语音</div>
          </button>
          <button
            onClick={() => setMode('clone')}
            className={`p-4 rounded-xl text-left transition-all border ${
              mode === 'clone'
                ? 'bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
            }`}
          >
            <div className="font-semibold mb-1">声音克隆 (Voice Cloning)</div>
            <div className="text-xs opacity-70">上传一段 3-10 秒包含清晰人声的参考音频及文字，快速克隆该音色</div>
          </button>
        </div>
      </div>

      {/* 参数配置 */}
      {mode === 'design' ? (
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
      ) : (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6 space-y-4">
          <h3 className="text-lg font-semibold mb-2">声音克隆配置 (Voice Cloning)</h3>
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
                <span className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
                  参考音频在线试听
                </span>
                <audio src={refAudioUrl} controls className="w-full h-8" />
              </div>
            )}
            <p className="text-xs text-[var(--muted-text)] mt-1.5">
              上传一段包含清晰发声的本地音频。
            </p>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
              参考音频文本内容 (Transcription of Reference Audio)
            </label>
            <input
              type="text"
              value={refText}
              disabled={isTranscribing}
              onChange={(e) => setRefText(e.target.value)}
              placeholder={isTranscribing ? "正在自动通过 SenseVoice 识别参考音频文字，请稍候..." : "输入参考音频中说话的具体文字内容"}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)] disabled:opacity-60 disabled:cursor-wait"
            />
          </div>
        </div>
      )}

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
