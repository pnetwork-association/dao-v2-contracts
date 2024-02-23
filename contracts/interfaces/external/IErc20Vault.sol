// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IErc20Vault {
    event PegIn(
        address _tokenAddress,
        address _tokenSender,
        uint256 _tokenAmount,
        string _destinationAddress,
        bytes _userData,
        bytes4 _originChainId,
        bytes4 _destinationChainId
    );

    function pegIn(
        uint256 tokenAmount,
        address tokenAddress,
        string memory destinationAddress,
        bytes memory userData,
        bytes4 destinationChainId
    ) external returns (bool);

    function pegOut(
        address payable _tokenRecipient,
        address _tokenAddress,
        uint256 _tokenAmount,
        bytes calldata _userData
    ) external returns (bool success);
}
