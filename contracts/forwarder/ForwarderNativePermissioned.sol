// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IForwarder} from "../interfaces/IForwarder.sol";
import {IErc20Vault} from "../interfaces/external/IErc20Vault.sol";
import {IPToken} from "../interfaces/external/IPToken.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {BytesLib} from "../libraries/BytesLib.sol";

error CallFailed(address target, bytes data);
error InvalidCallParams(address[] targets, bytes[] data, address caller);
error InvalidOriginAddress(address originAddress);
error InvalidCaller(address caller, address expected);

contract ForwarderNativePermissioned is IERC777Recipient, Context, Ownable {
    using SafeERC20 for IERC20;

    address public immutable token;
    address public immutable vault;
    mapping(address => bool) private _whitelistedOriginAddresses;

    constructor(address _token, address _vault) {
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        token = _token;
        vault = _vault; // set it to 0 on an host chain
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 /*_amount*/,
        bytes calldata _userData,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_msgSender() == token && _from == vault) {
            (, bytes memory userData, , address originAddress, , , , ) = abi.decode(
                _userData,
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

    function whitelistOriginAddress(address originAddress) external onlyOwner {
        _whitelistedOriginAddresses[originAddress] = true;
    }
}
