import { getEscrowContext } from "./_escrow";

async function main() {
  const { escrow, buyer, getSignerByAddress, ethers, escrowAddress, loadedEnvPath } = await getEscrowContext();
  const buyerSigner = await getSignerByAddress("BUYER", buyer);
  const asset = await escrow.asset();
  const amount = await escrow.amount();
  const status = await escrow.status();

  console.log("Escrow:", escrowAddress);
  console.log("Env file:", loadedEnvPath ?? "none");
  console.log("Buyer:", buyerSigner.address);
  console.log("Amount:", amount.toString());
  console.log("Status:", status.toString());

  const tx =
    asset === ethers.ZeroAddress
      ? await escrow.connect(buyerSigner).deposit({ value: amount })
      : await escrow.connect(buyerSigner).deposit();

  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Deposit complete.");
}

main().catch((error) => {
  console.error("Deposit failed.");
  console.error(error);
  process.exitCode = 1;
});
