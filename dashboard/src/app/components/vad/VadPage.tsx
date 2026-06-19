'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Sliders, Activity, FileAudio, VolumeX, AlertCircle, Headphones, Mic, Square } from 'lucide-react';

export default function VadPage({ selectedKey }: { selectedKey: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [engine, setEngine] = useState<string>('silero');
  const [threshold, setThreshold] = useState<number>(0.02);
  const [sensitivity, setSensitivity] = useState<number>(2);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [segments, setSegments] = useState<any[]>([]);
  const [processTime, setProcessTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [muteSilence, setMuteSilence] = useState<boolean>(false);

  // 录音相关状态
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioDataArray, setAudioDataArray] = useState<number[]>([]);

  // 统一的音频文件处理及可视化波形提取函数
  const processAudioFile = (selectedFile: File) => {
    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setAudioUrl(url);
    setSegments([]);
    setIsPlaying(false);
    
    // 读取音频振幅数据，生成简单的波形缓存
    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
        setAudioDuration(decodedData.duration);
        
        const rawData = decodedData.getChannelData(0); // 单声道
        const samples = 200; // 波形点数
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData: number[] = [];
        for (let i = 0; i < samples; i++) {
          let blockStart = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[blockStart + j]);
          }
          filteredData.push(sum / blockSize);
        }
        // 归一化
        const max = Math.max(...filteredData);
        const normalized = filteredData.map(val => val / (max || 1));
        setAudioDataArray(normalized);
      } catch (err) {
        console.error("音频解码失败", err);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // 处理文件上传
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processAudioFile(e.target.files[0]);
    }
  };

  // 开始录音
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const recordedFile = new File([audioBlob], `recorded_${Date.now()}.wav`, { type: 'audio/wav' });
        processAudioFile(recordedFile);
        
        // 关闭所有的媒体轨道释放麦克风占用
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("启动麦克风录音失败", err);
      alert("无法访问麦克风。请确保授予了语音输入权限。");
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 开始 VAD 分析
  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('engine', engine);
    formData.append('threshold', threshold.toString());
    formData.append('sensitivity', sensitivity.toString());

    try {
      const headers: Record<string, string> = {};
      if (selectedKey) {
        headers['Authorization'] = `Bearer ${selectedKey}`;
      }
      const response = await fetch('/api/v1/audio/vad', {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error('分析失败');
      }

      const result = await response.json();
      setSegments(result.segments || []);
      setProcessTime(result.process_time_ms || 0);
    } catch (err) {
      console.error(err);
      alert('VAD 分析出错，请检查后端状态。');
    } finally {
      setAnalyzing(false);
    }
  };

  // 控制音频播放状态
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // 音频播放时间更新，支持静音消除（跳过静音区间）
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    // 如果启用了跳过静音且有 VAD 数据
    if (muteSilence && segments.length > 0) {
      // 检查当前时间是否在任何语音段内
      const inSegment = segments.some(seg => time >= seg.start && time <= seg.end);
      if (!inSegment) {
        // 寻找下一个语音段
        const nextSeg = segments.find(seg => seg.start > time);
        if (nextSeg) {
          audioRef.current.currentTime = nextSeg.start;
        } else {
          // 没有更多语音段了，直接播到结尾或暂停
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  // 单独试听某个切片
  const playSegment = (start: number, end: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = start;
    audioRef.current.play();
    setIsPlaying(true);

    const checkEnd = () => {
      if (audioRef.current && audioRef.current.currentTime >= end) {
        audioRef.current.pause();
        setIsPlaying(false);
        audioRef.current.removeEventListener('timeupdate', checkEnd);
      }
    };
    audioRef.current.addEventListener('timeupdate', checkEnd);
  };

  // 绘制波形和高亮 VAD 段
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // 绘制背景网格
    ctx.strokeStyle = '#e2e8f01a';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }

    if (audioDataArray.length === 0) {
      // 绘制空占位
      ctx.fillStyle = '#64748b55';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isRecording ? '录音中，完成后绘制音频波形...' : '请上传音频或录制声音以生成可视化波形', width / 2, height / 2 + 5);
      return;
    }

    // 1. 绘制 VAD 检测的高亮底色
    if (segments.length > 0 && audioDuration > 0) {
      segments.forEach((seg, index) => {
        const startX = (seg.start / audioDuration) * width;
        const endX = (seg.end / audioDuration) * width;
        ctx.fillStyle = engine === 'silero' ? 'rgba(34, 197, 94, 0.15)' : engine === 'webrtc' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 179, 8, 0.15)';
        ctx.fillRect(startX, 0, endX - startX, height);
        
        ctx.strokeStyle = engine === 'silero' ? '#22c55e' : engine === 'webrtc' ? '#3b82f6' : '#eab308';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();
      });
    }

    // 2. 绘制音频波形
    const barWidth = width / audioDataArray.length;
    ctx.fillStyle = '#94a3b8';
    for (let i = 0; i < audioDataArray.length; i++) {
      const val = audioDataArray[i];
      const barHeight = val * (height * 0.8);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      
      // 检查当前点是否在已播放进度内
      const currentProgressX = (currentTime / (audioDuration || 1)) * width;
      if (x <= currentProgressX) {
        ctx.fillStyle = '#3b82f6'; // 进度条蓝色
      } else {
        ctx.fillStyle = '#475569'; // 未播放灰色
      }
      
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    }

    // 3. 绘制当前播放进度红线
    if (audioDuration > 0) {
      const progressX = (currentTime / audioDuration) * width;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, height);
      ctx.stroke();
    }
  }, [audioDataArray, segments, currentTime, audioDuration, engine, isRecording]);

  return (
    <div className="space-y-6">
      {/* 头部标题与定位说明 */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">VAD 语音活动检测实验室</h1>
        <p className="text-sm text-[var(--muted-text)]">
          探索并测试不同静音检测（VAD）算法的工作表现。支持对比分析人声截取及消除静音。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧配置控制栏 */}
        <div className="lg:col-span-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 font-bold text-lg border-b border-[var(--card-border)] pb-3">
            <Sliders size={20} className="text-blue-500" />
            <span>检测参数配置</span>
          </div>

          {/* 输入选择: 上传文件 或 麦克风录音 */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-[var(--muted-text)] uppercase tracking-wider">选择测试音频</label>
            
            {/* 上传音频文件 */}
            <div className="border-2 border-dashed border-[var(--card-border)] hover:border-blue-500 rounded-xl p-4 transition-all text-center relative group">
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                disabled={isRecording}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
              />
              <div className="flex flex-col items-center gap-2">
                <Upload size={28} className="text-[var(--muted-text)] group-hover:text-blue-500 transition-colors" />
                <span className="text-xs font-medium text-[var(--muted-text)] truncate max-w-full px-2">
                  {file && !isRecording ? file.name : '点击或拖拽文件上传'}
                </span>
                <span className="text-[10px] text-[var(--muted-text)] opacity-60">支持 WAV, MP3, M4A 等</span>
              </div>
            </div>

            {/* 实时麦克风录音控制 */}
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={analyzing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--card-border)] hover:border-red-500 hover:bg-red-500/5 text-xs font-bold text-[var(--muted-text)] hover:text-red-500 transition-all active:scale-95"
                >
                  <Mic size={14} className="text-red-500" />
                  开始实时录音
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-xs font-bold text-white transition-all active:scale-95 animate-pulse"
                >
                  <Square size={12} fill="white" />
                  停止录音 (已录制)
                </button>
              )}
            </div>
          </div>

          {/* VAD 引擎选择 */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--muted-text)] uppercase tracking-wider">VAD 算法引擎</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'silero', label: 'Silero VAD', desc: '深度学习' },
                { id: 'webrtc', label: 'WebRTC VAD', desc: 'Google 算法' },
                { id: 'energy', label: 'Energy VAD', desc: '简易能量' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setEngine(opt.id);
                    setSegments([]);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    engine === opt.id
                      ? 'border-blue-500 bg-blue-500/5 text-blue-500'
                      : 'border-[var(--card-border)] hover:bg-[var(--card-border)]/5 text-[var(--muted-text)]'
                  }`}
                >
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-[9px] opacity-60 mt-1">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 动态引擎微调配置 */}
          {engine === 'energy' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--muted-text)] uppercase tracking-wider">能量阈值 (Threshold)</label>
                <span className="text-xs text-blue-500 font-medium">{threshold}</span>
              </div>
              <input
                type="range"
                min="0.001"
                max="0.1"
                step="0.001"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[9px] text-[var(--muted-text)] opacity-70">较低的值更容易检测到微弱声音，但也更容易受背景噪音误触发。</span>
            </div>
          )}

          {engine === 'webrtc' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--muted-text)] uppercase tracking-wider">敏感度等级 (Sensitivity)</label>
              <select
                value={sensitivity}
                onChange={(e) => setSensitivity(parseInt(e.target.value))}
                className="w-full bg-[var(--card-border)] border border-[var(--card-border)] text-sm rounded-xl p-2.5 outline-none focus:border-blue-500"
              >
                <option value="0">0 (低敏感度，过滤杂音强)</option>
                <option value="1">1 (中度敏感度)</option>
                <option value="2">2 (高敏感度)</option>
                <option value="3">3 (极高敏感度，极易触发人声)</option>
              </select>
            </div>
          )}

          {engine === 'silero' && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 text-[11px] text-green-600 dark:text-green-400 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <AlertCircle size={12} />
                智能深度学习引擎
              </div>
              <p className="opacity-80">Silero VAD 具有卓越的通用人声和环境噪声分离特性。默认提供极好的综合体验，无需细微参数微调。</p>
            </div>
          )}

          {/* 一键检测按钮 */}
          <button
            onClick={handleAnalyze}
            disabled={!file || analyzing || isRecording}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-md ${
              !file || isRecording
                ? 'bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed shadow-none'
                : analyzing
                ? 'bg-blue-600/50 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-blue-500/20'
            }`}
          >
            <Activity size={18} className={analyzing ? 'animate-pulse' : ''} />
            {analyzing ? '正在进行人声特征分析...' : '一键进行 VAD 评估'}
          </button>
        </div>

        {/* 右侧可视化波形展示与切片列表 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 波形卡片 */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <span className="font-bold text-lg flex items-center gap-2">
                <FileAudio size={20} className="text-blue-500" />
                时域波形与人声热力图
              </span>
              {processTime > 0 && (
                <span className="text-[11px] bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full text-[var(--muted-text)]">
                  耗时: <span className="font-mono text-blue-500 font-semibold">{processTime} ms</span>
                </span>
              )}
            </div>

            {/* Canvas 绘图区域 */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl overflow-hidden relative border border-[var(--card-border)]/50">
              <canvas
                ref={canvasRef}
                width={800}
                height={160}
                className="w-full h-40 block cursor-pointer"
              />
              
              {/* 底部播放进度文字 */}
              {audioDuration > 0 && (
                <div className="absolute bottom-2 right-3 font-mono text-[10px] text-gray-500">
                  {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(1).padStart(4, '0')} / {Math.floor(audioDuration / 60)}:{(audioDuration % 60).toFixed(1).padStart(4, '0')}
                </div>
              )}
            </div>

            {/* 音频标签 */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => audioRef.current && setAudioDuration(audioRef.current.duration)}
                className="hidden"
              />
            )}

            {/* 音频主播放控制栏 */}
            {file && !isRecording && (
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/30 p-3 rounded-xl border border-[var(--card-border)]/50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/10 active:scale-95"
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-[1px]" />}
                  </button>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold truncate max-w-[200px]">{file.name}</span>
                    <span className="text-[10px] text-[var(--muted-text)] opacity-70">
                      采样大小: {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                </div>

                {/* 智能播放设定 */}
                {segments.length > 0 && (
                  <button
                    onClick={() => setMuteSilence(!muteSilence)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      muteSilence
                        ? 'bg-red-500/10 border-red-500/30 text-red-500'
                        : 'border-[var(--card-border)] text-[var(--muted-text)] hover:bg-[var(--card-border)]/5'
                    }`}
                  >
                    <VolumeX size={14} />
                    {muteSilence ? '已开启一键静音消除' : '一键消除无声区间'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* VAD 切片试听列表 */}
          {segments.length > 0 && (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="font-bold text-lg flex items-center gap-2 border-b border-[var(--card-border)] pb-3">
                <Headphones size={20} className="text-green-500" />
                <span>分析得到的人声片段 ({segments.length} 个)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {segments.map((seg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--card-border)] hover:border-blue-500 bg-gray-50 dark:bg-gray-900/10 hover:bg-blue-500/[0.02] transition-all group"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--foreground)]">片段 #{idx + 1}</span>
                      <span className="text-[10px] text-[var(--muted-text)] font-mono mt-0.5">
                        区间: {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s (时长: {(seg.end - seg.start).toFixed(2)}s)
                      </span>
                    </div>
                    
                    <button
                      onClick={() => playSegment(seg.start, seg.end)}
                      className="p-2 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-lg opacity-80 group-hover:opacity-100 hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                      title="单独试听该片段"
                    >
                      <Play size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
