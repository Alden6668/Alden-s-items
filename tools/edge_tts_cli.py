#!/usr/bin/env python3
"""Minimal Edge neural TTS bridge: reads text from stdin, writes MP3 to stdout."""
import asyncio
import sys

import edge_tts


async def main() -> None:
    text = sys.stdin.read().strip()
    if not text:
        return
    voice = sys.argv[1] if len(sys.argv) > 1 else "zh-CN-XiaoxiaoNeural"
    rate = sys.argv[2] if len(sys.argv) > 2 else "+0%"
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            sys.stdout.buffer.write(chunk["data"])
            sys.stdout.buffer.flush()


if __name__ == "__main__":
    asyncio.run(main())
