'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import TestPanel from '../shared/TestPanel';
import ApiExample from '../shared/ApiExample';

interface SenseVoicePageProps {
  selectedKey: string;
}

export default function SenseVoicePage({ selectedKey }: SenseVoicePageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTest = async (file?: File) => {
    if (!file || !selectedKey) return;

    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'sensevoice');

    try {
      const res = await fetch('/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${selectedKey}` },
        body: formData
      });
      const data = await res.json();
      setResult(data.text || '未识别到内容');
    } catch (e) {
      setResult('转录失败，请检查服务状态');
    } finally {
      setIsLoading(false);
    }
  };

  const curlCode = `curl http://localhost:8001/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -F "file=@/path/to/audio.wav" \\
  -F "model=sensevoice"`;

  return (
    <ModelLayout
      name="SenseVoice"
      description="阿里巴巴达摩院开源的高精度语音识别模型，支持多语言、情感识别和声纹特征提取"
      features={['高精度', '声纹提取', 'VAD 端点检测', '多语言支持', '快速推理']}
      modelId="iic/SenseVoiceSmall"
      framework="FunASR + PyTorch"
      useCases={['实时语音转写', '会议记录', '语音助手', '声纹认证']}
      githubUrl="https://github.com/FunAudioLLM/SenseVoice"
      model="sensevoice"
    >
      {/* 参数说明 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">模型参数</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 p-3 bg-[var(--background)] rounded-lg">
            <code className="text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap">language</code>
            <span className="text-[var(--muted-text)]">识别语言，默认 "zh"（中文）</span>
          </div>
          <div className="flex items-start gap-3 p-3 bg-[var(--background)] rounded-lg">
            <code className="text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap">use_itn</code>
            <span className="text-[var(--muted-text)]">是否启用逆文本正则化，将数字转换为阿拉伯数字格式</span>
          </div>
          <div className="flex items-start gap-3 p-3 bg-[var(--background)] rounded-lg">
            <code className="text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap">merge_vad</code>
            <span className="text-[var(--muted-text)]">合并 VAD 检测到的短语音片段</span>
          </div>
        </div>
      </div>

      <TestPanel
        type="asr"
        onTest={handleTest}
        isLoading={isLoading}
        result={result}
      />

      <ApiExample code={curlCode} />
    </ModelLayout>
  );
}
