from model_wotermarking_audioseal import AudioWatermarker, BlockchainVerifier
from typing import List, Tuple, Optional

def detect_audio_blockchain(input_wav: str, verifier: BlockchainVerifier, sample_rate: int = 16000, nbits: int = 16) -> Tuple[Optional[str], float, Optional[dict]]:
    """
    Detektuje watermark iz audio fajla, koristi sve registrovane bot_id sa blockchaina,
    i vraća (bot_id, confidence, bot_info_dict).
    :param input_wav: Putanja do WAV fajla
    :param verifier: BlockchainVerifier instanca
    :param sample_rate: Sample rate (default 16kHz)
    :param nbits: Broj bitova watermarka (default 16)
    :return: (bot_id, confidence, bot_info_dict) ili (None, 0.0, None) ako nije detektovan
    """
    all_bot_ids = verifier.get_all_registered_bots()
    if not all_bot_ids:
        print("Nema registrovanih bot_id na blockchainu!")
        return None, 0.0, None
    watermarker = AudioWatermarker(sample_rate=sample_rate, nbits=nbits)
    bot_id, confidence = watermarker.detect_watermark(input_wav, all_bot_ids)
    bot_info = verifier.verify_bot_id(bot_id) if bot_id else None
    return bot_id, confidence, bot_info
