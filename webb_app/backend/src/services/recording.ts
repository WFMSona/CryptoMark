import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recordingsDir = path.join(__dirname, '../../recordings');

// Ensure recordings directory exists
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

interface ActiveRecording {
  callId: string;
  speakerId: string;
  stream: fs.WriteStream;
  startedAt: number;
  chunkCount: number;
}

class RecordingService {
  private activeRecordings: Map<string, ActiveRecording> = new Map();

  /**
   * Start recording audio for a call
   */
  startRecording(callId: string, speakerId: string): string {
    const filename = `${callId}_${speakerId}_${Date.now()}.webm`;
    const filepath = path.join(recordingsDir, filename);
    
    const stream = fs.createWriteStream(filepath);
    
    this.activeRecordings.set(callId, {
      callId,
      speakerId,
      stream,
      startedAt: Date.now(),
      chunkCount: 0,
    });

    console.log(`[Recording] Started recording for call ${callId} -> ${filename}`);
    return filepath;
  }

  /**
   * Write audio chunk to recording
   */
  writeChunk(callId: string, audioData: Buffer): void {
    const recording = this.activeRecordings.get(callId);
    if (!recording) {
      console.warn(`[Recording] No active recording for call ${callId}`);
      return;
    }

    recording.stream.write(audioData);
    recording.chunkCount++;
  }

  /**
   * Stop recording and finalize file
   */
  stopRecording(callId: string): { filepath: string; duration: number } | null {
    const recording = this.activeRecordings.get(callId);
    if (!recording) {
      return null;
    }

    recording.stream.end();
    this.activeRecordings.delete(callId);

    const duration = Date.now() - recording.startedAt;
    console.log(`[Recording] Stopped recording for call ${callId}, duration: ${duration}ms, chunks: ${recording.chunkCount}`);

    return {
      filepath: recording.stream.path as string,
      duration,
    };
  }

  /**
   * Check if a call is being recorded
   */
  isRecording(callId: string): boolean {
    return this.activeRecordings.has(callId);
  }

  /**
   * Get list of all recordings
   */
  listRecordings(): string[] {
    return fs.readdirSync(recordingsDir).filter(f => f.endsWith('.webm'));
  }

  /**
   * Get recording file path
   */
  getRecordingPath(filename: string): string | null {
    const filepath = path.join(recordingsDir, filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
    return null;
  }
}

export const recordingService = new RecordingService();
