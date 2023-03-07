// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IPToken {
    function redeem(
        uint256 amount,
        bytes memory userData,
        string memory underlyingAssetRecipient,
        bytes4 destinationChainId
    ) external;

    function pegIn(
        uint256 _tokenAmount,
        address _tokenAddress,
        string memory _destinationAddress,
        bytes memory _userData,
        bytes4 _destinationChainId
    ) external;
}
