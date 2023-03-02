// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC777RecipientUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC777/IERC777RecipientUpgradeable.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";

error CallFailed(address target, bytes data);
error InvalidUserData(bytes userData);

contract Forwarder is IERC777RecipientUpgradeable, Initializable, UUPSUpgradeable, OwnableUpgradeable {
    address public sender;
    address public token;

    function initialize(address _token, address _sender) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        sender = _sender;
        token = _token;
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 /*_amount*/,
        bytes calldata _userData,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_msgSender() == token && _from == sender) {
            (, bytes memory userData, , , , , , ) = abi.decode(_userData, (bytes1, bytes, bytes4, address, bytes4, address, bytes, bytes));

            (address[] memory targets, bytes[] memory data) = abi.decode(userData, (address[], bytes[]));

            if (targets.length != data.length) {
                revert InvalidUserData(userData);
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

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
