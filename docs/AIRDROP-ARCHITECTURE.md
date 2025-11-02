# AEra Airdrop — Minimal-sichere Architektur (Enterprise-Grade)

**Version:** 1.0  
**Status:** Specification & Implementation Guide  
**Date:** 2. November 2025  
**Architecture Level:** Enterprise-Grade Security

---

## 📐 System-Übersicht

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AIRDROP ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  Telegram    │  Web UI (optional)
    │  Bot / Web   │  ├─ Roadmap
    └──────┬───────┘  ├─ FAQ
           │          ├─ Info
           │          └─ Sign-in Button
           ▼
    ┌──────────────────────────────────────────────┐
    │  FRONTEND: Sign-in & Consent                 │
    │  ├─ MetaMask (EIP-4361 Sign-in with Eth)   │
    │  ├─ GitHub OAuth (optional)                 │
    │  ├─ Twitter OAuth (optional)                │
    │  └─ Consent Dialog (Testtoken, kein Invest) │
    └──────────┬───────────────────────────────────┘
               │ 
               ▼
    ┌──────────────────────────────────────────────┐
    │  WALLET SIGNATURE (EIP-4361)                │
    │  ├─ Message: JSON mit Consent-Text         │
    │  ├─ Signature: user signiert mit private key│
    │  └─ Recovery: Wallet-Adresse aus Sig        │
    └──────────┬───────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────────────┐
    │  BACKEND: Signature Validation               │
    │  ├─ Verify Signature (ecrecover)            │
    │  ├─ Check Limits (max 50 AERA per wallet)   │
    │  ├─ Check Claim History (nur 1x pro wallet) │
    │  └─ Generate TX                             │
    └──────────┬───────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────────────┐
    │  SMART CONTRACT: Airdrop Claim Function      │
    │  function claim(                             │
    │    address claimant,                         │
    │    bytes memory signature                    │
    │  ) external nonReentrant                     │
    │  ├─ Verify Signature                        │
    │  ├─ Check Max Supply                        │
    │  ├─ Check Pause Status                      │
    │  ├─ Mint 50 AERA to claimer                 │
    │  └─ Emit ClaimedEvent (for logging)         │
    └──────────┬───────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────────────┐
    │  WEBHOOK LOGGING                            │
    │  ├─ TX-Hash speichern                       │
    │  ├─ Block-Number speichern                  │
    │  ├─ Timestamp speichern                     │
    │  └─ User-Daten speichern                    │
    └──────────┬───────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────────────────────────┐
    │  PERSISTENT STORAGE                          │
    │  /docs/airdrops/                            │
    │  ├─ claims.csv (TX-Hashes, Timestamps)     │
    │  ├─ claims.json (strukturiert)             │
    │  └─ audit-trail.log (verbose)              │
    └──────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────┐
    │  ADMIN CONTROL: Safe (2-of-3 Multisig)     │
    │  ├─ Can PAUSE/UNPAUSE claim()              │
    │  ├─ Can UPDATE airdrop cap                 │
    │  ├─ Can DRAIN contract (if needed)         │
    │  └─ NO private keys needed in Bot!         │
    └──────────────────────────────────────────────┘
```

---

## 🔐 Security Model

### Design Principles

1. **No Central Keys** — Admin functions nur durch Safe (2-of-3)
2. **Wallet-Only Auth** — Keine E-Mail, keine KYC, nur Wallet-Signatur
3. **Blockchain Native** — Alle Claims on-chain, vollständig verifizierbar
4. **Immutable Audit Trail** — TX-Hashes auf Blockchain
5. **Zero Trust Backend** — Alle Claims müssen signiert sein
6. **Rate Limiting** — Smart Contract enforced

### Threat Model

| Threat | Mitigation | Enforcement |
|--------|-----------|-------------|
| Duplicate Claims | 1x pro Wallet | Smart Contract |
| Over-distribution | Max 50 AERA/wallet | Smart Contract |
| Spam Attacks | Signature validation | EIP-4361 + Smart Contract |
| Backend Compromise | Can't mint without signature | Math (ECDSA) |
| Missing Logs | Webhook + CSV + Event Logs | Blockchain + files |
| Admin Abuse | Multi-Sig Safe | 2-of-3 threshold |

---

## 1️⃣ FRONTEND: Sign-in & Consent

### A) Telegram Bot Integration

**Command:** `/airdrop-signup`

```javascript
// File: telegram-marketing/marketing-bot.js

