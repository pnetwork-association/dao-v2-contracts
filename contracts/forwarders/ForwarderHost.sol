// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC777RecipientUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC777/IERC777RecipientUpgradeable.sol";
import {IERC1820Registry} from "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IForwarderHost} from "../interfaces/IForwarderHost.sol";
import {IStakingManager} from "../interfaces/IStakingManager.sol";
import {IBorrowingManager} from "../interfaces/IBorrowingManager.sol";
import {IRegistrationManager} from "../interfaces/IRegistrationManager.sol";
import {IPToken} from "../interfaces/external/IPToken.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {Errors} from "../libraries/Errors.sol";

contract ForwarderHost is
    IForwarderHost,
    IERC777RecipientUpgradeable,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public pToken;
    address public forwarderNative;
    address public stakingManager;
    address public borrowingManager;
    address public registrationManager;

    function initialize(
        address _pToken,
        address _forwarderNative,
        address _stakingManager,
        address _borrowingManager,
        address _registrationManager
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24).setInterfaceImplementer(
            address(this),
            keccak256("ERC777TokensRecipient"),
            address(this)
        );

        pToken = _pToken;
        forwarderNative = _forwarderNative;
        stakingManager = _stakingManager;
        borrowingManager = _borrowingManager;
        registrationManager = _registrationManager;
    }

    function tokensReceived(
        address /*_operator*/,
        address _from,
        address /*_to,*/,
        uint256 _amount,
        bytes calldata _userData,
        bytes calldata /*_operatorData*/
    ) external override {
        if (_from == address(0) && _msgSender() == pToken) {
            (, bytes memory userData, , address originatingAddress) = abi.decode(
                _userData,
                (bytes1, bytes, bytes4, address)
            );

            if (originatingAddress != forwarderNative) {
                revert Errors.InvalidOriginatingAddress(originatingAddress);
            }

            bytes4 fxSignature = abi.decode(userData, (bytes4));

            // bytes4(keccak256("stake(uint256,uint64,address)")
            if (fxSignature == 0x93ac045f) {
                (, uint64 duration, address receiver) = abi.decode(userData, (bytes4, uint64, address));
                IERC20Upgradeable(pToken).approve(stakingManager, _amount);
                IStakingManager(stakingManager).stake(_amount, duration, receiver);
            }

            // bytes4(keccak256("lend(uint256,uint64,address)")
            if (fxSignature == 0xbb7de928) {
                (, uint64 duration, address receiver) = abi.decode(userData, (bytes4, uint64, address));
                IERC20Upgradeable(pToken).approve(borrowingManager, _amount);
                IBorrowingManager(borrowingManager).lend(_amount, duration, receiver);
            }

            // bytes4(updateSentinelRegistrationByStaking(uint256,uint64,bytes,address))
            if (fxSignature == 0x7389fbc0) {
                (, uint64 duration, bytes memory signature, address owner) = abi.decode(
                    userData,
                    (bytes4, uint64, bytes, address)
                );
                IERC20Upgradeable(pToken).approve(registrationManager, _amount);
                IRegistrationManager(registrationManager).updateSentinelRegistrationByStaking(
                    _amount,
                    duration,
                    signature,
                    owner
                );
            }
        }
    }

    /// @inheritdoc IForwarderHost
    function unstake(uint256 amount, address receiver) external {
        IERC20Upgradeable(pToken).safeTransferFrom(_msgSender(), address(this), amount);
        IPToken(pToken).redeem(
            amount,
            abi.encode(bytes4(keccak256("unstake(uint256,address)")), receiver),
            Helpers.toAsciiString(forwarderNative),
            0x005fe7f9
        );
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
