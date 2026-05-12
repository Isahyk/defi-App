import { getEscrowContext } from "./_escrow";

async function main() {
  const { escrow, seller, getSignerByAddress } = await getEscrowContext();
  const sellerSigner = await getSignerByAddress("SELLER", seller);

  console.log("Escrow:", await escrow.getAddress());
  console.log("Seller:", sellerSigner.address);

  const tx = await escrow.connect(sellerSigner).sellerClaimAfterExpiry();
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Seller claim complete.");
}

main().catch((error) => {
  console.error("sellerClaimAfterExpiry failed.");
  console.error(error);
  process.exitCode = 1;
});
