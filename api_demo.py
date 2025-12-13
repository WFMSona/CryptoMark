"""
API Demo - Integracija Audio Watermarking sistema sa Flask API (AudioSeal)

Ovaj primer pokazuje kako bi se watermarking integrisao u production API
za AI botove koji generišu audio.
"""

from flask import Flask, request, jsonify, send_file
from model_wotermarking_audioseal import AudioWatermarker, BlockchainVerifier
import os
import tempfile
import hashlib
from datetime import datetime
import json

app = Flask(__name__)

# Inicijalizacija AudioSeal
watermarker = AudioWatermarker(sample_rate=16000, nbits=16)

# Fajl za čuvanje registrovanih bot ID-eva
REGISTERED_BOTS_FILE = 'registered_bots.json'

def load_registered_bots():
    """Učitava listu registrovanih bot ID-eva"""
    try:
        with open(REGISTERED_BOTS_FILE, 'r') as f:
            return json.load(f)
    except:
        return []

def save_registered_bot(bot_id, bot_info):
    """Čuva novi bot ID u listu"""
    bots = load_registered_bots()
    
    # Proveri da li već postoji
    for bot in bots:
        if bot['bot_id'] == bot_id:
            return  # Već postoji
    
    # Dodaj novi
    bots.append({
        'bot_id': bot_id,
        'name': bot_info.get('name', 'Unknown'),
        'owner': bot_info.get('owner', ''),
        'registered_at': datetime.utcnow().isoformat()
    })
    
    with open(REGISTERED_BOTS_FILE, 'w') as f:
        json.dump(bots, f, indent=2)
    
    print(f"  ✓ Bot {bot_id[:10]}... added to candidate list ({len(bots)} total)")

# Inicijalizacija BlockchainVerifier
verifier = None
blockchain_enabled = False

try:
    # Učitaj deployment info
    with open('deployment_info.json', 'r') as f:
        deployment = json.load(f)
    
    # Proveri da li je stvarni blockchain (eth-tester)
    if deployment.get('blockchain_type') == 'eth-tester':
        from web3 import Web3, EthereumTesterProvider
        
        # Inicijalizuj pravi blockchain verifier
        verifier = BlockchainVerifier(
            contract_address=deployment['contract_address'],
            provider_url=deployment['provider_url'],
            abi=deployment['abi']
        )
        print("✓ Real blockchain connected (eth-tester EVM)")
        print(f"  Contract: {deployment['contract_address']}")
        blockchain_enabled = True
    else:
        # Mock mode
        print("✓ Blockchain configuration loaded (mock mode)")
        print(f"  Contract: {deployment['contract_address']}")
        blockchain_enabled = True
except Exception as e:
    print(f"⚠ Blockchain verifier not available: {e}")
    print("  API will work without blockchain verification")


@app.route('/api/v1/embed', methods=['POST'])
def embed_watermark_endpoint():
    """
    Endpoint za ugrađivanje watermark-a u audio fajl.
    
    POST /api/v1/embed
    Content-Type: multipart/form-data
    
    Parameters:
        - audio_file: Audio fajl (WAV, MP3, etc.)
        - bot_id: Jedinstveni ID bota (hex string)
        
    Returns:
        - watermarked_audio: Audio fajl sa watermark-om
        - bot_id: Potvrda bot ID-a
        - timestamp: Vreme procesiranja
    """
    try:
        # Validacija input-a
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        if 'bot_id' not in request.form:
            return jsonify({'error': 'No bot_id provided'}), 400
        
        audio_file = request.files['audio_file']
        bot_id = request.form['bot_id']
        
        # Validacija bot_id formata
        if not bot_id.startswith('0x') or len(bot_id) != 42:
            return jsonify({'error': 'Invalid bot_id format (expected 0x + 40 hex chars)'}), 400
        
        # Verifikuj da je bot registrovan na blockchain-u (opciono za embed)
        # Za real-world, ovde bi proverili blockchain
        # Za demo, prihvatamo sve bot_id-eve
        if verifier and blockchain_enabled:
            print(f"  Note: Bot verification skipped for embed (accept all)")
        
        # Sačuvaj privremeno input fajl
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_input:
            audio_file.save(tmp_input.name)
            input_path = tmp_input.name
        
        # Output fajl
        output_path = tempfile.mktemp(suffix='.wav')
        
        # Ugradi watermark
        success = watermarker.embed_watermark(
            audio_path=input_path,
            bot_id=bot_id,
            output_path=output_path
        )
        
        if not success:
            return jsonify({'error': 'Failed to embed watermark'}), 500
        
        # Vrati watermarked fajl
        response = send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=f'watermarked_{audio_file.filename}'
        )
        
        # Cleanup će se desiti nakon slanja
        @response.call_on_close
        def cleanup():
            try:
                os.unlink(input_path)
                os.unlink(output_path)
            except:
                pass
        
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/detect', methods=['POST'])
def detect_watermark_endpoint():
    """
    Endpoint za detekciju watermark-a iz audio fajla.
    
    POST /api/v1/detect
    Content-Type: multipart/form-data
    
    Parameters:
        - audio_file: Audio fajl za proveru
        
    Returns:
        - detected: Boolean - da li je watermark detektovan
        - bot_id: ID detektovanog bota (ako je pronađen)
        - confidence: Poverenje u detekciju (0-1)
        - bot_info: Informacije o botu sa blockchain-a
    """
    try:
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio_file']
        
        # Sačuvaj privremeno
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            audio_file.save(tmp.name)
            audio_path = tmp.name
        
        # Dohvati sve registrovane bot ID-eve
        registered_bots = load_registered_bots()
        all_bot_ids = [bot['bot_id'] for bot in registered_bots]
        
        if not all_bot_ids:
            # Fallback na test ID-eve ako nema registrovanih
            all_bot_ids = [
                "0x1234567890abcdef1234567890abcdef12345678",
                "0xabcdef1234567890abcdef1234567890abcdef12",
                "0x9876543210fedcba9876543210fedcba98765432"
            ]
            print(f"  Using fallback candidate list ({len(all_bot_ids)} bots)")
        else:
            print(f"  Using registered bots as candidates ({len(all_bot_ids)} bots)")
        
        # Detektuj watermark
        detected_bot, confidence = watermarker.detect_watermark(
            audio_path=audio_path,
            candidate_bot_ids=all_bot_ids
        )
        
        # Cleanup
        os.unlink(audio_path)
        
        if detected_bot:
            # TODO: Dohvati informacije o botu sa blockchain-a
            # bot_info = verifier.verify_bot_id(detected_bot)
            
            return jsonify({
                'detected': True,
                'bot_id': detected_bot,
                'confidence': float(confidence),
                'bot_info': {
                    'owner': '0x...',  # bot_info['owner']
                    'status': 'ACTIVE',  # bot_info['status']
                    'registered_at': 'timestamp'  # bot_info['created_at']
                },
                'timestamp': datetime.utcnow().isoformat()
            })
        else:
            return jsonify({
                'detected': False,
                'bot_id': None,
                'confidence': 0.0,
                'timestamp': datetime.utcnow().isoformat()
            })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/verify-bot', methods=['GET'])
