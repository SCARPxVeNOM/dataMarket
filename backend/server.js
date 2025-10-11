import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const {
  PROVIDER_URL,
  ESCROW_ADDRESS,
  ORACLE_PRIVATE_KEY,
  AIR_KIT_VERIFY_ENDPOINT,
  AIR_KIT_KEY,
  PARTNER_ID
} = process.env;

// Load private key for JWT signing
const privateKey = fs.readFileSync('../contracts/private.key', 'utf8');

const ESCROW_ABI = [
  // minimal ABI for release/refund
  "function release(bytes32 id) external",
  "function refund(bytes32 id) external"
];

if (!PROVIDER_URL || !ESCROW_ADDRESS || !ORACLE_PRIVATE_KEY) {
  console.error('Missing env vars. Please set PROVIDER_URL, ESCROW_ADDRESS, ORACLE_PRIVATE_KEY.');
  process.exit(1);
}

const app = express();
app.use(express.json());

const provider = new JsonRpcProvider(PROVIDER_URL);
const signer = new Wallet(ORACLE_PRIVATE_KEY, provider);
const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);

// Generate Partner JWT for AIR Kit authentication
function generatePartnerJWT(additionalClaims = {}) {
  const payload = {
    partnerId: PARTNER_ID || '61f6379f-9145-4da8-a2d7-f6628343601c',
    exp: Math.floor(Date.now() / 1000) + 5 * 60, // 5 minutes expiry
    iat: Math.floor(Date.now() / 1000),
    ...additionalClaims
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: {
      kid: 'data-market-key-1'
    }
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, network: PROVIDER_URL?.slice(0, 20) + '...' });
});

// Endpoint to get Partner JWT for frontend
app.get('/auth-token', (_req, res) => {
  try {
    const token = generatePartnerJWT();
    res.json({ authToken: token });
  } catch (err) {
    console.error('JWT generation error:', err);
    res.status(500).json({ error: 'Failed to generate auth token' });
  }
});

// Callback after user joins data farming and AIR Kit returns a proof
app.post('/proof-callback', async (req, res) => {
  try {
    const { escrowId, proof, userAddress, attributes, farmingSession } = req.body || {};
    if (!escrowId || !proof || !userAddress) {
      return res.status(400).json({ ok: false, error: 'missing fields' });
    }

    // Verify proof via AIR Kit (placeholder). Ensure escrowId is included (nonce binding)
    let ok = false;
    if (AIR_KIT_VERIFY_ENDPOINT) {
      const verifyResp = await fetch(AIR_KIT_VERIFY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AIR_KIT_KEY ? { 'Authorization': `Bearer ${AIR_KIT_KEY}` } : {})
        },
        body: JSON.stringify({ proof, escrowId, userAddress, attributes })
      });
      const verifyJson = await verifyResp.json();
      ok = !!verifyJson?.ok;
    } else {
      // For local dev, accept any proof-shaped object WITH escrowId binding.
      ok = typeof proof === 'object' && !!escrowId;
    }

    if (!ok) {
      // Refund buyer on failed verification
      const tx = await escrow.refund(escrowId);
      const receipt = await tx.wait();
      return res.status(400).json({ ok: false, refunded: true, txHash: receipt?.hash });
    }

    // Release funds to user
    const tx = await escrow.release(escrowId);
    const receipt = await tx.wait();
    return res.json({ ok: true, released: true, txHash: receipt?.hash });
  } catch (err) {
    console.error('proof-callback error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Data farming session management
app.post('/farming-session', async (req, res) => {
  try {
    const { userId, dataType, duration, rewardRate, dataFields } = req.body || {};
    
    if (!userId || !dataType || !duration || !rewardRate) {
      return res.status(400).json({ ok: false, error: 'missing farming parameters' });
    }

    // Create farming session with AIR Kit credentials
    const farmingSession = {
      sessionId: 'farm_' + Date.now(),
      userId,
      dataType,
      duration: parseInt(duration),
      rewardRate: parseInt(rewardRate),
      dataFields: JSON.parse(dataFields || '{}'),
      startTime: new Date().toISOString(),
      status: 'active',
      totalRewards: 0
    };

    // Store session (in production, use database)
    console.log('Farming session created:', farmingSession);
    
    return res.json({ 
      ok: true, 
      farmingSession,
      message: 'Data farming session started successfully'
    });
  } catch (err) {
    console.error('farming-session error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Daily farming rewards calculation
app.post('/farming-rewards', async (req, res) => {
  try {
    const { sessionId, userAddress, dailyActivity } = req.body || {};
    
    if (!sessionId || !userAddress) {
      return res.status(400).json({ ok: false, error: 'missing session parameters' });
    }

    // Calculate daily rewards based on activity and data quality
    const baseReward = 10; // Base MOCA tokens per day
    const activityMultiplier = Math.min(dailyActivity || 1, 3); // Max 3x multiplier
    const dailyReward = baseReward * activityMultiplier;

    // In production, this would interact with Moca Chain for token distribution
    const rewardTx = {
      hash: '0x' + Math.random().toString(16).substr(2, 64),
      amount: dailyReward,
      token: 'MOCA',
      timestamp: new Date().toISOString()
    };

    return res.json({ 
      ok: true, 
      dailyReward,
      rewardTx,
      message: `Earned ${dailyReward} MOCA tokens for today's farming activity`
    });
  } catch (err) {
    console.error('farming-rewards error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Verifier listening on :${port}`);
});


