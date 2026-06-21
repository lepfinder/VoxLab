'use client';

import React, { useState, useEffect } from 'react';
import ModelLayout from '../shared/ModelLayout';
import ApiExample from '../shared/ApiExample';

interface OmniPageProps {
  selectedKey: string;
}

const OPTIONS = {
  gender: {
    zh: [
      { label: '不限', value: '' },
      { label: '男', value: '男' },
      { label: '女', value: '女' }
    ],
    en: [
      { label: 'Unspecified', value: '' },
      { label: 'Male', value: 'male' },
      { label: 'Female', value: 'female' }
    ]
  },
  age: {
    zh: [
      { label: '不限', value: '' },
      { label: '儿童', value: '儿童' },
      { label: '少年', value: '少年' },
      { label: '青年', value: '青年' },
      { label: '中年', value: '中年' },
      { label: '老年', value: '老年' }
    ],
    en: [
      { label: 'Unspecified', value: '' },
      { label: 'Child', value: 'child' },
      { label: 'Teenager', value: 'teenager' },
      { label: 'Young Adult', value: 'young adult' },
      { label: 'Middle-aged', value: 'middle-aged' },
      { label: 'Elderly', value: 'elderly' }
    ]
  },
  pitch: {
    zh: [
      { label: '不限', value: '' },
      { label: '极低音调', value: '极低音调' },
      { label: '低音调', value: '低音调' },
      { label: '中音调', value: '中音调' },
      { label: '高音调', value: '高音调' },
      { label: '极高音调', value: '极高音调' }
    ],
    en: [
      { label: 'Unspecified', value: '' },
      { label: 'Very Low', value: 'very low pitch' },
      { label: 'Low', value: 'low pitch' },
      { label: 'Moderate', value: 'moderate pitch' },
      { label: 'High', value: 'high pitch' },
      { label: 'Very High', value: 'very high pitch' }
    ]
  },
  style: {
    zh: [
      { label: '常规', value: '' },
      { label: '耳语', value: '耳语' }
    ],
    en: [
      { label: 'Normal', value: '' },
      { label: 'Whisper', value: 'whisper' }
    ]
  },
  dialects: [
    { label: '无特定方言', value: '' },
    { label: '河南话', value: '河南话' },
    { label: '陕西话', value: '陕西话' },
    { label: '四川话', value: '四川话' },
    { label: '贵州话', value: '贵州话' },
    { label: '云南话', value: '云南话' },
    { label: '桂林话', value: '桂林话' },
    { label: '济南话', value: '济南话' },
    { label: '石家庄话', value: '石家庄话' },
    { label: '甘肃话', value: '甘肃话' },
    { label: '宁夏话', value: '宁夏话' },
    { label: '青岛话', value: '青岛话' },
    { label: '东北话', value: '东北话' }
  ],
  accents: [
    { label: 'No Specific Accent', value: '' },
    { label: 'American', value: 'american accent' },
    { label: 'British', value: 'british accent' },
    { label: 'Australian', value: 'australian accent' },
    { label: 'Canadian', value: 'canadian accent' },
    { label: 'Indian', value: 'indian accent' },
    { label: 'Chinese', value: 'chinese accent' },
    { label: 'Korean', value: 'korean accent' },
    { label: 'Japanese', value: 'japanese accent' },
    { label: 'Portuguese', value: 'portuguese accent' },
    { label: 'Russian', value: 'russian accent' }
  ]
};

