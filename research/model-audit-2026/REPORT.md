# VoxLab 开源语音模型选型审计（2026-09）

> Generated 2026-09-13 · depth: deep · 6 angles · workspace: research/model-audit-2026/

## Executive summary

- **SenseVoice 无 Large/V2 可升**。官方公开权重仍只有 SenseVoiceSmall 234M；论文中的 Large 未开源。阿里官方后继线是 **Fun-ASR-Nano-2512（800M，Apache-2.0，AISHELL-1 CER 1.80）**，架构为 SenseVoice encoder + Qwen3 decoder [1][2][7][13]。
- **中文 ASR 精度新 SOTA 是 FireRedASR2-AED（2026-02）**：普通话 4 套均 CER 3.05，优于 Fun-ASR-Nano（4.55）与 Qwen3-ASR-1.7B（3.76）；但 Linux-first（仅测 Ubuntu 22.04），Apple Silicon 未验证 [16][17]。
- **Vosk 中文权重自 small-cn-0.22 后无更新**，API 仍在维护（v0.3.50，2026-04）但产品价值已边缘化；流式应迁向 Fun-ASR realtime 或 sherpa-onnx streaming SenseVoice [11][12]。
- **Kokoro 停在 82M**，推理库最后提交 2025-08，中文靠 misaki G2P 而非新权重；仍是 Mac 上许可证最干净的轻量 TTS [21][22]。
- **Qwen3-TTS 12Hz 0.6B/1.7B 已开源（2026-01-22，Apache-2.0，首包 97ms）**；技术报告中的 **25Hz 更高音质版本截至 2026-09 仍未放出** [25][26]。
- **VoxCPM2（2B，2026-04，Apache-2.0）质量很强（Seed-TTS zh CER 0.97 / SS 79.5），但 Apple Silicon RTF ~1.76（M4 Pro/Metal）无法实时**；社区还有长文本失真（#372）与爆音（#385）open issue [27][52][53]。
- **≤0.5B 中文 TTS 首选 Fun-CosyVoice3-0.5B-2512**（Apache-2.0，流式 ~150ms，CV3 zh CER 1.21/SS 78.0）；**Mac/MLX 生态最完整的是 F5-TTS**（f5-tts-mlx，4/8-bit），但权重 CC-BY-NC [32][33][34]。
- **Edge-TTS 可用性已不可靠**：2025-12 曾被微软切断请求方法，2026-04/07 仍有 403/503；不应作为产品主路径 [29][30][31]。
- **CAM++ 无 v2**；同 toolkit 更准的升级是 **ERes2NetV2 17.8M**（CNCeleb EER 6.14% vs CAM++ 6.78%），Apache-2.0 + ONNX [42][43][44]。
- **Silero VAD 已到 v6.2（2025-12）**，~260K 参数、MIT、流式；**TEN VAD 带 Agora non-compete 附加条款**，产品内嵌需法务确认；**FireRedVAD（0.6M，Apache-2.0，2026-03）** 是干净的神经 VAD 备选 [45][46][48][49]。

## Background & scope

VoxLab 现役栈：SenseVoiceSmall / Qwen3-ASR-0.6B / Vosk（ASR）；Kokoro-82M / Qwen3-TTS-1.7B / VoxCPM2 / OmniVoice / Edge-TTS（TTS）；CAM++（声纹）；Silero/WebRTC/Energy（VAD）。部署约束为单机本地推理、Apple Silicon 优先（MLX 量化友好）、中文为主、需流式与克隆。本报告只回答两件事：**现役模型有没有官方新版**，以及**同级/更小是否有更值得跑的替代**。

---

## 1. ASR：现役状态与升级路径

### 1.1 SenseVoice — 无新权重，后继是 Fun-ASR-Nano

官方 Model Zoo 与 v1.0.0 release 表只列 SenseVoiceSmall 234M（zh/yue/en/ja/ko）；论文里的 Large 从未作为可下载权重发布 [1][2]。仓库已迁至 QwenAudio 组织，近期 release 是 FunASR llama.cpp runtime（GGUF 单二进制，内置 FSMN-VAD）[3]。

许可证澄清：代码 MIT；官方权重走 FunASR Model License，**允许商用**，§3 是责任免责声明而非 NC；微调衍生权重可保持私有 [1][15]。

