## Data Wallet Marketplace (AIR Kit) — Starter Kit

Privacy-preserving data monetization: users hold credentials in an AIR Kit wallet and rent out zero-knowledge proofs of attributes to buyers. Buyers deposit funds into escrow; upon proof verification, payouts are released to users and the platform takes a fee.

### Architecture
```
+----------------+        +----------------+        +------------------+
|   Buyer Portal |  --->  |  Marketplace   |  --->  |  AIR Kit Widget  |
| (UI / API)     |        |  Backend (API) |        | (embedded in UI) |
+----------------+        +----------------+        +--------+---------+
       |                         |                         |
       |  deposit funds          |  verify proof / nonce   |
       v                         |<------------------------|
+----------------+        +----------------+        +------------------+
|  Escrow Smart  | <------|  Verifier /    |        |   User Wallet    |
|  Contract      |  tx    |  Oracle (BE)   |        | (AIR Kit creds)  |
+----------------+        +----------------+        +------------------+
```

Flow:
- Buyer creates request with attributes, audience size, and price; backend issues `escrowId`.
- Buyer deposits funds to escrow contract (native or ERC-20).
- Users receive request via AIR Kit widget, consent, and generate a ZK proof bound to `escrowId`.
- Backend verifies the proof (via AIR Kit verify). If valid, backend releases escrow to the user (minus fee). Otherwise refunds buyer.

### Repository Layout
- `contracts/` — Solidity escrow supporting native and ERC‑20 payments
- `backend/` — Express + Ethers verifier service (AIR Kit placeholders)
- `frontend/` — Static mockups for Buyer and User flows

### Quickstart
1) Contracts
- Inspect and deploy `contracts/DataEscrow.sol` with your tool of choice (Hardhat/Foundry). Set `owner` to a multisig when possible.

Hardhat (provided):
```
cd contracts
npm install
npm run build
npm test

# Deploy to local node
npm run deploy

# Export ABI for backend
npm run export-abi
```

Deploy to Moca Chain (EVM, chainId 222888):
```
cd contracts
copy env.example .env   # or set env vars in your shell
# set MOCA_RPC, DEPLOYER_KEY, ESCROW_OWNER (optional), FEE_RECIPIENT (optional)

npx hardhat run scripts/deploy.js --network mocachain
npm run export-abi
```

2) Backend
- Copy `backend/.env.example` to `backend/.env` and fill values.
- Install and run:
```
cd backend
npm install
npm run dev
```

3) Frontend (mock)
```
open frontend/public/index.html
```

### Environment (backend)
Required variables in `backend/.env`:
- `PROVIDER_URL` — JSON-RPC endpoint
- `ESCROW_ADDRESS` — deployed escrow contract
- `ORACLE_PRIVATE_KEY` — signer that is `owner` of escrow (use multisig relaying in prod)
- `AIR_KIT_VERIFY_ENDPOINT` — your verification endpoint or SDK bridge
- `AIR_KIT_KEY` — API key/token for AIR Kit verify (if applicable)

### API (backend)
- `POST /proof-callback`
  - body: `{ escrowId, proof, userAddress, attributes }`
  - verifies proof (bound to `escrowId`), then calls `release(escrowId)` or `refund(escrowId)`

Response examples:
```
{ "ok": true, "released": true, "txHash": "0x..." }
{ "ok": false, "refunded": true, "txHash": "0x...", "error": "proof invalid" }
```

### Security Checklist
- Nonce binding: include `escrowId` in proof to prevent replay
- Owner ops: use multisig (Gnosis Safe) for escrow ownership
- Reentrancy guards and SafeERC20 usage
- Unit tests and static analysis before mainnet

### License
MIT for code in this repository. Review third-party licenses separately.


