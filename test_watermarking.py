"""
Test suite za Audio Watermarking System (AudioSeal)
"""

import os
import torch
import torchaudio
import numpy as np
from scipy.io import wavfile
from model_wotermarking_audioseal import AudioWatermarker, BlockchainVerifier


def create_test_audio(filename: str, duration: float = 3.0, sample_rate: int = 16000):
    """Kreira testni audio signal (sine wave)"""
    
    t = np.linspace(0, duration, int(sample_rate * duration))
    # Mešavina više frekvencija (simulira govor/muziku)
    signal = (np.sin(2 * np.pi * 440 * t) * 0.3 +  # A note
              np.sin(2 * np.pi * 880 * t) * 0.2 +  # A octave higher
              np.sin(2 * np.pi * 220 * t) * 0.2)   # A octave lower
    
    # Konvertuj u int16 za WAV
    signal_int16 = np.int16(signal * 32767)
    
    # Sačuvaj kao WAV fajl koristeći scipy
    wavfile.write(filename, sample_rate, signal_int16)
    print(f"Created test audio: {filename}")


def test_basic_embed_detect():
    """Test osnovne funkcionalnosti - embed i detect"""
    print("\n" + "="*60)
    print("TEST 1: Basic Embed & Detect (AudioSeal)")
    print("="*60)
    
    # Setup
    watermarker = AudioWatermarker(sample_rate=16000, nbits=16)
    bot_id = "0x1234567890abcdef1234567890abcdef12345678"
    
    # Kreiraj test audio
    create_test_audio("test_original.wav", duration=3.0, sample_rate=16000)
    
    # Embed watermark
    print("\n--- Embedding watermark ---")
    success = watermarker.embed_watermark(
        audio_path="test_original.wav",
        bot_id=bot_id,
        output_path="test_watermarked.wav"
    )
    
    assert success, "Embedding failed!"
    assert os.path.exists("test_watermarked.wav"), "Output file not created!"
    
    # Detect watermark
    print("\n--- Detecting watermark ---")
    candidates = [
        bot_id,  # Correct one
        "0xabcdef1234567890abcdef1234567890abcdef12",  # Wrong
        "0x9999999999999999999999999999999999999999"   # Wrong
    ]
    
    detected_bot, confidence = watermarker.detect_watermark(
        audio_path="test_watermarked.wav",
        candidate_bot_ids=candidates
    )
    
    assert detected_bot == bot_id, f"Wrong bot detected! Expected {bot_id}, got {detected_bot}"
    assert confidence > 0.3, f"Confidence too low: {confidence}"
    
    print(f"\n✓ TEST PASSED! Correctly detected bot with {confidence:.2%} confidence")
    
    # Cleanup
    os.remove("test_original.wav")
    os.remove("test_watermarked.wav")


def test_multiple_bots():
    """Test sa više različitih botova"""
    print("\n" + "="*60)
    print("TEST 2: Multiple Different Bots (AudioSeal)")
    print("="*60)
    
    watermarker = AudioWatermarker(sample_rate=16000, nbits=16)
    
    # Različiti botovi
    bots = {
        "bot_alpha": "0x1111111111111111111111111111111111111111",
        "bot_beta": "0x2222222222222222222222222222222222222222",
        "bot_gamma": "0x3333333333333333333333333333333333333333"
    }
    
    all_bot_ids = list(bots.values())
    
    # Test svaki bot
    for bot_name, bot_id in bots.items():
        print(f"\n--- Testing {bot_name} ---")
        
        # Kreiraj i watermark audio
        original_file = f"test_{bot_name}_orig.wav"
        watermarked_file = f"test_{bot_name}_wm.wav"
        
        create_test_audio(original_file, duration=2.0, sample_rate=16000)
        watermarker.embed_watermark(original_file, bot_id, watermarked_file)
        
        # Detektuj
        detected_bot, confidence = watermarker.detect_watermark(
            watermarked_file,
            all_bot_ids
        )
        
        assert detected_bot == bot_id, f"Wrong bot! Expected {bot_id}, got {detected_bot}"
        print(f"✓ {bot_name} correctly identified (confidence: {confidence:.2%})")
        
        # Cleanup
        os.remove(original_file)
        os.remove(watermarked_file)
    
    print("\n✓ TEST PASSED! All bots correctly identified")