**官方推荐升级路径不是等 Large，而是 Fun-ASR-Nano-2512 / MLT-Nano-2512（各 800M，Apache-2.0）**：中英日 + 7 大方言 + 26 地方口音、歌词/说唱识别、vLLM 流式、GGUF 部署；AISHELL-1 CER 1.80 / AISHELL-2 2.75 [7][8][13]。注意：ModelScope checkpoint 含 CTC 时间戳张量，HF checkpoint 曾滞后 [14]。

### 1.2 Qwen3-ASR — 本地 0.6B 仍在，API 线已跑到 3.0

本地开源侧仍是 Qwen3-ASR-0.6B（macOS 走 mlx-community 4bit）。阿里云 API 线已迭代到 2026-02 snapshots，并推出更新一代 **Qwen-Audio-3.0-ASR-Flash**（热词 + prompt，8 种中文方言）[9][10]。官方明确「Paraformer is an older-generation ASR model family. Migrate to Fun-ASR or Qwen-ASR when possible」[10]。

同尺寸论文数字：Qwen3-ASR-1.7B 普通话均 CER 3.76 / 方言 11.85，弱于 FireRedASR2-AED [16]。流式推理目前仅 vLLM 后端；MLX 路径是社区 mlx-audio + mlx-community 量化，非官方包 [57]。

### 1.3 Vosk — 权重停滞，可降级为遗留兼容

API v0.3.50（2026-04）仍在发，但中文权重仍是 small-cn-0.22（42M）/ cn-0.22（1.3G），Apache-2.0 未变，**无新中文模型** [11][12]。中文 WER 基准：SpeechIO-02 23.54 / THCHS 17.15，明显弱于 SenseVoice/Paraformer [12]。

### 1.4 ASR 替代选型对照

| 模型 | 参数 | 中文 CER（代表集） | 流式 | 许可 | Mac 可行性 | 判定 |
|---|---|---|---|---|---|---|
| SenseVoiceSmall（现役） | 234M | AISHELL-1 ~低个位数 | 伪流式 | FunASR（可商用） | ONNX/GGUF，无一等 MLX | **保留为主力** |
| Fun-ASR-Nano-2512 | 800M | AISHELL-1 **1.80** | vLLM/GGUF | Apache-2.0 | GGUF 可试 | **优先升级候选** |
| FireRedASR2-AED | ~1B 级 | 普通话均 **3.05** | 有词级时间戳 | 需核对 | Linux-only 实测 | 精度上限，Mac 暂缓 |
| Qwen3-ASR-0.6B（现役） | 0.6B | 弱于 FireRed/Nano | vLLM 有，MLX 假时间戳 | Qwen 系 | mlx-audio 有坑 | 保留，时间戳勿信 |
| Paraformer-zh | 220M | 成熟生产 | 有 streaming 权重 | Apache/MIT 工具链 | ONNX | 时间戳/热词场景备选 |
| icefall Zipformer | 30–157M | AISHELL test **4.28–4.67** | 支持 | Apache | sherpa-onnx | **最小尺寸优选** |
| Vosk small-cn（现役） | 42M | SpeechIO-02 23.54 | 是 | Apache | 是 | 降级为兼容 |
| Moonshine Mand. | 34M | 16.1%（无空格 CER） | 是 | MIT/ONNX | 是 | 精度不够，不推 |
| Distil-Whisper | 166–756M | — | — | — | — | 英文 only，排除 |

来源：[7][8][13][14][16][17][18][19][20][57][58]

---

## 2. TTS：现役状态与风险

### 2.1 Kokoro — 权重停滞，Mac 最低风险

仍 82M，无后续权重；推理库主分支最后提交 2025-08-06 [21]。中文能力来自 misaki[zh] 第二代分词器（借鉴 PaddleSpeech frontend），不是新模型 [22][23]。Apache-2.0 权重 + mlx-community 8/6/4-bit，MPS 需 `PYTORCH_ENABLE_MPS_FALLBACK=1`，MLX 路径更稳 [21][59]。**判定：保留为轻量/低风险路径，不指望音质升级。**

### 2.2 Qwen3-TTS — 已是开源新版，25Hz 未放

2026-01-22 开源 12Hz 系列 0.6B/1.7B（VoiceDesign / CustomVoice / Base），Apache-2.0，Dual-Track 流式首包 97ms [25][26][27]。官方侧重点是 CUDA + FlashAttention2 + vLLM-Omni，**无官方 MLX**；vLLM-Omni 目前仅离线，在线 serving 标注 later [25]。`qwen-tts` 包停在 0.1.1（2026-02-06）[28]。技术报告中的 **25Hz 模型有完整 benchmark 但截至 2026-09 未公开放出** [25]。

