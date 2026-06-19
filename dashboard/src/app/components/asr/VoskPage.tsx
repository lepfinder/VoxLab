'use client';

import React, { useState } from 'react';
import ModelLayout from '../shared/ModelLayout';
import TestPanel from '../shared/TestPanel';
import ApiExample from '../shared/ApiExample';

interface VoskPageProps {
  selectedKey: string;
}

export default function VoskPage({ selectedKey }: VoskPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTest = async (file?: File) => {
    if (!file || !selectedKey) return;

    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'vosk');

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
  -F "model=vosk"`;

  return (
    <ModelLayout
      name="Vosk"
      description="轻量级离线语音识别引擎，支持多种语言，适合嵌入式设备和资源受限环境"
      features={['轻量级', '纯离线', '低资源占用', '多语言', '跨平台']}
      modelId="vosk-model-small-cn-0.22"
      framework="Vosk (Kaldi-based)"
      useCases={['嵌入式设备', '离线转写', '资源受限环境', '实时流式识别']}
      githubUrl="https://github.com/alphacep/vosk-api"
      model="vosk"
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
