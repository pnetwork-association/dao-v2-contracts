# dao-v2-contracts

pNetwork DAO V2 smart contracts.

&nbsp;

***

&nbsp;

## :white_check_mark: Publish & Verify


### publish


```
❍ npx hardhat run --network mainnet scripts/deploy-script.js
```

### verify

```
❍ npx hardhat verify --network mainnet DEPLOYED_CONTRACT_ADDRESS "Constructor argument 1"
```

&nbsp;

***

&nbsp;


## :clipboard: Release


Go to __`.github/workflows/versioning.yml`__ and updates __`body`__ fields with the all changelogs

```
Changes in this Release
    - First Change
    - Second Change
    - ecc eccc
```

then:

```
git add .github/workflows/versioning.yml
git commit -S -m "chore(global): updates changelog for release"
```


Run one of the followings command:

```
npm version patch
npm version minor
npm version major
```

and then:

```
git push origin develop --follow-tags
```