"""
Tiny local Whisper server exposing the OpenAI transcription API shape that the
caption tool expects (POST /v1/audio/transcriptions, verbose_json + word
timestamps). Runs on CPU or an NVIDIA GPU via faster-whisper.

Env: WHISPER_SIZE (default "small"; try "base" for speed, "medium" for accuracy)
     WHISPER_DEVICE ("cpu" or "cuda", default cpu)
"""
import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

SIZE = os.environ.get("WHISPER_SIZE", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE = "float16" if DEVICE == "cuda" else "int8"

print(f"Loading Whisper '{SIZE}' on {DEVICE} (first run downloads the model)...")
model = WhisperModel(SIZE, device=DEVICE, compute_type=COMPUTE)
print("Ready.")

app = FastAPI()


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model_name: str = Form("whisper-1", alias="model"),  # accepted, ignored: WHISPER_SIZE decides
    language: str | None = Form(None),
    response_format: str = Form("verbose_json"),
):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        segments, _info = model.transcribe(path, language=language or None, word_timestamps=True)
        words, text = [], []
        for seg in segments:
            text.append(seg.text.strip())
            for w in seg.words or []:
                words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
        return {"text": " ".join(text), "words": words}
    finally:
        os.unlink(path)