export default function OmniPage({ selectedKey }: OmniPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [text, setText] = useState('你好，欢迎使用 VoxLab 语音合成服务。今天天气真不错，适合出去走走。');

  // 模式状态：design (声音设计) | clone (声音克隆)
  const [mode, setMode] = useState<'design' | 'clone'>('design');

  // 声音设计模式状态
  const [langMode, setLangMode] = useState<'zh' | 'en'>('zh');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [pitch, setPitch] = useState('');
  const [style, setStyle] = useState('');
  const [region, setRegion] = useState('');

  // 声音克隆模式状态
  const [refText, setRefText] = useState('');
  const [refAudioBase64, setRefAudioBase64] = useState<string | null>(null);
  const [refAudioUrl, setRefAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleLangModeChange = (lMode: 'zh' | 'en') => {
    setLangMode(lMode);
    setGender('');
    setAge('');
    setPitch('');
    setStyle('');
    setRegion('');
    if (lMode === 'en') {
      setText('Hello, welcome to VoxLab voice synthesis service. The weather is so nice today, perfect for a walk.');
    } else {
      setText('你好，欢迎使用 VoxLab 语音合成服务。今天天气真不错，适合出去走走。');
    }
  };

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

  // 仅在声音设计模式下组装的 instruct 属性
  const instruct = React.useMemo(() => {
    if (mode !== 'design') return '';
    const parts = [gender, age, pitch, style, region].filter(Boolean);
    const separator = langMode === 'zh' ? '，' : ', ';
    return parts.join(separator);
  }, [mode, langMode, gender, age, pitch, style, region]);

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
        model: 'omni',
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
    "model": "omni",
    "input": "${text || '你好，这是 OmniVoice 语音克隆测试'}",
    "voice": "default",
    "ref_audio": "data:audio/wav;base64,UklGR...",
    "ref_text": "${refText}"
  }' --output output.wav`;
    }

    return `curl http://localhost:8001/api/v1/audio/speech \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "omni",
    "input": "${text || '你好，这是 OmniVoice 语音合成测试'}",
    "voice": "default",
    "instruct": "${instruct}"
  }' --output output.wav`;
  }, [mode, selectedKey, text, instruct, refText]);

  return (
    <ModelLayout
      name="OmniVoice"
      description="K2-FSA 开源的全能语音合成模型，支持通过“声音设计 (Voice Design)”或“声音克隆 (Voice Cloning)”来按需生成高品质人声音色。"
      features={['基础 TTS', '语气定制', '音色克隆', '高质量', '低延迟']}
      modelId="k2-fsa/OmniVoice"
      framework="PyTorch"
      useCases={['个性化语音', '音色克隆', '多音色定制', '简单播报']}
      githubUrl="https://github.com/k2-fsa/OmniVoice"
      model="omni"
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
            <div className="font-semibold mb-1">声音设计 (Voice Design)</div>
            <div className="text-xs opacity-70">通过输入描述性别、年龄、音高、口音的指令文本来生成专属音色</div>
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
            <div className="text-xs opacity-70">上传一段 3-10 秒的参考音频及文字，快速克隆目标发音人的音色</div>
          </button>
        </div>
      </div>

      {/* 参数配置 */}
      {mode === 'design' ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-[var(--card-border)]">
            <h3 className="text-lg font-semibold">语音设计面板 (Voice Design)</h3>
            
            {/* 语言模式切换 */}
            <div className="flex bg-[var(--background)] p-1 rounded-xl border border-[var(--card-border)]">
              <button
                onClick={() => handleLangModeChange('zh')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  langMode === 'zh' ? 'bg-blue-600 text-white shadow-sm' : 'text-[var(--muted-text)]'
                }`}
              >
                中文模式
              </button>
              <button
                onClick={() => handleLangModeChange('en')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  langMode === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-[var(--muted-text)]'
                }`}
              >
                英文模式
              </button>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            {/* 性别控制 */}
            <div>
              <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                性别 (Gender)
              </span>
              <div className="flex flex-wrap gap-2">
                {OPTIONS.gender[langMode].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGender(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      gender === opt.value
                        ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:border-blue-500/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 年龄控制 */}
            <div>
              <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                年龄 (Age)
              </span>
              <div className="flex flex-wrap gap-2">
                {OPTIONS.age[langMode].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAge(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      age === opt.value
                        ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:border-blue-500/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 音调控制 */}
            <div>
              <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                音高 (Pitch)
              </span>
              <div className="flex flex-wrap gap-2">
                {OPTIONS.pitch[langMode].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPitch(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      pitch === opt.value
                        ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:border-blue-500/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 风格与地域属性分栏 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* 特殊风格 */}
              <div>
                <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                  特殊风格 (Style)
                </span>
                <div className="flex flex-wrap gap-2">
                  {OPTIONS.style[langMode].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStyle(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        style === opt.value
                          ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                          : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:border-blue-500/30'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 方言或口音选择 */}
              <div>
                <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
                  {langMode === 'zh' ? '地域方言 (Chinese Dialect)' : '英语口音 (English Accent)'}
                </span>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)]"
                >
                  {langMode === 'zh'
                    ? OPTIONS.dialects.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))
                    : OPTIONS.accents.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                </select>
              </div>
            </div>
          </div>

          {/* Instruct 实时生成预览 */}
          <div className="p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-xl mt-4">
            <span className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1.5 block">
              生成的 Instruct 参数预览
            </span>
            <div className="font-mono text-xs text-blue-600 dark:text-blue-400 bg-[var(--card-bg)] px-3 py-2 rounded-lg border border-[var(--card-border)] min-h-[2rem] flex items-center">
              {instruct ? instruct : <span className="text-[var(--muted-text)] italic">无特定指令，模型将采用默认设定随机生成音色</span>}
            </div>
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
              上传一段 3-10 秒包含清晰说话人发音的本地音频。
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
              placeholder={isTranscribing ? "正在自动通过 SenseVoice 识别参考音频文字，请稍候..." : "（选填）输入参考音频中说话的具体文字，能极大提高克隆质量与声学稳定性"}
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
