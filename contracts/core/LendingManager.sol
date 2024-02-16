// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ForwarderRecipientUpgradeable} from "../forwarder/ForwarderRecipientUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IStakingManagerPermissioned} from "../interfaces/IStakingManagerPermissioned.sol";
import {ILendingManager} from "../interfaces/ILendingManager.sol";
import {IDandelionVoting} from "../interfaces/external/IDandelionVoting.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/Constants.sol";
import {Helpers} from "../libraries/Helpers.sol";

contract LendingManager is ILendingManager, Initializable, UUPSUpgradeable, ForwarderRecipientUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => uint32[]) private _borrowersEpochsBorrowedAmount;
    mapping(address => uint32[]) private _lendersEpochsWeight;
    mapping(address => mapping(uint256 => mapping(address => bool))) private _lendersEpochsAssetsRewardsClaim;
    mapping(address => mapping(uint256 => uint256)) private _totalEpochsAssetsRewardAmount;

    uint32[] private _epochsTotalLendedAmount;
    uint32[] private _epochsTotalBorrowedAmount;
    uint32[] private _epochTotalWeight;

    address public stakingManager;
    address public token;
    address public epochsManager;
    address public dandelionVoting;
    uint16 public lendMaxEpochs;

    function initialize(
        address _token,
        address _stakingManager,
        address _epochsManager,
        address _forwarder,
        address _dandelionVoting,
        uint16 _lendMaxEpochs
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __ForwarderRecipientUpgradeable_init(_forwarder);

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(SET_FORWARDER_ROLE, _msgSender());

        stakingManager = _stakingManager;
        token = _token;
        epochsManager = _epochsManager;
        dandelionVoting = _dandelionVoting;
        lendMaxEpochs = _lendMaxEpochs;

        _epochsTotalLendedAmount = new uint32[](Constants.AVAILABLE_EPOCHS);
        _epochsTotalBorrowedAmount = new uint32[](Constants.AVAILABLE_EPOCHS);
        _epochTotalWeight = new uint32[](Constants.AVAILABLE_EPOCHS);
    }

    /// @inheritdoc ILendingManager
    function borrow(uint256 amount, uint16 epoch, address borrower) external onlyRole(Roles.BORROW_ROLE) {
        if (amount == 0) revert Errors.InvalidAmount();
        uint32 truncatedAmount = Helpers.truncate(amount);

        // TODO: is it possible to borrow in the current epoch?

        if (_borrowersEpochsBorrowedAmount[borrower].length == 0) {
            _borrowersEpochsBorrowedAmount[borrower] = new uint32[](Constants.AVAILABLE_EPOCHS);
        }

        if (_epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch] < truncatedAmount) {
            revert Errors.AmountNotAvailableInEpoch(epoch);
        }

        _epochsTotalBorrowedAmount[epoch] += truncatedAmount;
        _borrowersEpochsBorrowedAmount[borrower][epoch] += truncatedAmount;

        emit Borrowed(borrower, epoch, amount);
    }

    /// @inheritdoc ILendingManager
    function borrowableAmountByEpoch(uint16 epoch) external view returns (uint32) {
        return _epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc ILendingManager
    function borrowedAmountByEpochOf(address borrower, uint16 epoch) external view returns (uint32) {
        return _borrowersEpochsBorrowedAmount[borrower][epoch];
    }


    /// @inheritdoc ILendingManager
    function changeToken(address token_) external onlyRole(Roles.CHANGE_TOKEN_ROLE) {
        address previousToken = token;
        token = token_;
        emit TokenChanged(previousToken, token);
    }

    /// @inheritdoc ILendingManager
    function claimableRewardsByEpochOf(address lender, address asset, uint16 epoch) public view returns (uint256) {
        if (_lendersEpochsAssetsRewardsClaim[lender][epoch][asset]) return 0;

        uint256 totalWeight = _epochTotalWeight[epoch];
        if (_lendersEpochsWeight[lender].length == 0 || totalWeight == 0) return 0;

        return
            (_totalEpochsAssetsRewardAmount[asset][epoch] * uint256(_lendersEpochsWeight[lender][epoch])) / totalWeight;
    }

    /// @inheritdoc ILendingManager
    function claimableAssetsAmountByEpochsRangeOf(
        address lender,
        address[] calldata assets,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](((endEpoch + 1) - startEpoch) * assets.length);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            for (uint8 i = 0; i < assets.length; i++) {
                result[((epoch - startEpoch) * assets.length) + i] = claimableRewardsByEpochOf(
                    lender,
                    assets[i],
                    epoch
                );
            }
        }
        return result;
    }

    /// @inheritdoc ILendingManager
    function claimRewardByEpoch(address asset, uint16 epoch) external {
        address lender = _msgSender();

        if (epoch >= IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        (uint256 numberOfVotes, uint256 votedVotes) = getLenderVotingStateByEpoch(lender, epoch);
        if (numberOfVotes == 0 || numberOfVotes > votedVotes) revert Errors.NotPartecipatedInGovernanceAtEpoch(epoch);

        uint256 reward = claimableRewardsByEpochOf(lender, asset, epoch);
        if (reward == 0) {
            revert Errors.NothingToClaim();
        }

        _lendersEpochsAssetsRewardsClaim[lender][epoch][asset] = true;
        IERC20Upgradeable(asset).safeTransfer(lender, reward);

        emit RewardClaimed(lender, asset, epoch, reward);
    }

    /// @inheritdoc ILendingManager
    function claimRewardByEpochsRange(address asset, uint16 startEpoch, uint16 endEpoch) external {
        address lender = _msgSender();

        if (endEpoch >= IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        uint256 cumulativeReward = 0;
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            (uint256 numberOfVotes, uint256 votedVotes) = getLenderVotingStateByEpoch(lender, epoch);
            if (numberOfVotes > votedVotes) continue;

            uint256 reward = claimableRewardsByEpochOf(lender, asset, epoch);
            if (reward > 0) {
                _lendersEpochsAssetsRewardsClaim[lender][epoch][asset] = true;
                cumulativeReward += reward;
                emit RewardClaimed(lender, asset, epoch, reward);
            }
            unchecked {
                ++epoch;
            }
        }

        if (cumulativeReward == 0) {
            revert Errors.NothingToClaim();
        }

        IERC20Upgradeable(asset).safeTransfer(lender, cumulativeReward);
    }

    /// @inheritdoc ILendingManager
    function depositReward(address asset, uint16 epoch, uint256 amount) external {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        _totalEpochsAssetsRewardAmount[asset][epoch] += amount;
        emit RewardDeposited(asset, epoch, amount);
    }

    /// @inheritdoc ILendingManager
    function getLenderVotingStateByEpoch(address lender, uint16 epoch) public returns (uint256, uint256) {
        address dandelionVotingAddress = dandelionVoting;
        uint256 numberOfVotes = IDandelionVoting(dandelionVotingAddress).votesLength();
        uint64 voteDuration = IDandelionVoting(dandelionVotingAddress).duration();

        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint256 startFirstEpochTimestamp = IEpochsManager(epochsManager).startFirstEpochTimestamp();

        uint256 epochStartDate = startFirstEpochTimestamp + (epoch * epochDuration);
        uint256 epochEndDate = epochStartDate + epochDuration - 1;

        uint256 epochNumberOfVotes = 0;
        uint256 epochVotedVotes = 0;

        for (uint256 voteId = numberOfVotes; voteId >= 1; ) {
            (, , uint64 voteStartDate, , , , , , , , ) = IDandelionVoting(dandelionVotingAddress).getVote(voteId);

            uint64 voteEndDate = voteStartDate + voteDuration;
            if (voteEndDate >= epochStartDate && voteEndDate <= epochEndDate) {
                unchecked {
                    ++epochNumberOfVotes;
                }

                if (
                    IDandelionVoting(dandelionVotingAddress).getVoterState(voteId, lender) !=
                    IDandelionVoting.VoterState.Absent
                ) {
                    unchecked {
                        ++epochVotedVotes;
                    }
                }
            }

            unchecked {
                --voteId;
            }
        }

        return (epochNumberOfVotes, epochVotedVotes);
    }

    /// @inheritdoc ILendingManager
    function increaseDuration(uint64 duration) external {
        _increaseDuration(_msgSender(), duration);
    }

    /// @inheritdoc ILendingManager
    function increaseDuration(address lender, uint64 duration) external onlyForwarder {
        _increaseDuration(lender, duration);
    }

    /// @inheritdoc ILendingManager
    function lend(address lender, uint256 amount, uint64 duration) external {
        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20Upgradeable(token).approve(stakingManager, amount);
        IStakingManagerPermissioned(stakingManager).stake(lender, amount, duration);
        _updateWeights(lender, amount, duration);
    }

    /// @inheritdoc ILendingManager
    function totalBorrowedAmountByEpoch(uint16 epoch) external view returns (uint32) {
        return _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc ILendingManager
    function totalBorrowedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochsTotalBorrowedAmount[epoch];
        }
        return result;
    }

    /// @inheritdoc ILendingManager
    function totalLendedAmountByEpoch(uint16 epoch) external view returns (uint32) {
        return _epochsTotalLendedAmount[epoch];
    }

    /// @inheritdoc ILendingManager
    function totalLendedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochsTotalLendedAmount[epoch];
        }
        return result;
    }

    /// @inheritdoc ILendingManager
    function release(address borrower, uint16 epoch, uint256 amount) external onlyRole(Roles.RELEASE_ROLE) {
        uint32 truncatedAmount = uint32(Helpers.truncate(amount));
        _epochsTotalBorrowedAmount[epoch] -= truncatedAmount;
        _borrowersEpochsBorrowedAmount[borrower][epoch] -= truncatedAmount;
        emit Released(borrower, epoch, amount);
    }

    /// @inheritdoc ILendingManager
    function totalAssetRewardAmountByEpoch(address asset, uint16 epoch) external view returns (uint256) {
        return _totalEpochsAssetsRewardAmount[asset][epoch];
    }

    /// @inheritdoc ILendingManager
    function totalWeightByEpoch(uint16 epoch) external view returns (uint32) {
        return _epochTotalWeight[epoch];
    }

    /// @inheritdoc ILendingManager
    function totalWeightByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochTotalWeight[epoch];
        }
        return result;
    }

    /// @inheritdoc ILendingManager
    function utilizationRatioByEpoch(uint16 epoch) public view returns (uint32) {
        uint32 size = _epochsTotalLendedAmount[epoch];
        return
            size > 0 ? uint32((uint256(_epochsTotalBorrowedAmount[epoch]) * Constants.DECIMALS_PRECISION) / size) : 0;
    }

    /// @inheritdoc ILendingManager
    function utilizationRatioByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = utilizationRatioByEpoch(epoch);
        }
        return result;
    }

    /// @inheritdoc ILendingManager
    function weightByEpochOf(address lender, uint16 epoch) external view returns (uint32) {
        return _lendersEpochsWeight[lender][epoch];
    }

    /// @inheritdoc ILendingManager
    function weightByEpochsRangeOf(
        address lender,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _lendersEpochsWeight[lender][epoch];
        }
        return result;
    }

    function _increaseDuration(address lender, uint64 duration) internal {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();

        IStakingManagerPermissioned(stakingManager).increaseDuration(lender, duration);
        IStakingManagerPermissioned.Stake memory stake = IStakingManagerPermissioned(stakingManager).stakeOf(lender);

        uint64 blockTimestamp = uint64(block.timestamp);
        uint16 startEpoch = currentEpoch + 1;
        // if startDate hasn't just been reset(increasing duration where block.timestamp < oldEndDate) it means that we have to count the epoch next to the current endEpoch one
        uint16 numberOfEpochs = uint16((stake.endDate - blockTimestamp) / epochDuration) -
            (stake.startDate == blockTimestamp ? 1 : 0);
        uint16 endEpoch = uint16(startEpoch + numberOfEpochs - 1);
        uint32 truncatedAmount = Helpers.truncate(stake.amount);

        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            uint32 weight = truncatedAmount * ((endEpoch - epoch) + 1);

            // reset old weight in order to update with the new ones or just update the _epochsTotalLendedAmount if the epoch is a "clean" one
            if (_lendersEpochsWeight[lender][epoch] != 0) {
                uint32 oldWeight = _lendersEpochsWeight[lender][epoch];
                _epochTotalWeight[epoch] -= oldWeight;
                _lendersEpochsWeight[lender][epoch] -= oldWeight;
            } else {
                _epochsTotalLendedAmount[epoch] += truncatedAmount;
            }
            _epochTotalWeight[epoch] += weight;
            _lendersEpochsWeight[lender][epoch] += weight;

            unchecked {
                ++epoch;
            }
        }

        emit DurationIncreased(lender, endEpoch);
    }

    function _updateWeights(address lender, uint256 amount, uint64 duration) internal {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();

        uint16 startEpoch = currentEpoch + 1;
        uint16 numberOfEpochs = uint16(duration / epochDuration);
        uint16 endEpoch = uint16(currentEpoch + numberOfEpochs - 1);

        if (endEpoch - startEpoch > lendMaxEpochs) {
            revert Errors.LendPeriodTooBig();
        }

        if (_lendersEpochsWeight[lender].length == 0) {
            _lendersEpochsWeight[lender] = new uint32[](Constants.AVAILABLE_EPOCHS);
        }

        uint32 truncatedAmount = Helpers.truncate(amount);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            uint32 weight = truncatedAmount * ((endEpoch - epoch) + 1);
            _epochTotalWeight[epoch] += weight;
            _lendersEpochsWeight[lender][epoch] += weight;
            _epochsTotalLendedAmount[epoch] += truncatedAmount;

            unchecked {
                ++epoch;
            }
        }

        emit Lended(lender, startEpoch, endEpoch, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}
}
