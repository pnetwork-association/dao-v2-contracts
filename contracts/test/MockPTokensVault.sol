// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.17;

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract MockPTokensVault {
    function pegIn(
        uint256 _tokenAmount,
        address _tokenAddress,
        string memory _destinationAddress,
        bytes memory _userData,
        bytes4 _destinationChainId
    ) external returns (bool) {}

    function pegOut(
        address _tokenRecipient,
        address _tokenAddress,
        uint256 _tokenAmount,
        bytes calldata _userData
    ) external returns (bool) {}
}
