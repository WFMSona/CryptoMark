# CryptoMark

CryptoMark was built during the **Garaža Hackathon (Belgrade, Serbia | 12–14 Dec 2025)**.

As generative audio tools and voice agents become easier to deploy, it’s also becoming easier to copy, remix, and redistribute synthetic content without attribution or control. CryptoMark explores a practical way to add **traceability** to AI-generated audio by combining:

- **Watermarking** for embedding unique IDs into generated audio/agent outputs  
- **Detection & verification** tooling to check whether a watermark is present and recover its ID  
- **Blockchain anchoring** to make watermark IDs tamper-evident and auditable (proving when an ID existed and who registered it)

The goal is to provide an integration-friendly layer for audio GenAI companies and developers: watermark at generation time, detect downstream, and optionally verify provenance through an on-chain record.

> Status: Hackathon prototype — APIs, architecture, and security assumptions are evolving.

