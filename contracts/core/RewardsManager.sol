// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IDandelionVoting} from "../interfaces/external/IDandelionVoting.sol";
import {IMinimeToken} from "../interfaces/external/IMinimeToken.sol";
import {ITokenManager} from "../interfaces/external/ITokenManager.sol";
import {IRewardsManager} from "../interfaces/IRewardsManager.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {Errors} from "../libraries/Errors.sol";
import {Roles} from "../libraries/Roles.sol";

contract RewardsManager is IRewardsManager, Initializable, UUPSUpgradeable, AccessControlEnumerableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    address public epochsManager;
    address public dandelionVoting;
    uint256 public maxTotalSupply;
    address public token;
    address public tokenManager;

    mapping(uint16 => uint256) public depositedAmountByEpoch;
    mapping(uint16 => uint256) public claimedAmountByEpoch;
    mapping(uint16 => uint256) public unclaimableAmountByEpoch;
    mapping(uint16 => mapping(address => uint256)) public lockedRewardByEpoch;

    event RewardRegistered(uint16 indexed epoch, address indexed staker, uint256 amount);

    function initialize(
        address _epochsManager,
        address _dandelionVoting,
        address _token,
        address _tokenManager,
        uint256 _maxTotalSupply
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

        epochsManager = _epochsManager;
        dandelionVoting = _dandelionVoting;
        token = _token;
        tokenManager = _tokenManager;
        maxTotalSupply = _maxTotalSupply;
    }

    function claimRewardByEpoch(uint16 epoch) external {
        address sender = _msgSender();
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (currentEpoch - epoch < 12) revert Errors.TooEarly();
        uint256 amount = lockedRewardByEpoch[epoch][sender];
        if (amount > 0) {
            ITokenManager(tokenManager).burn(sender, amount);
            IERC20Upgradeable(token).safeTransfer(sender, amount);
            delete lockedRewardByEpoch[epoch][sender];
            claimedAmountByEpoch[epoch] += amount;
        } else revert Errors.NothingToClaim();
    }

    function depositForEpoch(uint16 epoch, uint256 amount) external onlyRole(Roles.DEPOSIT_REWARD_ROLE) {
        address sender = _msgSender();
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (epoch < currentEpoch) revert Errors.InvalidEpoch();
        IERC20Upgradeable(token).safeTransferFrom(sender, address(this), amount);
        depositedAmountByEpoch[epoch] += amount;
    }

    function registerRewardsForEpoch(uint16 epoch, address[] calldata stakers) external {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (epoch >= currentEpoch) revert Errors.InvalidEpoch();
        for (uint256 i = 0; i < stakers.length; i++) {
            if (lockedRewardByEpoch[epoch][stakers[i]] > 0) continue;
            bool hasVoted = _hasVotedInEpoch(epoch, stakers[i]);
            uint256 amount = _calculateStakerRewardForEpoch(epoch, stakers[i]);
            if (hasVoted && amount > 0) {
                ITokenManager(tokenManager).mint(stakers[i], amount);
                _checkTotalSupply();
                lockedRewardByEpoch[epoch][stakers[i]] = amount;
                emit RewardRegistered(epoch, stakers[i], amount);
            } else if (amount > 0) {
                unclaimableAmountByEpoch[epoch] += amount;
            }
        }
    }

    function withdrawUnclaimableRewardsForEpoch(uint16 epoch) external onlyRole(Roles.WITHDRAW_ROLE) {
        if (unclaimableAmountByEpoch[epoch] > 0) {
            address sender = _msgSender();
            IERC20Upgradeable(token).safeTransfer(sender, unclaimableAmountByEpoch[epoch]);
            delete unclaimableAmountByEpoch[epoch];
        } else revert Errors.NothingToWithdraw();
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}

    function _calculateStakerRewardForEpoch(uint16 epoch, address staker) private returns (uint256) {
        address minime = ITokenManager(tokenManager).token();
        (, , , uint64 snapshotBlock) = _getLastVoteInEpoch(epoch);
        uint256 supply = IMinimeToken(minime).totalSupplyAt(snapshotBlock);
        uint256 balance = IMinimeToken(minime).balanceOfAt(staker, snapshotBlock);
        return (depositedAmountByEpoch[epoch] * balance) / supply;
    }

    function _checkTotalSupply() internal {
        address minime = ITokenManager(tokenManager).token();
        if (IERC20Upgradeable(minime).totalSupply() > maxTotalSupply) {
            revert Errors.MaxTotalSupplyExceeded();
        }
    }

    function _getEpochTimestamps(uint16 epoch) private view returns (uint256, uint256) {
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint256 startFirstEpochTimestamp = IEpochsManager(epochsManager).startFirstEpochTimestamp();
        uint256 epochStartDate = startFirstEpochTimestamp + (epoch * epochDuration);
        uint256 epochEndDate = epochStartDate + epochDuration - 1;
        return (epochStartDate, epochEndDate);
    }

    function _getLastVoteInEpoch(uint16 epoch) private returns (uint256, uint64, uint64, uint64) {
        uint256 numberOfVotes = IDandelionVoting(dandelionVoting).votesLength();
        uint64 voteDuration = IDandelionVoting(dandelionVoting).duration();
        (uint256 epochStartDate, uint256 epochEndDate) = _getEpochTimestamps(epoch);
        for (uint256 voteId = numberOfVotes; voteId >= 1; ) {
            (, , uint64 startDate, uint64 executionDate, uint64 snapshotBlock, , , , , , ) = IDandelionVoting(
                dandelionVoting
            ).getVote(voteId);
            uint64 voteEndDate = startDate + voteDuration;
            if (voteEndDate >= epochStartDate && voteEndDate <= epochEndDate) {
                return (voteId, startDate, executionDate, snapshotBlock);
            }
            unchecked {
                --voteId;
            }
        }
        revert Errors.NoVoteInEpoch();
    }

    function _hasVotedInEpoch(uint16 epoch, address staker) private returns (bool) {
        uint256 numberOfVotes = IDandelionVoting(dandelionVoting).votesLength();
        uint64 voteDuration = IDandelionVoting(dandelionVoting).duration();
        (uint256 epochStartDate, uint256 epochEndDate) = _getEpochTimestamps(epoch);
        for (uint256 voteId = numberOfVotes; voteId >= 1; ) {
            (, , uint64 voteStartDate, , , , , , , , ) = IDandelionVoting(dandelionVoting).getVote(voteId);

            uint64 voteEndDate = voteStartDate + voteDuration;
            if (voteEndDate >= epochStartDate && voteEndDate <= epochEndDate) {
                if (
                    IDandelionVoting(dandelionVoting).getVoterState(voteId, staker) !=
                    IDandelionVoting.VoterState.Absent
                ) {
                    unchecked {
                        return true;
                    }
                }
            }
            unchecked {
                --voteId;
            }
        }

        return false;
    }
}
