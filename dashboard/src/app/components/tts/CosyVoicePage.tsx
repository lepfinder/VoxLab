'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import ApiExample from '../shared/ApiExample';

interface CosyVoicePageProps {
  selectedKey: string;
}

export default function CosyVoicePage({ selectedKey }: CosyVoicePageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [text, setText] = useState('你好，欢迎使用 VoxLab 与 Fun-CosyVoice3 语音合成服务。');

  // clone: 零样本克隆；instruct: 指令（方言/情感，需参考音色）
  const [mode, setMode] = useState<'clone' | 'instruct'>('clone');
  const [instruct, setInstruct] = useState('');

  const [refText, setRefText] = useState('');
  const [refAudioBase64, setRefAudioBase64] = useState<string | null>(null);
  const [refAudioUrl, setRefAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      if (refAudioUrl) URL.revokeObjectURL(refAudioUrl);
      setRefAudioUrl(URL.createObjectURL(file));

      const reader = new FileReader();
      reader.onloadend = () => {
        setRefAudioBase64(reader.result as string);
      };
      reader.readAsDataURL(file);

      // 自动 ASR 补全 ref_text（CosyVoice zero-shot 要求 ref_text 覆盖全文）
      setIsTranscribing(true);
      setRefText('正在自动识别音频文字，请稍候...');
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'sensevoice');

        const res = await fetch('/api/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${selectedKey}` },
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
      setErrorMsg('请先上传用于声音克隆的参考音频（并确认参考文本完整）。');
      return;
    }
    if (mode === 'clone' && !refText.trim()) {
      setErrorMsg('参考文本不能为空：CosyVoice zero-shot 要求 ref_text 覆盖参考音频全文。');
      return;
    }
    if (mode === 'instruct' && !refAudioBase64) {
      setErrorMsg('instruct 模式也需要参考音频（作为音色 prompt），请先上传。');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    try {
      const payload: any = {
        model: 'fun_cosyvoice3',
        input: text,
        voice: 'default',
        response_format: 'wav'
      };

      if (refAudioBase64) {
        payload.ref_audio = refAudioBase64;
        payload.ref_text = refText;
      }
      if (mode === 'instruct' && instruct.trim()) {
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

      if (!res.ok) {
        let detail = '合成失败';
        try {
          const errJson = await res.json();
          detail = errJson.detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setErrorMsg(e?.message || '合成失败');
    } finally {
      setIsLoading(false);
    }
  };

  const curlCode = React.useMemo(() => {
    return `curl http://localhost:8001/api/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "fun_cosyvoice3",
    "input": "${text || '你好，这是 CosyVoice3 克隆测试'}",
    "voice": "default",
    "response_format": "wav",
    "ref_audio": "data:audio/wav;base64,UklGR...",
    "ref_text": "${refText || '参考音频完整转写'}"${mode === 'instruct' && instruct ? `,\n    "instruct": "${instruct}"` : ''}
  }' --output output.wav`;
  }, [selectedKey, text, refText, mode, instruct]);

  return (
    <ModelLayout
      name="Fun-CosyVoice3"
      description="阿里通义 0.5B 轻量流式克隆 TTS（Apache-2.0）。支持中英日韩等 9 语种与 18+ 中文方言，zero-shot 克隆首包约 150ms。需先 vendor CosyVoice 仓库。"
      features={['零样本克隆', '方言支持', '轻量 0.5B', 'Apache-2.0', '流式友好']}
      modelId="FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
      framework="CosyVoice / PyTorch"
      useCases={['音色克隆', '方言播报', '轻量实时 TTS', '有声内容']}
      githubUrl="https://github.com/FunAudioLLM/CosyVoice"
      model="fun_cosyvoice3"
    >
      {/* 模式选择 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">合成模式</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => setMode('clone')}
            className={`p-4 rounded-xl text-left transition-all border ${
              mode === 'clone'
                ? 'bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
            }`}
          >
            <div className="font-semibold mb-1">零样本克隆 (Zero-shot)</div>
            <div className="text-xs opacity-70">上传 3–10 秒参考音频 + 完整转写文本，克隆该音色</div>
          </button>
          <button
            onClick={() => setMode('instruct')}
            className={`p-4 rounded-xl text-left transition-all border ${
              mode === 'instruct'
                ? 'bg-blue-600/10 border-blue-500/50 text-blue-600 dark:text-blue-400'
                : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
            }`}
          >
            <div className="font-semibold mb-1">指令控制 (Instruct)</div>
            <div className="text-xs opacity-70">在参考音色基础上指定方言 / 情感 / 语速等指令</div>
          </button>
        </div>
      </div>

      {/* 参考音频（两种模式都需要） */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6 space-y-4">
        <h3 className="text-lg font-semibold mb-2">参考音频与文本</h3>
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
        </div>
        <div>
          <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
            参考音频完整转写 (ref_text) *
          </label>
          <input
            type="text"
            value={refText}
            disabled={isTranscribing}
            onChange={(e) => setRefText(e.target.value)}
            placeholder={isTranscribing ? "正在通过 SenseVoice 自动识别..." : "必须覆盖参考音频全部内容，否则克隆可能崩坏"}
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)] disabled:opacity-60 disabled:cursor-wait"
          />
          <p className="text-xs text-[var(--muted-text)] mt-1.5">
            与 Qwen3-TTS ICL 类似：ref_text 截断或不完整会导致合成结果异常。
          </p>
        </div>

        {mode === 'instruct' && (
          <div>
            <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
              指令 (Instruct)
            </label>
            <input
              type="text"
              value={instruct}
              onChange={(e) => setInstruct(e.target.value)}
              placeholder="如：用四川话说、语气开心、语速稍慢"
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {['用四川话说', '用粤语说', '语气开心', '语气严肃', '语速稍慢'].map(item => (
                <button
                  key={item}
                  onClick={() => setInstruct(item)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--background)] text-[var(--muted-text)] border border-[var(--card-border)] hover:border-blue-500/30 hover:text-blue-600 transition-all"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
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
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400 text-sm">
            {errorMsg}
          </div>
        )}
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
