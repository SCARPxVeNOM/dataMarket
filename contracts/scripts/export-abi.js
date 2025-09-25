const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'artifacts', 'contracts', 'DataEscrow.sol', 'DataEscrow.json');
const destDir = path.join(__dirname, '..', '..', 'backend', 'abi');
const dest = path.join(destDir, 'DataEscrow.json');

if (!fs.existsSync(src)) {
  console.error('Build first: artifacts not found at', src);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
const json = JSON.parse(fs.readFileSync(src, 'utf8'));
const minimal = { abi: json.abi, bytecode: json.bytecode, deployedBytecode: json.deployedBytecode };
fs.writeFileSync(dest, JSON.stringify(minimal, null, 2));
console.log('Exported ABI to', dest);