**运维红线（社区已复现根因）**：ICL 克隆时 `ref_text` 若未覆盖完整参考音频，官方 PyTorch 也会 3/3 崩坏成 ~24s 垃圾音；补全转写后 MLX 5/5 正常。这是使用约束，不是 MLX 移植 bug [54]。

### 2.3 VoxCPM2 — 质量强但 Mac 不能实时

最新是 2026-04 的 VoxCPM2（2B / 30 语种含川粤吴东北方言 / 48kHz / Voice Design / 可控克隆），代码 v2.0.3（2026-05-11，修 MPS 音质，默认 float32），**无 VoxCPM3**，Apache-2.0 [27][28][29]。Seed-TTS test-zh CER 0.97 / SS 79.5；RTX 4090 RTF 0.30，vLLM 加速到 ~0.13 [32]。

**Apple Silicon 硬约束**：llama.cpp-omni Q8_0 在 M4 Pro/Metal **RTF ~1.76**（慢于实时）[29][52]。社区 open issue：~300 字/20s 后中文长文失真（#372，用户称 1.5 更稳）、噼啪爆音（#385）[53][54]。**判定：可作离线高质量克隆，不可作 Mac 实时主路径。**

### 2.4 OmniVoice — 仍活跃，Mac 路径更现成

主分支最近提交 2026-08-24，包 0.2.0（2026-07）；近期合入 FlashInfer（2–2.9×）与 PEFT LoRA [30][31]。600+ 语言零样本，Apache-2.0；社区 **OmniVoice-MLX 已被官方收录**，Apple Silicon 路径比 Qwen3-TTS 更现成 [31]。

### 2.5 Edge-TTS — 不应作为可靠依赖

PyPI 7.2.8（2026-03-22，LGPLv3）；官方因微软限制移除自定义 SSML [29]。2025-12 曾疑似被切断请求方法（7.2.4–7.2.7 连发），2026-04/07 仍有 403/503/「No audio was received」[30][31]。**判定：降级为演示 fallback，产品路径必须本地化。**

### 2.6 TTS 替代选型对照

| 模型 | 参数 | 中文质量（官方表） | 流式/克隆 | 许可 | Mac/MLX | 判定 |
|---|---|---|---|---|---|---|
| Kokoro-82M（现役） | 82M | 中文靠 G2P，非 SOTA | 无克隆 | Apache | MLX 成熟 | 保留低风险档 |
| Qwen3-TTS-1.7B（现役） | 1.7B | 强（12Hz） | 97ms / ICL 克隆 | Apache | 仅社区 MLX，有 ICL 红线 | 保留，盯 25Hz |
| VoxCPM2（现役） | 2B | zh CER 0.97 / SS 79.5 | 克隆强 | Apache | RTF 1.76 不可实时 | 离线高质量档 |
| OmniVoice（现役） | — | 600+ 语种 | 克隆/设计 | Apache | OmniVoice-MLX | 保留，Mac 友好 |
| Edge-TTS（现役） | — | 好但云端 | 在线 | LGPLv3 | — | 降级，不可靠 |
| **Fun-CosyVoice3-0.5B-2512** | **0.5B** | zh CER **1.21**/SS 78.0（RL 0.81） | 流式 ~150ms / 克隆 | **Apache** | 需验证 | **≤0.5B 首选新增** |
| IndexTTS-2.5 | 0.8B | CV3 zh WER 4.36/SS 77.10 | 情感/语速/拼音可控 | bilibili 需商用授权 | 需验证 | 质量高，许可需谈 |
| IndexTTS-2 | 1.5B | Seed-TTS zh CER 1.03/SS 76.5 | 克隆 | bilibili | — | 1.5B 档质量优先 |
| F5-TTS Base | ~0.3B | Seed-TTS zh CER 1.52/SS 74.1 | 流式 | **CC-BY-NC** | **f5-tts-mlx 最完整** | Mac 快速验证首选 |
| Spark-TTS | 0.5B | SS 偏弱（zh 66.0） | 可控 | Apache | — | 不推 |
| GPT-SoVITS | ≪0.5B | few-shot 定制强 | 微调克隆 | MIT | 有 | 定制音色场景 |
| ChatTTS | ~4GB VRAM | 韵律好 | 流式未完 | AGPL + CC-BY-NC | — | 商用排除 |
| Fish S2 Pro | 4B | zh WER **0.54%** | 强 | Research License | — | 超预算 + 非标准开源 |
| MegaTTS3 | 0.5B | 数字好 | — | **未开源** | — | 只能围观 |