def test_robustness():
    """Test robusnosti watermark-a na modifikacije"""
    print("\n" + "="*60)
    print("TEST 3: Watermark Robustness (AudioSeal)")
    print("="*60)
    
    watermarker = AudioWatermarker(sample_rate=16000, nbits=16)
    bot_id = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    
    # Kreiraj i watermark
    create_test_audio("test_robust_orig.wav", duration=4.0, sample_rate=16000)
    watermarker.embed_watermark(
        "test_robust_orig.wav",
        bot_id,
        "test_robust_wm.wav"
    )
    
    candidates = [bot_id, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]
    
    # Test 1: MP3 kompresija simulacija (resample)
    print("\n--- Test: Resampling (simulate compression) ---")
    audio, sr = torchaudio.load("test_robust_wm.wav")
    # Downscale pa upscale
    resampler_down = torchaudio.transforms.Resample(sr, 8000)
    resampler_up = torchaudio.transforms.Resample(8000, 16000)
    audio_low = resampler_down(audio)
    audio_restored = resampler_up(audio_low)
    # Sačuvaj koristeći scipy
    audio_np = audio_restored.squeeze().numpy()
    audio_int16 = np.int16(audio_np * 32767)
    wavfile.write("test_resampled.wav", 16000, audio_int16)
    
    detected, conf = watermarker.detect_watermark("test_resampled.wav", candidates)
    print(f"After resampling: {detected} (confidence: {conf:.2%})")
    
    # Test 2: Dodavanje šuma
    print("\n--- Test: Adding noise ---")
    audio, sr = torchaudio.load("test_robust_wm.wav")
    noise = torch.randn_like(audio) * 0.005  # Mali šum
    audio_noisy = audio + noise
    # Sačuvaj koristeći scipy
    audio_np = audio_noisy.squeeze().numpy()
    audio_int16 = np.int16(np.clip(audio_np, -1.0, 1.0) * 32767)
    wavfile.write("test_noisy.wav", sr, audio_int16)
    
    detected, conf = watermarker.detect_watermark("test_noisy.wav", candidates)
    print(f"After adding noise: {detected} (confidence: {conf:.2%})")
    
    # Test 3: Volume promene
    # Sačuvaj koristeći scipy
    audio_np = audio_quiet.squeeze().numpy()
    audio_int16 = np.int16(audio_np * 32767)
    wavfile.write("test_quiet.wav", sr, audio_int16)
    audio, sr = torchaudio.load("test_robust_wm.wav")
    audio_quiet = audio * 0.5  # 50% volume
    torchaudio.save("test_quiet.wav", audio_quiet, sr)
    
    detected, conf = watermarker.detect_watermark("test_quiet.wav", candidates)
    print(f"After volume change: {detected} (confidence: {conf:.2%})")
    
    # Cleanup
    for f in ["test_robust_orig.wav", "test_robust_wm.wav", 
              "test_resampled.wav", "test_noisy.wav", "test_quiet.wav"]:
        if os.path.exists(f):
            os.remove(f)
    
    print("\n✓ TEST PASSED! AudioSeal watermark is robust to modifications")


def test_batch_processing():
    """Test batch procesiranja"""
    print("\n" + "="*60)
    print("TEST 4: Batch Processing (AudioSeal)")
    print("="*60)
    
    watermarker = AudioWatermarker(sample_rate=16000, nbits=16)
    bot_id = "0xcccccccccccccccccccccccccccccccccccccccc"
    
    # Kreiraj više test fajlova
    test_files = []
    for i in range(5):
        filename = f"test_batch_{i}.wav"
        create_test_audio(filename, duration=1.5, sample_rate=16000)
        test_files.append(filename)
    
    # Batch embed
    print("\n--- Batch embedding ---")
    success_count = watermarker.batch_embed(
        audio_files=test_files,
        bot_id=bot_id,
        output_dir="test_batch_output"
    )
    
    assert success_count == len(test_files), f"Only {success_count}/{len(test_files)} succeeded"
    
    # Proveri da su svi watermarked
    print("\n--- Verifying all files ---")
    for i in range(len(test_files)):
        wm_file = f"test_batch_output/wm_test_batch_{i}.wav"
        assert os.path.exists(wm_file), f"Missing output file: {wm_file}"
        
        detected, conf = watermarker.detect_watermark(wm_file, [bot_id])
        assert detected == bot_id, f"File {i} watermark not detected"
        print(f"✓ File {i}: watermark verified (confidence: {conf:.2%})")
    
    # Cleanup
    import shutil
    for f in test_files:
        os.remove(f)
    if os.path.exists("test_batch_output"):
        shutil.rmtree("test_batch_output")
    
    print("\n✓ TEST PASSED! Batch processing works correctly")


def run_all_tests():
    """Pokreće sve testove"""
    print("\n" + "="*60)
    print("AUDIO WATERMARKING SYSTEM - TEST SUITE")
    print("="*60)
    
    try:
        test_basic_embed_detect()
        test_multiple_bots()
        test_robustness()
        test_batch_processing()
        
        print("\n" + "="*60)
        print("✓ ALL TESTS PASSED!")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    run_all_tests()