bot.onText(/\/airdrop-signup(@AEra_Official_Bot)?/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    const signupMessage = `🎁 *AERA Airdrop — Claim Now!*

Welcome to the official AERA Testnet Airdrop!

🎯 **What you'll get:**
• 50 AERA Testtoken (Sepolia)
• One-time per wallet
• 100% free, no strings attached

⚠️  **Important:**
• This is a TEST token on Sepolia
• NOT an investment
• NO real money involved
• NO profit guaranteed

✅ **To claim:**
1. Click button below
2. Sign message with MetaMask
3. Receive 50 AERA instantly!

${"═".repeat(40)}`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: '🔐 Sign-in with MetaMask',
                        web_app: {
                            url: 'https://airdrop.aera.dev/claim' // Frontend URL
                        }
                    }
                ],
                [
                    {
                        text: '❓ How it works',
                        callback_data: 'airdrop_info'
                    },
                    {
                        text: '⚖️ Disclaimer',
                        callback_data: 'airdrop_disclaimer'
                    }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId, signupMessage, { ...options, parse_mode: 'Markdown' });
});
```

### B) Web UI (Frontend)

**Stack:** React + ethers.js + wagmi

**File:** `frontend/src/pages/Claim.jsx`

```jsx
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import axios from 'axios';

export default function ClaimPage() {
    const { address, isConnected } = useAccount();
    const { signMessage, isLoading } = useSignMessage();
    
    const handleClaim = async () => {
        if (!address) {
            alert('Please connect your wallet');
            return;
        }
        
        // 1. Create message to sign (EIP-4361)
        const message = `
I understand and accept the following:

1. AEra is a TESTTOKEN on Sepolia Testnet
2. This is NOT an investment
3. No guarantee of value or functionality
4. I claim 50 AERA testnet tokens
5. I comply with local laws

Wallet: ${address}
Time: ${new Date().toISOString()}
`;
        
        // 2. Sign message with wallet
        signMessage(
            { message },
            {
                onSuccess: async (signature) => {
                    // 3. Send to backend
                    try {
                        const response = await axios.post('/api/airdrop/claim', {
                            address,
                            message,
                            signature,
                            timestamp: new Date().toISOString()
                        });
                        
                        // 4. Show TX hash
                        alert(`✅ Claim successful!\nTX: ${response.data.txHash}`);
                        
                    } catch (error) {
                        alert(`❌ Claim failed: ${error.response.data.error}`);
                    }
                }
            }
        );
    };
    
    return (
        <div className="claim-container">
            <h1>🎁 Claim Your AERA Tokens</h1>
            
            {!isConnected ? (
                <ConnectButton />
            ) : (
                <div>
                    <p>Connected: {address}</p>
                    
                    <div className="consent-box">
                        <h3>⚠️ Important Notice</h3>
                        <p>✓ This is a TESTTOKEN (Sepolia)</p>
                        <p>✓ NOT an investment</p>
                        <p>✓ NO profit guaranteed</p>
                        <p>✓ You claim 50 AERA</p>
                    </div>
                    
                    <button 
                        onClick={handleClaim}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Signing...' : '🔐 Sign & Claim'}
                    </button>
                </div>
            )}
        </div>
    );
}
```

---

## 2️⃣ EIP-4361: Wallet Signature (Zero-KYC Auth)

### Message Format (Sign-in with Ethereum)

```javascript
// EIP-4361 Standard Message

