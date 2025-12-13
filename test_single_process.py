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

# Kreiraj eth-tester provider
w3 = Web3(EthereumTesterProvider())
deployer = w3.eth.accounts[0]

print(f"✓ Blockchain initialized!")
print(f"  Chain ID: {w3.eth.chain_id}")
print(f"  Deployer: {deployer}")
print(f"  Balance: {w3.eth.get_balance(deployer) / 10**18:,.0f} ETH")

# Kompajliraj i deploy contract
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

print(f"✓ Smart contract deployed!")
print(f"  Address: {contract_address}")
print(f"  TX Hash: {tx_hash.hex()}")

# ============================================================================
# [2/6] Inicijalizuj verifier sa ISTIM blockchain-om
# ============================================================================
print("\n[2/6] Initializing blockchain verifier...")

# KLJUČNO: Koristi isti w3 instance!
verifier = BlockchainVerifier.__new__(BlockchainVerifier)
verifier.contract_address = contract_address
verifier.provider_url = "eth-tester://embedded"
verifier.w3 = w3  # ← Isti blockchain!
verifier.contract = w3.eth.contract(
    address=Web3.to_checksum_address(contract_address),
    abi=contract_interface['abi']
)

print(f"✓ Verifier initialized with same blockchain instance")

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

print(f"✓ Bot registered!")
print(f"  Bot ID: {bot_id}")
print(f"  TX Hash: {tx_hash}")
print(f"  Owner: {deployer}")

# ============================================================================
# [4/6] Ugradi watermark
# ============================================================================
print("\n[4/6] Embedding watermark...")

# Koristi postojeći test audio
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

if success:
    print(f"✓ Watermark embedded!")
    print(f"  Output: test_single_process_watermarked.wav")
else:
    print(f"✗ Embedding failed!")
    exit(1)

# ============================================================================
# [5/6] Detektuj watermark
# ============================================================================
print("\n[5/6] Detecting watermark...")

detected_bot, confidence = watermarker.detect_watermark(
    audio_path='test_single_process_watermarked.wav',
    candidate_bot_ids=[bot_id]
)

if detected_bot:
    print(f"✓ Watermark detected!")
    print(f"  Detected Bot ID: {detected_bot}")
    print(f"  Confidence: {confidence * 100:.1f}%")
    print(f"  Match: {'YES' if detected_bot == bot_id else 'NO'}")
else:
    print(f"✗ No watermark detected!")
    exit(1)

# ============================================================================
# [6/6] Verifikuj bota na blockchain-u (SA ISTOG BLOCKCHAIN-A!)
# ============================================================================
print("\n[6/6] Verifying bot on blockchain...")

bot_info = verifier.verify_bot_id(bot_id)

print(f"✓ Bot verified on blockchain!")
print(f"  Exists: {bot_info['exists']}")
print(f"  Owner: {bot_info['owner']}")
print(f"  Status: {bot_info['status']}")
print(f"  Created: {bot_info['created_at']}")
print(f"  URI: {bot_info['uri']}")

# Proveri da li je vlasnik ispravan
if bot_info['owner'] == deployer and bot_info['status'] == 'ACTIVE':
    print(f"\n✅ VERIFICATION SUCCESS!")
else:
    print(f"\n❌ Verification mismatch!")
    exit(1)

print("\n" + "="*60)
print("✅ ALL TESTS PASSED!")
print("✅ Complete flow working in single process!")
print("✅ Blockchain verification successful!")
print(f"✅ Watermarked audio saved: test_single_process_watermarked.wav")
print("="*60)
