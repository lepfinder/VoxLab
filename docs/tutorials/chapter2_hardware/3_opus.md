# 2.3 语音 Opus 压缩编码

在网络传输中，直接发送未经压缩的原始 PCM 语音会占用极大的带宽。本小节将为您介绍如何利用开源的 Opus 编解码器在 ESP32 本地进行高效的语音压缩。

---

## 1. 为什么要使用 Opus 编码？
*   **压缩比极高**：原始 16kHz/16bit/单声道 PCM 音频的码率为 **256 kbps**（每秒 32,000 字节）。经过 Opus 编码后，只需 **16 - 24 kbps** 就能保证极高的音质，带宽开销缩小了 10 倍以上！
*   **低延迟**：Opus 专为实时通信设计，支持超小的帧大小（如 10ms, 20ms, 60ms）。
*   **网络硬件友好**：后端 WebSocket 接口 `ws://.../audio/voice` 默认接收的即为 **Opus 压缩流**。

---

## 2. 帧长与样本数量换算
在进行 Opus 编码前，我们需要按固定时间长将 PCM 数据切片为帧发送给编码器：
对于 `16000Hz` 采样率的音频，常用的帧长大小计算如下：
*   **20ms 帧**：$16000 \times 0.02 = 320$ 个采样点（共 640 字节）。
*   **60ms 帧 (最推荐)**：$16000 \times 0.06 = 960$ 个采样点（共 1920 字节）。

---

## 3. ESP32 使用 libopus 编码核心流程
在 C++ 项目中，您需要引入 `opus` 静态库（推荐使用适用于 ESP32 的第三方移植包如 `esp32-opus`）。

### 3.1 编码器初始化
```cpp
#include <opus.h>

OpusEncoder *encoder;
int error;

void init_opus() {
    // 创建单声道 VoIP 模式编码器
    encoder = opus_encoder_create(16000, 1, OPUS_APPLICATION_VOIP, &error);
    if (error != OPUS_OK) {
        Serial.println("Failed to create Opus encoder!");
        return;
    }
    
    // 设置目标码率为 24Kbps
    opus_encoder_ctl(encoder, OPUS_SET_BITRATE(24000));
    // 设置复杂度 (推荐 0-4，降低 CPU 消耗)
    opus_encoder_ctl(encoder, OPUS_SET_COMPLEXITY(3));
}
```

### 3.2 帧编码
当累积到 960 个采样点（60ms）后，调用 `opus_encode` 进行压缩：
```cpp
// in_pcm: 输入的 960 个 16-bit 采样点 (1920 字节)
// out_opus_data: 用于输出 Opus 压缩包的缓冲区
// 返回值: 实际编码后的 Opus 字节大小
int encode_frame(const int16_t* in_pcm, uint8_t* out_opus_data, int max_out_bytes) {
    int encoded_bytes = opus_encode(
        encoder, 
        in_pcm, 
        960,  // 帧大小必须匹配 960
        out_opus_data, 
        max_out_bytes
    );
    
    if (encoded_bytes < 0) {
        Serial.printf("Opus Encoding Error: %s\n", opus_strerror(encoded_bytes));
        return -1;
    }
    return encoded_bytes;
}
```

---

## 4. 传输协议打包设计 (大端对齐)
由于 Opus 属于变长编码，每一帧生成的包大小不同（通常在 10 到 100 字节之间）。
为了让后端的 VAD/ASR 解析器能够正确切包分帧，我们在通过 WebSocket 传输时，必须在每个二进制 Opus 包头部加上 **2 字节长度前缀（使用网络大端字节序，Big-Endian）**。

*   **大端格式**：
    `[2 字节包长度 (Big-Endian)] + [实际变长 Opus 载荷]`
*   **发送数据构造示例 (C++)**：
    ```cpp
    uint8_t send_buf[512];
    uint16_t opus_len = (uint16_t)encoded_bytes;
    
    // 写入大端长度前缀
    send_buf[0] = (opus_len >> 8) & 0xFF;
    send_buf[1] = opus_len & 0xFF;
    
    // 拷贝 Opus 载荷
    memcpy(send_buf + 2, out_opus_data, opus_len);
    
    // 发送 send_buf, 总发送长度为 opus_len + 2
    ```

在掌握了 I2S 音频采集和 Opus 编码后，最后一节我们将把数据通过 WebSocket 实时发送给本地 VoxLab 后端服务。