来源：[21][25][27][29][30][31][32][33][34][35][36][37][38][39][40][41][59]

---

## 3. 声纹与 VAD

### 3.1 CAM++ — 无 v2，升级到 ERes2NetV2

`iic/speech_campplus_sv_zh-cn_16k-common` 仍是 2023-05 的 7.2M 模型，无官方 v2 [42]。同 3D-Speaker toolkit 更准：**ERes2NetV2 17.8M**（CNCeleb EER 6.14% vs CAM++ 6.78%）、ERes2Net-large 22.46M（VoxCeleb1-O 0.52%）[42][43]。ERes2NetV2 中文权重 2024-08 发布，Apache 系 + ONNX，是「不换架构家族」时的精度优先替换 [44]。FunASR 生产默认仍是 cam++ 7.2M + FSMN-VAD 0.4M [45]。WeSpeaker 仍活跃（ReDimNet2 2026-07），中文 ResNet34 可用 [51]。

CAM++ 是段级 embedding，非 token 流式；流式应 VAD 切段后再跑，或换 ERes2NetV2 [50]。

### 3.2 VAD — Silero 已 v6.2，注意 TEN 许可

| 方案 | 参数 | 质量（Multi-Domain） | 许可 | 备注 |
|---|---|---|---|---|
| WebRTC（现役） | 极小 | ROC-AUC **0.73** | BSD | 明显最弱 |
| Energy（现役） | — | — | — | 仅 fallback |
| **Silero v6.2** | ~260K | **0.97** | **MIT** | 2025-12；RTS≈165×；有 mlx-community 权重 |
| TEN VAD | ~306KB lib | 0.93 | Apache + **Agora non-compete** | hop 10/16ms；sherpa-onnx 已集成 |
| FireRedVAD | 0.6M | F1 97.57 / AUC 99.60 | Apache-2.0 | 流式/非流式/mVAD；仅 Ubuntu 实测 |

来源：[45][46][47][48][49][50][59]

---

## 4. Apple Silicon / MLX 部署现实

1. **mlx-audio 是事实标准 MLX hub**：Kokoro、Qwen3-TTS/ASR、VoxCPM2、Silero VAD、Whisper 均有端口 + mlx-community 4/6/8-bit 权重 [52]。
2. **SenseVoice 无一等 MLX**；生产走 FunASR/ONNX/Libtorch/GGUF；长音频必须 VAD 切段或 30s+2s overlap 窗口，整文件 encode 会 OOM [58]。
3. **mlx-audio Qwen3-ASR 流式时间戳是假的**（token-budget × audio_duration）；改 `max_tokens` 同一音频时间戳会变。词级时间戳请用 Qwen3-ForcedAligner 或后对齐 [55]。另有「list 输入只认第一段」bug（已关）[56]。
4. **VoxCPM2 Mac RTF 1.76** 是产品级硬约束，不能进实时通话链路 [29][52]。
5. mlx-audio 还在收编 VibeVoice-ASR（60min 长音频 + diarization）、Parakeet v3、Nemotron streaming 等，Whisper/SenseVoice 已非 MLX 唯一选项 [52]。

---

## 5. 推荐行动（按优先级）

### 立刻可做（低风险、本地验证）
1. **Silero VAD 升级到 v6/v6.2**（MIT 不变，质量 0.73→0.97 量级）[45][46]。
2. **声纹评估 ERes2NetV2（17.8M）替换 CAM++**，同 toolkit/ONNX，中文 EER 更好 [42][43][44]。
3. **Qwen3-TTS 克隆加护栏**：`ref_text` 必须完整覆盖参考音频，否则会静默崩坏 [54]。
4. **Edge-TTS 降级**为演示 fallback，错误处理与超时必须可切本地 TTS [30][31]。
5. **VoxCPM2 升到 ≥v2.0.3**（MPS float32 修复）；实时链路不要用它 [29]。

### 中期试点（需要接入新 Provider）
6. **Fun-ASR-Nano-2512** 作为 SenseVoice 升级候选：Apache-2.0，AISHELL-1 CER 1.80，方言/口音/歌词；GGUF 可在 Mac 先跑通 [7][8][13]。
7. **Fun-CosyVoice3-0.5B-2512** 作为 ≤0.5B 流式克隆新 Provider（Apache-2.0）[32]。
8. **F5-TTS（f5-tts-mlx）** 作为 Mac 上最快能跑的克隆 PoC（注意 CC-BY-NC，产品化需换权重）[33][34]。
9. **FireRedVAD** 评估为 Silero 的 Apache-2.0 备选；**TEN VAD 先过法务**（Agora non-compete）[48][49]。

