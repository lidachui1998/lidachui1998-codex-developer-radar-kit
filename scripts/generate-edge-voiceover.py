import argparse
import asyncio
import os
from pathlib import Path

import edge_tts


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--voice", default="zh-CN-YunxiNeural")
    parser.add_argument("--rate", default="-12%")
    parser.add_argument("--proxy", default="")
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8").strip()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    proxy = (
        args.proxy
        or os.environ.get("EDGE_TTS_PROXY")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("HTTP_PROXY")
        or None
    )
    communicate = edge_tts.Communicate(text, args.voice, rate=args.rate, proxy=proxy)
    await communicate.save(str(args.output))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
