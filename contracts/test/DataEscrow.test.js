const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DataEscrow (native)', function () {
  it('depositNative then release pays payee minus fee', async () => {
    const [owner, payer, payee, feeRecipient] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory('contracts/DataEscrow.sol:DataEscrow');
    const feeBps = 250; // 2.5%
    const escrow = await Escrow.deploy(owner.address, feeRecipient.address, feeBps);
    await escrow.waitForDeployment();

    const id = ethers.hexlify(ethers.randomBytes(32));
    const amount = ethers.parseEther('1');

    await expect(
      escrow.connect(payer).depositNative(id, payee.address, { value: amount })
    ).to.emit(escrow, 'Deposited');

    const fee = (amount * BigInt(feeBps)) / 10000n;
    const net = amount - fee;

    const payeeBalBefore = await ethers.provider.getBalance(payee.address);
    const feeBalBefore = await ethers.provider.getBalance(feeRecipient.address);

    const tx = await escrow.connect(owner).release(id);
    await tx.wait();

    const payeeBalAfter = await ethers.provider.getBalance(payee.address);
    const feeBalAfter = await ethers.provider.getBalance(feeRecipient.address);

    expect(payeeBalAfter - payeeBalBefore).to.equal(net);
    expect(feeBalAfter - feeBalBefore).to.equal(fee);
  });

  it('refund returns funds to payer', async () => {
    const [owner, payer, payee] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory('contracts/DataEscrow.sol:DataEscrow');
    const escrow = await Escrow.deploy(owner.address, owner.address, 0);
    await escrow.waitForDeployment();

    const id = ethers.hexlify(ethers.randomBytes(32));
    const amount = ethers.parseEther('0.5');
    await escrow.connect(payer).depositNative(id, payee.address, { value: amount });

    const payerBalBefore = await ethers.provider.getBalance(payer.address);
    const tx = await escrow.connect(owner).refund(id);
    await tx.wait();
    const payerBalAfter = await ethers.provider.getBalance(payer.address);

    // Since payer didn't pay gas for refund, they should receive exactly amount back
    expect(payerBalAfter - payerBalBefore).to.equal(amount);
  });
});


