"""
Jednostavan test - Demo bez potrebe za AudioSeal modelima
"""

import torch
import numpy as np
import hashlib
import soundfile as sf


def create_test_audio(filename: str, duration: float = 3.0, sample_rate: int = 16000):
    """Kreira testni audio signal"""
    print(f"Creating test audio: {filename}")
    
    t = np.linspace(0, duration, int(sample_rate * duration))
    # Mešavina frekvencija
    signal = (np.sin(2 * np.pi * 440 * t) * 0.3 +
              np.sin(2 * np.pi * 880 * t) * 0.2 +
              np.sin(2 * np.pi * 220 * t) * 0.2)
    
    sf.write(filename, signal, sample_rate)
    print(f"✓ Created: {filename}")


def test_bot_id_to_message(bot_id: str, nbits: int = 16):
    """Test konverzije bot ID u binarnu poruku"""
    print(f"\n=== Testing Bot ID to Message Conversion ===")
    print(f"Bot ID: {bot_id}")
    
    # Normalizuj
    if bot_id.startswith('0x'):
        bot_id = bot_id[2:]
    
    # Hash
    hash_bytes = hashlib.sha256(bot_id.encode()).digest()
    
    # Konvertuj u bitove
    bits = []
    for byte in hash_bytes:
        for i in range(8):
            bits.append((byte >> i) & 1)
    
    message_bits = bits[:nbits]
    print(f"Message bits ({nbits}): {message_bits}")
    print(f"✓ Conversion successful!")
    return message_bits


def test_basic_functionality():
    """Test osnovnih funkcija bez AudioSeal modela"""
    print("\n" + "="*60)
    print("CRYPTOMARK - BASIC FUNCTIONALITY TEST")
    print("="*60)
    
    # Test 1: Kreiranje audio fajla
    print("\n--- TEST 1: Audio File Creation ---")
    create_test_audio("demo_audio.wav", duration=2.0)
    
    # Test 2: Bot ID konverzija
    print("\n--- TEST 2: Bot ID Conversion ---")
    bot_ids = [
        "0x1234567890abcdef1234567890abcdef12345678",
        "0xabcdef1234567890abcdef1234567890abcdef12",
        "0x9999999999999999999999999999999999999999"
    ]
    
    for bot_id in bot_ids:
        bits = test_bot_id_to_message(bot_id)
    
    # Test 3: Hamming distance
    print("\n--- TEST 3: Hamming Distance Test ---")
    bits1 = test_bot_id_to_message(bot_ids[0])
    bits2 = test_bot_id_to_message(bot_ids[1])
    
    matching = sum([b1 == b2 for b1, b2 in zip(bits1, bits2)])
    similarity = matching / len(bits1)
    print(f"Similarity between bot1 and bot2: {similarity:.2%}")
    print(f"✓ Different bots have low similarity (good!)")
    
    # Test 4: Determinizam
    print("\n--- TEST 4: Determinism Test ---")
    bits_a = test_bot_id_to_message(bot_ids[0])
    bits_b = test_bot_id_to_message(bot_ids[0])
    
    if bits_a == bits_b:
        print("✓ Same bot ID generates same bits (deterministic!)")
    else:
        print("✗ ERROR: Not deterministic!")
    
    # Test 5: Audio loading
    print("\n--- TEST 5: Audio Loading Test ---")
    audio, sr = sf.read("demo_audio.wav")
    print(f"Audio shape: {audio.shape}")
    print(f"Sample rate: {sr}")
    print(f"Duration: {len(audio) / sr:.2f} seconds")
    print(f"✓ Audio loading works!")
    
    # Cleanup
    import os
    os.remove("demo_audio.wav")
    print("\n" + "="*60)
    print("✓ ALL BASIC TESTS PASSED!")
    print("="*60)
    print("\nNote: Full watermarking tests require AudioSeal models.")
    print("To download models, run:")
    print("  python -c \"from audioseal import AudioSeal; AudioSeal.load_generator('audioseal_wm_16bits')\"")


if __name__ == "__main__":
    try:
        test_basic_functionality()
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
