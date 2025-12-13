# CryptoMark - Audio Watermarking System za AI Botove

CryptoMark was built during the **Garaža Hackathon (Belgrade, Serbia | 12–14 Dec 2025)**.

As generative audio tools and voice agents become easier to deploy, it's also becoming easier to copy, remix, and redistribute synthetic content without attribution or control. CryptoMark explores a practical way to add **traceability** to AI-generated audio by combining:

- **Watermarking** for embedding unique IDs into generated audio/agent outputs  
- **Detection & verification** tooling to check whether a watermark is present and recover its ID  
- **Blockchain anchoring** to make watermark IDs tamper-evident and auditable (proving when an ID existed and who registered it)

The goal is to provide an integration-friendly layer for audio GenAI companies and developers: watermark at generation time, detect downstream, and optionally verify provenance through an on-chain record.

> Status: Hackathon prototype — APIs, architecture, and security assumptions are evolving.

---

## 🎯 Funkcionalnosti

- **Audio Watermarking**: Ugrađivanje nevidljivih watermark-a u audio zapise
- **Bot Identifikacija**: Detekcija i identifikacija AI bota koji je generisao audio
- **Blockchain Verifikacija**: On-chain registar svih AI botova i njihovih ID-eva
- **Robusnost**: Watermark otporan na kompresiju, šum i druge modifikacije
- **API Integration**: REST API za laku integraciju u postojeće sisteme

## 🏗️ Arhitektura

### Smart Contract (Solidity)
- **ModelRegistry.sol**: On-chain registar AI botova
  - Registracija bot ID-eva
  - Upravljanje statusom (ACTIVE/REVOKED)
  - Metadata storage (IPFS linkovi)

### Python Backend
- **model_wotermarking_audioseal.py**: Glavna implementacija sa AudioSeal
  - `AudioWatermarker`: Klasa za embed/detect operacije
  - `BlockchainVerifier`: Integracija sa smart contract-om
  - AudioSeal (Meta AI) - neuralni model za watermarking
  - 16-bit poruke za visoku jedinstvnost bot ID-eva

## 🚀 Quick Start

### Instalacija

```bash
# Kloniraj repozitorijum
git clone <repo-url>
cd CryptoMark

# Instaliraj zavisnosti
pip install -r requirements.txt

# AudioSeal će automatski download-ovati modele pri prvom pokretanju
# Za detalje vidi AUDIOSEAL_SETUP.md
```

### Osnovni Primer

```python
from model_wotermarking_audioseal import AudioWatermarker

# 1. Inicijalizuj watermarker (AudioSeal - Meta AI)
watermarker = AudioWatermarker(sample_rate=16000, nbits=16)

# 2. Bot ID (registrovan na blockchain-u)
bot_id = "0x1234567890abcdef1234567890abcdef12345678"

# 3. Ugradi watermark
watermarker.embed_watermark(
    audio_path="generated_audio.wav",
    bot_id=bot_id,
    output_path="watermarked_audio.wav"
)

# 4. Detektuj watermark
all_bot_ids = ["0x1234...", "0xabcd...", ...]  # Sa blockchain-a
detected_bot, confidence = watermarker.detect_watermark(
    audio_path="unknown_audio.wav",
    candidate_bot_ids=all_bot_ids
)

print(f"Bot: {detected_bot}, Confidence: {confidence:.2%}")
```

### Testiranje

```bash
python test_watermarking.py
```

### API Server

```bash
python api_demo.py
# Server dostupan na http://localhost:5000
```

## 📖 API Endpoints

### Embed Watermark
```bash
POST /api/v1/embed
Content-Type: multipart/form-data

Parameters:
  - audio_file: Audio fajl
  - bot_id: Bot ID (0x...)
```

### Detect Watermark
```bash
POST /api/v1/detect

Response:
{
  "detected": true,
  "bot_id": "0x...",
  "confidence": 0.85
}
```

### Verify Bot
```bash
GET /api/v1/verify-bot?bot_id=0x...
```

## 🔧 Kako Radi (AudioSeal)

1. **Generisanje Poruke**: Bot ID → SHA-256 hash → 16-bit binarna poruka
2. **Neural Embedding**: AudioSeal generator ugrađuje poruku u audio waveform
3. **Neural Detection**: AudioSeal detector ekstraktuje poruku iz audio-a
4. **Bot Matching**: Hamming distance između detektovane i svih kandidat poruka

AudioSeal koristi neuralnu mrežu za robustno watermarking bez degradacije kvaliteta audio-a.

### Robusnost

Watermark je robustan na:
- ✅ MP3/AAC kompresiju
- ✅ Resampling
- ✅ Aditivni šum
- ✅ Volume promene

## 🔐 Smart Contract

### Registracija Bota

```solidity
function registerModel(
    bytes32 modelId,
    bytes32 wmSpecHash,
    string calldata uri
) external
```

### Provera

```solidity
function getModel(bytes32 modelId) 
    external view returns (Model memory)
```

## 📊 Performance (AudioSeal)

- **Embedding**: ~1-2 sekunde/min audio (GPU) ili ~5-10 sec (CPU)
- **Detection**: ~0.5-1 sekunda/fajl (GPU) ili ~2-4 sec (CPU)
- **Memory**: ~500MB za model + audio buffer
- **Quality**: Perceptually lossless - neprimetno ljudskom uhu

## 🛠️ Konfiguracija

```python
AudioWatermarker(
    sample_rate=16000,    # Sample rate (Hz) - optimalno za AudioSeal
    nbits=16              # Broj bitova (16 = 65,536 jedinstvenih ID-eva)
)
```

**Preporuke:**
- `sample_rate=16000`: Optimalno za AudioSeal
- `nbits=16`: Podržava 65,536 različitih botova
- GPU automatski se koristi ako je dostupan

