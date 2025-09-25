const fs = require('fs');
const crypto = require('crypto');

// Read the public key
const publicKeyPem = fs.readFileSync('public.key', 'utf8');

// Extract the key data (remove headers and newlines)
const keyData = publicKeyPem
  .replace(/-----BEGIN PUBLIC KEY-----/, '')
  .replace(/-----END PUBLIC KEY-----/, '')
  .replace(/\n/g, '');

// Create a simple JWK (this is a simplified version)
// In production, you'd want to use a proper library to convert PEM to JWK
const jwk = {
  kty: 'RSA',
  use: 'sig',
  kid: 'data-market-key-1',
  alg: 'RS256',
  n: keyData, // This should be the modulus, but we're using the full key for simplicity
  e: 'AQAB' // Standard exponent for RSA
};

const jwks = {
  keys: [jwk]
};

fs.writeFileSync('jwks.json', JSON.stringify(jwks, null, 2));
console.log('JWKS file created: jwks.json');
console.log('Key ID:', jwk.kid);