### 观望 / 不推
10. 等 **Qwen3-TTS 25Hz** 与更大规格公开（技术报告已有数）[25]。
11. **FireRedASR2-AED** 等 Mac/MLX 路径成熟再上（当前 Linux-only）[16][17]。
12. **不要**押注 Vosk 新中文权重、SenseVoice Large、Kokoro 新权重——官方均无迹象 [1][2][11][21]。
13. 商用产品避开 ChatTTS（AGPL+NC）、TEN VAD（未过法务前）、F5-TTS 权重（NC）。

---

## Open questions

- HuggingFace 本会话 transport error，**Qwen/Qwen3-ASR-0.6B 开源模型卡的许可证字段与是否已有更大/更小开源规格**未能直读核对；API 线信息完整，开源 checkpoint 细节置信度 medium。
- FireRedASR2-AED **确切参数量、许可证全文、是否有 ONNX/Core ML 路径**未在 README 找到。
- CosyVoice3-0.5B / IndexTTS-2.5 在 **Apple Silicon MLX/Core ML** 上的可用性未核实（目前仅 F5-TTS 与 VoxCPM-omni 路径清晰）。
- bilibili IndexTTS 与 Fish Audio Research License 的**实际商用条款边界**需法务/商务确认。
- 本会话 WebSearch 不可用，**知乎/Reddit/HN 真实中文口音听感横评**未纳入；社区信号仅来自 GitHub issues。
- 各家 README 的 CV3-Eval / Seed-TTS 对照表**不可直接跨家横比**（测试集切分与指标实现有差异），落地前需 VoxLab 自有音频 A/B。

## Sources

