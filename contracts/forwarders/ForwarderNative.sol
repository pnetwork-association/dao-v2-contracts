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
import {IForwarderNative} from "../interfaces/IForwarderNative.sol";
import {Roles} from "../libraries/Roles.sol";
import {IErc20Vault} from "../interfaces/external/IErc20Vault.sol";
import {Helpers} from "../libraries/Helpers.sol";

contract ForwarderNative is
    IForwarderNative,
    IERC777RecipientUpgradeable,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public vault;
    address public token;
    address public forwarderHost;

    function initialize(address _token, address _vault) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        vault = _vault;
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
        /*if (_msgSender() == erc777 && _from == vault) {
            (, bytes memory userData, , address originatingAddress) = abi.decode(_userData, (bytes1, bytes, bytes4, address));
            require(originatingAddress == basicERC1155Host, "BasicERC1155Native: Invalid originating address");
        }*/
    }

    /// @inheritdoc IForwarderNative
    function lend(uint256 amount, uint64 duration, address lender) external {
        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20Upgradeable(token).approve(vault, amount);
        IErc20Vault(vault).pegIn(
            amount,
            token,
            Helpers.toAsciiString(forwarderHost),
            abi.encode(bytes4(keccak256("lend(uint256,uint64,address)")), duration, lender),
            0x0075dd4c
        );
    }

    /// @inheritdoc IForwarderNative
    function setForwarderHost(address _forwarderHost) external onlyRole(Roles.SET_FORWARDER_HOST_ROLE) {
        forwarderHost = _forwarderHost;
    }

    /// @inheritdoc IForwarderNative
    function stake(uint256 amount, uint64 duration, address receiver) external {
        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20Upgradeable(token).approve(vault, amount);
        IErc20Vault(vault).pegIn(
            amount,
            token,
            Helpers.toAsciiString(forwarderHost),
            abi.encode(bytes4(keccak256("stake(uint256,uint64,address)")), duration, receiver),
            0x0075dd4c
        );
    }

    /// @inheritdoc IForwarderNative
    function updateSentinelRegistrationByStaking(
        uint256 amount,
        uint64 duration,
        bytes calldata signature,
        address owner
    ) external {
        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20Upgradeable(token).approve(vault, amount);
        IErc20Vault(vault).pegIn(
            amount,
            token,
            Helpers.toAsciiString(forwarderHost),
            abi.encode(
                bytes4(keccak256("updateSentinelRegistrationByStaking(uint256,uint64,bytes,address)")),
                duration,
                signature,
                owner
            ),
            0x0075dd4c
        );
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
