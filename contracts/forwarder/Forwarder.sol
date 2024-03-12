// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IERC777Recipient} from "@openzeppelin/contracts/interfaces/IERC777Recipient.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IForwarder} from "../interfaces/IForwarder.sol";
import {IERC20Vault} from "../interfaces/external/IERC20Vault.sol";
import {IPReceiver} from "../interfaces/external/IPReceiver.sol";
import {IPToken} from "../interfaces/external/IPToken.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {BytesLib} from "../libraries/BytesLib.sol";

contract Forwarder is Context, Ownable, IERC777Recipient, IForwarder, IPReceiver {
    using SafeERC20 for IERC20;

    address public immutable TOKEN;
    address public immutable VAULT;

    mapping(bytes4 => mapping(string => bool)) private _whitelistedOriginAddresses;
    mapping(bytes4 => bool) private _unprivilegedCalls;

    error InvalidMetadataVersion(bytes1 version);
    error InvalidOriginAddress(bytes4 originNetworkId, string originAddress);
    error InvalidCallParams(address[] targets, bytes[] data, bytes4 networkId, address caller);
    error CallFailed(address target, bytes data);
    error InvalidCaller(address caller, address expected);

    constructor(address _token, address _vault) {
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );
        TOKEN = _token;
        VAULT = _vault; // set it to 0 on an host chain
    }

    function addUnprivilegedCall(bytes4 _call) external onlyOwner {
        _unprivilegedCalls[_call] = true;
    }

    function removeUnprivilegedCall(bytes4 _call) external onlyOwner {
        delete _unprivilegedCalls[_call];
    }

    function whitelistOriginAddress(bytes4 networkId, string calldata originAddress) external onlyOwner {
        _whitelistedOriginAddresses[networkId][originAddress] = true;
    }

    function dewhitelistOriginAddress(bytes4 networkId, string calldata originAddress) external onlyOwner {
        delete _whitelistedOriginAddresses[networkId][originAddress];
    }

    /// @inheritdoc IForwarder
    function call(uint256 amount, address to, bytes calldata data, bytes4 chainId) external {
        address msgSender = _msgSender();
        bytes memory effectiveUserData = abi.encode(data, msgSender);

        // NOTE: whenever the caller specified 0 for amount, use the bare minimum of 1 wei to deliver messages via pNetwork v2,
        // e.g. when voting from another chain. The Forwarder contract will need a small reserve of PNT in this case.
        // Otherwise, withdraw the specified amount from the caller, e.g. when staking from another chain.
        uint256 effectiveAmount = amount == 0 ? 1 : amount;

        if (amount > 0) IERC20(TOKEN).safeTransferFrom(msgSender, address(this), amount);

        if (VAULT == address(0))
            IPToken(TOKEN).redeem(effectiveAmount, effectiveUserData, Helpers.addressToAsciiString(to), chainId);
        else {
            IERC20(TOKEN).safeApprove(VAULT, effectiveAmount);
            IERC20Vault(VAULT).pegIn(
                effectiveAmount,
                TOKEN,
                Helpers.addressToAsciiString(to),
                effectiveUserData,
                chainId
            );
        }
    }

    /// @inheritdoc IPReceiver
    function receiveUserData(bytes calldata _metadata) external {
        if (_msgSender() == TOKEN) _processMetadata(_metadata);
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
        if (_msgSender() == TOKEN && _from == VAULT) _processMetadata(_metadata);
    }

    function _processMetadata(bytes memory _metadata) internal {
        (bytes1 metadataVersion, bytes memory userData, bytes4 originNetworkId, string memory originAddress) = abi
            .decode(_metadata, (bytes1, bytes, bytes4, string));

        if (metadataVersion != 0x03) revert InvalidMetadataVersion(metadataVersion);

        if (!_whitelistedOriginAddresses[originNetworkId][originAddress])
            revert InvalidOriginAddress(originNetworkId, originAddress);

        (bytes memory callsAndTargets, address caller) = abi.decode(userData, (bytes, address));
        (address[] memory targets, bytes[] memory data) = abi.decode(callsAndTargets, (address[], bytes[]));
        uint256 targetsLength = targets.length;

        if (targetsLength != data.length) revert InvalidCallParams(targets, data, originNetworkId, caller);

        for (uint256 i = 0; i < targetsLength; ) {
            // NOTE: avoid to check the caller if function is approve
            if (!_unprivilegedCalls[bytes4(data[i])]) {
                bytes memory addrSlot = BytesLib.slice(data[i], 4, 36);
                address expectedCaller = address(BytesLib.toAddress(addrSlot, 32 - 20));

                // NOTE: needed to for example avoid someone to vote for someone else
                if (expectedCaller != caller) revert InvalidCaller(caller, expectedCaller);
            }

            (bool success, ) = targets[i].call(data[i]);
            if (!success) revert CallFailed(targets[i], data[i]);

            unchecked {
                ++i;
            }
        }
    }
}
