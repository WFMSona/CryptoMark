// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  ModelRegistry: minimalni on-chain registar "modelId" vrednosti.

  Šta čuva?
    - modelId (bytes32) -> Model struct:
        owner       : ko je registrovao taj modelId (kompanija/wallet)
        status      : 1=ACTIVE, 2=REVOKED
        wmSpecHash  : hash verzije watermark/detektora (da znaš koja šema važi)
        uri         : metadata link (ipfs://... ili https://...)
        createdAt   : timestamp registracije

  Zašto bytes32?
    - fiksna dužina, jeftin storage, lako poređenje, tipično za hash ID-eve.
*/

contract ModelRegistry {
    // Konstantne vrednosti statusa (čisto da ne koristiš "magijske brojeve")
    uint8 public constant ACTIVE = 1;
    uint8 public constant REVOKED = 2;

    // Model = zapis o jednom modelId-u
    struct Model {
        address owner;
        uint8 status;
        bytes32 wmSpecHash;
        string uri;
        uint64 createdAt;
    }

    // mapping je on-chain "hash mapa": modelId -> Model
    mapping(bytes32 => Model) public models;

    // Event-i su "logovi" koji se lako prate (UI/indekseri/backendi)
    event ModelRegistered(bytes32 indexed modelId, address indexed owner, bytes32 wmSpecHash);
    event ModelStatusChanged(bytes32 indexed modelId, uint8 status);

    /*
      registerModel:
        - upisuje novi modelId u registar
        - može samo jednom za dati modelId (ne sme duplikat)
        - owner postaje msg.sender (onaj ko šalje tx)
    */
    function registerModel(bytes32 modelId, bytes32 wmSpecHash, string calldata uri) external {
        // ako owner == 0x0 znači da još nije registrovan
        require(models[modelId].owner == address(0), "already registered");

        models[modelId] = Model({
            owner: msg.sender,
            status: ACTIVE,
            wmSpecHash: wmSpecHash,
            uri: uri,
            createdAt: uint64(block.timestamp)
        });

        emit ModelRegistered(modelId, msg.sender, wmSpecHash);
    }

    /*
      setStatus:
        - menja status postojećeg modela (ACTIVE <-> REVOKED)
        - može samo owner (kompanija koja ga je registrovala)
        - tipično se koristi za revocation kad watermark/ID procure ili želite rotaciju
    */
    function setStatus(bytes32 modelId, uint8 status) external {
        require(models[modelId].owner == msg.sender, "not owner");
        require(status == ACTIVE || status == REVOKED, "bad status");

        models[modelId].status = status;
        emit ModelStatusChanged(modelId, status);
    }

    /*
      getModel:
        - read-only funkcija (view)
        - vraća ceo struct za dati modelId
        - ovo će APK/server koristiti da proveri owner + status
    */
    function getModel(bytes32 modelId) external view returns (Model memory) {
        return models[modelId];
    }
}
