import torch
import numpy as np
from audioseal import AudioSeal
from typing import Tuple, Optional, List
import hashlib
import os
from scipy.io import wavfile


class AudioWatermarker:
    def __init__(self, sample_rate: int = 16000, nbits: int = 16):
        self.sample_rate = sample_rate
        self.nbits = nbits
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        self.model = AudioSeal.load_generator("audioseal_wm_16bits").to(self.device)
        self.detector = AudioSeal.load_detector("audioseal_detector_16bits").to(self.device)
    
    def _bot_id_to_message(self, bot_id: str) -> torch.Tensor:
        # Normalizuj bot_id (ukloni 0x prefix ako postoji)
        if bot_id.startswith('0x'):
            bot_id = bot_id[2:]
        
        # Konvertuj hex u bitove direktno (uzmi prvih nekoliko hex cifara)
        # Svaka hex cifra = 4 bita, tako da nam treba nbits/4 cifara
        hex_chars_needed = (self.nbits + 3) // 4  # Round up
        hex_part = bot_id[:hex_chars_needed].ljust(hex_chars_needed, '0')
        
        # Konvertuj u int pa u bitove
        try:
            num = int(hex_part, 16)
        except:
            # Fallback ako hex nije validan
            num = int(hashlib.sha256(bot_id.encode()).hexdigest()[:hex_chars_needed], 16)
        
        # Konvertuj broj u bitove
        bits = []
        for i in range(self.nbits):
            bits.append((num >> i) & 1)
        
        # Konvertuj u tensor
        message = torch.tensor([bits], dtype=torch.int32).to(self.device)
        return message
    
    def _message_to_bot_id(self, message: torch.Tensor, candidate_bot_ids: List[str]) -> Tuple[Optional[str], float]:
        # Konvertuj detektovanu poruku u numpy
        if isinstance(message, torch.Tensor):
            detected_bits = message.cpu().numpy().flatten()
        else:
            detected_bits = np.array(message).flatten()
        
        # Uzmi samo prvih nbits (AudioSeal može vratiti više)
        detected_bits = detected_bits[:self.nbits]
        
        best_match = None
        best_score = -1
        best_details = []
        
        for bot_id in candidate_bot_ids:
            expected_msg = self._bot_id_to_message(bot_id)
            expected_bits = expected_msg.cpu().numpy().flatten()
            
            # Izračunaj Hamming distance
            min_len = min(len(detected_bits), len(expected_bits))
            matching_bits = np.sum(detected_bits[:min_len] == expected_bits[:min_len])
            score = matching_bits / min_len
            
            best_details.append((bot_id[:10] + "...", score))
            
            if score > best_score:
                best_score = score
                best_match = bot_id
        
        if best_score >= 0.6:
            return best_match, best_score
        else:
            return None, 0.0
    
    def embed_watermark(self, audio_path: str, bot_id: str, output_path: str) -> bool:
        try:
            # 1. Učitaj audio (podrška za MP3/WAV)
            if audio_path.lower().endswith('.mp3'):
                from pydub import AudioSegment
                audio_segment = AudioSegment.from_mp3(audio_path)
                # Konvertuj u WAV u memoriji
                import io
                wav_buffer = io.BytesIO()
                audio_segment.export(wav_buffer, format='wav')
                wav_buffer.seek(0)
                sr, audio_np = wavfile.read(wav_buffer)
            else:
                sr, audio_np = wavfile.read(audio_path)
            
            # Konvertuj u float32 i normalizuj
            if audio_np.dtype == np.int16:
                audio_np = audio_np.astype(np.float32) / 32768.0
            elif audio_np.dtype == np.int32:
                audio_np = audio_np.astype(np.float32) / 2147483648.0
            # Konvertuj u PyTorch tensor
            audio = torch.from_numpy(audio_np).float()
            # Ako je mono, dodaj dimenziju za kanal
            if audio.dim() == 1:
                audio = audio.unsqueeze(0)
            # Ako je stereo, konvertuj na mono
            elif audio.dim() == 2:
                audio = torch.mean(audio, dim=1, keepdim=True).T
            # Resample ako je potrebno
            if sr != self.sample_rate:
                from torchaudio.transforms import Resample
                resampler = Resample(sr, self.sample_rate)
                audio = resampler(audio)
            # Prebaci na device
            audio = audio.to(self.device)
            # 2. Generiši poruku od bot_id
            message = self._bot_id_to_message(bot_id)
            # 3. Ugradi watermark koristeći AudioSeal
            with torch.no_grad():
                watermarked_audio = self.model(
                    audio.unsqueeze(0), 
                    message=message, 
                    sample_rate=self.sample_rate
                )
                watermarked_audio = watermarked_audio.squeeze(0)
            # 4. Sačuvaj kao WAV
            watermarked_audio = watermarked_audio.cpu().squeeze().numpy()
            # Konvertuj nazad u int16
            watermarked_int16 = np.int16(np.clip(watermarked_audio, -1.0, 1.0) * 32767)
            wavfile.write(output_path, self.sample_rate, watermarked_int16)
            return True
        except Exception as e:
            print(f"Error in embed_watermark: {e}")
            return False
    
    def detect_watermark(self, audio_path: str, candidate_bot_ids: list) -> Tuple[Optional[str], float]:
        try:
            # 1. Učitaj audio (podrška za MP3/WAV)
            if audio_path.lower().endswith('.mp3'):
                from pydub import AudioSegment
                audio_segment = AudioSegment.from_mp3(audio_path)
                # Konvertuj u WAV u memoriji
                import io
                wav_buffer = io.BytesIO()
                audio_segment.export(wav_buffer, format='wav')
                wav_buffer.seek(0)
                sr, audio_np = wavfile.read(wav_buffer)
            else:
                sr, audio_np = wavfile.read(audio_path)
            
            # Konvertuj u float32 i normalizuj
            if audio_np.dtype == np.int16:
                audio_np = audio_np.astype(np.float32) / 32768.0
            elif audio_np.dtype == np.int32:
                audio_np = audio_np.astype(np.float32) / 2147483648.0
            # Konvertuj u PyTorch tensor
            audio = torch.from_numpy(audio_np).float()
            # Ako je mono, dodaj dimenziju za kanal
            if audio.dim() == 1:
                audio = audio.unsqueeze(0)
            # Ako je stereo, konvertuj na mono
            elif audio.dim() == 2:
                audio = torch.mean(audio, dim=1, keepdim=True).T
            # Resample ako je potrebno
            if sr != self.sample_rate:
                from torchaudio.transforms import Resample
                resampler = Resample(sr, self.sample_rate)
                audio = resampler(audio)
            # Prebaci na device
            audio = audio.to(self.device)
            # 2. Detektuj watermark koristeći AudioSeal
            with torch.no_grad():
                result, message = self.detector.detect_watermark(
                    audio.unsqueeze(0), 
                    sample_rate=self.sample_rate
                )
            # result sadrži confidence score (može biti float ili tensor)
            if isinstance(result, torch.Tensor):
                detection_confidence = result.item()
            else:
                detection_confidence = float(result)
            # 3. Proveri da li je watermark detektovan
            detection_threshold = 0.5  # AudioSeal threshold
            if detection_confidence < detection_threshold:
                return None, 0.0
            # 4. Dekoduj poruku
            # message je tensor sa bitovima - AudioSeal vraća batch format (batch, bits)
            if message.dim() > 1:
                message = message.squeeze(0)  # Ukloni batch dimenziju
            # Konvertuj u binarne vrednosti (0 ili 1)
            detected_message = (message > 0.5).int()
            # 5. Mapiranje nazad na bot_id
            bot_id, match_confidence = self._message_to_bot_id(detected_message, candidate_bot_ids)
            if bot_id:
                overall_confidence = detection_confidence * match_confidence
                return bot_id, overall_confidence
            else:
                return None, 0.0
        except Exception as e:
            print(f"Error in detect_watermark: {e}")
            return None, 0.0
    