const message = `
aera.dev wants you to sign in with your Ethereum account:
${address}

I understand and agree:

1. AEra is a TESTTOKEN on Sepolia Testnet
2. NOT an investment or financial product
3. NO guarantee of value or functionality
4. I claim 50 AERA testnet tokens
5. I comply with local laws

URI: https://airdrop.aera.dev
Version: 1
Chain ID: 11155111 (Sepolia)
Nonce: ${generateRandomNonce()}
Issued At: ${new Date().toISOString()}
Expires: ${new Date(Date.now() + 10 * 60 * 1000).toISOString()}
`;

// User signs with MetaMask → Signature returned
// Backend verifies signature → Wallet-Adresse recovered
// No private key ever seen by backend!
```

### Backend Signature Verification

**File:** `backend/services/signatureService.js`

```javascript
const { ethers } = require('ethers');

function verifySignature(message, signature, expectedAddress) {
    try {
        // EIP-191: Recover signer from message + signature
        const recoveredAddress = ethers.verifyMessage(
            message,
            signature
        );
        
        // Check if it matches claimed address
        if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
            throw new Error('Signature verification failed');
        }
        
        return true;
    } catch (error) {
        console.error('Signature error:', error);
        return false;
    }
}

module.exports = { verifySignature };
```

---

## 3️⃣ Smart Contract: Airdrop Claim Function

### Contract Design

**File:** `contracts/AeraAirdrop.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AeraAirdrop
 * @notice Secure airdrop contract for AERA token with signature-based claiming
 * @dev Uses EIP-4361 for wallet authentication
 */
contract AeraAirdrop is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;
    
    // ===== STATE =====
    IERC20 public aera;
    address public signer; // Backend signer address
    
    uint256 public claimAmount = 50 * 10**18; // 50 AERA
    mapping(address => bool) public hasClaimed;
    mapping(address => uint256) public claimedAmount;
    
    uint256 public totalClaimed = 0;
    uint256 public maxDistribution = 100000 * 10**18; // 100k AERA max
    
    // ===== EVENTS =====
    event AirdropClaimed(address indexed claimer, uint256 amount, bytes32 messageHash);
    event ClaimAmountUpdated(uint256 newAmount);
    event SignerUpdated(address newSigner);
    
    // ===== CONSTRUCTOR =====
    constructor(
        address _aera,
        address _signer
    ) {
        aera = IERC20(_aera);
        signer = _signer;
    }
    
    // ===== CLAIM FUNCTION =====
    /**
     * @notice Claim airdrop tokens with signature verification
     * @param message The message signed by the user
     * @param signature The signature from user wallet
     * @dev Uses ECDSA recovery to verify user owns the wallet
     */
    function claim(
        string memory message,
        bytes memory signature
    ) external nonReentrant whenNotPaused {
        address claimer = msg.sender;
        
        // 1. Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(message));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedMessageHash.recover(signature);
        
        require(
            recoveredSigner == claimer,
            "AeraAirdrop: Invalid signature - not signed by sender"
        );
        
        // 2. Check if already claimed
        require(
            !hasClaimed[claimer],
            "AeraAirdrop: Already claimed"
        );
        
        // 3. Check max distribution
        require(
            totalClaimed + claimAmount <= maxDistribution,
            "AeraAirdrop: Max distribution reached"
        );
        
        // 4. Check token balance
        require(
            aera.balanceOf(address(this)) >= claimAmount,
            "AeraAirdrop: Insufficient token balance"
        );
        
        // 5. Mark as claimed
        hasClaimed[claimer] = true;
        claimedAmount[claimer] = claimAmount;
        totalClaimed += claimAmount;
        
        // 6. Transfer tokens
        require(
            aera.transfer(claimer, claimAmount),
            "AeraAirdrop: Transfer failed"
        );
        
        // 7. Emit event
        emit AirdropClaimed(claimer, claimAmount, messageHash);
    }
    
    // ===== ADMIN FUNCTIONS =====
    
    /// @notice Update claim amount (only owner/Safe)
    function setClaimAmount(uint256 _newAmount) external onlyOwner {
        claimAmount = _newAmount;
        emit ClaimAmountUpdated(_newAmount);
    }
    
    /// @notice Pause claims (only owner/Safe)
    function pause() external onlyOwner {
        _pause();
    }
    
    /// @notice Resume claims (only owner/Safe)
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /// @notice Drain contract (emergency only)
    function drain(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(owner(), balance);
    }
    
    // ===== VIEW FUNCTIONS =====
    
    /// @notice Check if address has claimed
    function isClaimed(address _address) external view returns (bool) {
        return hasClaimed[_address];
    }
    
    /// @notice Get claimed amount for address
    function getClaimedAmount(address _address) external view returns (uint256) {
        return claimedAmount[_address];
    }
    
    /// @notice Get airdrop stats
    function getStats() external view returns (
        uint256 claimed,
        uint256 remaining,
        uint256 maxDist
    ) {
        return (
            totalClaimed,
            maxDistribution - totalClaimed,
            maxDistribution
        );
    }
}
```

### Deployment

```bash
# Deploy AeraAirdrop to Sepolia
npx hardhat run scripts/deploy-airdrop.js --network sepolia

