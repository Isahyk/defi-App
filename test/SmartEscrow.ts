import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const { ethers } = await network.connect();

const ESCROW_AMOUNT = ethers.parseEther("10");
const FEE_BPS = 250n;
const ZERO_ADDRESS = ethers.ZeroAddress;

async function latestTimestamp(): Promise<bigint> {
  const latestBlock = await ethers.provider.getBlock("latest");
  if (latestBlock === null) {
    throw new Error("Latest block not available");
  }

  return BigInt(latestBlock.timestamp);
}

async function increaseTimeTo(timestamp: bigint) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await ethers.provider.send("evm_mine", []);
}

async function expectCustomError(txPromise: Promise<unknown>, errorName: string) {
  await assert.rejects(
    async () => {
      await txPromise;
    },
    (error: unknown) => {
      const message = String(error);
      return message.includes(errorName);
    },
  );
}

async function deployEthEscrow(overrides: Partial<{
  buyer: string;
  seller: string;
  arbiter: string;
  feeRecipient: string;
  amount: bigint;
  inspectionEnd: bigint;
  feeBps: number;
}> = {}) {
  const [deployer, buyer, seller, arbiter, feeRecipient, outsider] = await ethers.getSigners();
  const inspectionEnd = overrides.inspectionEnd ?? (await latestTimestamp()) + 7n * 24n * 60n * 60n;

  const Escrow = await ethers.getContractFactory("SmartEscrow");
  const escrow = await Escrow.deploy(
    overrides.buyer ?? buyer.address,
    overrides.seller ?? seller.address,
    overrides.arbiter ?? arbiter.address,
    overrides.feeRecipient ?? feeRecipient.address,
    ZERO_ADDRESS,
    overrides.amount ?? ESCROW_AMOUNT,
    inspectionEnd,
    overrides.feeBps ?? Number(FEE_BPS),
  );

  await escrow.waitForDeployment();

  return {
    escrow,
    deployer,
    buyer,
    seller,
    arbiter,
    feeRecipient,
    outsider,
    inspectionEnd,
  };
}

async function deployTokenEscrow() {
  const fixture = await deployEthEscrow();
  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("Mock USD", "mUSD");
  await token.waitForDeployment();

  await token.mint(fixture.buyer.address, ESCROW_AMOUNT * 2n);

  const Escrow = await ethers.getContractFactory("SmartEscrow");
  const escrow = await Escrow.deploy(
    fixture.buyer.address,
    fixture.seller.address,
    fixture.arbiter.address,
    fixture.feeRecipient.address,
    await token.getAddress(),
    ESCROW_AMOUNT,
    fixture.inspectionEnd,
    Number(FEE_BPS),
  );

  await escrow.waitForDeployment();

  return {
    ...fixture,
    escrow,
    token,
  };
}

