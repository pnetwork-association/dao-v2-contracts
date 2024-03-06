// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

error CallFailed(address target, bytes data);
error InvalidCallParams(address[] targets, bytes[] data, address caller);
error InvalidOriginAddress(address originAddress);
error InvalidCaller(address caller, address expected);

contract CrossExecutor is IERC777Recipient, Context, Ownable {
    address public immutable token;
    address public immutable sender;
    mapping(address => bool) private _whitelistedOriginAddresses;

    constructor(address _token, address _sender) {
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        token = _token;
        sender = _sender; // set it to 0 on an host chain, vault address on a native chain
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 /*_amount*/,
        bytes calldata _metaData,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_msgSender() == token && _from == sender) {
            (, bytes memory callsAndTargets, , address originAddress, , , , ) = abi.decode(
                _metaData,
                (bytes1, bytes, bytes4, address, bytes4, address, bytes, bytes)
            );

            if (!_whitelistedOriginAddresses[originAddress]) {
                revert InvalidOriginAddress(originAddress);
            }

            (address[] memory targets, bytes[] memory data) = abi.decode(callsAndTargets, (address[], bytes[]));

            if (targets.length != data.length) {
                revert InvalidCallParams(targets, data, originAddress);
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

    function call(address to, bytes memory data) external onlyOwner {
        (bool success, ) = to.call(data);
        if (!success) {
            revert CallFailed(to, data);
        }
    }

    function whitelistOriginAddress(address originAddress) external onlyOwner {
        _whitelistedOriginAddresses[originAddress] = true;
    }

    function dewhitelistOriginAddress(address originAddress) external onlyOwner {
        delete _whitelistedOriginAddresses[originAddress];
    }
}
