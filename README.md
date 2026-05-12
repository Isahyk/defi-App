## defi-App

Minimal Hardhat 3 escrow project structure:

- `contracts/`
- `scripts/`
- `hardhat.config.ts`

Useful commands:

```bash
npm run compile
npm run test
npm run deploy
```

For a persistent local chain, use two terminals:

```bash
# terminal 1
npm run node

# terminal 2
npm run deploy:local
npm run deposit:local
npm run confirm:local
npm run withdraw:local
```

## Environment file support

The deploy script now looks for environment files in this order:

1. `SmartEscrow.env`
2. `.env`

Recommended flow:

1. Copy `SmartEscrow.env.example` to `SmartEscrow.env`
2. Fill in your real values
3. Run:

```bash
npm run deploy
```

Minimum required values now:

- `BUYER`
- `SELLER`
- `AMOUNT`

Defaults:

- `ARBITER`: zero address
- `FEE_RECIPIENT`: deployer wallet
- `ASSET`: native ETH
- `INSPECTION_WINDOW_DAYS`: `7`
- `FEE_BPS`: `250`
# defi-App
