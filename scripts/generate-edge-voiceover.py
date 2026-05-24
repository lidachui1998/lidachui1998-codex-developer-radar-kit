import argparse
import asyncio
from pathlib import Path

import edge_tts


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--voice", default="zh-CN-YunxiNeural")
    parser.add_argument("--rate", default="-12%")
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8").strip()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, args.voice, rate=args.rate)
    await communicate.save(str(args.output))
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
