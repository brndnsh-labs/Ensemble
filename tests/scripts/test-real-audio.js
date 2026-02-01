
import { spawn } from 'child_process';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';
import { extractForm } from '../../public/form-extractor.js';

const filePath = process.argv[2] || 'tests/resources/12 Bar Blues with bass.m4a';

async function decodeAudio(path) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', path,
            '-f', 'f32le',
            '-acodec', 'pcm_f32le',
            '-ac', '1',
            '-ar', '44100',
            '-'
        ]);

        const chunks = [];
        ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                const buffer = Buffer.concat(chunks);
                const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
                resolve({
                    sampleRate: 44100,
                    length: floatArray.length,
                    duration: floatArray.length / 44100,
                    getChannelData: () => floatArray
                });
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });
    });
}

async function runTest() {
    try {
        console.log(`Decoding ${filePath}...`);
        const buffer = await decodeAudio(filePath);
        console.log(`Duration: ${buffer.duration.toFixed(2)}s`);

        const analyzer = new ChordAnalyzerLite();
        const analysis = await analyzer.analyze(buffer);

        console.log(`Detected BPM: ${analysis.bpm}`);
        console.log(`Meter: ${analysis.beatsPerMeasure}/4`);
        console.log(`Downbeat Offset: ${analysis.downbeatOffset.toFixed(3)}s`);

        const form = extractForm(analysis.chords, analysis.pulse);
        console.log(`\nDetected Form for ${filePath}:`);
        form.forEach(s => console.log(`  ${s.label}: ${s.value} (x${s.repeat})`));

        // Sample check of first 4 measures
        for (let i = 0; i < 4; i++) {
            const measure = analysis.chords.filter(r => r.beat >= i*4 && r.beat < (i+1)*4);
            console.log(`Measure ${i+1}: ${measure.map(m => m.chord).join(' ')}`);
        }
    } catch (err) {
        console.error("Test failed:", err);
    }
}

runTest();
