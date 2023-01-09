# dao-v2-contracts

pNetwork DAO V2 smart contracts.

&nbsp;

***

&nbsp;

## :white_check_mark: Publish & Verify

Create an __.env__ file with the following fields:

```
ETHERSCAN_API_KEY=
PK=
ETH_MAINNET_NODE=
```


### publish


```
❍ npx hardhat run --network mainnet scripts/deploy-script.js
```

### verify

```
❍ npx hardhat verify --network mainnet DEPLOYED_CONTRACT_ADDRESS "Constructor argument 1"
```
