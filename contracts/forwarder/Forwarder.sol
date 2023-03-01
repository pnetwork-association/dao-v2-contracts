// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IERC777RecipientUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC777/IERC777RecipientUpgradeable.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IErc20Vault} from "../interfaces/external/IErc20Vault.sol";
import {IForwarder} from "../interfaces/IForwarder.sol";
import {Roles} from "../libraries/Roles.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {Errors} from "../libraries/Errors.sol";

contract Forwarder is
    IForwarder,
    IERC777RecipientUpgradeable,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public sender;
    address public token;
    address public originatingAddress;

    function initialize(address _token, address _sender) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

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
            (, bytes memory userData, , address originatingAddress_) = abi.decode(
                _userData,
                (bytes1, bytes, bytes4, address)
            );

            if (originatingAddress_ != originatingAddress) {
                revert Errors.InvalidOriginatingAddress(originatingAddress);
            }

            (address[] memory targets, bytes[] memory data) = abi.decode(userData, (address[], bytes[]));

            uint256 targetsLength = targets.length;
            for (uint256 i = 0; i < targetsLength; ) {
                (bool success, ) = targets[i].call(data[i]);
                if (!success) {
                    revert Errors.CallFailed(targets[i], data[i]);
                }

                unchecked {
                    ++i;
                }
            }
        }
    }

    /// @inheritdoc IForwarder
    function setOriginatingAddress(address _originatingAddress) external onlyRole(Roles.SET_ORIGINATING_ADDRESS_ROLE) {
        originatingAddress = _originatingAddress;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
