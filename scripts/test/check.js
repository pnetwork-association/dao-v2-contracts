const { ethers } = require('hardhat')

const TOKEN_ADDRESS_1 = '0xE29fb74B5A3d915cD7b298C6fC94Bc39CdC846C9'
const TOKEN_ADDRESS_2 = '0xB0A978B5dc20Bc01F44De0658909aB4077790998'
const BORROWING_MANAGER_ADDRESS = '0x2d6b046Cd9996AB6Ef4B3113e1dDC5B0e4107e97'
const LENDER = '0x3aEa738FDe85CF147746733bBf4D3a4f11A16bF4'

const main = async () => {
  const ERC20 = await ethers.getContractFactory('ERC20')
  const BorrowingManager = await ethers.getContractFactory('BorrowingManager')

  const token1 = await ERC20.attach(TOKEN_ADDRESS_1)
  const token2 = await ERC20.attach(TOKEN_ADDRESS_2)
  const borrowingManager = await BorrowingManager.attach(BORROWING_MANAGER_ADDRESS)

  console.log('#1 totalLendedAmount: ', ethers.utils.formatEther((await borrowingManager.totalLendedAmountByEpoch(1)).toString()), 'PNT')
  console.log('#1 lendedAmountByEpochOf: ', ethers.utils.formatEther((await borrowingManager.lendedAmountByEpochOf(LENDER, 1)).toString()), 'PNT')
  console.log(
    '#1 totalAssetInterestAmountByEpoch (token1):',
    ethers.utils.formatEther((await borrowingManager.totalAssetInterestAmountByEpoch(TOKEN_ADDRESS_1, 1)).toString()),
    'TST1'
  )
  console.log(
    '#1 totalAssetInterestAmountByEpoch (token2):',
    ethers.utils.formatEther((await borrowingManager.totalAssetInterestAmountByEpoch(TOKEN_ADDRESS_2, 1)).toString()),
    'TST2'
  )
  console.log(
    '#1 claimableAssetAmountByEpochOf:',
    ethers.utils.formatEther((await borrowingManager.claimableAssetAmountByEpochOf(LENDER, TOKEN_ADDRESS_1, 1)).toString()),
    'TST1'
  )
  console.log('#1 totalEpochsLeftByEpoch:', (await borrowingManager.totalEpochsLeftByEpoch(1)).toString())
  console.log('#1 loanEndEpochOf:', (await borrowingManager.loanEndEpochOf(LENDER)).toString())

  console.log('\n')
  console.log('#2 totalLendedAmount: ', ethers.utils.formatEther((await borrowingManager.totalLendedAmountByEpoch(2)).toString()), 'PNT')
  console.log('#2 lendedAmountByEpochOf: ', ethers.utils.formatEther((await borrowingManager.lendedAmountByEpochOf(LENDER, 2)).toString()), 'PNT')
  console.log(
    '#2 totalAssetInterestAmountByEpoch (token1):',
    ethers.utils.formatEther((await borrowingManager.totalAssetInterestAmountByEpoch(TOKEN_ADDRESS_1, 2)).toString()),
    'TST1'
  )
  console.log(
    '#2 totalAssetInterestAmountByEpoch (token2):',
    ethers.utils.formatEther((await borrowingManager.totalAssetInterestAmountByEpoch(TOKEN_ADDRESS_2, 2)).toString()),
    'TST2'
  )
  console.log('#2 totalEpochsLeftByEpoch:', (await borrowingManager.totalEpochsLeftByEpoch(2)).toString())

  console.log('token1.balanceOf(borrowingManager) ', ethers.utils.formatEther((await token1.balanceOf(borrowingManager.address)).toString()))
  console.log('token2.balanceOf(borrowingManager) ', ethers.utils.formatEther((await token2.balanceOf(borrowingManager.address)).toString()))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