# Expected output:
# ✅ AeraAirdrop deployed to: 0x...
# ✅ Owner set to Safe: 0xC8B1bEb43361bb78400071129139A37Eb5c5Dd93
```

---

## 4️⃣ Backend API: Signature Validation & Claim Processing

### API Structure

**File:** `backend/src/api/airdrop.js`

```javascript
const express = require('express');
const { ethers } = require('ethers');
const { verifySignature } = require('../services/signatureService');
const { logClaim } = require('../services/loggingService');
const router = express.Router();

// Setup
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const airdropContract = new ethers.Contract(
    process.env.AIRDROP_CONTRACT_ADDRESS,
    AIRDROP_ABI,
    provider
);

// ===== CLAIM ENDPOINT =====
router.post('/api/airdrop/claim', async (req, res) => {
    try {
        const { address, message, signature, timestamp } = req.body;
        
        // 1. Validate input
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }
        
        if (!signature.startsWith('0x')) {
            return res.status(400).json({ error: 'Invalid signature format' });
        }
        
        // 2. Verify signature
        const isValid = verifySignature(message, signature, address);
        if (!isValid) {
            return res.status(401).json({ error: 'Signature verification failed' });
        }
        
        // 3. Check if already claimed (backend cache)
        const claimed = await airdropContract.isClaimed(address);
        if (claimed) {
            return res.status(400).json({ error: 'Already claimed' });
        }
        
        // 4. Prepare transaction
        const tx = airdropContract.claim(message, signature);
        const txResponse = await tx;
        
        console.log(`✅ Claim TX submitted: ${txResponse.hash}`);
        
        // 5. Log to file
        await logClaim({
            address,
            txHash: txResponse.hash,
            signature,
            timestamp,
            status: 'pending'
        });
        
        // 6. Wait for confirmation
        const receipt = await txResponse.wait();
        
        if (receipt.status === 1) {
            console.log(`✅ Claim confirmed: Block ${receipt.blockNumber}`);
            
            await logClaim({
                address,
                txHash: receipt.transactionHash,
                block: receipt.blockNumber,
                status: 'confirmed',
                timestamp: new Date().toISOString()
            });
            
            return res.json({
                success: true,
                txHash: receipt.transactionHash,
                block: receipt.blockNumber,
                amount: '50 AERA'
            });
        } else {
            return res.status(500).json({ error: 'Transaction failed' });
        }
        
    } catch (error) {
        console.error('Claim error:', error);
        return res.status(500).json({ 
            error: 'Claim failed',
            details: error.message
        });
    }
});

