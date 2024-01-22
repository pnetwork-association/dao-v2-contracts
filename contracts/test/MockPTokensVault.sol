// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.17;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract MockPTokensVault {
    using SafeERC20 for IERC20;

    bytes4 public immutable ORIGIN_CHAIN_ID;

    event PegIn(
        address _tokenAddress,
        address _tokenSender,
        uint256 _tokenAmount,
        string _destinationAddress,
        bytes _userData,
        bytes4 _originChainId,
        bytes4 _destinationChainId
    );

    constructor(bytes4 originChainId) {
        ORIGIN_CHAIN_ID = originChainId;
    }

    function pegIn(
        uint256 _tokenAmount,
        address _tokenAddress,
        string memory _destinationAddress,
        bytes memory _userData,
        bytes4 _destinationChainId
    ) external returns (bool) {
        require(_tokenAmount > 0, "Token amount must be greater than zero!");
        IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _tokenAmount);
        emit PegIn(
            _tokenAddress,
            msg.sender,
            _tokenAmount,
            _destinationAddress,
            _userData,
            ORIGIN_CHAIN_ID,
            _destinationChainId
        );
        return true;
    }

    function pegOut(
        address _tokenRecipient,
        address _tokenAddress,
        uint256 _tokenAmount,
        bytes calldata _userData
    ) external returns (bool) {}
}
