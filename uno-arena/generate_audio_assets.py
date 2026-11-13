"""Generate original, royalty-free fallback audio assets for the UNO-style game.

These files are local fallbacks. Two ElevenLabs generations also completed, but
this runtime could not fetch their signed MP3 URLs into the project directory.
"""
from __future__ import annotations
import math
import subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent
AUDIO = ROOT / "assets" / "audio"
AUDIO.mkdir(parents=True, exist_ok=True)
SR = 44_100
RNG = np.random.default_rng(20261113)

def env_adsr(t: np.ndarray, attack: float, decay: float, sustain: float, release: float, length: float) -> np.ndarray:
    e = np.zeros_like(t)
    a = max(attack, 1e-4); d = max(decay, 1e-4); r = max(release, 1e-4)
    e = np.where(t < a, t / a, e)
    mask = (t >= a) & (t < a + d)
    e[mask] = 1.0 - (1.0 - sustain) * ((t[mask] - a) / d)
    mask = (t >= a + d) & (t < length - r)
    e[mask] = sustain
    mask = t >= length - r
    if np.any(mask):
        start_level = sustain
        e[mask] = start_level * np.clip((length - t[mask]) / r, 0, 1)
    return e

def note(freq: float, length: float, amp: float = 0.2, kind: str = "sine", pan: float = 0.0,
         attack: float = 0.008, decay: float = 0.12, sustain: float = 0.0, release: float = 0.1,
         vibrato: float = 0.0) -> np.ndarray:
    n = max(1, int(length * SR)); t = np.arange(n, dtype=np.float64) / SR
    f = freq * (1 + vibrato * np.sin(2 * np.pi * 5.2 * t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    if kind == "triangle":
        raw = (2 / np.pi) * np.arcsin(np.sin(phase))
    elif kind == "square":
        raw = np.tanh(2.6 * np.sin(phase)) * 0.72
    elif kind == "pluck":
        raw = (np.sin(phase) + 0.34*np.sin(2*phase) + 0.12*np.sin(3*phase)) / 1.46
    else:
        raw = np.sin(phase)
    return raw * env_adsr(t, attack, decay, sustain, release, length) * amp

def mix_at(dst: np.ndarray, src: np.ndarray, start: float, gain: float = 1.0, pan: float = 0.0) -> None:
    i = int(start * SR)
    if i >= len(dst): return
    end = min(len(dst), i + len(src))
    if end <= i: return
    x = src[:end-i] * gain
    left = math.sqrt((1 - pan) / 2) * 1.41421356237
    right = math.sqrt((1 + pan) / 2) * 1.41421356237
    dst[i:end, 0] += x * left
    dst[i:end, 1] += x * right

def write_wav(name: str, data: np.ndarray) -> Path:
    peak = max(float(np.max(np.abs(data))), 1e-8)
    data = np.clip(data / max(1.0, peak / 0.94), -0.999, 0.999)
    path = AUDIO / f"{name}.wav"
    wavfile.write(path, SR, (data * 32767).astype(np.int16))
    return path

def to_mp3(wav: Path, name: str) -> Path:
    out = AUDIO / f"{name}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(out)], check=True)
    wav.unlink(missing_ok=True)
    return out

# 40-second, 120 BPM instrumental loop: five cycles of Cadd9-Am7-Fmaj7-G6.
seconds = 40.0
music = np.zeros((int(SR * seconds), 2), dtype=np.float64)
chords = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 329.63],
    [196.00, 246.94, 293.66, 392.00],
]
melodies = [
    [523.25, 392.00, 659.25, 587.33, 493.88, 392.00, 587.33, 659.25],
    [440.00, 523.25, 659.25, 587.33, 392.00, 440.00, 523.25, 587.33],
    [523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 659.25, 783.99],
    [587.33, 493.88, 392.00, 493.88, 587.33, 659.25, 587.33, 493.88],
]
bar = 2.0
for b in range(20):
    t0 = b * bar
    chord = chords[b % 4]
    for j, f in enumerate(chord):
        tone = note(f, 1.92, amp=0.035 if j else 0.048, kind="sine", attack=0.22, decay=0.25, sustain=0.6, release=0.45, vibrato=0.0015)
        mix_at(music, tone, t0 + 0.02, pan=(-0.28 + j*0.18))
    bass_f = chord[0] / 2
    for beat in (0, 2):
        bass = note(bass_f, 0.42, amp=0.105, kind="triangle", attack=0.005, decay=0.12, sustain=0.14, release=0.18)
        mix_at(music, bass, t0 + beat*0.5, pan=-0.05)
    seq = melodies[b % 4]
    for k, f in enumerate(seq):
        pluck = note(f, 0.23, amp=0.055, kind="pluck", attack=0.004, decay=0.09, sustain=0.0, release=0.13)
        mix_at(music, pluck, t0 + 0.08 + k*0.25, pan=(0.24 if k % 2 else -0.24))
    for beat in range(4):
        bt = t0 + beat*0.5
        if beat in (0, 2):
            n = int(0.13*SR); tt=np.arange(n)/SR
            kick = np.sin(2*np.pi*(95 - 48*tt/0.13)*tt) * np.exp(-tt*31) * 0.12
            mix_at(music, kick, bt)
        else:
            n = int(0.10*SR); tt=np.arange(n)/SR
            noise = RNG.normal(0, 1, n) * np.exp(-tt*55) * 0.017
            mix_at(music, noise, bt)
    for h in range(8):
        ht = t0 + h*0.25
        n = int(0.035*SR); tt=np.arange(n)/SR
        hat = RNG.normal(0, 1, n) * np.exp(-tt*115) * 0.008
        mix_at(music, hat, ht, pan=0.2 if h%2 else -0.2)
