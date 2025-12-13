import sys
import json
from model_wotermarking_audioseal import BlockchainVerifier

if len(sys.argv) < 2:
    print("Usage: python add_bot.py <bot_name> [uri] [desc]")
    sys.exit(1)

bot_name = sys.argv[1]
uri = sys.argv[2] if len(sys.argv) > 2 else "https://example.com"
desc = sys.argv[3] if len(sys.argv) > 3 else "desc"

with open("deployment_info.json") as f:
    info = json.load(f)

verifier = BlockchainVerifier(
    info["contract_address"],
    info["provider_url"],
    account=info["accounts"][0]
)

bot_id = verifier.register_bot(bot_name, uri, desc)
print(f"Bot registered: {bot_name} ({bot_id})")