def verify_bot_endpoint():
    """
    Endpoint za verifikaciju bot ID-a na blockchain-u.
    
    GET /api/v1/verify-bot?bot_id=0x...
    
    Returns:
        - exists: Da li je bot registrovan
        - owner: Vlasnik bota
        - status: Status (ACTIVE/REVOKED)
        - metadata: Dodatne informacije
    """
    try:
        bot_id = request.args.get('bot_id')
        
        if not bot_id:
            return jsonify({'error': 'No bot_id provided'}), 400
        
        # TODO: Pozovi blockchain
        # bot_info = verifier.verify_bot_id(bot_id)
        
        # Placeholder response
        return jsonify({
            'bot_id': bot_id,
            'exists': True,
            'owner': '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
            'status': 'ACTIVE',
            'created_at': 1702468800,
            'uri': 'ipfs://QmXxx...',
            'watermark_spec_hash': '0xabcd...'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/v1/register-bot', methods=['POST'])
def register_bot_endpoint():
    """
    Endpoint za registraciju novog bota na blockchain-u.
    
    POST /api/v1/register-bot
    Content-Type: application/json
    
    Parameters:
        - owner: Ethereum adresa vlasnika bota
        - name: Ime bota
        - description: Opis bota (opciono)
        - metadata_uri: IPFS URI sa dodatnim informacijama (opciono)
        
    Returns:
        - bot_id: Novi generisani bot ID
        - tx_hash: Hash blockchain transakcije
        - owner: Vlasnik bota
        - status: Status registracije
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Validacija obaveznih polja
        if 'owner' not in data:
            return jsonify({'error': 'Owner address is required'}), 400
        
        if 'name' not in data:
            return jsonify({'error': 'Bot name is required'}), 400
        
        owner = data['owner']
        name = data['name']
        description = data.get('description', '')
        metadata_uri = data.get('metadata_uri', '')
        
        # Validacija Ethereum adrese
        if not owner.startswith('0x') or len(owner) != 42:
            return jsonify({'error': 'Invalid owner address format'}), 400
        
        # Generiši jedinstveni bot_id (kombinacija owner + name + timestamp)
        unique_string = f"{owner}{name}{datetime.utcnow().isoformat()}"
        bot_id = '0x' + hashlib.sha256(unique_string.encode()).hexdigest()[:40]
        
        # Registruj na blockchain
        if not verifier:
            return jsonify({'error': 'Blockchain verifier not available'}), 503
        
        try:
            tx_hash = verifier.register_bot(
                bot_id=bot_id,
                owner=owner,
                wm_spec_hash=None,
                uri=metadata_uri or f"data:application/json,{{\\\"name\\\":\\\"{name}\\\",\\\"description\\\":\\\"{description}\\\"}}"
            )
        except Exception as e:
            return jsonify({'error': f'Blockchain registration failed: {str(e)}'}), 500
        
        # Dodaj u listu registrovanih botova
        save_registered_bot(bot_id, {
            'name': name,
            'owner': owner,
            'description': description
        })
        
        return jsonify({
            'success': True,
            'bot_id': bot_id,
            'tx_hash': tx_hash,
            'owner': owner,
            'name': name,
            'description': description,
            'metadata_uri': metadata_uri,
            'status': 'ACTIVE',
            'created_at': datetime.utcnow().isoformat(),
            'message': 'Bot successfully registered on blockchain'
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'audio-watermarking-api',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })


if __name__ == '__main__':
    print("""
    ═══════════════════════════════════════════════════════════
    Audio Watermarking API Server
    ═══════════════════════════════════════════════════════════
    
    Endpoints:
    • POST /api/v1/register-bot  - Register new bot
    • POST /api/v1/embed         - Embed watermark
    • POST /api/v1/detect        - Detect watermark
    • GET  /api/v1/verify-bot    - Verify bot on blockchain
    • GET  /health               - Health check
    
    Running on http://localhost:5000
    ═══════════════════════════════════════════════════════════
    """)
    
    app.run(debug=False, host='0.0.0.0', port=5000)
