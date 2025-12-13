# CryptoMark - AudioSeal Setup Guide

## Instalacija AudioSeal-a

AudioSeal je Meta-in napredni model za audio watermarking. Evo kako da ga instaliraš:

### Metod 1: Pip instalacija (Preporučeno)

```bash
# Instaliraj PyTorch prvo (ako već nije instaliran)
pip install torch torchaudio

# Instaliraj AudioSeal
pip install audioseal
```

### Metod 2: Instalacija iz source-a

Ako pip instalacija ne radi, možeš instalirati direktno iz GitHub-a:

```bash
# Kloniraj AudioSeal repozitorijum
git clone https://github.com/facebookresearch/audioseal.git
cd audioseal

# Instaliraj
pip install -e .
```

### Verifikacija instalacije

```python
import torch
from audioseal import AudioSeal

# Test učitavanje modela
model = AudioSeal.load_generator("audioseal_wm_16bits")
detector = AudioSeal.load_detector("audioseal_detector_16bits")

print("✓ AudioSeal uspešno instaliran!")
```

## Sistemski zahtevi

- **Python**: 3.8 ili noviji
- **PyTorch**: 2.0.0 ili noviji
- **CUDA**: Opciono, za GPU akceleraciju (preporučeno)
- **RAM**: Minimum 4GB, preporučeno 8GB+
- **Disk**: ~500MB za modele

## GPU podrška (Opciono ali preporučeno)

AudioSeal automatski koristi GPU ako je dostupan:

```python
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"Device: {torch.device('cuda' if torch.cuda.is_available() else 'cpu')}")
```

### Instalacija PyTorch sa CUDA

```bash
# Za CUDA 11.8
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118

# Za CUDA 12.1
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# Samo CPU (bez GPU)
pip install torch torchaudio
```

## Brzi test

```bash
# Instaliraj sve zavisnosti
pip install -r requirements.txt

# Testiraj osnovnu funkcionalnost
python -c "from model_wotermarking_audioseal import AudioWatermarker; print('✓ All imports successful!')"
```

## Troubleshooting

### Problem: "No module named 'audioseal'"

**Rešenje:**
```bash
pip install audioseal
# ili
pip install git+https://github.com/facebookresearch/audioseal.git
```

### Problem: PyTorch verzija

**Rešenje:**
```bash
pip install --upgrade torch torchaudio
```

### Problem: CUDA errors

**Rešenje:**
```bash
# Proveri CUDA verziju
nvidia-smi

# Instaliraj odgovarajući PyTorch
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Problem: Modeli se ne učitavaju

**Rešenje:**
Modeli se automatski download-uju pri prvom pokretanju. Proveri internet konekciju.

## Performance tips

1. **Koristi GPU** za 5-10x bržu obradu
2. **Batch processing** za više fajlova odjednom
3. **Sample rate 16000 Hz** je optimalan za AudioSeal
4. **Preload modele** jednom i koristi više puta

## Reference

- AudioSeal GitHub: https://github.com/facebookresearch/audioseal
- AudioSeal Paper: https://arxiv.org/abs/2401.17264
- PyTorch: https://pytorch.org/get-started/locally/
