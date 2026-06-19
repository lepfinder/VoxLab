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

  // 自定义录音播放器状态
  const recordedAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);
  const [recordedCurrentTime, setRecordedCurrentTime] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string>('');

  // Recording state
  const [asrMode, setAsrMode] = useState<'upload' | 'record'>('upload');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<File | null>(null);
  
  // 监听录音文件改变，自动生成对应的本地播放链接，并自动销毁旧的 url
  useEffect(() => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      setRecordedAudioUrl(url);
      setIsPlayingRecorded(false);
      setRecordedCurrentTime(0);
      setRecordedDuration(0);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setRecordedAudioUrl('');
    }
  }, [recordedBlob]);

  const togglePlayRecorded = () => {
    const audio = recordedAudioRef.current;
    if (!audio) return;
    if (isPlayingRecorded) {
      audio.pause();
      setIsPlayingRecorded(false);
    } else {
      audio.play().then(() => {
        setIsPlayingRecorded(true);
      }).catch(() => {});
    }
  };

  const handleRecordedTimeUpdate = () => {
    if (recordedAudioRef.current) {
      setRecordedCurrentTime(recordedAudioRef.current.currentTime);
    }
  };

  const handleRecordedMetadata = () => {
    if (recordedAudioRef.current) {
      setRecordedDuration(recordedAudioRef.current.duration || 0);
    }
  };

  const seekRecordedAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = recordedAudioRef.current;
    if (!audio || !recordedDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    const newTime = percentage * recordedDuration;
    audio.currentTime = newTime;
    setRecordedCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
              <div className="flex flex-col items-center">
                {/* 隐藏的 audio 元素用于辅助逻辑控制 */}
                <audio
                  ref={recordedAudioRef}
                  src={recordedAudioUrl}
                  onTimeUpdate={handleRecordedTimeUpdate}
                  onLoadedMetadata={handleRecordedMetadata}
                  onEnded={() => setIsPlayingRecorded(false)}
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-3 text-green-500 shadow-lg shadow-green-500/5 animate-pulse">
                  <FileAudio size={28} />
                </div>
                <p className="text-sm font-semibold mb-1">录音已就绪</p>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">16kHz Mono</span>
                  <span className="text-[10px] text-[var(--muted-text)] font-mono">{(recordedBlob.size / 1024).toFixed(1)} KB</span>
                </div>

                {/* 精美拟真自定义播放器 */}
                <div className="w-72 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-3.5 flex items-center gap-3.5 shadow-md">
                  <button
                    type="button"
                    onClick={togglePlayRecorded}
                    className="w-10 h-10 shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-md shadow-blue-500/10 active:scale-95"
                  >
                    {isPlayingRecorded ? <Pause size={16} /> : <Play size={16} className="translate-x-[1px]" />}
                  </button>
                  
                  <div className="flex-1 space-y-1.5">
                    {/* 进度轨道 */}
                    <div 
                      onClick={seekRecordedAudio}
                      className="w-full h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden cursor-pointer relative"
                    >
                      <div 
                        className="h-full bg-blue-600 transition-[width] duration-75"
                        style={{ width: `${(recordedCurrentTime / (recordedDuration || 1)) * 100}%` }}
                      />
                    </div>
                    {/* 播放时间 */}
                    <div className="flex justify-between text-[10px] text-[var(--muted-text)] font-mono">
                      <span>{formatTime(recordedCurrentTime)}</span>
                      <span>{formatTime(recordedDuration)}</span>
                    </div>
                  </div>
                </div>
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
