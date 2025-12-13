from blockchain_embed_util import embed_audio_blockchain
from blockchain_detect_util import detect_audio_blockchain
from model_wotermarking_audioseal import BlockchainVerifier
import sys

# Parametri za test
INPUT_WAV = '1.wav'  # Putanja do ulaznog audio fajla
BOT_NAME = 'TestBot' # Ime bota (mora biti registrovan na chainu sa ovim imenom)
OUTPUT_WAV = 'test_embed_detect_out.wav'

# --- Automatski deploy ModelRegistry kontrakta ---
from web3 import Web3, EthereumTesterProvider
import solcx
import json

# Učitaj Solidity kod
with open('src/ModelRegistry.sol', 'r', encoding='utf-8') as f:
    source_code = f.read()

# Compile contract
solcx.install_solc('0.8.20')
compiled = solcx.compile_source(
    source_code,
    output_values=['abi', 'bin'],
    solc_version='0.8.20'
)
contract_id, contract_interface = next(iter(compiled.items()))
abi = contract_interface['abi']
bytecode = contract_interface['bin']

# Deploy contract
w3 = Web3(EthereumTesterProvider())
acct = w3.eth.accounts[0]
ModelRegistry = w3.eth.contract(abi=abi, bytecode=bytecode)
tx_hash = ModelRegistry.constructor().transact({'from': acct})
tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
contract_address = tx_receipt.contractAddress

w3.provider.ethereum_tester.mine_blocks()  # Mine deployment block
print(f"Contract deployed at: {contract_address}")

# Inicijalizuj BlockchainVerifier sa pravim ABI i adresom
verifier = BlockchainVerifier(
    contract_address=contract_address,
    provider_url='eth-tester://embedded',
    abi=abi,
    w3=w3
)

print(f"Contract address: {contract_address}")
print(f"Backend: {w3.provider.ethereum_tester.backend}")


# Registruj bota ako ne postoji
def ensure_bot_registered(verifier, bot_name, owner):
    all_bot_ids = verifier.get_all_registered_bots()
    for candidate_id in all_bot_ids:
        info = verifier.verify_bot_id(candidate_id)
        bot_name_on_chain = None
        if info and info.get('uri'):
            uri = info['uri']
            import json
            if uri.startswith('data:application/json,'):
                try:
                    meta = json.loads(uri.split(',', 1)[1])
                    bot_name_on_chain = meta.get('name')
                except Exception:
                    pass
            elif uri.strip().startswith('{'):
                try:
                    meta = json.loads(uri)
                    bot_name_on_chain = meta.get('name')
                except Exception:
                    pass
        if bot_name_on_chain == bot_name and info['exists'] and info['status'] == 'ACTIVE':
            print(f"Bot '{bot_name}' je već registrovan.")
            return candidate_id
    # Ako nije, registruj
    from datetime import datetime
    import hashlib
    import time
    unique_string = f"{owner}{bot_name}{datetime.utcnow().isoformat()}"
    bot_id = '0x' + hashlib.sha256(unique_string.encode()).hexdigest()[:40]
    tx_hash = verifier.register_bot(
        bot_id=bot_id,
        owner=owner,
        wm_spec_hash=None,
        uri=f"data:application/json,{{\"name\":\"{bot_name}\"}}"
    )
    verifier.w3.provider.ethereum_tester.mine_blocks()
    time.sleep(0.2)
    print(f"Bot '{bot_name}' registrovan.")
    return bot_id

# Pronađi owner adresu (prvi account na test chainu)
owner = verifier.w3.eth.accounts[0]
ensure_bot_registered(verifier, BOT_NAME, owner)

# 1. Embeduj watermark


print(f"\n--- EMBED ---")
embed_success = embed_audio_blockchain(INPUT_WAV, BOT_NAME, OUTPUT_WAV, verifier)
if embed_success:
    print(f"Watermark embedovan za bota '{BOT_NAME}' u {OUTPUT_WAV}")
else:
    print(f"Embedovanje nije uspelo!")
    sys.exit(1)

# 2. Detekcija watermarka

print(f"\n--- DETECT ---")
bot_id, confidence, bot_info = detect_audio_blockchain(OUTPUT_WAV, verifier)
if not bot_id:
    print("Detekcija nije uspela!")
    sys.exit(1)
ime_bota = None
if bot_info and bot_info.get('uri'):
    uri = bot_info['uri']
    import json
    if uri.startswith('data:application/json,'):
        try:
            meta = json.loads(uri.split(',', 1)[1])
            ime_bota = meta.get('name')
        except Exception:
            pass
    elif uri.strip().startswith('{'):
        try:
            meta = json.loads(uri)
            ime_bota = meta.get('name')
        except Exception:
            pass
if ime_bota:
    print(f"Detektovan bot: {ime_bota}")
else:
    print(f"Detektovan bot_id: {bot_id}")
print(f"Confidence: {confidence:.2%}")
