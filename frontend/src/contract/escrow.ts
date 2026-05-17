import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

import abi from "./abi.json";
import { ESCROW_ADDRESS } from "./address";

export type EscrowSnapshot = {
  address: string;
  buyer: string;
  seller: string;
  arbiter: string;
  feeRecipient: string;
  asset: string;
  amount: bigint;
  inspectionEnd: bigint;
  feeBps: bigint;
  status: number;
  pendingBuyer: bigint;
  pendingSeller: bigint;
  pendingFeeRecipient: bigint;
  sellerReceivesOnFullRelease: bigint;
  feeOnFullRelease: bigint;
};

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

export function getReadProvider() {
  return new JsonRpcProvider(LOCAL_RPC_URL);
}

export function getReadContract() {
  return new Contract(ESCROW_ADDRESS, abi, getReadProvider());
}

export async function getEscrowSnapshot(): Promise<EscrowSnapshot> {
  const contract = getReadContract();
  const [buyer, seller, arbiter, feeRecipient, amount, inspectionEnd, feeBps, status, asset] =
    await Promise.all([
      contract.buyer(),
      contract.seller(),
      contract.arbiter(),
      contract.feeRecipient(),
      contract.amount(),
      contract.inspectionEnd(),
      contract.feeBps(),
      contract.status(),
      contract.asset(),
    ]);

  const [
    pendingBuyer,
    pendingSeller,
    pendingFeeRecipient,
    [, , , , sellerReceivesOnFullRelease, feeOnFullRelease],
  ] = await Promise.all([
    contract.pendingWithdrawals(buyer),
    contract.pendingWithdrawals(seller),
    contract.pendingWithdrawals(feeRecipient),
    contract.getSummary(),
  ]);

  return {
    address: ESCROW_ADDRESS,
    buyer,
    seller,
    arbiter,
    feeRecipient,
    asset,
    amount,
    inspectionEnd,
    feeBps: BigInt(feeBps),
    status: Number(status),
    pendingBuyer,
    pendingSeller,
    pendingFeeRecipient,
    sellerReceivesOnFullRelease,
    feeOnFullRelease,
  };
}

function requireProvider(provider: BrowserProvider | null) {
  if (!provider) {
    throw new Error("Connect your wallet first.");
  }

  return provider;
}

export async function writeDeposit(provider: BrowserProvider) {
  const browserProvider = requireProvider(provider);
  const signer = await browserProvider.getSigner();
  const contract = new Contract(ESCROW_ADDRESS, abi, signer);
  const asset = await contract.asset();
  const amount = await contract.amount();

  const tx =
    asset === "0x0000000000000000000000000000000000000000"
      ? await contract.deposit({ value: amount })
      : await contract.deposit();

  return tx.wait();
}

export async function writeConfirmReceipt(provider: BrowserProvider) {
  const signer = await requireProvider(provider).getSigner();
  const contract = new Contract(ESCROW_ADDRESS, abi, signer);
  const tx = await contract.confirmReceipt();
  return tx.wait();
}

export async function writeWithdraw(provider: BrowserProvider) {
  const signer = await requireProvider(provider).getSigner();
  const contract = new Contract(ESCROW_ADDRESS, abi, signer);
  const tx = await contract.withdraw();
  return tx.wait();
}

export async function writeOpenDispute(provider: BrowserProvider) {
  const signer = await requireProvider(provider).getSigner();
  const contract = new Contract(ESCROW_ADDRESS, abi, signer);
  const tx = await contract.openDispute();
  return tx.wait();
}

export async function writeSellerClaim(provider: BrowserProvider) {
  const signer = await requireProvider(provider).getSigner();
  const contract = new Contract(ESCROW_ADDRESS, abi, signer);
  const tx = await contract.sellerClaimAfterExpiry();
  return tx.wait();
}
