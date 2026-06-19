# 2.4 WebSocket 实时语音流传输

本小节将为您介绍如何在 ESP32 上通过 WebSocket 协议建立长连接，并在主循环中将压缩后的语音 Opus 帧实时发送至 VoxLab 服务。

---

## 1. 对接 API 接口说明
*   **通信协议**：`WebSocket`
*   **WebSocket 地址**：`ws://<voxlab_server_ip>:8001/api/v1/audio/voice`
*   **消息类型**：
    *   **客户端发送**：二进制流数据（带 2 字节长度前缀的变长 Opus 帧）。
    *   **服务端推送**：当服务端静音检测（VAD）触发说话结束时，推送文本识别 JSON：
        ```json
        {
          "type": "asr_result",
          "text": "明天上海天气怎么样"
        }
        ```

---

## 2. 软件库依赖 (Arduino 平台)
推荐使用以下社区成熟的 Arduino 库处理网络和 WebSocket：
*   **`WebSocketsClient`** (由 links2004 提供，支持收发二进制包)。

---

## 3. ESP32 全流程集成示例代码

我们将 I2S 采集、Opus 编码和 WebSocket 逻辑拼装成一个可以运行的完整框架：

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>
#include <opus.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* server_ip = "192.168.1.100"; // 替换为您运行 VoxLab 服务的电脑 IP

WebSocketsClient webSocket;
OpusEncoder* encoder;

#define I2S_WS      5
#define I2S_SD      6
#define I2S_SCK     4
#define I2S_PORT    I2S_NUM_0

// Opus 编码缓冲区
#define FRAME_SIZE  960 // 60ms
int16_t pcm_buffer[FRAME_SIZE];
int pcm_buffer_index = 0;
uint8_t opus_output_buffer[512];

// I2S 初始化
void setup_i2s() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = 16000,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 64,
        .use_apll = false
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK,
        .ws_io_num = I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_SD
    };

    i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    i2s_set_pin(I2S_PORT, &pin_config);
}

// WebSocket 事件处理
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("[WS] Disconnected from VoxLab");
            break;
        case WStype_CONNECTED:
            Serial.println("[WS] Connected! Ready to stream voice.");
            break;
        case WStype_TEXT:
            Serial.printf("[WS] Received ASR text: %s\n", payload);
            // 收到识别出的文本，可以在这里控制外设，如 OLED 屏显示或继电器动作
            break;
    }
}

void setup() {
    Serial.begin(115200);
    
    // 连接 Wi-Fi
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected.");

    // 初始化 I2S 麦克风
    setup_i2s();

    // 初始化 Opus 编码器
    int error;
    encoder = opus_encoder_create(16000, 1, OPUS_APPLICATION_VOIP, &error);
    opus_encoder_ctl(encoder, OPUS_SET_BITRATE(24000));
    opus_encoder_ctl(encoder, OPUS_SET_COMPLEXITY(3));

    // 连接 VoxLab 实时语音接口 (注意使用的是 ws:// 和 8001 端口)
    webSocket.begin(server_ip, 8001, "/api/v1/audio/voice");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void loop() {
    webSocket.loop();

    if (!webSocket.isConnected()) return;

    // 每次从 I2S 读取少量字节（防止阻塞大循环导致网络超时）
    int16_t sample;
    size_t bytes_read = 0;
    esp_err_t err = i2s_read(I2S_PORT, &sample, 2, &bytes_read, 0); // 每次读取 1 个采样点 (2 字节)
    
    if (err == ESP_OK && bytes_read == 2) {
        pcm_buffer[pcm_buffer_index++] = sample;

        // 攒够一帧 960 样本点（60毫秒）开始处理并发送
        if (pcm_buffer_index >= FRAME_SIZE) {
            int encoded_bytes = opus_encode(encoder, pcm_buffer, FRAME_SIZE, opus_output_buffer, sizeof(opus_output_buffer));
            
            if (encoded_bytes > 0) {
                // 打包发送缓存（大端长度前缀 + Opus 载荷）
                uint8_t send_packet[encoded_bytes + 2];
                send_packet[0] = (encoded_bytes >> 8) & 0xFF;
                send_packet[1] = encoded_bytes & 0xFF;
                memcpy(send_packet + 2, opus_output_buffer, encoded_bytes);

                // 发送二进制帧至服务端
                webSocket.sendBIN(send_packet, encoded_bytes + 2);
            }
            // 重置 PCM 索引
            pcm_buffer_index = 0;
        }
    }
}
```

---

## 4. 调试与实验室成果
1.  启动本地 VoxLab 后端服务：`DEV_MODE=true python main.py`。
2.  烧录 ESP32 客户端，通电后会自动连接 Wi-Fi 与 WebSocket。
3.  对准麦克风说话，并在说话结束后停顿。
4.  您会在 ESP32 的串口控制台监视器（Serial Monitor）以及 VoxLab 服务控制台同时看到转写成功的中文文本。

至此，您已完成了**第 2 章 ESP32 硬件与 WebSocket 对接**的完整学习！通过结合声学原理与本章的软硬件代码，您亲手打通了从“物理声波采集 $\to$ 端侧编码压缩 $\to$ 网络流式传输 $\to$ 服务端 VAD 切片 $\to$ ASR 语音识别”的完整离线智能对讲系统。
