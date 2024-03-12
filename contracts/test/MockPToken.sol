// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPReceiver} from "../interfaces/external/IPReceiver.sol";

contract MockPTokenERC777 is ERC777 {
    address public pNetwork;
    bytes4 public ORIGIN_CHAIN_ID;

    event Redeem(
        address indexed redeemer,
        uint256 value,
        string underlyingAssetRecipient,
        bytes userData,
        bytes4 originChainId,
        bytes4 destinationChainId
    );

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address _pnetwork,
        bytes4 originChainId
    ) ERC777(tokenName, tokenSymbol, new address[](0)) {
        pNetwork = _pnetwork;
        ORIGIN_CHAIN_ID = originChainId;
    }

    function changePNetwork(address newPNetwork) external {
        require(_msgSender() == pNetwork, "Only the pNetwork can change the `pNetwork` account!");
        require(newPNetwork != address(0), "pNetwork cannot be the zero address!");
        pNetwork = newPNetwork;
    }

    function mint(
        address recipient,
        uint256 value,
        bytes calldata userData,
        bytes calldata operatorData
    ) external returns (bool) {
        require(_msgSender() == pNetwork, "Only the pNetwork can mint tokens!");
        require(recipient != address(0), "pToken: Cannot mint to the zero address!");
        _mint(recipient, value, userData, operatorData, false);
        return true;
    }

    function redeem(
        uint256 amount,
        string calldata underlyingAssetRecipient,
        bytes4 destinationChainId
    ) external returns (bool) {
        redeem(amount, "", underlyingAssetRecipient, destinationChainId);
        return true;
    }

    function redeem(
        uint256 amount,
        bytes memory data,
        string memory underlyingAssetRecipient,
        bytes4 destinationChainId
    ) public {
        _burn(_msgSender(), amount, data, "");
        emit Redeem(msg.sender, amount, underlyingAssetRecipient, data, ORIGIN_CHAIN_ID, destinationChainId);
    }

    function owner() internal view returns (address) {
        return pNetwork;
    }
}

contract MockPTokenERC20 is ERC20 {
    address public pNetwork;
    bytes4 public ORIGIN_CHAIN_ID;

    event ReceiveUserDataFailed();

    event Redeem(
        address indexed redeemer,
        uint256 value,
        string underlyingAssetRecipient,
        bytes userData,
        bytes4 originChainId,
        bytes4 destinationChainId
    );

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address _pnetwork,
        bytes4 originChainId
    ) ERC20(tokenName, tokenSymbol) {
        pNetwork = _pnetwork;
        ORIGIN_CHAIN_ID = originChainId;
    }

    function changePNetwork(address newPNetwork) external {
        require(_msgSender() == pNetwork, "Only the pNetwork can change the `pNetwork` account!");
        require(newPNetwork != address(0), "pNetwork cannot be the zero address!");
        pNetwork = newPNetwork;
    }

    function mint(
        address recipient,
        uint256 value,
        bytes calldata userData,
        bytes calldata
    ) external returns (bool) {
        require(_msgSender() == pNetwork, "Only the pNetwork can mint tokens!");
        require(recipient != address(0), "pToken: Cannot mint to the zero address!");
        _mint(recipient, value);
        if (userData.length > 0) {
            // pNetwork aims to deliver cross chain messages successfully regardless of what the user may do with them.
            // We do not want this mint transaction reverting if their receiveUserData function reverts,
            // and thus we swallow any such errors, emitting a `ReceiveUserDataFailed` event instead.
            // The low-level call is used because in the solidity version this contract was written in,
            // a try/catch block fails to catch the revert caused if the receiver is not in fact a contract.
            // This way, a user also has the option include userData even when minting to an externally owned account.
            bytes memory data = abi.encodeWithSelector(IPReceiver.receiveUserData.selector, userData);
            (bool success, ) = recipient.call(data);
            if (!success) emit ReceiveUserDataFailed();
        }
        return true;
    }

    function redeem(
        uint256 amount,
        string calldata underlyingAssetRecipient,
        bytes4 destinationChainId
    ) external returns (bool) {
        redeem(amount, "", underlyingAssetRecipient, destinationChainId);
        return true;
    }

    function redeem(
        uint256 amount,
        bytes memory data,
        string memory underlyingAssetRecipient,
        bytes4 destinationChainId
    ) public {
        _burn(_msgSender(), amount);
        emit Redeem(_msgSender(), amount, underlyingAssetRecipient, data, ORIGIN_CHAIN_ID, destinationChainId);
    }

    function owner() internal view returns (address) {
        return pNetwork;
    }
}