describe("SmartEscrow", async function () {
  it("stores deployment configuration correctly", async function () {
    const { escrow, buyer, seller, arbiter, feeRecipient, inspectionEnd } = await deployEthEscrow();

    assert.equal(await escrow.buyer(), buyer.address);
    assert.equal(await escrow.seller(), seller.address);
    assert.equal(await escrow.arbiter(), arbiter.address);
    assert.equal(await escrow.feeRecipient(), feeRecipient.address);
    assert.equal(await escrow.asset(), ZERO_ADDRESS);
    assert.equal(await escrow.amount(), ESCROW_AMOUNT);
    assert.equal(await escrow.inspectionEnd(), inspectionEnd);
    assert.equal(await escrow.feeBps(), FEE_BPS);
  });

  it("accepts buyer ETH deposit and releases after receipt confirmation", async function () {
    const { escrow, buyer, seller, feeRecipient } = await deployEthEscrow();
    const feeAmount = (ESCROW_AMOUNT * FEE_BPS) / 10_000n;
    const sellerNet = ESCROW_AMOUNT - feeAmount;

    await escrow.connect(buyer).deposit({ value: ESCROW_AMOUNT });
    await escrow.connect(buyer).confirmReceipt();

    assert.equal(await escrow.status(), 3n);
    assert.equal(await escrow.pendingWithdrawals(seller.address), sellerNet);
    assert.equal(await escrow.pendingWithdrawals(feeRecipient.address), feeAmount);
  });

  it("lets the seller claim after inspection expiry", async function () {
    const { escrow, buyer, seller, feeRecipient, inspectionEnd } = await deployEthEscrow();
    const feeAmount = (ESCROW_AMOUNT * FEE_BPS) / 10_000n;
    const sellerNet = ESCROW_AMOUNT - feeAmount;

    await escrow.connect(buyer).deposit({ value: ESCROW_AMOUNT });
    await increaseTimeTo(inspectionEnd + 1n);
    await escrow.connect(seller).sellerClaimAfterExpiry();

    assert.equal(await escrow.status(), 3n);
    assert.equal(await escrow.pendingWithdrawals(seller.address), sellerNet);
    assert.equal(await escrow.pendingWithdrawals(feeRecipient.address), feeAmount);
  });

  it("supports dispute resolution by the arbiter", async function () {
    const { escrow, buyer, seller, arbiter, feeRecipient } = await deployEthEscrow();
    const buyerAward = ethers.parseEther("4");
    const sellerGross = ESCROW_AMOUNT - buyerAward;
    const feeAmount = (sellerGross * FEE_BPS) / 10_000n;
    const sellerNet = sellerGross - feeAmount;

    await escrow.connect(buyer).deposit({ value: ESCROW_AMOUNT });
    await escrow.connect(seller).openDispute();
    await escrow.connect(arbiter).resolveDispute(buyerAward);

    assert.equal(await escrow.status(), 5n);
    assert.equal(await escrow.pendingWithdrawals(buyer.address), buyerAward);
    assert.equal(await escrow.pendingWithdrawals(seller.address), sellerNet);
    assert.equal(await escrow.pendingWithdrawals(feeRecipient.address), feeAmount);
  });

  it("does not allow disputes when no arbiter is configured", async function () {
    const { escrow, buyer, seller } = await deployEthEscrow({ arbiter: ZERO_ADDRESS });

    await escrow.connect(buyer).deposit({ value: ESCROW_AMOUNT });

    await expectCustomError(
      escrow.connect(seller).openDispute(),
      "ArbiterRequired",
    );
  });

  it("escrows ERC20 tokens and records seller and fee balances", async function () {
    const { escrow, token, buyer, seller, feeRecipient } = await deployTokenEscrow();
    const feeAmount = (ESCROW_AMOUNT * FEE_BPS) / 10_000n;
    const sellerNet = ESCROW_AMOUNT - feeAmount;

    await token.connect(buyer).approve(await escrow.getAddress(), ESCROW_AMOUNT);
    await escrow.connect(buyer).deposit();
    await escrow.connect(buyer).confirmReceipt();

    assert.equal(await escrow.pendingWithdrawals(seller.address), sellerNet);
    assert.equal(await escrow.pendingWithdrawals(feeRecipient.address), feeAmount);
    assert.equal(await token.balanceOf(await escrow.getAddress()), ESCROW_AMOUNT);
  });

  it("rejects fee-on-transfer tokens that underfund the escrow", async function () {
    const [, buyer, seller, arbiter, feeRecipient] = await ethers.getSigners();
    const inspectionEnd = (await latestTimestamp()) + 7n * 24n * 60n * 60n;

    const Token = await ethers.getContractFactory("FeeOnTransferToken");
    const feeToken = await Token.deploy("Tax Token", "TAX");
    await feeToken.waitForDeployment();
    await feeToken.mint(buyer.address, ESCROW_AMOUNT);

    const Escrow = await ethers.getContractFactory("SmartEscrow");
    const escrow = await Escrow.deploy(
      buyer.address,
      seller.address,
      arbiter.address,
      feeRecipient.address,
      await feeToken.getAddress(),
      ESCROW_AMOUNT,
      inspectionEnd,
      Number(FEE_BPS),
    );
    await escrow.waitForDeployment();

    await feeToken.connect(buyer).approve(await escrow.getAddress(), ESCROW_AMOUNT);

    await expectCustomError(
      escrow.connect(buyer).deposit(),
      "UnexpectedTokenAmount",
    );
  });

  it("rejects unauthorized and invalid actions", async function () {
    const { escrow, buyer, seller, arbiter, outsider } = await deployEthEscrow();

    await expectCustomError(
      escrow.connect(outsider).confirmReceipt(),
      "Unauthorized",
    );

    await escrow.connect(buyer).deposit({ value: ESCROW_AMOUNT });

    await expectCustomError(
      escrow.connect(outsider).openDispute(),
      "Unauthorized",
    );

    await escrow.connect(seller).openDispute();

    await expectCustomError(
      escrow.connect(arbiter).resolveDispute(ESCROW_AMOUNT + 1n),
      "ResolutionExceedsDeposit",
    );
  });

  it("rejects direct ETH transfers and empty withdrawals", async function () {
    const { escrow, buyer, seller } = await deployEthEscrow();

    await expectCustomError(
      buyer.sendTransaction({
        to: await escrow.getAddress(),
        value: ethers.parseEther("1"),
      }),
      "UnsupportedDirectPayment",
    );

    await expectCustomError(
      escrow.connect(seller).withdraw(),
      "ZeroWithdrawableBalance",
    );
  });

  it("allows refunding an unfunded expired escrow", async function () {
    const { escrow, buyer, inspectionEnd } = await deployEthEscrow();

    await increaseTimeTo(inspectionEnd + 1n);
    await escrow.connect(buyer).refundBuyerBeforeDeposit();

    assert.equal(await escrow.status(), 4n);
  });
});
