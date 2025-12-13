import json
from model_wotermarking_audioseal import BlockchainVerifier

# Učitaj deployment info
with open("deployment_info.json") as f:
    info = json.load(f)

verifier = BlockchainVerifier(info["contract_address"], info["provider_url"])

# Prikaži sve registrovane botove
bot_ids = verifier.get_all_registered_bots()
print("Registrovani botovi:")
for bot_id in bot_ids:
    print(bot_id)
