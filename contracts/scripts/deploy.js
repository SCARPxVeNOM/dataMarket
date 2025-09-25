const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const owner = process.env.ESCROW_OWNER || deployer.address;
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const feeBps = Number(process.env.FEE_BPS || 250);

  const Escrow = await hre.ethers.getContractFactory('contracts/DataEscrow.sol:DataEscrow');
  const escrow = await Escrow.deploy(owner, feeRecipient, feeBps);
  await escrow.waitForDeployment();
  const addr = await escrow.getAddress();
  console.log('DataEscrow deployed to:', addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


