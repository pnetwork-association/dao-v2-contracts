// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IForwarder} from "../interfaces/IForwarder.sol";
import {IPReceiver} from "../interfaces/external/IPReceiver.sol";
import {IPToken} from "../interfaces/external/IPToken.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {BytesLib} from "../libraries/BytesLib.sol";
import "hardhat/console.sol";

error CallFailed(address target, bytes data);
error InvalidCallParams(address[] targets, bytes[] data, address caller);
error InvalidOriginAddress(address originAddress);
error InvalidCaller(address caller, address expected);

contract ForwarderHostPermissioned is IForwarder, Context, Ownable {
    using SafeERC20 for IERC20;

    address public immutable caller;
    address public immutable token;
    mapping(address => bool) private _whitelistedOriginAddresses;

    constructor(address _caller, address _token) {
        caller = _caller;
        token = _token;
    }

    modifier onlyAdmitted() {
        address msgSender = _msgSender();
        if (caller != msgSender) {
            revert InvalidCaller(msgSender, caller);
        }
        _;
    }

    /// @inheritdoc IForwarder
    function call(uint256 amount, address to, bytes calldata data, bytes4 chainId) external onlyAdmitted() {
        address msgSender = _msgSender();
        if (amount > 0) {
            IERC20(token).safeTransferFrom(msgSender, address(this), amount);
        }

        bytes memory effectiveUserData = abi.encode(data, msgSender);
        uint256 effectiveAmount = amount == 0 ? 1 : amount;
        IPToken(token).redeem(effectiveAmount, effectiveUserData, Helpers.addressToAsciiString(to), chainId);
    }
}
