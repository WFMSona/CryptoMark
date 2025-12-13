class PCMPlayer extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferQueue = [];
        this.port.onmessage = (event) => {
            // Receive Float32Array chunks from main thread
            const float32Array = new Float32Array(event.data);
            this.bufferQueue.push(float32Array);
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel0 = output[0]; // Mono output

        if (!channel0) return true;

        // Fill output buffer from queue
        for (let i = 0; i < channel0.length; i++) {
            if (this.bufferQueue.length === 0) {
                channel0[i] = 0; // Silence if underflow
                continue;
            }

            const currentChunk = this.bufferQueue[0];
            // Note: This is a simplified ring buffer. 
            // In production you'd track read index.
            // For now, we assume chunks > 128 frames and shift them.

            // Actually, let's just implement a simple pointer
            if (this.readIndex === undefined) this.readIndex = 0;

            channel0[i] = currentChunk[this.readIndex++];

            if (this.readIndex >= currentChunk.length) {
                this.bufferQueue.shift();
                this.readIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('pcm-player', PCMPlayer);
