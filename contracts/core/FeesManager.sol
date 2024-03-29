// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ForwarderRecipientUpgradeable} from "../forwarder/ForwarderRecipientUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {ILendingManager} from "../interfaces/ILendingManager.sol";
import {IRegistrationManager} from "../interfaces/IRegistrationManager.sol";
import {IFeesManager} from "../interfaces/IFeesManager.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/Constants.sol";
import {Roles} from "../libraries/Roles.sol";

contract FeesManager is IFeesManager, Initializable, UUPSUpgradeable, ForwarderRecipientUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(uint256 => mapping(address => uint256)) _epochsSentinelsStakingAssetsFee;
    mapping(uint256 => mapping(address => uint256)) _epochsSentinelsBorrowingAssetsFee;
    mapping(address => mapping(address => mapping(uint16 => bool))) _ownersEpochsAssetsClaim;

    uint24 public minimumBorrowingFee;

    address public epochsManager;
    address public lendingManager;
    address public registrationManager;

    function initialize(
        address _epochsManager,
        address _lendingManager,
        address _registrationManager,
        address _forwarder,
        uint24 _minimumBorrowingFee
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __ForwarderRecipientUpgradeable_init(_forwarder);

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(SET_FORWARDER_ROLE, _msgSender());

        epochsManager = _epochsManager;
        lendingManager = _lendingManager;
        registrationManager = _registrationManager;
        minimumBorrowingFee = _minimumBorrowingFee;
    }

    /// @inheritdoc IFeesManager
    function claimableFeeByEpochOf(address sentinel, address asset, uint16 epoch) public view returns (uint256) {
        if (_ownersEpochsAssetsClaim[sentinel][asset][epoch]) {
            return 0;
        }

        IRegistrationManager.Registration memory registration = IRegistrationManager(registrationManager)
            .sentinelRegistration(sentinel);

        uint256 fee = 0;
        if (registration.kind == Constants.REGISTRATION_SENTINEL_STAKING) {
            uint256 totalStakedAmount = IRegistrationManager(registrationManager).totalSentinelStakedAmountByEpoch(
                epoch
            );
            if (totalStakedAmount == 0) {
                return 0;
            }

            uint256 sentinelStakingAssetFee = _epochsSentinelsStakingAssetsFee[epoch][asset];
            uint256 stakedAmount = IRegistrationManager(registrationManager).sentinelStakedAmountByEpochOf(
                sentinel,
                epoch
            );

            fee = (stakedAmount * sentinelStakingAssetFee) / totalStakedAmount;
        }
        if (registration.kind == Constants.REGISTRATION_SENTINEL_BORROWING) {
            uint256 totalBorrowedAmount = ILendingManager(lendingManager).totalBorrowedAmountByEpoch(epoch);
            if (totalBorrowedAmount == 0) {
                return 0;
            }

            uint256 sentinelsBorrowingAssetFee = _epochsSentinelsBorrowingAssetsFee[epoch][asset];
            uint256 borrowedAmount = ILendingManager(lendingManager).borrowedAmountByEpochOf(sentinel, epoch);
            fee = (borrowedAmount * sentinelsBorrowingAssetFee) / totalBorrowedAmount;
        }

        return fee;
    }

    /// @inheritdoc IFeesManager
    function claimableFeesByEpochsRangeOf(
        address sentinel,
        address[] calldata assets,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](((endEpoch + 1) - startEpoch) * assets.length);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            for (uint8 i = 0; i < assets.length; i++) {
                result[((epoch - startEpoch) * assets.length) + i] = claimableFeeByEpochOf(sentinel, assets[i], epoch);
            }
        }
        return result;
    }

    /// @inheritdoc IFeesManager
    function claimFeeByEpoch(address asset, uint16 epoch) external {
        address owner = _msgSender();

        if (epoch >= IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        address sentinel = IRegistrationManager(registrationManager).sentinelOf(owner);
        if (sentinel == address(0)) {
            revert Errors.SentinelNotRegistered();
        }

        uint256 fee = claimableFeeByEpochOf(sentinel, asset, epoch);
        if (fee == 0) {
            revert Errors.NothingToClaim();
        }

        _ownersEpochsAssetsClaim[sentinel][asset][epoch] = true;
        IERC20Upgradeable(asset).safeTransfer(owner, fee);
        emit FeeClaimed(owner, sentinel, epoch, asset, fee);
    }

    /// @inheritdoc IFeesManager
    function claimFeeByEpochsRange(address asset, uint16 startEpoch, uint16 endEpoch) external {
        address owner = _msgSender();

        if (endEpoch > IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        address sentinel = IRegistrationManager(registrationManager).sentinelOf(owner);
        if (sentinel == address(0)) {
            revert Errors.SentinelNotRegistered();
        }

        uint256 cumulativeFee = 0;
        uint256 fee = 0;
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            fee = claimableFeeByEpochOf(sentinel, asset, epoch);
            if (fee > 0) {
                _ownersEpochsAssetsClaim[sentinel][asset][epoch] = true;
                cumulativeFee += fee;
                emit FeeClaimed(owner, sentinel, epoch, asset, fee);
            }

            unchecked {
                ++epoch;
            }
        }

        if (cumulativeFee == 0) {
            revert Errors.NothingToClaim();
        }

        IERC20Upgradeable(asset).safeTransfer(owner, cumulativeFee);
    }

    /// @inheritdoc IFeesManager
    function depositFee(address asset, uint256 amount) external {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        uint256 totalBorrowedAmount = ILendingManager(lendingManager).totalBorrowedAmountByEpoch(currentEpoch);
        uint256 totalStakedAmount = IRegistrationManager(registrationManager).totalSentinelStakedAmountByEpoch(
            currentEpoch
        );
        uint256 totalAmount = totalStakedAmount + totalBorrowedAmount;

        uint256 sentinelsStakingFeesAmount = totalAmount > 0 ? (amount * totalStakedAmount) / totalAmount : 0;
        uint256 sentinelsBorrowingFeesAndLendersRewardsAmount = amount - sentinelsStakingFeesAmount;
        uint256 lendersRewardsAmount = (sentinelsBorrowingFeesAndLendersRewardsAmount * kByEpoch(currentEpoch)) /
            Constants.DECIMALS_PRECISION;
        uint256 sentinelsBorrowingFeesAmount = sentinelsBorrowingFeesAndLendersRewardsAmount - lendersRewardsAmount;

        if (lendersRewardsAmount > 0) {
            IERC20Upgradeable(asset).approve(lendingManager, lendersRewardsAmount);
            ILendingManager(lendingManager).depositReward(asset, currentEpoch, lendersRewardsAmount);
        }

        if (sentinelsStakingFeesAmount > 0) {
            _epochsSentinelsStakingAssetsFee[currentEpoch][asset] += sentinelsStakingFeesAmount;
        }

        if (sentinelsBorrowingFeesAmount > 0) {
            _epochsSentinelsBorrowingAssetsFee[currentEpoch][asset] += sentinelsBorrowingFeesAmount;
        }

        emit FeeDeposited(asset, currentEpoch, amount);
    }

    /// @inheritdoc IFeesManager
    function kByEpoch(uint16 epoch) public view returns (uint256) {
        uint256 utilizationRatio = ILendingManager(lendingManager).utilizationRatioByEpoch(epoch);
        if (utilizationRatio == 0) {
            return 0;
        }

        uint256 k = ((utilizationRatio * utilizationRatio) / Constants.DECIMALS_PRECISION) + minimumBorrowingFee;
        return k > Constants.DECIMALS_PRECISION ? Constants.DECIMALS_PRECISION : k;
    }

    /// @inheritdoc IFeesManager
    function kByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = kByEpoch(epoch);
        }
        return result;
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}
}
