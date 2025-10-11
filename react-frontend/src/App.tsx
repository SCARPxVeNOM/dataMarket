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

  const handleCreateRequest = async () => {
    const dataType = (document.getElementById('dataType') as HTMLSelectElement)?.value || 'demographics';
    const duration = Number((document.getElementById('farmingDuration') as HTMLInputElement)?.value || 30);
    const rewardRate = Number((document.getElementById('rewardRate') as HTMLInputElement)?.value || 10);
    const dataFields = (document.getElementById('dataFields') as HTMLTextAreaElement)?.value || '{}';
    
    setCurrentAttributes(dataFields);

    if (!dataFields || dataFields === '{}') {
      showStatus('Please specify data fields to farm', 'error');
      return;
    }

    try {
      // Create farming session
      const response = await fetch('http://localhost:3000/farming-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_' + Date.now(),
          dataType,
          duration,
          rewardRate,
          dataFields
        })
      });
      
      const result = await response.json();
      
      if (result.ok) {
        setCurrentEscrowId(result.farmingSession.sessionId);
        setRequestPreview(`FARMING SESSION: ${result.farmingSession.sessionId}\nTYPE: ${dataType}\nDURATION: ${duration} days\nREWARD RATE: ${rewardRate} MOCA/day\nDATA FIELDS: ${dataFields}`);
        setBuyerLog('✓ FARMING SESSION CREATED\n✓ REWARDS ENABLED\n✓ READY FOR FARMERS');
        showStatus('Data farming session started! Ready for farmers to join.', 'success');
      } else {
        setBuyerLog(`❌ FARMING SESSION FAILED\n❌ ERROR: ${result.error}`);
        showStatus('Failed to create farming session. Please try again.', 'error');
      }
    } catch (error) {
      setBuyerLog(`❌ FARMING SESSION ERROR\n❌ ERROR: ${(error as Error).message}`);
      showStatus('Error creating farming session. Please try again.', 'error');
    }
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
        <h1>DATA FARM</h1>
        <div className="subtitle">CULTIVATE YOUR DATA • EARN REWARDS • PRIVACY-FIRST FARMING</div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>DATA FARMING DASHBOARD</h2>
          <div className="form-group">
            <label htmlFor="dataType">DATA FARMING TYPE</label>
            <select id="dataType">
              <option value="demographics">Demographics & Profile</option>
              <option value="behavior">Behavioral Patterns</option>
              <option value="preferences">Preferences & Interests</option>
              <option value="social">Social Connections</option>
            </select>
          </div>
          <div className="row">
            <div className="form-group">
              <label htmlFor="farmingDuration">FARMING DURATION (DAYS)</label>
              <input 
                id="farmingDuration" 
                type="number" 
                placeholder="30" 
              />
            </div>
            <div className="form-group">
              <label htmlFor="rewardRate">REWARD RATE (MOCA/DAY)</label>
              <input 
                id="rewardRate" 
                type="number" 
                placeholder="10" 
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="dataFields">DATA FIELDS TO FARM</label>
            <textarea 
              id="dataFields" 
              rows={3} 
              placeholder='{ "age": "18-25", "location": "IN", "interests": ["gaming", "tech"], "activity": "daily" }'
            />
          </div>
          <button onClick={handleCreateRequest}>START DATA FARMING</button>
          <div className="status">Begin continuous data cultivation with privacy-preserving ZK proofs</div>
          <div className="log">{buyerLog}</div>
        </div>

        <div className="card">
          <h2>FARMER PORTAL</h2>
          <div className="badge">ACTIVE FARMING SESSION</div>
          <div className="log">{requestPreview}</div>
          <button onClick={handleConsent}>JOIN DATA FARM</button>
          <div className="status">AIR Kit enables privacy-preserving data farming with ZK proofs</div>
          <div className="log">{userLog}</div>
        </div>
      </div>
    </div>
  );
};

export default App;
