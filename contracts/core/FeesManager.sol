// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IBorrowingManager} from "../interfaces/IBorrowingManager.sol";
import {IRegistrationManager} from "../interfaces/IRegistrationManager.sol";
import {IFeesManager} from "../interfaces/IFeesManager.sol";
import {IStakingManager} from "../interfaces/external/IStakingManager.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/Constants.sol";

import "hardhat/console.sol";

contract FeesManager is
    IFeesManager,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(uint256 => mapping(address => uint256)) _epochsAssetsFee;
    mapping(address => mapping(uint256 => bool)) _ownersEpochsClaim;

    address public epochsManager;
    address public borrowingManager;
    address public registrationManager;

    function initialize(
        address epochsManager_,
        address borrowingManager_,
        address registrationManager_
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        epochsManager = epochsManager_;
        borrowingManager = borrowingManager_;
        registrationManager = registrationManager_;
    }

    function k() public pure returns (uint256) {
        return 1;
    }

    function z() public pure returns (uint256) {
        return 1;
    }

    function depositFee(address asset, uint256 amount) external {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        uint256 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint256 kAmount = k() * amount;

        IERC20Upgradeable(asset).approve(borrowingManager, kAmount);
        IBorrowingManager(borrowingManager).depositInterest(asset, currentEpoch, kAmount);

        _epochsAssetsFee[currentEpoch][asset] += (amount - kAmount);

        emit FeeDeposited(asset, currentEpoch, amount);
    }

    function claimFee(address asset, uint256 epoch) external {
        address owner = _msgSender();

        address sentinel = IRegistrationManager(registrationManager).sentinelOf(owner);
        if (sentinel == address(0)) revert Errors.SentinelNotRegistered();

        // TODO: adds continuos claiming (aka remove _ownersEpochsClaim)

        if (_ownersEpochsClaim[owner][epoch]) revert Errors.AlreadyClaimed();

        uint256 reservedAmount = IRegistrationManager(registrationManager).sentinelReservedAmountByEpochOf(
            epoch,
            sentinel
        );
        uint256 amount = reservedAmount * z();
        _ownersEpochsClaim[owner][epoch] = true;
        IERC20Upgradeable(asset).safeTransfer(owner, amount);

        emit FeeClaimed(owner, sentinel, epoch, asset, amount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
