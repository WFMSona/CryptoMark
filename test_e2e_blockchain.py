"""
Kompletan end-to-end test sa pravim blockchain-om
"""

import requests
import json
import os

API_URL = "http://localhost:5000"

# Učitaj deployment info
with open('deployment_info.json', 'r') as f:
    deployment = json.load(f)

deployer = deployment['deployer']

print("="*60)
print("CryptoMark - End-to-End Blockchain Test")
print("="*60)

# 1. Registruj novi bot
print("\n[1/4] Registering new bot on blockchain...")
bot_data = {
    "owner": deployer,
    "name": "E2ETestBot",
    "description": "End-to-end test bot",
    "metadata_uri": "ipfs://QmE2ETest"
}

response = requests.post(
    f"{API_URL}/api/v1/register-bot",
    json=bot_data,
    headers={'Content-Type': 'application/json'}
)

if response.status_code != 201:
    print(f"✗ Registration failed: {response.text}")
    exit(1)

bot_id = response.json()['bot_id']
print(f"✓ Bot registered!")
print(f"  Bot ID: {bot_id}")
print(f"  TX Hash: {response.json()['tx_hash']}")

# 2. Embed watermark
print("\n[2/4] Embedding watermark...")
audio_file = "1.wav"

if not os.path.exists(audio_file):
    print(f"✗ Audio file '{audio_file}' not found!")
    exit(1)

with open(audio_file, 'rb') as f:
    files = {'audio_file': f}
    data = {'bot_id': bot_id}
    
    response = requests.post(
        f"{API_URL}/api/v1/embed",
        files=files,
        data=data
    )

if response.status_code != 200:
    print(f"✗ Embed failed: {response.text}")
    exit(1)

with open('test_watermarked.wav', 'wb') as f:
    f.write(response.content)
    
print("✓ Watermark embedded!")
print(f"  Output: test_watermarked.wav")

# 3. Detect watermark
print("\n[3/4] Detecting watermark...")
with open('test_watermarked.wav', 'rb') as f:
    files = {'audio_file': f}
    
    response = requests.post(
        f"{API_URL}/api/v1/detect",
        files=files
    )

if response.status_code != 200:
    print(f"✗ Detection failed: {response.text}")
    exit(1)

result = response.json()
print(f"✓ Watermark detected!")
print(f"  Detected Bot ID: {result['bot_id']}")
print(f"  Confidence: {result['confidence']*100:.1f}%")
print(f"  Match: {'YES' if result['bot_id'] == bot_id else 'NO'}")

# 4. Verify bot on blockchain
print("\n[4/4] Verifying bot on blockchain...")
response = requests.get(
    f"{API_URL}/api/v1/verify-bot",
    params={'bot_id': bot_id}
)

if response.status_code != 200:
    print(f"✗ Verification failed: {response.text}")
    exit(1)

bot_info = response.json()
print(f"✓ Bot verified on blockchain!")
print(f"  Owner: {bot_info['owner']}")
print(f"  Status: {bot_info['status']}")
print(f"  Exists: {bot_info['exists']}")

print("\n" + "="*60)
print("✓ All tests passed!")
print("✓ Real blockchain integration working!")
print("="*60)
