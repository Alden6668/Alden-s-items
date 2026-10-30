#!/bin/bash
cd "$(dirname "$0")"

NODE_BIN=""
for candidate in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/Users/qienda/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "没有找到 Node.js，请先安装 Node.js 18 或更高版本。"
  read -r -p "按回车键退出…"
  exit 1
fi

PORT="${PORT:-4321}"
echo ""
echo "拾页 · 局域网模式"
echo "电脑和手机/平板需要连接同一个 Wi-Fi。"
echo "启动后，终端会显示手机访问地址。"
echo "只在家庭网络中使用，不要在公共 Wi-Fi 上开启。"
echo ""

( sleep 1; open "http://127.0.0.1:${PORT}" 2>/dev/null ) &
HOST=0.0.0.0 PORT="${PORT}" exec "$NODE_BIN" server.mjs
