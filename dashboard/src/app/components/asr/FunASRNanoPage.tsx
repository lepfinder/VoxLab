'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import TestPanel from '../shared/TestPanel';
import ApiExample from '../shared/ApiExample';

interface FunASRNanoPageProps {
  selectedKey: string;
}

export default function FunASRNanoPage({ selectedKey }: FunASRNanoPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTest = async (file?: File) => {
    if (!file || !selectedKey) return;

    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'fun_asr_nano');

    try {
      const res = await fetch('/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${selectedKey}` },
        body: formData
      });
      const data = await res.json();
      setResult(data.text || data.detail || '未识别到内容');
    } catch (e) {
      setResult('转录失败，请检查服务状态');
    } finally {
      setIsLoading(false);
    }
  };

  const curlCode = `curl http://localhost:8001/api/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -F "file=@/path/to/audio.wav" \\
  -F "model=fun_asr_nano"`;

  return (
    <ModelLayout
      name="Fun-ASR-Nano"
      description="阿里通义 SenseVoice 官方后继（800M）。中英日 + 7 大方言 + 26 地方口音，支持歌词/说唱识别，默认走 ModelScope 获取 CTC 时间戳权重。"
      features={['方言与口音', '歌词识别', 'Apache-2.0', '高精度中文', 'FunASR 生态']}
      modelId="FunAudioLLM/Fun-ASR-Nano-2512"
      framework="FunASR / PyTorch"
      useCases={['中文方言转写', '会议记录', '口音鲁棒识别', '歌词转写']}
      githubUrl="https://github.com/QwenAudio/Fun-ASR"
      model="fun_asr_nano"
    >
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
