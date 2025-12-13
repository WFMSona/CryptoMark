"""
Audio Watermarking System za AI Botove sa AudioSeal
====================================================

Ovaj modul omogućava:
1. Ugrađivanje watermark-a u audio zapise koje generiše AI bot
2. Detekciju watermark-a iz audio zapisa
3. Identifikaciju AI bota na osnovu watermark-a
4. Verifikaciju kroz blockchain (ModelRegistry)

Watermark se ugrađuje koriščenjem AudioSeal modela (Meta AI),
naprednog neuralnog modela za audio watermarking koji je robustan
na kompresiju, modifikacije i druge transformacije.
"""

import torch
import numpy as np
from audioseal import AudioSeal
from typing import Tuple, Optional, List
import hashlib
import os
from scipy.io import wavfile


class AudioWatermarker:
    """
    Klasa za watermarkovanje audio zapisa sa jedinstvenim bot ID-em.
    
    Koristi AudioSeal (Meta AI) - neuralnu mrežu specijalizovanu
    za generativne audio watermark-ove sa visokom robusnošću.
    """
    
    def __init__(self, sample_rate: int = 16000, nbits: int = 16):
        """
        Args:
            sample_rate: Sample rate za audio (Hz) - AudioSeal preporučuje 16000
            nbits: Broj bitova za watermark (više bitova = više jedinstvenih ID-eva)
        """
        self.sample_rate = sample_rate
        self.nbits = nbits
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Inicijalizuj AudioSeal model
        print(f"Loading AudioSeal model on {self.device}...")
        self.model = AudioSeal.load_generator("audioseal_wm_16bits")
        self.detector = AudioSeal.load_detector("audioseal_detector_16bits")
        
        # Prebaci na device
        self.model = self.model.to(self.device)
        self.detector = self.detector.to(self.device)
        
        print(f"✓ AudioSeal loaded successfully ({self.nbits} bits)")
    
    def _bot_id_to_message(self, bot_id: str) -> torch.Tensor:
        """
        Konvertuje bot ID (hex string) u binarnu poruku za AudioSeal.
        
        Koristi direktnu konverziju prvih hex cifara bot_id u bitove.
        Ovo je deterministički i jedinstveno za svaki bot ID.
        
        Args:
            bot_id: Jedinstveni identifikator bota (hex string, npr. "0x1234...")
            
        Returns:
            Tensor sa binarnom porukom [0, 1] dimenzije (1, nbits)
        """
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
        """
        Mapira detektovanu poruku nazad na bot ID.
        
        Args:
            message: Detektovana binarna poruka
            candidate_bot_ids: Lista kandidat bot ID-eva
            
        Returns:
            Tuple (bot_id, confidence) - najbolje podudaranje
        """
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
        
        # Debug output
        if len(candidate_bot_ids) <= 5:
            for bid, s in best_details:
                print(f"    {bid}: {s:.2%}")
        
        # Threshold za match (snižen na 60% zbog nesavršene AudioSeal ekstrakcije)
        if best_score >= 0.6:
            return best_match, best_score
        else:
            print(f"  Best match score: {best_score:.2%} (threshold: 60%)")
            return None, 0.0
    
    def embed_watermark(self, audio_path: str, bot_id: str, output_path: str) -> bool:
        """
        Ugrađuje watermark u audio fajl koristeći AudioSeal.
        
        Process:
        1. Učitava audio signal
        2. Konvertuje bot_id u binarnu poruku
        3. Koristi AudioSeal generator za embedding
        4. Čuva watermarked audio
        
        Args:
            audio_path: Putanja do originalnog audio fajla
            bot_id: ID bota koji generiše audio (hex string)
            output_path: Putanja za čuvanje watermarked audio-a
            
        Returns:
            True ako je uspešno, False ako je došlo do greške
        """
        try:
            # 1. Učitaj audio koristeći scipy
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
            
            # 4. Sačuvaj koristeći scipy
            watermarked_audio = watermarked_audio.cpu().squeeze().numpy()
            # Konvertuj nazad u int16
            watermarked_int16 = np.int16(np.clip(watermarked_audio, -1.0, 1.0) * 32767)
            wavfile.write(output_path, self.sample_rate, watermarked_int16)
            
            print(f"✓ Watermark embedded for bot_id: {bot_id}")
            print(f"  Output: {output_path}")
            return True
            
        except Exception as e:
            print(f"✗ Error embedding watermark: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def detect_watermark(self, audio_path: str, candidate_bot_ids: list) -> Tuple[Optional[str], float]:
        """
        Detektuje watermark iz audio fajla i identifikuje bot koristeći AudioSeal.
        
        Process:
        1. Učitava audio signal
        2. Koristi AudioSeal detector za ekstrakciju poruke
        3. Mapira poruku nazad na bot_id iz kandidata
        
        Args:
            audio_path: Putanja do audio fajla za proveru
            candidate_bot_ids: Lista mogućih bot ID-eva za proveru
            
        Returns:
            Tuple (bot_id, confidence) - bot_id koji je detektovan i poverenje (0-1)
            Vraća (None, 0.0) ako watermark nije detektovan
        """
        try:
            # 1. Učitaj audio koristeći scipy
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
                print(f"✗ No watermark detected (confidence: {detection_confidence:.3f})")
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
                # Kombinuj detection i match confidence
                overall_confidence = detection_confidence * match_confidence
                print(f"✓ Watermark detected!")
                print(f"  Bot ID: {bot_id}")
                print(f"  Confidence: {overall_confidence:.2%}")
                return bot_id, overall_confidence
            else:
                print(f"✗ Watermark detected but no matching bot ID")
                print(f"  Detection confidence: {detection_confidence:.2%}")
                return None, 0.0
                
        except Exception as e:
            print(f"✗ Error detecting watermark: {e}")
            import traceback
            traceback.print_exc()
            return None, 0.0
    
    def batch_embed(self, audio_files: list, bot_id: str, output_dir: str) -> int:
        """
        Ugrađuje watermark u više audio fajlova odjednom.
        
        Args:
            audio_files: Lista putanja do audio fajlova
            bot_id: ID bota
            output_dir: Direktorijum za output fajlove
            
        Returns:
            Broj uspešno procesiranih fajlova
        """
        import os
        os.makedirs(output_dir, exist_ok=True)
        
        success_count = 0
        for audio_file in audio_files:
            filename = os.path.basename(audio_file)
            output_path = os.path.join(output_dir, f"wm_{filename}")
            
            if self.embed_watermark(audio_file, bot_id, output_path):
                success_count += 1
        
        print(f"\nBatch embedding completed: {success_count}/{len(audio_files)} successful")
        return success_count


class BlockchainVerifier:
    """
    Helper klasa za verifikaciju bot ID-eva kroz blockchain.
    
    Integriše se sa ModelRegistry smart contract-om.
    """
    
    def __init__(self, contract_address: str, provider_url: str, abi: list = None):
        """
        Args:
            contract_address: Adresa ModelRegistry smart contract-a
            provider_url: RPC URL za blockchain (npr. Infura, Alchemy, ili eth-tester://embedded)
            abi: Contract ABI (učitava se iz deployment_info.json ako nije prosleđen)
        """
        from web3 import Web3
        import json
        
        self.contract_address = contract_address
        self.provider_url = provider_url
        
        # Konektuj se na blockchain (eth-tester ili HTTP)
        if provider_url == 'eth-tester://embedded':
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
        
        print(f"✓ Connected to ModelRegistry at {contract_address}")
    
    def register_bot(self, bot_id: str, owner: str, wm_spec_hash: str = None, uri: str = "") -> str:
        """
        Registruje novi bot ID na blockchain.
        
        Args:
            bot_id: Jedinstveni ID bota (hex string)
            owner: Ethereum adresa vlasnika
            wm_spec_hash: Hash watermark specifikacije (opciono)
            uri: Metadata URI (opciono)
            
        Returns:
            Transaction hash
        """
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
        
        # Pošalji transakciju
        tx_hash = self.contract.functions.registerModel(
            bot_id_bytes,
            wm_spec_hash,
            uri
        ).transact({'from': self.w3.to_checksum_address(owner)})
        
        # Čekaj potvrdu
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        
        return tx_hash.hex()
    
    def verify_bot_id(self, bot_id: str) -> dict:
        """
        Verifikuje da li je bot ID registrovan na blockchain-u.
        
        Args:
            bot_id: ID bota za proveru
            
        Returns:
            Dict sa informacijama o botu
        """
        # Konvertuj bot_id u bytes32
        if bot_id.startswith('0x'):
            bot_id_bytes = bytes.fromhex(bot_id[2:].ljust(64, '0')[:64])
        else:
            bot_id_bytes = bytes.fromhex(bot_id.ljust(64, '0')[:64])
        
        try:
            # Pozovi getModel funkciju
            model = self.contract.functions.getModel(bot_id_bytes).call()
            
            # Model tuple: (owner, status, wmSpecHash, uri, createdAt)
            owner = model[0]
            status = model[1]
            uri = model[3]
            created_at = model[4]
            
            # Proveri da li postoji (owner != zero address)
            exists = owner != '0x0000000000000000000000000000000000000000'
            
            return {
                'exists': exists,
                'owner': owner,
                'status': 'ACTIVE' if status == 1 else ('REVOKED' if status == 2 else 'UNKNOWN'),
                'created_at': created_at,
                'uri': uri
            }
        except Exception as e:
            # Ako ne može da kontaktira contract, vrati not exists
            print(f"Warning: Could not verify bot on blockchain: {e}")
            return {
                'exists': False,
                'owner': '0x0000000000000000000000000000000000000000',
                'status': 'UNKNOWN',
                'created_at': 0,
                'uri': ''
            }
    
    def get_all_registered_bots(self) -> list:
        """
        Dohvata sve registrovane bot ID-eve sa blockchain-a.
        
        Koristi event log-ove (ModelRegistered) za efikasno skeniranje.
        
        Returns:
            Lista bot ID-eva (hex stringovi)
        """
        # Dohvati sve ModelRegistered event-e
        events = self.contract.events.ModelRegistered.get_logs(fromBlock=0)
        
        # Ekstraktuj modelId iz svakog event-a
        bot_ids = []
        for event in events:
            model_id = event['args']['modelId']
            # Konvertuj bytes32 u hex string
            bot_id_hex = '0x' + model_id.hex()
            bot_ids.append(bot_id_hex)
        
        return bot_ids
    
    def revoke_bot(self, bot_id: str, owner: str) -> str:
        """
        Revokuje (deaktivira) bot ID.
        
        Args:
            bot_id: ID bota
            owner: Vlasnik koji revokuje
            
        Returns:
            Transaction hash
        """
        # Konvertuj bot_id u bytes32
        if bot_id.startswith('0x'):
            bot_id_bytes = bytes.fromhex(bot_id[2:].ljust(64, '0')[:64])
        else:
            bot_id_bytes = bytes.fromhex(bot_id.ljust(64, '0')[:64])
        
        # Status 2 = REVOKED
        tx_hash = self.contract.functions.setStatus(
            bot_id_bytes,
            2
        ).transact({'from': self.w3.to_checksum_address(owner)})
        
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        return tx_hash.hex()


# ============================================================================
# PRIMERI KORIŠĆENJA
# ============================================================================

def example_usage():
    """Demonstracija osnovnih funkcionalnosti sa realnim audio fajlom"""
    
    # 1. Inicijalizuj watermarker
    watermarker = AudioWatermarker(sample_rate=16000, nbits=16)
    
    # 2. Definiši bot ID (ovaj bi bio registrovan na blockchain-u)
    bot_id = "0x1234567890abcdef1234567890abcdef12345678"
    
    # 3. Ugradi watermark u postojeći audio fajl
    print("\n=== EMBEDDING WATERMARK ===")
    watermarker.embed_watermark(
        audio_path="1.wav",
        bot_id=bot_id,
        output_path="1_watermarked.wav"
    )
    
    # 4. Kasnije, detektuj watermark iz audio fajla
    print("\n=== DETECTING WATERMARK ===")
    
    # Lista svih mogućih bot-ova (ovo bi se dohvatilo sa blockchain-a)
    all_bot_ids = [
        "0x1234567890abcdef1234567890abcdef12345678",
        "0xabcdef1234567890abcdef1234567890abcdef12",
        "0x7890abcdef1234567890abcdef1234567890abcd"
    ]
    
    detected_bot, confidence = watermarker.detect_watermark(
        audio_path="1_watermarked.wav",
        candidate_bot_ids=all_bot_ids
    )
    
    if detected_bot:
        print(f"\n✓ Audio je generisan od bota: {detected_bot}")
        print(f"  Confidence: {confidence:.2%}")
        
        # 5. Verifikuj kroz blockchain
        # verifier = BlockchainVerifier(
        #     contract_address="0x...",
        #     provider_url="https://..."
        # )
        # bot_info = verifier.verify_bot_id(detected_bot)
        # print(f"  Owner: {bot_info['owner']}")
        # print(f"  Status: {bot_info['status']}")





if __name__ == "__main__":
    print("""
    ═══════════════════════════════════════════════════════════
    Audio Watermarking System za AI Botove (AudioSeal)
    ═══════════════════════════════════════════════════════════
    
    Koristi Meta AudioSeal - napredni neuralni model za audio watermarking
    
    Ovaj sistem omogućava:
    • Ugrađivanje jedinstvenog ID-a bota u audio zapise
    • Detekciju watermark-a i identifikaciju bota
    • Blockchain verifikaciju registrovanih botova
    • Visoka robusnost na kompresiju i modifikacije
    
    Za korišćenje, importuj klasu:
        from model_wotermarking import AudioWatermarker
    
    Za primere pogledaj example_usage() funkciju.
    ═══════════════════════════════════════════════════════════
    """)
    
    # Odkomentiraj za testiranje:
    # example_usage()
