'use client';

import React, { useState } from 'react';
import ModelCard from '../shared/ModelCard';
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
  -F "model=qwen"`;

  return (
    <div>
      <ModelCard
        name="Qwen ASR"
        description="通义千问语音识别模型，针对 Apple Silicon 优化，使用 MLX 框架实现高效推理"
        features={['Apple Silicon 优化', 'MLX 加速', '低延迟', '高精度']}
        modelId="mlx-community/Qwen3-ASR-0.6B-4bit"
        framework="MLX (macOS) / PyTorch (Linux)"
        useCases={['本地语音识别', '离线转写', '隐私敏感场景']}
        githubUrl="https://github.com/QwenLM/Qwen-Audio"
      />

      {/* 平台说明 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">跨平台支持</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 p-3 bg-[var(--background)] rounded-lg">
            <span className="text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">macOS</span>
            <span className="text-[var(--muted-text)]">使用 MLX 框架，充分利用 Apple Silicon 统一内存架构，模型量化为 4-bit</span>
          </div>
          <div className="flex items-start gap-3 p-3 bg-[var(--background)] rounded-lg">
            <span className="text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">Linux</span>
            <span className="text-[var(--muted-text)]">使用 PyTorch 框架，支持 CUDA 加速，模型为官方 bf16 版本</span>
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
    </div>
  );
}
