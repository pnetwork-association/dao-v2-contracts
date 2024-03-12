// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/interfaces/IERC777Recipient.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

contract CrossExecutor is Context, Ownable, IERC777Recipient {
    using SafeERC20 for IERC20;

    address public immutable TOKEN;
    address public immutable VAULT;
    address public immutable CALLER;

    mapping(bytes4 => mapping(string => bool)) private _whitelistedOriginAddresses;

    error InvalidMetadataVersion(bytes1 version);
    error InvalidOriginAddress(bytes4 originNetworkId, string originAddress);
    error InvalidCallParams(address[] targets, bytes[] data, bytes4 networkId, address caller);
    error CallFailed(address target, bytes data);
    error InvalidCaller(address caller, address expected);

    constructor(address _token, address _vault, address _caller) {
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );
        TOKEN = _token;
        VAULT = _vault;
        CALLER = _caller;
    }

    function whitelistOriginAddress(bytes4 networkId, string calldata originAddress) external onlyOwner {
        _whitelistedOriginAddresses[networkId][originAddress] = true;
    }

    function dewhitelistOriginAddress(bytes4 networkId, string calldata originAddress) external onlyOwner {
        delete _whitelistedOriginAddresses[networkId][originAddress];
    }

    /// @inheritdoc IERC777Recipient
    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 /*_amount*/,
        bytes calldata _metadata,
        bytes calldata /*_operatorData*/
    ) external {
        if (_msgSender() == TOKEN && _from == VAULT) {
            (bytes1 metadataVersion, bytes memory userData, bytes4 originNetworkId, string memory originAddress) = abi
                .decode(_metadata, (bytes1, bytes, bytes4, string));

            if (metadataVersion != 0x03) revert InvalidMetadataVersion(metadataVersion);

            if (!_whitelistedOriginAddresses[originNetworkId][originAddress])
                revert InvalidOriginAddress(originNetworkId, originAddress);

            (bytes memory callsAndTargets, address _caller) = abi.decode(userData, (bytes, address));
            if (_caller != CALLER) revert InvalidCaller(_caller, CALLER);

            (address[] memory targets, bytes[] memory data) = abi.decode(callsAndTargets, (address[], bytes[]));

            if (targets.length != data.length) revert InvalidCallParams(targets, data, originNetworkId, CALLER);

            for (uint256 i = 0; i < targets.length; ) {
                (bool success, ) = targets[i].call(data[i]);
                if (!success) revert CallFailed(targets[i], data[i]);

                unchecked {
                    ++i;
                }
            }
        }
    }
}
