from model_wotermarking_audioseal import AudioWatermarker, BlockchainVerifier
from typing import Optional

def embed_audio_blockchain(input_wav: str, bot_name: str, output_wav: str, verifier: BlockchainVerifier, sample_rate: int = 16000, nbits: int = 16) -> bool:
    """
    Ugrađuje watermark u audio fajl, ali sada se koristi ime bota (ne hex bot_id).
    :param input_wav: Putanja do ulaznog WAV fajla
    :param bot_name: Ime bota (kako je upisano u uri na blockchainu)
    :param output_wav: Putanja za izlazni (watermarked) WAV
    :param verifier: BlockchainVerifier instanca
    :param sample_rate: Sample rate (default 16kHz)
    :param nbits: Broj bitova watermarka (default 16)
    :return: True ako je uspešno, False ako nije
    """
    # Pronađi bot_id na osnovu imena bota
    all_bot_ids = verifier.get_all_registered_bots()
    for candidate_id in all_bot_ids:
        info = verifier.verify_bot_id(candidate_id)
        # Pokušaj parsirati ime iz uri polja
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
            watermarker = AudioWatermarker(sample_rate=sample_rate, nbits=nbits)
            return watermarker.embed_watermark(input_wav, candidate_id, output_wav)
    print(f"Bot sa imenom '{bot_name}' nije pronađen ili nije ACTIVE na blockchainu!")
    return False
