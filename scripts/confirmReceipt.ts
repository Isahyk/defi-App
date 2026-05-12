import { getEscrowContext } from "./_escrow";

async function main() {
  const { escrow, buyer, getSignerByAddress } = await getEscrowContext();
  const buyerSigner = await getSignerByAddress("BUYER", buyer);

  console.log("Escrow:", await escrow.getAddress());
  console.log("Buyer:", buyerSigner.address);

  const tx = await escrow.connect(buyerSigner).confirmReceipt();
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Receipt confirmed.");
}

main().catch((error) => {
  console.error("confirmReceipt failed.");
  console.error(error);
  process.exitCode = 1;
});
