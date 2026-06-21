'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  Square,
  Send,
  AlertCircle,
  Loader2,
  PhoneOff,
  Settings,
  UserCheck,
  Radio,
  Wifi,
  WifiOff
} from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

type Phase = 'idle' | 'listening' | 'recognizing' | 'thinking' | 'speaking';

interface Speaker {
  id: string;
  name: string;
  description: string;
  avatar: string;
  system_prompt: string;
  voice_id: string;
  llm_config_id?: string;
  llm_model?: string;
  is_preset: number;
}

interface Props {
  selectedKey: string;
  onJumpToConfig: () => void;
}

// PCM 队列播放器
class PCMQueuePlayer {
  private audioCtx: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private sampleRate: number = 16000;

  constructor(sampleRate: number = 16000) {
    this.sampleRate = sampleRate;
  }

  init() {
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });
    this.nextPlayTime = this.audioCtx.currentTime;
  }

  feed(pcmData: Int16Array) {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }

    const buffer = this.audioCtx.createBuffer(1, floatData.length, this.sampleRate);
    buffer.copyToChannel(floatData, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.02; // 极小的缓冲窗
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
  }

  stop() {
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.nextPlayTime = 0;
  }
}

export default function StreamingConversationPage({ selectedKey, onJumpToConfig }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentAiResponse, setCurrentAiResponse] = useState('');

  // 引用管理
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playerRef = useRef<PCMQueuePlayer | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // --- 加载发音人 ---
  const loadSpeakers = async () => {
    try {
      const res = await fetch('/admin/speakers');
      const data = await res.json();
      setSpeakers(data);
      if (data.length > 0) {
        setActiveSpeaker(data[0]);
      }
    } catch (e) {
      setError('无法获取发音人列表');
    }
  };

  // 用于防止 React 开发模式或并发引起的多次重复创建会话锁
  const creatingConvsRef = useRef<Record<string, boolean>>({});

  // --- 智能为 Speaker 查找或创建会话（每个发声人永久唯一） ---
  const initConversationForSpeaker = useCallback(async (speaker: Speaker) => {
    try {
      const targetTitle = `与 ${speaker.name} 的实时通话`;

      // 1. 如果检测到有其他并发流程正在为该发音人创建会话，我们稍微等一下再查
      if (creatingConvsRef.current[targetTitle]) {
        await new Promise(resolve => setTimeout(resolve, 300));
        // 重新拉取以复用刚才创建好的
        const listRes = await fetch('/admin/conversations');
        const conversations = await listRes.json();
        const existingConv = conversations.find((c: any) => c.title === targetTitle);
        if (existingConv) {
          setActiveId(existingConv.id);
          const check = await fetch(`/admin/conversations/${existingConv.id}`);
          const data = await check.json();
          setMessages(data.messages || []);
          return;
        }
      }

      // 2. 直接请求后端获取当前所有的会话列表，用于全局查重与复用
      const listRes = await fetch('/admin/conversations');
      const conversations = await listRes.json();
      
      // 3. 在后端已存数据中寻找名称匹配的专属会话
      const existingConv = conversations.find((c: any) => c.title === targetTitle);

      if (existingConv) {
        // 找到了已存在的唯一会话，直接复用
        const localKey = `conv_id_${speaker.id}`;
        localStorage.setItem(localKey, existingConv.id);
        setActiveId(existingConv.id);
        
        // 拉取该会话的所有历史消息
        const check = await fetch(`/admin/conversations/${existingConv.id}`);
        const data = await check.json();
        setMessages(data.messages || []);
        return;
      }

      // 4. 只有当数据库里没有任何匹配的会话时，才上锁并唯一新建一个
      creatingConvsRef.current[targetTitle] = true;
      try {
        const create = await fetch('/admin/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: targetTitle }),
        });
        const created = await create.json();
        if (created?.conversation?.id) {
          const newId = created.conversation.id;
          const localKey = `conv_id_${speaker.id}`;
          localStorage.setItem(localKey, newId);
          setActiveId(newId);
          setMessages([]); // 新会话无历史，清空消息
        }
      } finally {
        creatingConvsRef.current[targetTitle] = false;
      }
    } catch (e) {
      setError('发音人专属会话初始化失败');
    }
  }, []);

  // --- 当 activeSpeaker 改变时，切换会话 ID ---
  useEffect(() => {
    if (activeSpeaker) {
      initConversationForSpeaker(activeSpeaker);
    }
  }, [activeSpeaker, initConversationForSpeaker]);

  // --- 加载历史消息 ---
  const loadMessages = useCallback(async () => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    try {
      const res = await fetch(`/admin/conversations/${activeId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setError('加载聊天历史失败');
    }
  }, [activeId]);

  useEffect(() => {
    loadSpeakers();
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- 停止播放与录音 ---
  const stopAudioTracks = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }
    setAudioLevel(0);
  };

  // --- WebSocket 连接 ---
  const connectWebSocket = useCallback((speakerId: string, currentConvId: string | null) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    let url = `${protocol}//${host}/api/v1/audio/agent/ws?speaker_id=${speakerId}`;
    if (currentConvId) {
      url += `&conversation_id=${currentConvId}`;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      ws.send(JSON.stringify({ type: 'start', speaker_id: speakerId, conversation_id: currentConvId }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'status':
            setPhase(data.status);
            break;
          case 'asr_result':
            setMessages(prev => [...prev, { role: 'user', content: data.text }]);
            break;
          case 'llm_start':
            setCurrentAiResponse('');
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            break;
          case 'llm_chunk':
            setCurrentAiResponse(prev => {
              const updated = prev + data.text;
              setMessages(oldMsgs => {
                const copy = [...oldMsgs];
                if (copy.length > 0 && copy[copy.length - 1].role === 'assistant') {
                  copy[copy.length - 1] = { ...copy[copy.length - 1], content: updated };
                }
                return copy;
              });
              return updated;
            });
            break;
          case 'audio_chunk':
            if (!playerRef.current) {
              playerRef.current = new PCMQueuePlayer(16000);
              playerRef.current.init();
            }
            // base64 to binary
            const binaryStr = window.atob(data.audio);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const pcm16 = new Int16Array(bytes.buffer);
            playerRef.current.feed(pcm16);
            break;
          case 'audio_end':
            // 播音完毕
            loadMessages();
            break;
          case 'interrupt':
            // 中断播放
            if (playerRef.current) {
              playerRef.current.stop();
              playerRef.current = null;
            }
            setCurrentAiResponse('已打断回复');
            loadMessages();
            break;
          case 'error':
            setError(data.message);
            break;
        }
      } catch (err) {
        console.error('Failed to handle ws message', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setError('WebSocket 连接发生错误');
      setIsConnected(false);
    };
  }, [activeId, loadMessages]);

  // Downsample & Int16 Conversion
  const downsampleBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number = 16000): Int16Array => {
    if (inputSampleRate === outputSampleRate) {
      const pcm = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        pcm[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7FFF;
      }
      return pcm;
    }
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = Math.min(1, Math.max(-1, accum / (count || 1))) * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  // --- 开始实时通话 ---
  const startStreaming = async () => {
    if (!activeSpeaker) return;
    setError(null);
    stopAudioTracks();

    // 重新连接并准备 WS
    connectWebSocket(activeSpeaker.id, activeId);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 创建 PCM 音频采集处理器
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      source.connect(processor);
      processor.connect(ctx.destination);
      processorRef.current = processor;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      processor.onaudioprocess = (e) => {
        // 音量显示
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setAudioLevel(Math.sqrt(sum / buf.length));

        // 收集输入声道数据
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = downsampleBuffer(inputData, ctx.sampleRate, 16000);

        // 发送到后端
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm16.buffer);
        }
      };

      setPhase('listening');
      setCurrentAiResponse('我正在听，请说话...');

    } catch (e: any) {
      setError(`麦克风授权失败: ${e.message}`);
      setPhase('idle');
    }
  };

  const handleHangup = () => {
    stopAudioTracks();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setPhase('idle');
    setCurrentAiResponse('通话已结束');
  };

  useEffect(() => {
    return () => {
      stopAudioTracks();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex flex-1 min-h-0 gap-6 overflow-hidden select-none">

      
      {/* 左侧：发音人呼叫主控制区 */}
      <div className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 flex flex-col justify-between relative shadow-sm min-h-0 overflow-hidden">
        
        {/* 顶部发音人及 WS 连通指示 */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-4">
          <div className="flex gap-2.5 overflow-x-auto max-w-[70%] py-1 no-scrollbar">
            {speakers.map((sp) => {
              const active = activeSpeaker?.id === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => {
                    handleHangup();
                    setMessages([]); // 立即清空，防止界面残留上一个发音人的对话历史
                    setActiveSpeaker(sp);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    active
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-500/10 scale-105'
                      : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-gray-400'} animate-pulse`} />
                  {sp.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-semibold border ${
              isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
            }`}>
              {isConnected ? <Wifi size={12} className="animate-pulse" /> : <WifiOff size={12} />}
              {isConnected ? '流式连通' : '离线'}
            </div>
            <button
              onClick={onJumpToConfig}
              className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all border border-transparent hover:border-[var(--card-border)] text-[var(--muted-text)] flex items-center justify-center"
              title="管理发音人角色"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* 中间：声波高亮扩散动画 */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-4 my-auto">
          <div className="relative mb-8">
            
            <div
              className={`absolute inset-[-20px] rounded-full blur-2xl transition-all duration-300 opacity-30 ${
                phase === 'listening'
                  ? 'bg-emerald-500 scale-110 opacity-40'
                  : phase === 'speaking'
                  ? 'bg-blue-600 scale-105'
                  : phase === 'thinking'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-zinc-500/20'
              }`}
            />

            <div
              className={`absolute inset-[-10px] rounded-full border border-emerald-500/20 transition-transform duration-100 ${
                phase === 'listening' ? 'scale-105 border-emerald-500/30' : ''
              }`}
              style={{
                transform: phase === 'listening' ? `scale(${1 + audioLevel * 3.5})` : undefined
              }}
            />

            <div className="w-44 h-44 rounded-full border-4 border-[var(--card-bg)] shadow-2xl relative overflow-hidden flex items-center justify-center bg-gradient-to-tr from-emerald-500/20 to-teal-500/20">
              <span className="text-5xl font-extrabold text-emerald-600/60 dark:text-emerald-400/60 select-none">
                {activeSpeaker?.name.slice(0, 1) || 'A'}
              </span>

              {phase === 'recognizing' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={32} className="animate-spin text-white" />
                </div>
              )}
            </div>
          </div>

          <div className="text-center space-y-3 max-w-sm">
            <h2 className="text-xl font-bold tracking-tight">{activeSpeaker?.name}</h2>
            <p className="text-xs text-[var(--muted-text)] line-clamp-2 px-4 leading-relaxed">
              {activeSpeaker?.description || '暂无详细介绍'}
            </p>
          </div>
        </div>

        {/* 底部控制中心 */}
        <div className="border-t border-[var(--card-border)] pt-5 flex flex-col items-center gap-4">
          <div className="w-full text-center min-h-[2rem] flex items-center justify-center px-4">
            {error ? (
              <div className="flex items-center gap-1.5 text-xs text-rose-500 font-medium">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            ) : (
              <div className="w-full max-w-lg flex flex-col gap-1.5 py-1">
                {/* 单行实时字幕滚动区 */}
                {messages.length > 0 && phase !== 'idle' && (
                  <div className="w-full px-4 py-1.5 text-center transition-all">
                    {(() => {
                      // 智能寻找要显示的消息
                      // 如果当前 AI 还在思考或倾听，优先展示用户说的最后一条
                      // 否则（AI在说话），展示 AI 的回复
                      let msgToShow = messages[messages.length - 1];
                      if (phase === 'thinking' || phase === 'recognizing' || phase === 'listening') {
                        const userMsgs = messages.filter(m => m.role === 'user');
                        if (userMsgs.length > 0) {
                          msgToShow = userMsgs[userMsgs.length - 1];
                        }
                      }

                      const isUser = msgToShow.role === 'user';
                      return (
                        <div className="text-xs leading-normal inline-flex items-center gap-1.5 animate-fadeIn max-w-full justify-center">
                          <span className={`font-bold shrink-0 ${isUser ? 'text-emerald-500' : 'text-blue-500'}`}>
                            {isUser ? '你:' : `${activeSpeaker?.name || 'AI'}:`}
                          </span>
                          <span className="opacity-90 truncate select-text max-w-[280px]">
                            {msgToShow.content || (
                              <span className="inline-flex gap-0.5 items-center">
                                <span className="w-1 h-1 bg-[var(--muted-text)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 bg-[var(--muted-text)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 bg-[var(--muted-text)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <p className="text-[11px] text-[var(--muted-text)] italic tracking-wide max-w-md line-clamp-2 mt-1">
                  {phase === 'listening' ? '正在倾听...' :
                   phase === 'thinking' ? '思考中...' :
                   phase === 'speaking' ? '正在播音...' :
                   currentAiResponse || '点击下方绿色电话按钮开始全双工极低延迟通话'}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4">
            {phase === 'idle' ? (
              <button
                onClick={startStreaming}
                className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 transition-all scale-105 active:scale-95 border border-emerald-500"
              >
                <Mic size={28} />
              </button>
            ) : (
              <button
                onClick={handleHangup}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/20 hover:shadow-rose-500/30 transition-all scale-105 active:scale-95 border border-rose-500"
              >
                <PhoneOff size={28} />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* 右侧：状态面板与交互式消息历史 */}
      <div className="w-80 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 flex flex-col shadow-sm">
        <div className="flex items-center gap-2 border-b border-[var(--card-border)] pb-3 mb-4">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <h3 className="text-sm font-semibold">对话快照</h3>
        </div>

        {/* 消息流视图 */}
        <div className="flex-1 overflow-y-auto space-y-4 -mr-5 pr-5 scroll-smooth custom-scrollbar">

          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[var(--muted-text)] opacity-60 p-4">
              <UserCheck size={28} className="mb-2 text-zinc-400" />
              <span>暂无语音记录，接通电话开始畅聊</span>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-[var(--muted-text)] mb-1 px-1">
                    {isUser ? '你' : activeSpeaker?.name || 'AI'}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm transition-all border ${
                      isUser
                        ? 'bg-emerald-600 border-emerald-500 text-white rounded-tr-none'
                        : 'bg-[var(--background)] border-[var(--card-border)] rounded-tl-none'
                    }`}
                  >
                    {msg.content || (
                      <div className="flex items-center gap-1 py-1">
                        <span className="w-1.5 h-1.5 bg-[var(--foreground)]/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-[var(--foreground)]/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-[var(--foreground)]/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

    </div>
  );
}
