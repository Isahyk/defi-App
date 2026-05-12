import { getEscrowContext } from "./_escrow";

async function main() {
  const { escrow, seller, feeRecipient, readAddress, getSignerByAddress } = await getEscrowContext();
  const withdrawer = readAddress("WITHDRAWER", seller);
  const withdrawerSigner = await getSignerByAddress("WITHDRAWER", withdrawer);

  console.log("Escrow:", await escrow.getAddress());
  console.log("Withdrawer:", withdrawerSigner.address);
  console.log("Fee recipient from config:", feeRecipient);

  const tx = await escrow.connect(withdrawerSigner).withdraw();
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Withdrawal complete.");
}

main().catch((error) => {
  console.error("withdraw failed.");
  console.error(error);
  process.exitCode = 1;
});