[1] SenseVoice README / Model Zoo — https://github.com/QwenAudio/SenseVoice (accessed 2026-09-13)  
[2] SenseVoice v1.0.0 release — https://github.com/QwenAudio/SenseVoice/releases/tag/v1.0.0 (accessed 2026-09-13)  
[3] SenseVoice releases（llama.cpp runtime）— https://github.com/QwenAudio/SenseVoice/releases (accessed 2026-09-13)  
[7] Fun-ASR README — https://github.com/QwenAudio/Fun-ASR (accessed 2026-09-13)  
[8] FunASR model_selection.md — https://raw.githubusercontent.com/modelscope/FunASR/main/docs/model_selection.md (accessed 2026-09-13)  
[9] Alibaba Cloud ASR models — https://www.alibabacloud.com/help/en/model-studio/asr-model (updated 2026-09-03)  
[10] Alibaba Cloud real-time ASR guide — https://www.alibabacloud.com/help/en/model-studio/real-time-speech-recognition-user-guide (updated 2026-09-11)  
[11] Vosk API releases — https://github.com/alphacep/vosk-api/releases (v0.3.50, 2026-04)  
[12] Vosk models — https://alphacephei.com/vosk/models (accessed 2026-09-13)  
[13] Fun-ASR paper — https://arxiv.org/abs/2509.12508 (v4, 2025-12-19)  
[14] FunASR README — https://raw.githubusercontent.com/modelscope/FunASR/main/README.md (accessed 2026-09-13)  
[15] FunASR production AutoModel defaults — https://github.com/modelscope/FunASR (accessed 2026-09-13)  
[16] FireRedASR2S — https://github.com/FireRedTeam/FireRedASR2S (2026-02)  
[17] FireRedASR — https://github.com/FireRedTeam/FireRedASR (2025-01)  
[18] icefall Zipformer recipes — https://github.com/k2-fsa/icefall (accessed 2026-09-13)  
[19] Distil-Whisper — https://github.com/huggingface/distil-whisper (accessed 2026-09-13)  
[20] Moonshine models — https://moonshine-voice.readthedocs.io/en/latest/models/available-models/ (accessed 2026-09-13)  
[21] Kokoro — https://github.com/hexgrad/kokoro (last commit 2025-08-06)  
[22] misaki — https://github.com/hexgrad/misaki (accessed 2026-09-13)  
[23] QwenLM/Qwen3-ASR — https://github.com/QwenLM/Qwen3-ASR (2026-01-29; transformers 2026-06-26)  
[25] QwenLM/Qwen3-TTS — https://github.com/QwenLM/Qwen3-TTS (2026-01-22)  
[26] Qwen3-TTS paper — https://arxiv.org/abs/2601.15621 (2026-01-22)  
[27] qwen-tts PyPI — https://pypi.org/project/qwen-tts/ (0.1.1, 2026-02-06)  
[28] OpenBMB/VoxCPM — https://github.com/OpenBMB/VoxCPM (VoxCPM2 2026-04; v2.0.3 2026-05-11)  
[29] edge-tts PyPI — https://pypi.org/project/edge-tts/ (7.2.8, 2026-03-22)  
[30] edge-tts issue #444 — https://github.com/rany2/edge-tts/issues/444 (2025-12)  
[31] edge-tts issues (403/503) — https://github.com/rany2/edge-tts/issues?q=is%3Aissue+microsoft (2026-04/07)  
[32] FunAudioLLM/CosyVoice — https://github.com/FunAudioLLM/CosyVoice (Fun-CosyVoice3-0.5B-2512, 2025-12)  
[33] SWivid/F5-TTS — https://github.com/SWivid/F5-TTS (accessed 2026-09-13)  
[34] f5-tts-mlx — https://github.com/lucasnewman/f5-tts-mlx (accessed 2026-09-13)  
[35] Spark-TTS — https://github.com/SparkAudio/Spark-TTS (accessed 2026-09-13)  
[36] index-tts (IndexTTS-2.5) — https://github.com/index-tts/index-tts (2026-08-10)  
[37] fish-speech (S2 Pro) — https://github.com/fishaudio/fish-speech (2026)  
[38] GPT-SoVITS — https://github.com/RVC-Boss/GPT-SoVITS (accessed 2026-09-13)  
[39] ChatTTS — https://github.com/2noise/ChatTTS (accessed 2026-09-13)  
[40] MaskGCT — https://github.com/open-mmlab/Amphion/tree/main/models/tts/maskgct (accessed 2026-09-13)  
[41] Orpheus-TTS — https://github.com/canopyai/Orpheus-TTS (accessed 2026-09-13)  
[42] 3D-Speaker — https://github.com/modelscope/3D-Speaker (CAM++/ERes2NetV2)  
[43] OmniVoice — https://github.com/k2-fsa/OmniVoice (accessed 2026-09-13)  
[44] OmniVoice commits — https://github.com/k2-fsa/OmniVoice/commits/master (through 2026-08-24)  
[45] Silero VAD version history — https://github.com/snakers4/silero-vad/wiki/Version-history-and-Available-Models (v6.2, 2025-12-10)  
[46] Silero VAD quality metrics — https://github.com/snakers4/silero-vad/wiki/Quality-Metrics (2026-03-26)  
[47] Silero VAD performance — https://github.com/snakers4/silero-vad/wiki/Performance-Metrics (accessed 2026-09-13)  
[48] TEN VAD — https://github.com/TEN-framework/ten-vad (accessed 2026-09-13)  
[49] TEN VAD LICENSE — https://github.com/TEN-framework/ten-vad/blob/main/LICENSE (Agora non-compete)  
[50] FireRedVAD paper — https://arxiv.org/abs/2603.10420 (2026-03-11)  
[51] WeSpeaker — https://github.com/wenet-e2e/wespeaker (ReDimNet2 2026-07)  
[52] mlx-audio — https://github.com/lucasnewman/mlx-audio (accessed 2026-09-13)  
[53] VoxCPM issue #372 (long-form) — https://github.com/OpenBMB/VoxCPM/issues/372 (2026-08-06)  
[54] VoxCPM issue #385 (crackle) — https://github.com/OpenBMB/VoxCPM/issues/385 (2026-08-20)  
[55] mlx-audio #921 (Qwen3-TTS ICL) — https://github.com/Blaizzy/mlx-audio/issues/921 (2026-08-28)  
[56] mlx-audio #927 (fake timestamps) — https://github.com/Blaizzy/mlx-audio/issues/927 (2026-08-29)  
[57] mlx-audio #926 (batch bug) — https://github.com/Blaizzy/mlx-audio/issues/926 (2026-08-31)  
[58] SenseVoice long-audio guidance — https://github.com/QwenAudio/SenseVoice (accessed 2026-09-13)  
[59] Silero VAD README — https://github.com/snakers4/silero-vad (accessed 2026-09-13)
