class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Buffer size: 4096 frames (approx 92ms at 44.1k)
        // We can tweak this. Smaller = lower latency, Higher = safer.
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.index = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const channel0 = input[0]; // Mono input

        if (!channel0) return true;

        // Copy input samples to our internal buffer
        for (let i = 0; i < channel0.length; i++) {
            this.buffer[this.index++] = channel0[i];

            // When buffer is full, flush it to the main thread
            if (this.index >= this.bufferSize) {
                this.port.postMessage(this.buffer.slice()); // Send copy
                this.index = 0;
            }
        }

        return true; // Keep processor alive
    }
}

registerProcessor('pcm-processor', PCMProcessor);
