# 使用 Python 3.11 官方镜像作为基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
# vosk, funasr 等库可能需要 ffmpeg 和一些基础库
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libatomic1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
# 注意：有些 AI 模型库可能很大，这里建议使用国内镜像源加速
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制应用代码
COPY . .

# 暴露端口 (FastAPI 默认端口)
EXPOSE 8001

# 创建模型和临时音频目录的挂载点
VOLUME ["/app/models", "/app/temp_audio"]

# 启动命令
# 使用 uvicorn 启动 FastAPI 应用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