f = int(0.035 * SR)
music[:f] *= np.linspace(0, 1, f)[:, None]
music[-f:] *= np.linspace(1, 0, f)[:, None]
mp3s = [to_mp3(write_wav("ambience", music), "ambience")]

length = 0.28; n=int(length*SR); t=np.arange(n)/SR
click = np.zeros((n,2), dtype=np.float64)
noise = RNG.normal(0,1,n) * np.exp(-t*60)
tick = note(1550, 0.085, amp=0.28, kind="sine", attack=0.001, decay=0.018, sustain=0.0, release=0.05)
sub = note(880, 0.11, amp=0.12, kind="sine", attack=0.001, decay=0.02, sustain=0.0, release=0.08)
mono = noise*0.045
mono[:len(tick)] += tick
mono[:len(sub)] += sub
click[:,0] = mono; click[:,1] = mono * 0.92
mp3s.append(to_mp3(write_wav("card-click", click), "card-click"))

length=0.85; n=int(length*SR); t=np.arange(n)/SR
play=np.zeros((n,2),dtype=np.float64)
noise=RNG.normal(0,1,n)*np.exp(-t*17)*0.07
thump=note(112,0.28,amp=0.34,kind="sine",attack=0.002,decay=0.07,sustain=0.0,release=0.20)
for f0,st in [(784,0.13),(988,0.25),(1318.5,0.38)]:
    s=note(f0,0.28,amp=0.105,kind="pluck",attack=0.003,decay=0.1,sustain=0,release=0.17)
    mix_at(play,s,st,pan=0.25 if st>0.2 else -0.18)
play[:,0]+=noise*0.92; play[:,1]+=noise*0.75
mix_at(play,thump,0.0,pan=0.0)
mp3s.append(to_mp3(write_wav("card-play", play), "card-play"))

length=1.9; n=int(length*SR); win=np.zeros((n,2),dtype=np.float64)
for f0,st in [(523.25,0.0),(659.25,0.20),(783.99,0.40),(1046.5,0.62),(1318.5,0.88)]:
    s=note(f0,0.72 if st>=0.62 else 0.44,amp=0.16 if st>=0.62 else 0.13,kind="pluck",attack=0.004,decay=0.18,sustain=0.03,release=0.34)
    mix_at(win,s,st,pan=-0.15 if st%0.4<0.1 else 0.18)
for f0 in (523.25,659.25,783.99,1046.5):
    s=note(f0,0.96,amp=0.035,kind="sine",attack=0.04,decay=0.2,sustain=0.25,release=0.48)
    mix_at(win,s,0.76,pan=0.0)
mp3s.append(to_mp3(write_wav("victory", win), "victory"))

length=1.5; n=int(length*SR); lose=np.zeros((n,2),dtype=np.float64)
for f0,st in [(659.25,0.0),(523.25,0.28),(392.0,0.58),(329.63,0.88)]:
    s=note(f0,0.52,amp=0.12,kind="triangle",attack=0.018,decay=0.15,sustain=0.04,release=0.25)
    mix_at(lose,s,st,pan=(-0.12 if st<0.4 else 0.12))
mp3s.append(to_mp3(write_wav("defeat", lose), "defeat"))

uno_wav = AUDIO / "uno-callout.wav"
subprocess.run(["espeak", "-v", "fr-fr", "-s", "138", "-p", "68", "-a", "165", "-w", str(uno_wav), "Uno !"], check=True)
mp3s.append(to_mp3(uno_wav, "uno-callout"))

for path in mp3s:
    if not path.exists() or path.stat().st_size < 500:
        raise RuntimeError(f"Missing or invalid audio output: {path}")
    print(f"{path.name}\t{path.stat().st_size} bytes")