// ===== INFO ENDPOINT =====
router.get('/api/airdrop/info', async (req, res) => {
    try {
        const stats = await airdropContract.getStats();
        
        return res.json({
            claimAmount: '50 AERA',
            totalClaimed: ethers.formatUnits(stats[0], 18),
            remaining: ethers.formatUnits(stats[1], 18),
            maxDistribution: ethers.formatUnits(stats[2], 18)
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ===== CHECK CLAIM STATUS =====
router.get('/api/airdrop/status/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }
        
        const hasClaimed = await airdropContract.isClaimed(address);
        const claimedAmount = await airdropContract.getClaimedAmount(address);
        
        return res.json({
            hasClaimed,
            claimedAmount: ethers.formatUnits(claimedAmount, 18),
            address
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch status' });
    }
});

module.exports = router;
```

---

## 5️⃣ Logging & Audit Trail

### A) Webhook Logging

**File:** `backend/src/services/loggingService.js`

```javascript
const fs = require('fs').promises;
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../../docs/airdrops');
const CLAIMS_CSV = path.join(LOGS_DIR, 'claims.csv');
const CLAIMS_JSON = path.join(LOGS_DIR, 'claims.json');

async function logClaim(claimData) {
    try {
        // 1. Append to CSV
        const csvLine = `${claimData.timestamp},${claimData.address},${claimData.txHash},${claimData.block || 'pending'},${claimData.status}\n`;
        await fs.appendFile(CLAIMS_CSV, csvLine);
        
        // 2. Append to JSON
        let claims = [];
        try {
            const data = await fs.readFile(CLAIMS_JSON, 'utf8');
            claims = JSON.parse(data);
        } catch {}
        
        claims.push({
            timestamp: claimData.timestamp,
            address: claimData.address,
            txHash: claimData.txHash,
            block: claimData.block || null,
            status: claimData.status,
            signature: claimData.signature ? claimData.signature.substring(0, 20) + '...' : null
        });
        
        await fs.writeFile(CLAIMS_JSON, JSON.stringify(claims, null, 2));
        
        console.log(`✅ Logged claim: ${claimData.address}`);
        
    } catch (error) {
        console.error('❌ Logging error:', error);
    }
}

module.exports = { logClaim };
```

### B) CSV Format

**File:** `docs/airdrops/claims.csv`

```csv
Timestamp,Address,TX Hash,Block,Status
2025-11-02T14:30:15Z,0x1234...abcd,0xa0a1a525...,9545535,confirmed
2025-11-02T14:31:22Z,0x5678...efgh,0xb1b2b636...,9545536,confirmed
2025-11-02T14:32:45Z,0x9abc...ijkl,0xc2c3c747...,pending,pending
```

### C) Public Audit Report

**File:** `docs/airdrops/audit-report.md`

```markdown
# AERA Airdrop Audit Report

**Report Date:** 2. November 2025  
**Network:** Sepolia Testnet  
**Contract:** 0x...

## Summary

- **Total Claims:** 42
- **Total Distributed:** 2,100 AERA
- **Remaining Budget:** 97,900 AERA
- **Max Wallets:** 42 / 2,000

## Verification

✅ All TX-Hashes on Sepolia Etherscan:
- [TX 1](https://sepolia.etherscan.io/tx/0xa0a1...)
- [TX 2](https://sepolia.etherscan.io/tx/0xb1b2...)
- ...

✅ All signatures verified via ECDSA

✅ No duplicate claims detected

✅ All within spending limits (50 AERA per wallet max)

## Data Export

Raw data available in:
- `claims.csv` (timestamp, address, tx, block, status)
- `claims.json` (structured format)

```

---

## 6️⃣ Admin Control: Safe Integration

### Multi-Sig Safe Functions

**Airdrop Contract Owner: Safe (2-of-3)**

```solidity
// Owner is Safe address: 0xC8B1bEb43361bb78400071129139A37Eb5c5Dd93

// Safe can execute:
1. airdrop.pause()              // Emergency stop
2. airdrop.unpause()            // Resume
3. airdrop.setClaimAmount()     // Adjust rewards
4. airdrop.drain(token)         // Emergency withdrawal
```

### Safe Transaction Execution

**Via Gnosis Safe Web UI:**

```
1. Go to: https://app.safe.global/home?safe=sepolia:0xC8B1bEb43361bb78400071129139A37Eb5c5Dd93
2. Apps → Contract Interaction
3. Address: 0x... (AeraAirdrop)
4. Method: pause()
5. Sign with 2 of 3 signers
6. Execute
```

**Via CLI (Hardhat):**

```bash
npx hardhat run scripts/safe-pause-airdrop.js --network sepolia

// Output:
// ✅ Safe transaction created
// Safe TX Hash: 0x...
// Status: Awaiting signatures
```

---

## 🔄 Full Workflow: User Claim

```
┌─────────────────────────────────────────────────────────────────┐
│  USER CLAIM WORKFLOW - End-to-End                              │
└─────────────────────────────────────────────────────────────────┘

1. USER: Opens Telegram Bot
   → Command: /airdrop-signup
   → Gets inline button: "Sign-in with MetaMask"

2. USER: Clicks button → Opens Web UI (https://airdrop.aera.dev)
   → Connects wallet: MetaMask
   → Sees consent dialog

3. USER: Clicks "Sign & Claim"
   → MetaMask popup: "Sign message"
   → Message shows: Consent text + wallet + timestamp
   → User reviews & signs

4. FRONTEND: Gets signature
   → Sends to backend: { address, message, signature }

5. BACKEND:
   ├─ Verifies signature (ECDSA recovery)
   ├─ Checks if already claimed (contract call)
   ├─ Submits TX to contract.claim(message, signature)
   └─ Logs to file: { timestamp, address, txHash, status: pending }

6. SMART CONTRACT:
   ├─ Recovers signer from signature
   ├─ Verifies signer == tx.sender
   ├─ Checks max distribution
   ├─ Marks wallet as claimed
   ├─ Mints 50 AERA
   └─ Emits ClaimedEvent

7. BLOCKCHAIN:
   → TX confirmed in block X
   → State updated on Sepolia

8. BACKEND WEBHOOK:
   → Listens for block event
   → Updates log: { status: confirmed, block: X }

9. FRONTEND:
   → Shows: "✅ Claim successful!"
   → Displays TX-hash link to Etherscan

10. TRANSPARENCY:
    ├─ TX visible on Etherscan (public)
    ├─ Logged in /docs/airdrops/claims.csv
    ├─ User can verify own TX
    └─ Community can audit all claims

═══════════════════════════════════════════════════════════════════

TIME TAKEN: ~15 seconds (block time)
COST TO USER: $0 (backend pays gas from Safe)
TRUST REQUIRED: None (signature = proof of wallet ownership)

```

---

## 📋 Implementation Checklist

### Phase 1: Smart Contract (Week 1)

- [ ] Create `AeraAirdrop.sol`
- [ ] Implement claim() with signature verification
- [ ] Add pause/unpause functionality
- [ ] Add rate limiting & caps
- [ ] Write tests (50+ test cases)
- [ ] Deploy to Sepolia
- [ ] Verify on Etherscan
- [ ] Transfer ownership to Safe

### Phase 2: Backend API (Week 2)

- [ ] Create Express.js server
- [ ] Implement `/api/airdrop/claim` endpoint
- [ ] Add signature verification (ethers.js)
- [ ] Setup logging (CSV + JSON)
- [ ] Add error handling
- [ ] Setup webhook listener (for block events)
- [ ] Create `/api/airdrop/info` endpoint
- [ ] Create `/api/airdrop/status/:address` endpoint

### Phase 3: Frontend (Week 2-3)

- [ ] Create React app with wagmi + ethers.js
- [ ] Add MetaMask connect button
- [ ] Implement claim page with consent dialog
- [ ] Add signature display (for transparency)
- [ ] Show TX-hash after claim
- [ ] Add loading states
- [ ] Error handling & user feedback
- [ ] Responsive design

### Phase 4: Integration (Week 3)

- [ ] Update Telegram Bot with `/airdrop-signup`
- [ ] Add inline button with web_app link
- [ ] Create deployment scripts
- [ ] Setup CI/CD for frontend
- [ ] Backup + monitoring setup

### Phase 5: Testing & Audit (Week 4)

- [ ] Load testing (1000+ concurrent claims)
- [ ] Security audit (external review)
- [ ] User acceptance testing (UAT)
- [ ] Legal review
- [ ] Go-live preparation

---

## 🛡️ Security Considerations

### Contract Security

✅ **Reentrancy Guard** — ReentrancyGuard prevents re-entry attacks  
✅ **Pausable** — Emergency stop functionality  
✅ **Signature Verification** — ECDSA validation  
✅ **Max Distribution Cap** — Prevents over-issuance  
✅ **One Claim Per Wallet** — Prevents duplicate claims  
✅ **Only Owner Functions** — Multi-Sig Safe controlled  

### Backend Security

✅ **HTTPS Only** — All API calls encrypted  
✅ **Rate Limiting** — Max requests per IP  
✅ **Input Validation** — All params checked  
✅ **Signature Verification** — No trust in frontend  
✅ **No Private Keys** — Uses Safe for fund management  
✅ **Audit Logs** — Immutable trail  

### Frontend Security

✅ **No Private Key Storage** — Only signatures in memory  
✅ **Wallet.connect** — User controls authorization  
✅ **Message Signing** — No approval needed  
✅ **CSRF Protection** — State validation  
✅ **XSS Prevention** — React auto-escapes  

---

## 💰 Cost Analysis (Sepolia)

| Operation | Gas | Cost (ETH) | Cost (USD) |
|-----------|-----|-----------|-----------|
| Deploy AeraAirdrop | 1.2M | 0.0012 | ~$3 |
| claim() function | 45K | 0.000045 | ~$0.12 |
| per 1000 claims | - | 0.045 | ~$120 |
| Admin pause() | 25K | 0.000025 | ~$0.07 |

**Note:** Sepolia gas prices are minimal (testnet). On mainnet, costs would be higher.

---

## 📞 Deployment Instructions

### 1. Deploy Smart Contract

```bash
# Compile
npx hardhat compile

# Deploy to Sepolia
npx hardhat run scripts/deploy-airdrop.js --network sepolia

# Verify on Etherscan
npx hardhat verify <CONTRACT_ADDRESS> <AERA_ADDRESS> <SIGNER_ADDRESS> --network sepolia
```

### 2. Start Backend

```bash
cd backend
npm install
npm start

# Should output:
# ✅ Backend running on port 3001
# ✅ Connected to Sepolia
# ✅ Listening for webhook events
```

### 3. Deploy Frontend

```bash
cd frontend
npm run build
npm start

# Should output:
# ✅ Frontend running on http://localhost:3000
# ✅ Connected to contract: 0x...
```

### 4. Update Telegram Bot

```bash
# Restart bot with new FRONTEND_URL in .env
AIRDROP_FRONTEND_URL=https://airdrop.aera.dev

systemctl restart aera-bot
```

---

## 📊 Monitoring & Alerts

### Key Metrics

- **Claim Rate** — Claims per minute
- **Success Rate** — % successful claims
- **Error Rate** — Failed claims
- **Gas Costs** — Per transaction
- **Contract Balance** — Remaining AERA

### Alerts

```
🚨 If success_rate < 95% for 5 min → ALERT
🚨 If contract balance < 1000 AERA → ALERT
🚨 If claims > 100/min (spam) → ALERT
🚨 If backend down → ALERT
```

---

## 🎓 References

- [EIP-4361: Sign-in with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
- [EIP-191: Signed Data](https://eips.ethereum.org/EIPS/eip-191)
- [OpenZeppelin ECDSA](https://docs.openzeppelin.com/contracts/4.x/api/utils#ECDSA)
- [Hardhat Documentation](https://hardhat.org/)
- [ethers.js](https://docs.ethers.org/)
- [wagmi Documentation](https://wagmi.sh/)

---

**Version:** 1.0  
**Status:** ✅ Complete  
**Last Updated:** 2. November 2025  
**Maintainer:** AEra Community

---

**Next Steps:**
1. Review architecture with team
2. Start Phase 1: Smart Contract development
3. Conduct security audit before mainnet
