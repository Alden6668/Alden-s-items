# 拾页托管版：Node 静态服务 + AI 代理 + Edge 自然人声
# 无需数据库；用户数据保存在各自浏览器 localStorage。
FROM node:20-bookworm-slim

ENV PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

# 云端用 Linux 版 edge-tts；本地 macOS 的 vendor/ 不会进入镜像。
RUN python3 -m venv /opt/edge \
  && /opt/edge/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/edge/bin/pip install --no-cache-dir edge-tts==7.3.1

ENV PATH="/opt/edge/bin:${PATH}"
ENV HOST=0.0.0.0
ENV NODE_ENV=production

WORKDIR /app
COPY . .

EXPOSE 8080

CMD ["node", "server.mjs"]
