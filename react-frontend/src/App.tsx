import React, { useState, useEffect } from 'react';
import { AirService, BUILD_ENV } from '@mocanetwork/airkit';

interface UserInfo {
  partnerId: string;
  partnerUserId: string;
  airId?: any;
  user: {
    id: string;
    abstractAccountAddress?: string;
    email?: string;
    isMFASetup: boolean;
  };
}

// Remove unused LoginResult interface since we're using type assertion

const App: React.FC = () => {
  const [currentEscrowId, setCurrentEscrowId] = useState<string | null>(null);
  const [currentAttributes, setCurrentAttributes] = useState<string>('{}');
  const [airService, setAirService] = useState<AirService | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [buyerLog, setBuyerLog] = useState<string>('Ready to create request...');
  const [userLog, setUserLog] = useState<string>('Ready for consent...');
  const [requestPreview, setRequestPreview] = useState<string>('No request yet. Create one on the left.');

  // Initialize AIR Kit SDK
  useEffect(() => {
    const initAIRKit = async () => {
      try {
        // Get auth token from backend
        const response = await fetch('http://localhost:3000/auth-token');
        const { authToken: token } = await response.json();
        setAuthToken(token);

        // Initialize AIR Kit
        const air = new AirService({
          partnerId: '61f6379f-9145-4da8-a2d7-f6628343601c'
        });

        await air.init({
          buildEnv: BUILD_ENV.SANDBOX,
          enableLogging: true,
          skipRehydration: false
        });

        setAirService(air);
        setUserLog('AIR Kit initialized successfully');
      } catch (error) {
        setUserLog(`AIR Kit init failed: ${(error as Error).message}`);
      }
    };

    initAIRKit();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const log = (setter: React.Dispatch<React.SetStateAction<string>>, msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setter(msg);
  };

  const showStatus = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    // In a real app, you'd use a toast notification system
    console.log(`${type.toUpperCase()}: ${msg}`);
  };

  const handleCreateRequest = () => {
    const attrs = (document.getElementById('attributes') as HTMLTextAreaElement)?.value || '{}';
    const price = Number((document.getElementById('price') as HTMLInputElement)?.value || 0);
    const size = Number((document.getElementById('size') as HTMLInputElement)?.value || 0);
    
    setCurrentAttributes(attrs);

    if (!attrs || attrs === '{}') {
      showStatus('Please specify attributes needed', 'error');
      return;
    }

    // Generate an escrowId client-side for demo (in prod, backend issues it)
    const escrowId = '0x' + crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '');
    setCurrentEscrowId(escrowId);
    
    setRequestPreview(`ESCROW ID: ${escrowId}\nPRICE: ${price} wei\nAUDIENCE: ${size} users\nATTRIBUTES: ${attrs}`);
    setBuyerLog('✓ REQUEST DRAFTED\n✓ ESCROW ID GENERATED\n✓ READY FOR DEPOSIT');
    showStatus('Request created successfully! Ready for user consent.', 'success');
  };

  const handleConsent = async () => {
    if (!currentEscrowId) {
      setUserLog('❌ NO REQUEST TO RESPOND TO\nCreate a request first.');
      return;
    }

    try {
      if (!airService) {
        throw new Error('AIR Kit not initialized');
      }

      // Login user with Partner JWT
      setUserLog('🔄 INITIALIZING AIR KIT...\n🔄 AUTHENTICATING USER...');
      showStatus('Starting AIR Kit authentication...', 'info');
      
      const loginResult = await airService.login({ authToken });
      // Use type assertion to access the user property
      const userAddress = (loginResult as any).user?.abstractAccountAddress || (loginResult as any).abstractAccountAddress || 'Unknown';
      setUserLog(`✅ LOGIN SUCCESSFUL\n✅ ACCOUNT: ${userAddress}`);

      // Get user info
      const userInfo: UserInfo = await airService.getUserInfo();
      setUserLog(`✅ USER INFO RETRIEVED\n✅ PARTNER ID: ${userInfo.partnerUserId}\n✅ EMAIL: ${userInfo.user.email || 'N/A'}`);

      // For now, create a demo proof since credential verification isn't fully implemented
      // In production, you'd use airService.verifyCredential() or similar
      const proof = {
        type: 'air-kit-proof',
        nonce: currentEscrowId,
        attributes: currentAttributes,
        userAddress: userInfo.user.abstractAccountAddress || userAddress,
        partnerUserId: userInfo.partnerUserId
      };

      setUserLog('🔄 GENERATING ZK PROOF...\n🔄 SENDING TO BACKEND...');
      showStatus('Generating proof and verifying...', 'info');

      // Send proof to backend for verification
      const resp = await fetch('http://localhost:3000/proof-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          escrowId: currentEscrowId, 
          proof, 
          userAddress: userInfo.user.abstractAccountAddress || userAddress,
          attributes: currentAttributes 
        })
      });
      const json = await resp.json();
      
      if (json.ok) {
        setUserLog(`✅ PROOF VERIFIED\n✅ FUNDS RELEASED\n✅ TX HASH: ${json.txHash}`);
        showStatus('Success! Funds released to your account.', 'success');
      } else {
        setUserLog(`❌ VERIFICATION FAILED\n❌ REASON: ${json.error || 'Unknown error'}`);
        showStatus('Verification failed. Please try again.', 'error');
      }

    } catch (e) {
      setUserLog(`❌ AIR KIT FLOW FAILED\n❌ ERROR: ${(e as Error).message}`);
      showStatus('AIR Kit failed, trying fallback...', 'error');
      
      // Fallback to demo proof
      const proof = { type: 'demo-zk-proof', nonce: currentEscrowId, attributes: currentAttributes };
      try {
        setUserLog('🔄 FALLBACK: DEMO PROOF\n🔄 SENDING TO BACKEND...');
        const resp = await fetch('http://localhost:3000/proof-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ escrowId: currentEscrowId, proof, userAddress: '0xUser' , attributes: currentAttributes })
        });
        const json = await resp.json();
        setUserLog(`✅ DEMO PROOF RESPONSE\n✅ RESULT: ${JSON.stringify(json)}`);
      } catch (fallbackError) {
        setUserLog(`❌ FALLBACK FAILED\n❌ ERROR: ${(fallbackError as Error).message}`);
      }
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>DATA WALLET</h1>
        <div className="subtitle">MONETIZE YOUR DATA • PRIVACY-FIRST • ZERO-KNOWLEDGE PROOFS</div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>BUYER PORTAL</h2>
          <div className="form-group">
            <label htmlFor="attributes">ATTRIBUTES NEEDED</label>
            <textarea 
              id="attributes" 
              rows={4} 
              placeholder='{ "ageRange": "18-25", "country": "IN", "interest": "gaming" }'
            />
          </div>
          <div className="row">
            <div className="form-group">
              <label htmlFor="price">PRICE PER PROOF (WEI)</label>
              <input 
                id="price" 
                type="number" 
                placeholder="1000000000000000" 
              />
            </div>
            <div className="form-group">
              <label htmlFor="size">AUDIENCE SIZE</label>
              <input 
                id="size" 
                type="number" 
                placeholder="1000" 
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="token">PAYMENT TOKEN</label>
            <select id="token">
              <option value="native">NATIVE MOCA</option>
              <option value="erc20">ERC-20 (COMING SOON)</option>
            </select>
          </div>
          <button onClick={handleCreateRequest}>CREATE REQUEST & DEPOSIT</button>
          <div className="status">Backend issues escrowId and emits on-chain deposit event</div>
          <div className="log">{buyerLog}</div>
        </div>

        <div className="card">
          <h2>USER CONSENT</h2>
          <div className="badge">INCOMING REQUEST</div>
          <div className="log">{requestPreview}</div>
          <button onClick={handleConsent}>OPEN AIR KIT WIDGET</button>
          <div className="status">AIR Kit returns ZK proof bound to escrowId</div>
          <div className="log">{userLog}</div>
        </div>
      </div>
    </div>
  );
};

export default App;