class BlockchainVerifier:
    def get_all_registered_bots(self) -> list:
        """
        Dohvata sve registrovane bot_id sa blockchaina koristeći ModelRegistered event.
        Returns: lista bot_id (hex string)
        """
        # Try using w3.eth.get_logs directly
        event_signature = self.w3.keccak(text="ModelRegistered(bytes32,address,bytes32)").hex()
        logs = self.w3.eth.get_logs({
            'fromBlock': 0,
            'toBlock': 'latest',
            'address': self.contract_address,
            'topics': [event_signature]
        })
        bot_ids = []
        for log in logs:
            # Decode the log
            event = self.contract.events.ModelRegistered().process_log(log)
            model_id = event['args']['modelId']
            bot_id_hex = '0x' + model_id.hex()
            bot_ids.append(bot_id_hex)
        return bot_ids

    def __init__(self, contract_address: str, provider_url: str, abi: list = None, w3=None):
        from web3 import Web3
        import json
        
        self.contract_address = contract_address
        self.provider_url = provider_url
        
        # Konektuj se na blockchain (eth-tester ili HTTP)
        if w3 is not None:
            self.w3 = w3
        elif provider_url == 'eth-tester://embedded':
            from web3 import EthereumTesterProvider
            self.w3 = Web3(EthereumTesterProvider())
        else:
            self.w3 = Web3(Web3.HTTPProvider(provider_url))
        
        if not self.w3.is_connected():
            raise Exception(f"Failed to connect to blockchain at {provider_url}")
        
        # Učitaj ABI
        if abi is None:
            # Pokušaj učitati iz deployment_info.json
            try:
                with open('deployment_info.json', 'r') as f:
                    deployment = json.load(f)
                    abi = deployment['abi']
            except:
                raise Exception("ABI not provided and deployment_info.json not found")
        
        # Inicijalizuj contract
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address),
            abi=abi
        )
        

    
    def register_bot(self, bot_id: str, owner: str, wm_spec_hash: str = None, uri: str = "") -> str:
        # Konvertuj bot_id u bytes32
        if bot_id.startswith('0x'):
            bot_id_bytes = bytes.fromhex(bot_id[2:].ljust(64, '0')[:64])
        else:
            bot_id_bytes = bytes.fromhex(bot_id.ljust(64, '0')[:64])
        

        
        # Default wm_spec_hash ako nije prosleđen
        if wm_spec_hash is None:
            wm_spec_hash = bytes(32)  # Nulti hash
        elif isinstance(wm_spec_hash, str):
            wm_spec_hash = bytes.fromhex(wm_spec_hash.replace('0x', '').ljust(64, '0')[:64])
        
        tx_hash = self.contract.functions.registerModel(
            bot_id_bytes,
            wm_spec_hash,
            uri
        ).transact({'from': self.w3.to_checksum_address(owner)})
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return tx_hash.hex()
    
    def verify_bot_id(self, bot_id: str) -> dict:
        # Konvertuj bot_id u bytes32
        if bot_id.startswith('0x'):
            bot_id_bytes = bytes.fromhex(bot_id[2:].ljust(64, '0')[:64])
        else:
            bot_id_bytes = bytes.fromhex(bot_id.ljust(64, '0')[:64])
        

        
        try:
            model = self.contract.functions.getModel(bot_id_bytes).call()
            owner = model[0]
            status = model[1]
            uri = model[3]
            created_at = model[4]
            exists = owner != '0x0000000000000000000000000000000000000000'
            return {
                'exists': exists,
                'owner': owner,
                'status': 'ACTIVE' if status == 1 else ('REVOKED' if status == 2 else 'UNKNOWN'),
                'created_at': created_at,
                'uri': uri
            }
        except Exception:
            return {
                'exists': False,
                'owner': '0x0000000000000000000000000000000000000000',
                'status': 'UNKNOWN',
                'created_at': 0,
                'uri': ''
            }

    # Odkomentiraj za testiranje:
    # example_usage()
