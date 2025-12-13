import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const recordingsDir = path.join(__dirname, '../../recordings');

// Ensure recordings directory exists
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

interface ActiveRecording {
  callId: string;
  speakerId: string;
  directory: string; // Specific session directory
  stream: fs.WriteStream | null;
  startedAt: number;
  chunkCount: number;
  fileIndex: number;
  rotationTimer: NodeJS.Timeout;
  headerBuffer?: Buffer;
  // We use a promise chain to ensure chunks are processed in order
  // preventing race conditions on fileIndex and header buffer.
  promiseChain: Promise<void>;
  sampleRate: number; // Added sample rate
}

class RecordingService {
  private activeRecordings: Map<string, ActiveRecording> = new Map();

  /**
   * Start recording audio for a call (driven by incoming data)
   */
  startRecording(callId: string, speakerId: string, sampleRate: number = 48000): string {
    // Create base directory for this call/speaker
    const baseDir = path.join(recordingsDir, callId, speakerId);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    // Create unique session directory
    const sessionDir = path.join(baseDir, `session_${Date.now()}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const recording: ActiveRecording = {
      callId,
      speakerId,
      directory: sessionDir,
      stream: null,
      startedAt: Date.now(),
      chunkCount: 0,
      fileIndex: 0,
      rotationTimer: setTimeout(() => { }, 0),
      promiseChain: Promise.resolve(),
      sampleRate, // Store it
    };
    clearTimeout(recording.rotationTimer);

    this.activeRecordings.set(callId, recording);

    console.log(`[Recording] Started chunked recording for call ${callId}/${speakerId} in ${sessionDir} @ ${sampleRate}Hz`);
    return sessionDir;
  }

  /**
   * Write audio chunk to current file and convert to wav
   */
  async writeChunk(callId: string, audioData: Buffer): Promise<void> {
    const recording = this.activeRecordings.get(callId);
    if (!recording) {
      console.warn(`[Recording] No active recording stream for call ${callId}`);
      return;
    }

    // Chain the processing to ensure sequential execution
    recording.promiseChain = recording.promiseChain.then(async () => {
      try {
        // Skip if too small
        if (audioData.length < 100) return;

        // 1. Write RAW Float32 (Temp file)
        const filenameBase = `chunk_${recording.fileIndex.toString().padStart(3, '0')}`;
        const rawPath = path.join(recording.directory, `${filenameBase}.raw`);

        fs.writeFileSync(rawPath, audioData);
        // console.log(`[Recording] Saved raw ${rawPath}`);

        // 2. Convert to WAV (Float32 -> WAV Float32)
        // -f f32le: Input is Float 32 Little Endian
        // -ar recording.sampleRate: Input rate dynamic
        // -ac 1: Mono
        // -c:a pcm_f32le: Output codec Float 32
        await this.convertRawToWav(rawPath, recording.directory, filenameBase, recording.sampleRate);

        recording.fileIndex++;
        recording.chunkCount++;

      } catch (err) {
        console.error('[Recording] Error processing chunk:', err);
      }
    });
  }

  private async convertRawToWav(rawPath: string, directory: string, filenameBase: string, sampleRate: number): Promise<void> {
    const wavPath = path.join(directory, `${filenameBase}.wav`);

    // Convert Raw F32LE 16k -> WAV PCM F32LE
    // Use dynamic sampleRate
    const command = `ffmpeg -f f32le -ar ${sampleRate} -ac 1 -i "${rawPath}" -c:a pcm_f32le "${wavPath}" -y`;

    try {
      await execAsync(command);
      console.log(`[Recording] Saved ${filenameBase}.wav (Float32 @ ${sampleRate}Hz)`);
    } catch (err) {
      console.error(`[Recording] Failed to convert ${rawPath}:`, err);
    } finally {
      // Cleanup raw file
      try {
        if (fs.existsSync(rawPath)) {
          fs.unlinkSync(rawPath);
        }
      } catch (e) {
        console.warn(`[Recording] Failed to delete temp raw ${rawPath}:`, e);
      }
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(callId: string): Promise<{ filepath: string; duration: number } | null> {
    const recording = this.activeRecordings.get(callId);
    if (!recording) {
      return null;
    }

    // Wait for the chain to stay consistent
    console.log(`[Recording] Stopping... waiting for pending chunks...`);
    try {
      await recording.promiseChain;
    } catch (e) {
      console.warn('[Recording] Error waiting for pending chain:', e);
    }

    this.activeRecordings.delete(callId);

    const duration = Date.now() - recording.startedAt;
    console.log(`[Recording] Stopped recording for call ${callId}, duration: ${duration}ms`);

    return {
      filepath: recording.directory,
      duration,
    };
  }

  // ... (keeping other methods if needed, or removing if unused)

  isRecording(callId: string): boolean {
    return this.activeRecordings.has(callId);
  }

  listRecordings(): string[] {
    return [];
  }
}

export const recordingService = new RecordingService();
