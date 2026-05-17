import fs from "node:fs";
import path from "node:path";

import { isAddress } from "ethers";
import { network } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const loadedEnv = new Map<string, string>();
let loadedEnvPath: string | undefined;

function loadEnvFiles() {
  const candidateFiles = [
    path.resolve(process.cwd(), "SmartEscrow.env"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidateFiles) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const fileContents = fs.readFileSync(envPath, "utf8");
    const lines = fileContents.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line === "" || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      loadedEnv.set(key, value);
    }

    loadedEnvPath = envPath;
    console.log(`Loaded environment file: ${path.basename(envPath)}`);
    return;
  }
}

function readEnv(name: string, fallback?: string): string {
  const value = loadedEnv.get(name) ?? process.env[name]?.trim() ?? fallback;

  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readAddress(name: string, fallback?: string): string {
  const value = readEnv(name, fallback);

  if (!isAddress(value)) {
    throw new Error(`Invalid address supplied for ${name}: ${value}`);
  }

  return value;
}

export async function getEscrowContext() {
  loadEnvFiles();

  const { ethers } = await network.connect();
  const escrowAddress = readAddress("ESCROW_ADDRESS", "0x5FbDB2315678afecb367f032d93F642f64180aa3");
  const escrow = await ethers.getContractAt("SmartEscrow", escrowAddress);
  const [contractBuyer, contractSeller, contractFeeRecipient] = await Promise.all([
    escrow.buyer(),
    escrow.seller(),
    escrow.feeRecipient(),
  ]);
  const buyer = loadedEnv.get("BUYER") ?? contractBuyer;
  const seller = loadedEnv.get("SELLER") ?? contractSeller;
  const feeRecipient = loadedEnv.get("FEE_RECIPIENT") ?? contractFeeRecipient ?? ZERO_ADDRESS;
  const signers = await ethers.getSigners();

  async function getSignerByAddress(label: string, address: string) {
    const signer = signers.find(
      (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
    );

    if (!signer) {
      throw new Error(
        `No local signer found for ${label} address ${address}. ` +
          `This usually means you're using an address not unlocked by the current network.`,
      );
    }

    return signer;
  }

  return {
    ethers,
    escrow,
    escrowAddress,
    buyer,
    seller,
    feeRecipient,
    getSignerByAddress,
    readAddress,
    loadedEnvPath,
  };
}
