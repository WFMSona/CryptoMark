"""
Kompletan test u JEDNOM procesu - sve deli isti blockchain!
Nema HTTP poziva, direktno koristi klase
"""

from model_wotermarking_audioseal import AudioWatermarker, BlockchainVerifier
from web3 import Web3, EthereumTesterProvider
from solcx import compile_source, install_solc
import json
import os
import hashlib
from datetime import datetime

print("="*60)
print("CryptoMark - Single Process Complete Test")
print("="*60)

# ============================================================================
# [1/6] Inicijalizuj blockchain i deploy contract
# ============================================================================
print("\n[1/6] Initializing blockchain and deploying contract...")

w3 = Web3(EthereumTesterProvider())
deployer = w3.eth.accounts[0]

install_solc('0.8.20')

with open('src/ModelRegistry.sol', 'r', encoding='utf-8') as f:
    contract_source = f.read()

compiled = compile_source(
    contract_source,
    output_values=['abi', 'bin'],
    solc_version='0.8.20'
)

contract_interface = compiled['<stdin>:ModelRegistry']

ModelRegistry = w3.eth.contract(
    abi=contract_interface['abi'],
    bytecode=contract_interface['bin']
)

tx_hash = ModelRegistry.constructor().transact({'from': deployer})
tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
contract_address = tx_receipt['contractAddress']

print(f"✓ Contract deployed: {contract_address}")

# ============================================================================
# [2/6] Inicijalizuj verifier sa ISTIM blockchain-om
# ============================================================================
print("\n[2/6] Initializing blockchain verifier...")

verifier = BlockchainVerifier.__new__(BlockchainVerifier)
verifier.contract_address = contract_address
verifier.provider_url = "eth-tester://embedded"
verifier.w3 = w3
verifier.contract = w3.eth.contract(
    address=Web3.to_checksum_address(contract_address),
    abi=contract_interface['abi']
)

print(f"✓ Verifier initialized")

# ============================================================================
# [3/6] Registruj bota na blockchain
# ============================================================================
print("\n[3/6] Registering bot on blockchain...")

bot_name = "TestBot"
unique_string = f"{deployer}{bot_name}{datetime.utcnow().isoformat()}"
bot_id = '0x' + hashlib.sha256(unique_string.encode()).hexdigest()[:40]

tx_hash = verifier.register_bot(
    bot_id=bot_id,
    owner=deployer,
    wm_spec_hash=None,
    uri=f"data:application/json,{{\"name\":\"{bot_name}\"}}"
)

print(f"✓ Bot registered: {bot_id}")

# ============================================================================
# [4/6] Ugradi watermark
# ============================================================================
print("\n[4/6] Embedding watermark...")

audio_file = "C:\\Users\\doslj\\Desktop\\hakaton\\CryptoMark\\1.wav"

if not os.path.exists(audio_file):
    print(f"❌ Audio file not found: {audio_file}")
    exit(1)

watermarker = AudioWatermarker(sample_rate=16000, nbits=16)

success = watermarker.embed_watermark(
    audio_path=audio_file,
    bot_id=bot_id,
    output_path='test_single_process_watermarked.wav'
)

if not success:
    print(f"✗ Embedding failed!")
    exit(1)

print(f"✓ Watermark embedded")

# ============================================================================
# [5/6] Detektuj watermark
# ============================================================================
print("\n[5/6] Detecting watermark...")

detected_bot, confidence = watermarker.detect_watermark(
    audio_path='test_single_process_watermarked.wav',
    candidate_bot_ids=[bot_id]
)

if not detected_bot or detected_bot != bot_id:
    print(f"✗ Detection failed!")
    exit(1)

print(f"✓ Watermark detected: {confidence * 100:.1f}% confidence")

# Prikaz imena bota iz uri polja na blockchainu
bot_info = verifier.verify_bot_id(detected_bot)
bot_name = None
import json
if bot_info and bot_info.get('uri'):
    uri = bot_info['uri']
    if uri.startswith('data:application/json,'):
        try:
            meta = json.loads(uri.split(',', 1)[1])
            bot_name = meta.get('name')
        except Exception:
            pass
    elif uri.strip().startswith('{'):
        try:
            meta = json.loads(uri)
            bot_name = meta.get('name')
        except Exception:
            pass
if bot_name:
    print(f"Bot name (from blockchain): {bot_name}")
else:
    print(f"Bot name not found in blockchain metadata.")

# ============================================================================
# [6/6] Verifikuj bota na blockchain-u
# ============================================================================
print("\n[6/6] Verifying bot on blockchain...")

bot_info = verifier.verify_bot_id(bot_id)

if bot_info['owner'] != deployer or bot_info['status'] != 'ACTIVE':
    print(f"✗ Verification failed!")
    exit(1)

print(f"✓ Bot verified: {bot_info['status']}")
if bot_name:
    print(f"Bot name (from blockchain): {bot_name}")

print("\n" + "="*60)
print("✅ ALL TESTS PASSED!")
print("✅ Watermarked audio: test_single_process_watermarked.wav")
print("="*60)
