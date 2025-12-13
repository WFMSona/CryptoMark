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

app = Flask(__name__)

# Inicijalizacija AudioSeal
watermarker = AudioWatermarker(sample_rate=16000, nbits=16)

# Placeholder za blockchain verifier (setuj prave vrednosti)
# verifier = BlockchainVerifier(
#     contract_address="0xYourContractAddress",
#     provider_url="https://your-rpc-provider.com"
# )


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
        
        # TODO: Verifikuj da je bot registrovan na blockchain-u
        # bot_info = verifier.verify_bot_id(bot_id)
        # if not bot_info['exists']:
        #     return jsonify({'error': 'Bot ID not registered on blockchain'}), 403
        # if bot_info['status'] != 'ACTIVE':
        #     return jsonify({'error': 'Bot ID is revoked'}), 403
        
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
        
        # TODO: Dohvati sve registrovane bot ID-eve sa blockchain-a
        # all_bot_ids = verifier.get_all_registered_bots()
        
        # Za demo, koristi neke test ID-eve
        all_bot_ids = [
            "0x1234567890abcdef1234567890abcdef12345678",
            "0xabcdef1234567890abcdef1234567890abcdef12",
            "0x9876543210fedcba9876543210fedcba98765432"
        ]
        
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


@app.route('/api/v1/batch-embed', methods=['POST'])
def batch_embed_endpoint():
    """
    Endpoint za batch procesiranje više audio fajlova.
    
    POST /api/v1/batch-embed
    Content-Type: multipart/form-data
    
    Parameters:
        - audio_files[]: Lista audio fajlova
        - bot_id: ID bota
        
    Returns:
        - results: Lista rezultata za svaki fajl
        - success_count: Broj uspešno procesiranih
    """
    try:
        if 'bot_id' not in request.form:
            return jsonify({'error': 'No bot_id provided'}), 400
        
        bot_id = request.form['bot_id']
        
        # Dohvati sve fajlove
        files = request.files.getlist('audio_files[]')
        
        if not files:
            return jsonify({'error': 'No audio files provided'}), 400
        
        results = []
        success_count = 0
        
        for idx, audio_file in enumerate(files):
            try:
                # Privremeni fajlovi
                with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_in:
                    audio_file.save(tmp_in.name)
                    input_path = tmp_in.name
                
                output_path = tempfile.mktemp(suffix='.wav')
                
                # Embed
                success = watermarker.embed_watermark(input_path, bot_id, output_path)
                
                if success:
                    success_count += 1
                    results.append({
                        'filename': audio_file.filename,
                        'status': 'success',
                        'index': idx
                    })
                else:
                    results.append({
                        'filename': audio_file.filename,
                        'status': 'failed',
                        'error': 'Embedding failed',
                        'index': idx
                    })
                
                # Cleanup
                os.unlink(input_path)
                if os.path.exists(output_path):
                    os.unlink(output_path)
                    
            except Exception as e:
                results.append({
                    'filename': audio_file.filename,
                    'status': 'error',
                    'error': str(e),
                    'index': idx
                })
        
        return jsonify({
            'results': results,
            'total': len(files),
            'success_count': success_count,
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
    • POST /api/v1/embed         - Embed watermark
    • POST /api/v1/detect        - Detect watermark
    • POST /api/v1/batch-embed   - Batch processing
    • GET  /api/v1/verify-bot    - Verify bot on blockchain
    • GET  /health               - Health check
    
    Running on http://localhost:5000
    ═══════════════════════════════════════════════════════════
    """)
    
    app.run(debug=True, host='0.0.0.0', port=5000)
