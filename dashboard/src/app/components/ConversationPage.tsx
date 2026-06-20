'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  Square,
  Send,
  AlertCircle,
  Loader2,
  PhoneOff,
  Keyboard,
  Settings,
  UserCheck
} from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

type Phase = 'idle' | 'recording' | 'recognizing' | 'thinking' | 'speaking';

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

const stripThink = (text: string): string => {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const thinkStart = cleaned.indexOf('<think>');
  if (thinkStart !== -1) {
    cleaned = cleaned.substring(0, thinkStart);
  } else if (cleaned.includes('<think')) {
    const lastTagIdx = cleaned.lastIndexOf('<think');
    cleaned = cleaned.substring(0, lastTagIdx);
  }
  return cleaned;
};

export default function ConversationPage({ selectedKey, onJumpToConfig }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showKeyboardInput, setShowKeyboardInput] = useState(false);
  const [currentAiResponse, setCurrentAiResponse] = useState(''); // 当前正在说的/输出的话

  // 音频与VAD相关引用
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const vadTimerRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const silenceSinceRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // VAD 灵敏度常量 (从配置继承，此处提供精细基准值)
  const vadSensitivity = 0.02;
  const silenceMs = 800;

  // --- 加载所有发音人 ---
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

  useEffect(() => {
    loadSpeakers();
  }, []);

  // --- 自动初始化会话 ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/admin/conversations');
        const data = await res.json();
        if (data.length > 0) {
          setActiveId(data[0].id);
          return;
        }
        const create = await fetch('/admin/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '语音通话会话' }),
        });
        const created = await create.json();
        if (created?.conversation?.id) setActiveId(created.conversation.id);
      } catch {
        setError('会话初始化失败');
      }
    })();
  }, []);

  // --- 加载历史消息 ---
  const loadMessages = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/admin/conversations/${activeId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setError('加载聊天历史失败');
    }
  }, [activeId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- LLM 调用流 ---
  const streamLLM = async (history: Message[]) => {
    if (!activeId || !activeSpeaker) return '';
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);
    setPhase('thinking');
    setCurrentAiResponse('正在组织语言...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: activeSpeaker.system_prompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          stream: true,
          conversation_id: activeId,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const displayVal = stripThink(fullText);
              setCurrentAiResponse(displayVal);
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], content: displayVal };
                return next;
              });
            }
          } catch {}
        }
      }
      return stripThink(fullText);
    } catch (e: any) {
      setError(`思考过程出错: ${e.message}`);
      setCurrentAiResponse('思考发生错误');
      return '';
    } finally {
      abortRef.current = null;
    }
  };

  // --- TTS 合成与流播放 ---
  const speak = async (responseText: string) => {
    if (!responseText.trim() || !activeSpeaker) return;
    setPhase('speaking');
    try {
      const res = await fetch('/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify({
          model: 'auto',
          input: responseText,
          voice: activeSpeaker.voice_id,
          response_format: 'mp3',
        }),
      });
      if (!res.ok) throw new Error('生成语音失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPhase('idle');
        activeAudioRef.current = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPhase('idle');
        activeAudioRef.current = null;
      };
      await audio.play();
    } catch (e: any) {
      setError(`合成失败: ${e.message}`);
      setPhase('idle');
    }
  };

  // --- 触发整体回复链 ---
  const handleUserText = async (userText: string) => {
    if (!userText.trim()) return;
    setError(null);
    const history = [...messages, { role: 'user' as const, content: userText }];
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setText('');
    const reply = await streamLLM(history);
    if (reply) await speak(reply);
    await loadMessages();
  };

  // ---------------- VAD 录音底层 ----------------
  const stopVadTimer = () => {
    if (vadTimerRef.current) {
      cancelAnimationFrame(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    stopVadTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const finalizeRecording = async (blob: Blob) => {
    if (!activeSpeaker) return;
    setPhase('recognizing');
    setCurrentAiResponse('正在倾听您的声音并转写...');
    try {
      const form = new FormData();
      form.append('file', blob, 'utterance.webm');
      form.append('model', 'sensevoice');
      const res = await fetch('/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${selectedKey}` },
        body: form,
      });
      const data = await res.json();
      const txt = (data.text || '').trim();
      if (!txt) {
        setPhase('idle');
        setCurrentAiResponse('刚才好像没听清，请再说一次。');
        return;
      }
      await handleUserText(txt);
    } catch (e: any) {
      setError(`ASR 转写出错: ${e.message}`);
      setPhase('idle');
    }
  };

  const startRecording = async () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    setError(null);
    recordedChunksRef.current = [];
    setCurrentAiResponse('请说话，结束时会自动为您答复。');
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
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 智能探测支持的 MIME
      let mimeType = '';
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) finalizeRecording(blob);
        else setPhase('idle');
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setPhase('recording');
      speakingRef.current = false;
      silenceSinceRef.current = performance.now();

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setAudioLevel(rms);
        const now = performance.now();

        if (rms > vadSensitivity) {
          if (!speakingRef.current) {
            speakingRef.current = true;
          }
          silenceSinceRef.current = now;
        } else if (speakingRef.current) {
          if (now - silenceSinceRef.current > silenceMs) {
            speakingRef.current = false;
            stopRecording();
            return;
          }
        }
        vadTimerRef.current = requestAnimationFrame(tick);
      };
      vadTimerRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setError(`麦克风授权失败: ${e.message}`);
      setPhase('idle');
    }
  };

  const handleHangup = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    abortRef.current?.abort();
    stopRecording();
    setPhase('idle');
    setCurrentAiResponse('通话已挂断');
  };

  useEffect(() => {
    return () => {
      stopVadTimer();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="flex flex-1 min-h-0 gap-6 overflow-hidden select-none">

      
      {/* 左侧：发音人呼叫主控制区 */}
      <div className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 flex flex-col justify-between relative shadow-sm">
        
        {/* 顶部发音人横向栏 */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-4">
          <div className="flex gap-2.5 overflow-x-auto max-w-[85%] py-1 no-scrollbar">
            {speakers.map((sp) => {
              const active = activeSpeaker?.id === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => {
                    handleHangup();
                    setActiveSpeaker(sp);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    active
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/10 scale-105'
                      : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-gray-400'} animate-pulse`} />
                  {sp.name}
                </button>
              );
            })}
          </div>
          <button
            onClick={onJumpToConfig}
            className="p-2 hover:bg-[var(--foreground)]/5 rounded-xl transition-all border border-transparent hover:border-[var(--card-border)] text-[var(--muted-text)] flex items-center justify-center"
            title="管理发音人角色"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* 中间：发光脉冲头像区 */}
        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <div className="relative mb-8">
            
            {/* 炫酷的环形声波高亮扩散动画 */}
            <div
              className={`absolute inset-[-20px] rounded-full blur-2xl transition-all duration-300 opacity-30 ${
                phase === 'recording'
                  ? 'bg-green-500 scale-110 opacity-40'
                  : phase === 'speaking'
                  ? 'bg-blue-600 scale-105'
                  : phase === 'thinking'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-blue-400/20'
              }`}
            />

            {/* 头像外圈物理反馈水波纹 */}
            <div
              className={`absolute inset-[-10px] rounded-full border border-blue-500/20 transition-transform duration-100 ${
                phase === 'recording' ? 'scale-105 border-green-500/30' : ''
              }`}
              style={{
                transform: phase === 'recording' ? `scale(${1 + audioLevel * 3})` : undefined
              }}
            />

            {/* 头像容器 */}
            <div className="w-44 h-44 rounded-full border-4 border-[var(--card-bg)] shadow-2xl relative overflow-hidden flex items-center justify-center bg-gradient-to-tr from-blue-500/20 to-indigo-500/20">
              <span className="text-5xl font-extrabold text-blue-600/60 dark:text-blue-400/60 select-none">
                {activeSpeaker?.name.slice(0, 1) || 'A'}
              </span>

              {/* 呼吸或者处理中遮罩 */}
              {phase === 'recognizing' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={32} className="animate-spin text-white" />
                </div>
              )}
            </div>
          </div>

          {/* 发音人属性与波点指示器 */}
          <div className="text-center space-y-3 max-w-sm">
            <h2 className="text-xl font-bold">{activeSpeaker?.name || '加载中'}</h2>
            
            {/* 经典波形跳动小圆点 */}
            <div className="flex justify-center gap-1.5 h-4 items-center">
              {[...Array(9)].map((_, i) => {
                const active = phase === 'recording' || phase === 'speaking';
                return (
                  <span
                    key={i}
                    className={`w-1 rounded-full bg-blue-600 dark:bg-blue-400 transition-all ${
                      active ? 'animate-bounce' : 'h-1.5'
                    }`}
                    style={{
                      height: active ? `${Math.max(6, Math.min(24, Math.random() * (phase === 'recording' ? audioLevel * 100 : 20)))}px` : undefined,
                      animationDelay: active ? `${i * 0.08}s` : undefined
                    }}
                  />
                );
              })}
            </div>

            <p className="text-sm font-medium px-4 text-[var(--muted-text)] min-h-[48px] line-clamp-2">
              {currentAiResponse || activeSpeaker?.description || '就绪，点击下方麦克风开始'}
            </p>
          </div>
        </div>

        {/* 底部：精简通话控制条 */}
        <div className="border-t border-[var(--card-border)] pt-5 flex items-center justify-center gap-6">
          <button
            onClick={() => setShowKeyboardInput(!showKeyboardInput)}
            className={`p-3 rounded-full border transition-all ${
              showKeyboardInput
                ? 'bg-blue-600/10 border-blue-500/30 text-blue-600'
                : 'bg-[var(--background)] border-[var(--card-border)] text-[var(--muted-text)] hover:bg-[var(--foreground)]/5'
            }`}
            title="切换文本键盘输入"
          >
            <Keyboard size={20} />
          </button>

          {/* 主通话操作按钮 */}
          {phase === 'recording' ? (
            <button
              onClick={stopRecording}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-red-500/30 hover:scale-105"
              title="暂停倾听"
            >
              <Square size={22} fill="white" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={phase === 'recognizing' || phase === 'thinking'}
              className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-blue-500/35 hover:scale-105 disabled:opacity-30"
              title="呼叫开始对话"
            >
              <Mic size={24} />
            </button>
          )}

          <button
            onClick={handleHangup}
            disabled={phase === 'idle'}
            className="p-3 rounded-full border border-transparent bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all active:scale-95 disabled:opacity-30"
            title="挂断当前对话"
          >
            <PhoneOff size={20} />
          </button>
        </div>

        {/* 悬浮键盘文本输入抽屉 */}
        {showKeyboardInput && (
          <div className="absolute bottom-24 left-6 right-6 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-3 flex gap-2 shadow-xl animate-scale-up">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim() && phase === 'idle') {
                  handleUserText(text);
                  setShowKeyboardInput(false);
                }
              }}
              placeholder="输入文本消息，回车发送..."
              disabled={phase !== 'idle'}
              className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
            />
            <button
              onClick={() => {
                if (text.trim()) {
                  handleUserText(text);
                  setShowKeyboardInput(false);
                }
              }}
              disabled={phase !== 'idle' || !text.trim()}
              className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
        )}

      </div>

      {/* 右侧：Live Transcript 聊天瀑布流 */}
      <div className="w-80 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 flex flex-col justify-between shadow-sm">
        <div>
          <h3 className="font-bold text-sm border-b border-[var(--card-border)] pb-3 text-[var(--muted-text)] tracking-wider uppercase">
            实时转译历史 (Live Transcript)
          </h3>
        </div>

        {/* 对话消息滚动体 */}
        <div className="flex-1 overflow-y-auto my-4 space-y-4 -mr-5 pr-5 custom-scrollbar max-h-[calc(100vh-18rem)]">

          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-xs text-[var(--muted-text)] py-20">
              暂无语音交互对话记录
            </div>
          ) : (
            messages.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id || i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs whitespace-pre-wrap break-words border ${
                      isUser
                        ? 'bg-blue-600 border-blue-500 text-white rounded-br-none shadow-sm'
                        : 'bg-[var(--background)] border-[var(--card-border)] rounded-bl-none text-[var(--foreground)]'
                    }`}
                  >
                    {m.content || <Loader2 size={12} className="animate-spin inline" />}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 异常和底层状态提示栏 */}
        <div className="text-[10px] text-[var(--muted-text)] font-mono border-t border-[var(--card-border)] pt-3 flex items-center justify-between">
          <span className="flex items-center gap-1">
            {error && <span className="text-red-500 flex items-center gap-0.5"><AlertCircle size={10} />错误</span>}
            {!error && <span className="text-green-500">●</span>}
            音色: {activeSpeaker?.voice_id || '默认'}
          </span>
          <span>模型: {activeSpeaker?.llm_model || '系统默认'}</span>
        </div>

      </div>

    </div>
  );
}
