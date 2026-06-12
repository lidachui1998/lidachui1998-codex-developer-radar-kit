import argparse
import asyncio
import json
import math
import os
import subprocess
from pathlib import Path

import edge_tts


def run(command: list[str]) -> str:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def duration_seconds(ffprobe: Path, media: Path) -> float:
    value = run([
        str(ffprobe),
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nk=1:nw=1",
        str(media),
    ])
    return float(value)


async def tts(text: str, output: Path, voice: str, rate: str, proxy: str | None) -> None:
    communicate = edge_tts.Communicate(text.strip(), voice, rate=rate, proxy=proxy)
    await communicate.save(str(output))


async def tts_with_retry(
    text: str,
    output: Path,
    voice: str,
    rate: str,
    proxy: str | None,
    attempts: int,
    retry_base_seconds: float,
) -> None:
    last_error: Exception | None = None
    for attempt in range(1, max(1, attempts) + 1):
        if output.exists():
            output.unlink()
        try:
            await tts(text, output, voice, rate, proxy)
            if not output.exists() or output.stat().st_size <= 0:
                raise RuntimeError("Edge TTS wrote an empty audio file")
            return
        except Exception as error:
            last_error = error
            if attempt >= attempts:
                break
            wait_seconds = retry_base_seconds * attempt
            print(
                f"Edge TTS attempt {attempt}/{attempts} failed for {output.name}: {error}. "
                f"Retrying in {wait_seconds:.0f}s.",
                flush=True,
            )
            await asyncio.sleep(wait_seconds)
    raise last_error or RuntimeError("Edge TTS generation failed")


def write_concat_list(path: Path, files: list[Path]) -> None:
    lines = []
    for file in files:
        normalized = file.resolve().as_posix()
        lines.append(f"file '{normalized}'")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("data/hot-topics.json"))
    parser.add_argument("--output", type=Path, default=Path("assets/narration.mp3"))
    parser.add_argument("--timings", type=Path, default=Path("data/timings.json"))
    parser.add_argument("--voice", default="zh-CN-YunxiNeural")
    parser.add_argument("--rate", default="-8%")
    parser.add_argument("--pause", type=float, default=0.35)
    parser.add_argument("--proxy", default="")
    parser.add_argument("--retries", type=int, default=int(os.environ.get("EDGE_TTS_RETRIES", "4")))
    parser.add_argument(
        "--retry-base-seconds",
        type=float,
        default=float(os.environ.get("EDGE_TTS_RETRY_BASE_SECONDS", "30")),
    )
    parser.add_argument(
        "--segment-delay",
        type=float,
        default=float(os.environ.get("EDGE_TTS_SEGMENT_DELAY", "8")),
    )
    args = parser.parse_args()

    root = Path.cwd()
    ffmpeg = root / "node_modules" / "@ffmpeg-installer" / "win32-x64" / "ffmpeg.exe"
    ffprobe = root / "node_modules" / "@ffprobe-installer" / "win32-x64" / "ffprobe.exe"
    data = json.loads(args.data.read_text(encoding="utf-8"))
    proxy = (
        args.proxy
        or os.environ.get("EDGE_TTS_PROXY")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("HTTP_PROXY")
        or None
    )
    item_count = int(data.get("videoItemCount") or data.get("itemCount") or 7)
    items = data["items"][:item_count]

    hook_text = data.get("hookVoiceover") or (
        "这条热点视频，是我用 Codex 自动生成的。"
        "它负责抓项目，写口播，再渲染成竖屏视频。"
        f"今天先看{len(items)}个开发者热点。"
    )
    outro_text = data.get("cta") or "今天先到这里，明天继续看开发者热点。"

    segments = [{"id": "hook", "label": "hook", "text": hook_text}]
    for item in items:
        segments.append({
            "id": f"topic-{item['rank']}",
            "rank": item["rank"],
            "label": item["title"],
            "text": item.get("voiceover") or item.get("angle") or item["title"],
        })
    segments.append({"id": "outro", "label": "outro", "text": outro_text})

    segment_dir = root / "assets" / "voice-segments"
    segment_dir.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.timings.parent.mkdir(parents=True, exist_ok=True)

    rendered_files: list[Path] = []
    timeline = []
    cursor = 0.0

    silence = segment_dir / "silence.mp3"
    run([
        str(ffmpeg),
        "-y",
        "-f",
        "lavfi",
        "-t",
        f"{args.pause:.3f}",
        "-i",
        "anullsrc=channel_layout=mono:sample_rate=24000",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "48k",
        str(silence),
    ])

    for index, segment in enumerate(segments):
        out = segment_dir / f"{index:02d}-{segment['id']}.mp3"
        await tts_with_retry(
            segment["text"],
            out,
            args.voice,
            args.rate,
            proxy,
            args.retries,
            args.retry_base_seconds,
        )
        dur = duration_seconds(ffprobe, out)
        visual_duration = max(3.2, dur + args.pause)
        entry = {
            **segment,
            "start": round(cursor, 3),
            "duration": round(visual_duration, 3),
            "audioDuration": round(dur, 3),
        }
        timeline.append(entry)
        rendered_files.append(out)
        if index != len(segments) - 1:
            rendered_files.append(silence)
            if args.segment_delay > 0:
                await asyncio.sleep(args.segment_delay)
        cursor += visual_duration

    concat_list = segment_dir / "concat.txt"
    write_concat_list(concat_list, rendered_files)
    run([
        str(ffmpeg),
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_list),
        "-ar",
        "24000",
        "-ac",
        "1",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "48k",
        str(args.output),
    ])

    audio_duration = duration_seconds(ffprobe, args.output)
    total_duration = max(math.ceil(audio_duration + 0.8), math.ceil(cursor + 0.5))
    timings = {
        "audio": args.output.as_posix(),
        "voice": args.voice,
        "rate": args.rate,
        "pause": args.pause,
        "audioDuration": round(audio_duration, 3),
        "totalDuration": total_duration,
        "hook": timeline[0],
        "items": timeline[1 : 1 + len(items)],
        "outro": timeline[-1],
    }
    args.timings.write_text(json.dumps(timings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")
    print(f"Wrote {args.timings}")
    print(f"Voice: {args.voice} at {args.rate}")
    print(f"Audio duration: {audio_duration:.2f}s; video duration: {total_duration}s")


if __name__ == "__main__":
    asyncio.run(main())
