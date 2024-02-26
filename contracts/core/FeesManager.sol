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
    mapping(address => mapping(uint16 => address)) _challengersEpochsClaimRedirect;
    mapping(uint256 => mapping(address => uint256)) _epochsGuardiansAssetsFee;

    uint32 public minimumBorrowingFee;
    address public epochsManager;
    address public lendingManager;
    address public registrationManager;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _epochsManager,
        address _lendingManager,
        address _registrationManager,
        address _forwarder,
        uint32 _minimumBorrowingFee
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
    function challengerClaimRedirectByEpochsRangeOf(
        address actor,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (address[] memory) {
        address[] memory result = new address[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            result[epoch] = challengerClaimRedirectByEpochOf(actor, epoch);
            unchecked {
                ++epoch;
            }
        }
        return result;
    }

    /// @inheritdoc IFeesManager
    function challengerClaimRedirectByEpochOf(address actor, uint16 epoch) public view returns (address) {
        return _challengersEpochsClaimRedirect[actor][epoch];
    }

    /// @inheritdoc IFeesManager
    function claimableFeeByEpochOf(address actor, address asset, uint16 epoch) public view returns (uint256) {
        if (_ownersEpochsAssetsClaim[actor][asset][epoch]) {
            return 0;
        }

        IRegistrationManager.Registration memory registration = IRegistrationManager(registrationManager)
            .registrationOf(actor);
        bytes1 registrationKind = registration.kind;

        uint256 fee = 0;
        if (registrationKind == Constants.REGISTRATION_SENTINEL_STAKING) {
            uint256 totalStakedAmount = IRegistrationManager(registrationManager).totalSentinelStakedAmountByEpoch(
                epoch
            );
            if (totalStakedAmount == 0) {
                return 0;
            }

            uint256 sentinelStakingAssetFee = _epochsSentinelsStakingAssetsFee[epoch][asset];
            uint256 stakedAmount = IRegistrationManager(registrationManager).sentinelStakedAmountByEpochOf(
                actor,
                epoch
            );

            fee = (stakedAmount * sentinelStakingAssetFee) / totalStakedAmount;
        }
        if (registrationKind == Constants.REGISTRATION_SENTINEL_BORROWING) {
            uint256 totalBorrowedAmount = ILendingManager(lendingManager).totalBorrowedAmountByEpoch(epoch);
            if (totalBorrowedAmount == 0) {
                return 0;
            }

            uint256 sentinelsBorrowingAssetFee = _epochsSentinelsBorrowingAssetsFee[epoch][asset];
            uint256 borrowedAmount = ILendingManager(lendingManager).borrowedAmountByEpochOf(actor, epoch);
            fee = (borrowedAmount * sentinelsBorrowingAssetFee) / totalBorrowedAmount;
        }
        if (registrationKind == Constants.REGISTRATION_GUARDIAN) {
            uint256 totalNumberOfGuardians = IRegistrationManager(registrationManager).totalNumberOfGuardiansByEpoch(
                epoch
            );
            uint256 totalGuardiansAmount = totalNumberOfGuardians * Constants.GUARDIAN_AMOUNT;
            if (totalGuardiansAmount == 0) {
                return 0;
            }

            uint256 guardiansAssetFee = _epochsGuardiansAssetsFee[epoch][asset];
            fee = (Constants.GUARDIAN_AMOUNT * guardiansAssetFee) / totalGuardiansAmount;
        }

        return fee;
    }

    /// @inheritdoc IFeesManager
    function claimableFeesByEpochsRangeOf(
        address actor,
        address[] calldata assets,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](((endEpoch + 1) - startEpoch) * assets.length);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            for (uint8 i = 0; i < assets.length; i++) {
                result[((epoch - startEpoch) * assets.length) + i] = claimableFeeByEpochOf(actor, assets[i], epoch);
            }
        }
        return result;
    }

    /// @inheritdoc IFeesManager
    function claimFeeByEpoch(address owner, address asset, uint16 epoch) public {
        if (epoch >= IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        address actor = IRegistrationManager(registrationManager).sentinelOf(owner);
        if (actor == address(0)) {
            actor = IRegistrationManager(registrationManager).guardianOf(owner);
            if (actor == address(0)) {
                revert Errors.NothingToClaim();
            }
        }

        uint256 fee = claimableFeeByEpochOf(actor, asset, epoch);
        if (fee == 0) {
            revert Errors.NothingToClaim();
        }

        // NOTE: if a borrowing sentinel or a guardian have been slashed (aka redirectClaimToChallengerByEpoch)
        // the fees earned until the slashing can be claimed by the challenger for the epoch in which the slashing happened
        address challenger = _challengersEpochsClaimRedirect[actor][epoch];
        address receiver = challenger != address(0) ? challenger : owner;

        _ownersEpochsAssetsClaim[actor][asset][epoch] = true;
        IERC20Upgradeable(asset).safeTransfer(receiver, fee);
        emit FeeClaimed(receiver, actor, epoch, asset, fee);
    }

    /// @inheritdoc IFeesManager
    function claimFeeByEpochsRange(address owner, address asset, uint16 startEpoch, uint16 endEpoch) external {
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            // NOTE: impossible to use the cumulative claim since in an epoch the fees
            // could be claimed by a challenger that slashed a sentinel/guardian
            claimFeeByEpoch(owner, asset, epoch);
            unchecked {
                ++epoch;
            }
        }
    }

    /// @inheritdoc IFeesManager
    function depositFee(address asset, uint256 amount) external {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        uint256 totalBorrowedAmount = ILendingManager(lendingManager).totalBorrowedAmountByEpoch(currentEpoch);
        uint256 totalStakedAmount = IRegistrationManager(registrationManager).totalSentinelStakedAmountByEpoch(
            currentEpoch
        );
        uint256 totalNumberOfGuardians = IRegistrationManager(registrationManager).totalNumberOfGuardiansByEpoch(
            currentEpoch
        );
        uint256 totalGuardiansAmount = totalNumberOfGuardians * Constants.GUARDIAN_AMOUNT;
        uint256 totalAmount = totalStakedAmount + totalBorrowedAmount + totalGuardiansAmount;
        uint256 sentinelsStakingFeesAmount = totalAmount > 0 ? (amount * totalStakedAmount) / totalAmount : 0;
        uint256 guardiansFeesAmount = totalAmount > 0 ? (amount * totalGuardiansAmount) / totalAmount : 0;
        uint256 sentinelsBorrowingFeesAndLendersRewardsAmount = amount -
            sentinelsStakingFeesAmount -
            guardiansFeesAmount;
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

        if (guardiansFeesAmount > 0) {
            _epochsGuardiansAssetsFee[currentEpoch][asset] += guardiansFeesAmount;
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

    /// @inheritdoc IFeesManager
    function redirectClaimToChallengerByEpoch(
        address actor,
        address challenger,
        uint16 epoch
    ) external onlyRole(Roles.REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE) {
        _challengersEpochsClaimRedirect[actor][epoch] = challenger;
        emit ClaimRedirectedToChallenger(actor, challenger, epoch);
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}
}
