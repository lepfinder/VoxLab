'use client';

import React, { useRef, useState } from 'react';
import { Upload, Play, Pause, Volume2, FileAudio } from 'lucide-react';

interface TestPanelProps {
  type: 'asr' | 'tts';
  onTest: (file?: File, text?: string) => void;
  isLoading: boolean;
  result?: string | null;
  audioUrl?: string | null;
  placeholder?: string;
}

export default function TestPanel({
  type,
  onTest,
  isLoading,
  result,
  audioUrl,
  placeholder
}: TestPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [text, setText] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleASRTest = () => {
    if (selectedFile) {
      onTest(selectedFile, undefined);
    }
  };

  const handleTTSTest = () => {
    if (text.trim()) {
      onTest(undefined, text);
    }
  };

  if (type === 'asr') {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
        <h3 className="text-lg font-semibold mb-4">在线测试</h3>

        {/* 文件上传区域 */}
        <div
          className="border-2 border-dashed border-[var(--card-border)] rounded-xl p-8 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <FileAudio size={48} className="mx-auto mb-4 text-[var(--muted-text)]" />
          {selectedFile ? (
            <div>
              <p className="text-sm font-medium mb-1">{selectedFile.name}</p>
              <p className="text-xs text-[var(--muted-text)]">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium mb-1">点击选择音频文件</p>
              <p className="text-xs text-[var(--muted-text)]">
                支持 wav, mp3, flac, webm 等格式
              </p>
            </div>
          )}
        </div>

        {/* 测试按钮 */}
        <button
          onClick={handleASRTest}
          disabled={isLoading || !selectedFile}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              转录中...
            </>
          ) : (
            <>
              <Play size={18} />
              开始转录
            </>
          )}
        </button>

        {/* 结果展示 */}
        {result !== undefined && result !== null && (
          <div className="mt-6 p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-xl">
            <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
              转录结果
            </label>
            <p className="text-[var(--foreground)] whitespace-pre-wrap">
              {result || <span className="italic text-[var(--muted-text)]">未识别到内容</span>}
            </p>
          </div>
        )}
      </div>
    );
  }

  // TTS 测试面板
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm mb-6">
      <h3 className="text-lg font-semibold mb-4">在线测试</h3>

      {/* 文本输入 */}
      <div className="mb-4">
        <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
          输入文本
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder || '输入要合成的文本...'}
          className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-4 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[var(--foreground)] resize-none"
        />
      </div>

      {/* 测试按钮 */}
      <button
        onClick={handleTTSTest}
        disabled={isLoading || !text.trim()}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            合成中...
          </>
        ) : (
          <>
            <Volume2 size={18} />
            开始合成
          </>
        )}
      </button>

      {/* 音频播放 */}
      {audioUrl && (
        <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
          <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 block">
            合成结果
          </label>
          <audio src={audioUrl} controls className="w-full h-10" />
        </div>
      )}
    </div>
  );
}
