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

error CallFailed(address target, bytes data);
error InvalidCallParams(address[] targets, bytes[] data, address caller);
error InvalidOriginAddress(address originAddress);
error InvalidCaller(address caller, address expected);

contract ForwarderHost is IForwarder, IERC777Recipient, Context, Ownable, IPReceiver {
    using SafeERC20 for IERC20;

    address public immutable token;
    mapping(address => bool) private _whitelistedOriginAddresses;

    constructor(address _token) {
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );
        token = _token;
    }

    /// @inheritdoc IForwarder
    function call(uint256 amount, address to, bytes calldata data, bytes4 chainId) external {
        address msgSender = _msgSender();
        if (amount > 0) {
            IERC20(token).safeTransferFrom(msgSender, address(this), amount);
        }

        bytes memory effectiveUserData = abi.encode(data, msgSender);
        uint256 effectiveAmount = amount == 0 ? 1 : amount;

        IPToken(token).redeem(effectiveAmount, effectiveUserData, Helpers.addressToAsciiString(to), chainId);
    }

    function receiveUserData(bytes calldata _metadata) external override {
        if (_msgSender() == token)
            _processMetadata(_metadata);
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 /*_amount*/,
        bytes calldata _metadata,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_msgSender() == token && _from == address(0))
            _processMetadata(_metadata);
    }

    function whitelistOriginAddress(address originAddress) external onlyOwner {
        _whitelistedOriginAddresses[originAddress] = true;
    }

    function _processMetadata(bytes memory _metadata) private {
        (, bytes memory userData, , address originAddress, , , , ) = abi.decode(
            _metadata,
            (bytes1, bytes, bytes4, address, bytes4, address, bytes, bytes)
        );

        (bytes memory callsAndTargets, address caller) = abi.decode(userData, (bytes, address));
        if (!_whitelistedOriginAddresses[originAddress]) {
            revert InvalidOriginAddress(originAddress);
        }

        (address[] memory targets, bytes[] memory data) = abi.decode(callsAndTargets, (address[], bytes[]));

        if (targets.length != data.length) {
            revert InvalidCallParams(targets, data, caller);
        }

        for (uint256 i = 0; i < targets.length; ) {
            // NOTE: avoid to check the caller if function is approve
            if (bytes4(data[i]) != 0x095ea7b3) {
                bytes memory addrSlot = BytesLib.slice(data[i], 4, 36);
                address expectedCaller = address(BytesLib.toAddress(addrSlot, 32 - 20));

                // NOTE: needed to for example avoid someone to vote for someone else
                if (expectedCaller != caller) {
                    revert InvalidCaller(caller, expectedCaller);
                }
            }

            (bool success, ) = targets[i].call(data[i]);
            if (!success) {
                revert CallFailed(targets[i], data[i]);
            }

            unchecked {
                ++i;
            }
        }
    }
}
