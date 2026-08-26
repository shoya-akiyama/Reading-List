import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ffmpegPath from "ffmpeg-static";
import { KokoroTTS } from "kokoro-js";

const rootDir = path.resolve(import.meta.dirname, "..");
const htmlPath = path.join(rootDir, "index.html");
const audioDir = path.join(rootDir, "audio");
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";

const force = process.argv.includes("--force");
const unitArg = process.argv.find((arg) => arg.startsWith("--unit="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const voiceArg = process.argv.find((arg) => arg.startsWith("--voice="));
const speedArg = process.argv.find((arg) => arg.startsWith("--speed="));
const selectedUnit = unitArg ? Number(unitArg.split("=")[1]) : null;
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const voice = voiceArg ? voiceArg.split("=")[1] : "af_heart";
const speed = speedArg ? Number(speedArg.split("=")[1]) : 0.9;

const html = await readFile(htmlPath, "utf8");
const match = html.match(/^  const SENTENCES = (\[.*\]);\r?$/m);
if (!match) throw new Error("Could not find SENTENCES in index.html");

let sentences = JSON.parse(match[1]);
if (selectedUnit !== null) {
  if (!Number.isInteger(selectedUnit) || selectedUnit < 1 || selectedUnit > 36) {
    throw new Error("--unit must be an integer from 1 to 36");
  }
  sentences = sentences.filter((sentence) => sentence.group === selectedUnit);
}
if (limit !== null) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  sentences = sentences.slice(0, limit);
}
if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
  throw new Error("--speed must be between 0.5 and 2");
}

await mkdir(audioDir, { recursive: true });

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-codec:a", "libmp3lame",
      "-b:a", "64k",
      outputPath,
    ]);
    let errorText = "";
    child.stderr.on("data", (chunk) => { errorText += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${errorText}`));
    });
  });
}

console.log(`Loading ${modelId} (voice=${voice}, speed=${speed})...`);
const tts = await KokoroTTS.from_pretrained(modelId, {
  dtype: "q8",
  device: "cpu",
});

let generated = 0;
let skipped = 0;
for (let i = 0; i < sentences.length; i += 1) {
  const sentence = sentences[i];
  const outputPath = path.join(audioDir, `${sentence.id}.mp3`);
  const tempMp3Path = path.join(audioDir, `${sentence.id}.tmp.mp3`);
  const tempWavPath = path.join(audioDir, `${sentence.id}.wav`);

  if (!force && await exists(outputPath)) {
    skipped += 1;
    console.log(`[${i + 1}/${sentences.length}] ${sentence.id}: skipped`);
    continue;
  }

  const text = sentence.en_chunks.join(" ").replace(/\s+/g, " ").trim();
  try {
    const audio = await tts.generate(text, { voice, speed });
    audio.save(tempWavPath);
    await convertToMp3(tempWavPath, tempMp3Path);
    await rm(outputPath, { force: true });
    await rename(tempMp3Path, outputPath);
    generated += 1;
    console.log(`[${i + 1}/${sentences.length}] ${sentence.id}: generated`);
  } finally {
    await rm(tempWavPath, { force: true });
    await rm(tempMp3Path, { force: true });
  }
}

console.log(`Done. Generated: ${generated}, skipped: ${skipped}`);
