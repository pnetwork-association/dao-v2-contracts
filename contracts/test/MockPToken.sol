// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";

contract MockPToken is ERC777 {
    address public pNetwork;
    bytes4 public ORIGIN_CHAIN_ID;

    event Redeem(
        address indexed redeemer,
        uint256 value,
        string underlyingAssetRecipient,
        bytes4 originChainId,
        bytes4 destinationChainId
    );

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address[] memory defaultOperators,
        address _pnetwork,
        bytes4 originChainId
    ) ERC777(tokenName, tokenSymbol, defaultOperators) {
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
        _mint(recipient, value, userData, operatorData);
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

    function operatorRedeem(
        address account,
        uint256 amount,
        bytes calldata data,
        bytes calldata operatorData,
        string calldata underlyingAssetRecipient,
        bytes4 destinationChainId
    ) external {
        require(isOperatorFor(_msgSender(), account), "ERC777: caller is not an operator for holder");
        _burn(account, amount, data, operatorData);
        emit Redeem(account, amount, underlyingAssetRecipient, ORIGIN_CHAIN_ID, destinationChainId);
    }

    function redeem(
        uint256 amount,
        bytes memory data,
        string memory underlyingAssetRecipient,
        bytes4 destinationChainId
    ) public {
        _burn(_msgSender(), amount, data, "");
        emit Redeem(msg.sender, amount, underlyingAssetRecipient, ORIGIN_CHAIN_ID, destinationChainId);
    }

    function owner() internal view returns (address) {
        return pNetwork;
    }
}
