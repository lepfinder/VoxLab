'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import TestPanel from '../shared/TestPanel';
import ApiExample from '../shared/ApiExample';

interface QwenASRPageProps {
  selectedKey: string;
}

export default function QwenASRPage({ selectedKey }: QwenASRPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTest = async (file?: File) => {
    if (!file || !selectedKey) return;

    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'qwen');

    try {
      const res = await fetch('/api/v1/audio/transcriptions', {
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

  const curlCode = `curl http://localhost:8001/api/v1/audio/transcriptions \\
  -H "Authorization: Bearer ${selectedKey || 'YOUR_TOKEN'}" \\
  -F "file=@/path/to/audio.wav" \\
  -F "model=qwen"`;

  return (
    <ModelLayout
      name="Qwen ASR"
      description="通义千问语音识别模型，针对 Apple Silicon 优化，使用 MLX 框架实现高效推理"
      features={['Apple Silicon 优化', 'MLX 加速', '低延迟', '高精度']}
      modelId="mlx-community/Qwen3-ASR-0.6B-4bit"
      framework="MLX (macOS) / PyTorch (Linux)"
      useCases={['本地语音识别', '离线转写', '隐私敏感场景']}
      githubUrl="https://github.com/QwenLM/Qwen-Audio"
      model="qwen-asr"
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
