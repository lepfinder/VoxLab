# Research Brief: VoxLab 开源语音模型选型审计

## Question
VoxLab 当前接入的开源 ASR / TTS / 声纹 / VAD 模型，截至 2026-09 是否有官方新版本？市面上是否存在同等或更小参数量、效果持平或更好的替代/升级选型，值得优先尝试？

## Context
- 项目：VoxLab，本地语音实验室（FastAPI + Next.js），面向 macOS MLX / Linux PyTorch 双栈
- 部署约束：单机本地推理、延迟加载、Apple Silicon 优先（MLX 4/8-bit 量化友好）、中文为主、支持流式与克隆
- 决策目标：给出「继续用 / 升级版本 / 换模型 / 暂缓」的可执行建议，而非罗列论文

## Current inventory (must audit these first)
| 类别 | 当前模型 | 备注 |
|---|---|---|
| ASR | iic/SenseVoiceSmall | 主力中文 ASR + 声纹 |
| ASR | mlx-community/Qwen3-ASR-0.6B-4bit (Linux: Qwen/Qwen3-ASR-0.6B) | |
| ASR | vosk-model-small-cn-0.22 | 轻量流式 |
| TTS | hexgrad/Kokoro-82M | |
| TTS | Qwen3-TTS-12Hz-1.7B (VoiceDesign / CustomVoice / Base, macOS 8-bit MLX) | 三变体 |
| TTS | openbmb/VoxCPM2 | 克隆 |
| TTS | k2-fsa/OmniVoice | |
| TTS | Edge-TTS | 云端 fallback |
| 声纹 | iic/speech_campplus_sv_zh-cn_16k-common | CAM++ |
| VAD | Silero VAD / WebRTC / Energy | |

## Scope
**In**: 上述模型的官方后续版本；同级或更小参数量的开源替代；中英双语；本地可跑（CPU/Apple Silicon/消费级 GPU）；流式能力；克隆质量；许可证与维护状态
**Out**: 商业闭源 API 横评（仅作对照提及）；超大规模云端模型；非语音任务

## Assumptions
- 时间窗：重点关注 2025-01 至 2026-09 的发布与更新
- 参数量/显存是硬约束，不接受「大一截但更好」作为默认推荐
- 中文效果权重高于纯英文基准分
- 社区实测（GitHub issues、知乎、Reddit）可作次要证据，优先官方

## Depth
deep（6 angles × ≤8 queries）

## Angles
- F1: ASR 现役模型官方版本与维护状态（SenseVoice / Qwen3-ASR / Vosk 后继）
- F2: ASR 同级/更小替代选型与基准对比
- F3: TTS 现役模型官方版本与维护状态（Kokoro / Qwen3-TTS / VoxCPM / OmniVoice）
- F4: TTS 同级/更小替代选型与基准对比（含流式与克隆）
- F5: 声纹 CAM++ 与 VAD（Silero 等）的更新与替代
- F6: 实战部署视角：Apple Silicon/MLX 生态、社区实测口碑、避坑点

## Date
2026-09-13
