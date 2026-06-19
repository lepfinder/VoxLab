'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Upload, Play, Pause, Volume2, FileAudio, Mic, Square } from 'lucide-react';

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

  // Recording state
  const [asrMode, setAsrMode] = useState<'upload' | 'record'>('upload');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startLevelMeter = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      setAudioLevel(sum / dataArray.length / 255);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startLevelMeter(stream);

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
        setRecordedBlob(file);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert('无法访问麦克风，请检查浏览器权限');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setIsRecording(false);
    setAudioLevel(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleASRTest = () => {
    const activeFile = asrMode === 'record' ? recordedBlob : selectedFile;
    if (activeFile) {
      onTest(activeFile, undefined);
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

        {/* 模式切换 */}
        <div className="flex gap-1 bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-1 mb-4 w-fit">
          <button
            onClick={() => setAsrMode('upload')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              asrMode === 'upload'
                ? 'bg-blue-600 text-white shadow'
                : 'text-[var(--muted-text)] hover:text-[var(--foreground)]'
            }`}
          >
            <Upload size={12} className="inline mr-1.5 -mt-0.5" />
            文件上传
          </button>
          <button
            onClick={() => setAsrMode('record')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              asrMode === 'record'
                ? 'bg-blue-600 text-white shadow'
                : 'text-[var(--muted-text)] hover:text-[var(--foreground)]'
            }`}
          >
            <Mic size={12} className="inline mr-1.5 -mt-0.5" />
            实时录音
          </button>
        </div>

        {/* 文件上传模式 */}
        {asrMode === 'upload' && (
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
        )}

        {/* 实时录音模式 */}
        {asrMode === 'record' && (
          <div className="border-2 border-dashed border-[var(--card-border)] rounded-xl p-8 text-center">
            {!recordedBlob && !isRecording ? (
              <>
                <Mic size={48} className="mx-auto mb-4 text-[var(--muted-text)]" />
                <p className="text-sm font-medium mb-1">点击开始录音</p>
              </>
            ) : null}

            {isRecording && (
              <div>
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm text-red-500 font-medium">正在录音...</span>
                </div>
                {/* 音量条 */}
                <div className="w-48 h-2 bg-[var(--background)] rounded-full mx-auto mb-4 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-100"
                    style={{ width: `${Math.min(audioLevel * 3, 1) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {recordedBlob && !isRecording && (
              <div>
                <FileAudio size={48} className="mx-auto mb-4 text-green-500" />
                <p className="text-sm font-medium mb-1">录音完成</p>
                <p className="text-xs text-[var(--muted-text)]">
                  {(recordedBlob.size / 1024).toFixed(1)} KB
                </p>
                <audio src={URL.createObjectURL(recordedBlob)} controls className="w-64 h-8 mt-3" />
              </div>
            )}

            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading}
              className={`w-fit mx-auto mt-4 px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white'
              }`}
            >
              {isRecording ? (
                <>
                  <Square size={16} />
                  停止录音
                </>
              ) : recordedBlob ? (
                <>
                  <Mic size={16} />
                  重新录音
                </>
              ) : (
                <>
                  <Mic size={16} />
                  开始录音
                </>
              )}
            </button>
          </div>
        )}

        {/* 测试按钮 */}
        <button
          onClick={handleASRTest}
          disabled={isLoading || (asrMode === 'upload' ? !selectedFile : !recordedBlob)}
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
