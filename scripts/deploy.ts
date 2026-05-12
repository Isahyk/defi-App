import { network } from "hardhat";
import { isAddress } from "ethers";
import fs from "node:fs";
import path from "node:path";

type AddressEnvOptions = {
  optional?: boolean;
  defaultValue?: string;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_BPS = 10_000n;
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

function persistEnvValue(key: string, value: string) {
  const envPath = loadedEnvPath ?? path.resolve(process.cwd(), "SmartEscrow.env");
  const existingContents = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existingContents === "" ? [] : existingContents.split(/\r?\n/);
  let updated = false;

  const nextLines = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }

    return line;
  });

  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, `${nextLines.filter((line) => line !== "").join("\n")}\n`, "utf8");
  loadedEnv.set(key, value);
}

function readEnv(name: string, options: AddressEnvOptions = {}): string {
  const rawValue = loadedEnv.get(name) ?? process.env[name]?.trim();

  if (rawValue && rawValue.length > 0) {
    return rawValue;
  }

  if (options.optional) {
    return options.defaultValue ?? "";
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function readAddress(name: string, options: AddressEnvOptions = {}): string {
  const value = readEnv(name, options);

  if (options.optional && value === "") {
    return options.defaultValue ?? ZERO_ADDRESS;
  }

  if (!isAddress(value)) {
    throw new Error(`Invalid address supplied for ${name}: ${value}`);
  }

  return value;
}

function readUint(name: string): bigint {
  const value = readEnv(name);

  try {
    const parsed = BigInt(value);
    if (parsed < 0n) {
      throw new Error("negative");
    }
    return parsed;
  } catch {
    throw new Error(`Invalid unsigned integer supplied for ${name}: ${value}`);
  }
}

function readOptionalUint(name: string): bigint | undefined {
  const rawValue = loadedEnv.get(name) ?? process.env[name]?.trim();
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = BigInt(rawValue);
    if (parsed < 0n) {
      throw new Error("negative");
    }
    return parsed;
  } catch {
    throw new Error(`Invalid unsigned integer supplied for ${name}: ${rawValue}`);
  }
}

function assertConfiguration(config: {
  buyer: string;
  seller: string;
  arbiter: string;
  feeRecipient: string;
  asset: string;
  amount: bigint;
  inspectionEnd: bigint;
  feeBps: bigint;
}) {
  const { buyer, seller, arbiter, feeRecipient, amount, inspectionEnd, feeBps } = config;

  if (buyer.toLowerCase() === seller.toLowerCase()) {
    throw new Error("BUYER and SELLER must be different addresses");
  }

  if (arbiter !== ZERO_ADDRESS) {
    const normalizedArbiter = arbiter.toLowerCase();
    if (normalizedArbiter === buyer.toLowerCase() || normalizedArbiter === seller.toLowerCase()) {
      throw new Error("ARBITER cannot be the same as BUYER or SELLER");
    }
  }

  if (feeRecipient === ZERO_ADDRESS) {
    throw new Error("FEE_RECIPIENT cannot be the zero address");
  }

  if (amount === 0n) {
    throw new Error("AMOUNT must be greater than zero");
  }

  if (feeBps > MAX_BPS) {
    throw new Error("FEE_BPS must be between 0 and 10000");
  }

  const currentUnixTime = BigInt(Math.floor(Date.now() / 1000));
  if (inspectionEnd <= currentUnixTime) {
    throw new Error("INSPECTION_END must be a future Unix timestamp in seconds");
  }
}

function printHeader(title: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(title);
  console.log(`${"=".repeat(72)}`);
}

function printField(label: string, value: string) {
  console.log(`${label.padEnd(18)} ${value}`);
}

function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

async function main() {
  loadEnvFiles();
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();
  const balanceBefore = await ethers.provider.getBalance(deployer.address);
  const connectedNetwork = await ethers.provider.getNetwork();
  const networkName = process.env.HARDHAT_NETWORK ?? "default";

  const buyer = readAddress("BUYER");
  const seller = readAddress("SELLER");
  const arbiter = readAddress("ARBITER", { optional: true, defaultValue: ZERO_ADDRESS });
  const feeRecipient = readAddress("FEE_RECIPIENT", {
    optional: true,
    defaultValue: deployer.address,
  });
  const asset = readAddress("ASSET", { optional: true, defaultValue: ZERO_ADDRESS });
  const amount = readUint("AMOUNT");
  const inspectionEndFromEnv = readOptionalUint("INSPECTION_END");
  const inspectionWindowDays = readOptionalUint("INSPECTION_WINDOW_DAYS");
  const feeBps = readOptionalUint("FEE_BPS") ?? 250n;
  const currentUnixTime = BigInt(Math.floor(Date.now() / 1000));
  const inspectionEnd =
    inspectionEndFromEnv ??
    (currentUnixTime + (inspectionWindowDays ?? 7n) * 24n * 60n * 60n);

  assertConfiguration({
    buyer,
    seller,
    arbiter,
    feeRecipient,
    asset,
    amount,
    inspectionEnd,
    feeBps,
  });

  printHeader("SmartEscrow Deployment");
  printField("Network", networkName);
  printField("Chain ID", connectedNetwork.chainId.toString());
  printField("Deployer", deployer.address);
  printField("Balance", balanceBefore.toString());
  printField("Buyer", buyer);
  printField("Seller", seller);
  printField("Arbiter", arbiter);
  printField("Fee recipient", feeRecipient);
  printField("Asset", asset);
  printField("Amount", amount.toString());
  printField("Inspection end", inspectionEnd.toString());
  printField("Inspection ISO", formatDate(inspectionEnd));
  printField("Window days", inspectionWindowDays?.toString() ?? "7 (default)");
  printField("Fee bps", feeBps.toString());

  const EscrowFactory = await ethers.getContractFactory("SmartEscrow");
  const escrow = await EscrowFactory.deploy(
    buyer,
    seller,
    arbiter,
    feeRecipient,
    asset,
    amount,
    inspectionEnd,
    Number(feeBps)
  );

  printHeader("Broadcasted");
  printField("Tx hash", escrow.deploymentTransaction()?.hash ?? "unavailable");

  await escrow.waitForDeployment();

  const deployedAddress = await escrow.getAddress();
  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  const deploymentCost = balanceBefore - balanceAfter;

  printHeader("Deployment Complete");
  printField("Contract", deployedAddress);
  printField("Network", networkName);
  printField("Deployer", deployer.address);
  printField("Gas spend", deploymentCost.toString());
  printField("Explorer args", "[buyer, seller, arbiter, feeRecipient, asset, amount, inspectionEnd, feeBps]");

  persistEnvValue("ESCROW_ADDRESS", deployedAddress);
  persistEnvValue("DEPLOY_NETWORK", networkName);
  console.log(`Saved ESCROW_ADDRESS to ${path.basename(loadedEnvPath ?? "SmartEscrow.env")}`);

  console.log("\nConstructor arguments:");
  console.log(
    JSON.stringify(
      [
        buyer,
        seller,
        arbiter,
        feeRecipient,
        asset,
        amount.toString(),
        inspectionEnd.toString(),
        Number(feeBps),
      ],
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("\nDeployment failed.");
  console.error(error);
  process.exitCode = 1;
});
