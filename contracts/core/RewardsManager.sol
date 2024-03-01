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
    mapping(uint16 => mapping(address => bool)) private _stakerSeenByEpoch;

    event RewardRegistered(uint16 indexed epoch, address indexed staker, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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

    /// @inheritdoc IRewardsManager
    function changeToken(address token_) external onlyRole(Roles.CHANGE_TOKEN_ROLE) {
        address previousToken = token;
        token = token_;
        emit TokenChanged(previousToken, token);
    }

    /// @inheritdoc IRewardsManager
    function claimRewardByEpoch(uint16 epoch) external {
        address sender = _msgSender();
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (currentEpoch - epoch < 12) revert Errors.TooEarly();
        uint256 amount = lockedRewardByEpoch[epoch][sender];
        if (amount > 0) {
            delete lockedRewardByEpoch[epoch][sender];
            claimedAmountByEpoch[epoch] += amount;
            ITokenManager(tokenManager).burn(sender, amount);
            IERC20Upgradeable(token).safeTransfer(sender, amount);
        } else revert Errors.NothingToClaim();
    }

    /// @inheritdoc IRewardsManager
    function depositForEpoch(uint16 epoch, uint256 amount) external onlyRole(Roles.DEPOSIT_REWARD_ROLE) {
        address sender = _msgSender();
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (epoch < currentEpoch) revert Errors.InvalidEpoch();
        depositedAmountByEpoch[epoch] += amount;
        IERC20Upgradeable(token).safeTransferFrom(sender, address(this), amount);
    }

    /// @inheritdoc IRewardsManager
    function registerRewardsForEpoch(uint16 epoch, address[] calldata stakers) external {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (epoch >= currentEpoch) revert Errors.InvalidEpoch();
        (bool[] memory hasVoted, uint256[] memory amounts) = _getVotesAndBalancesForEpoch(epoch, stakers);
        for (uint256 i = 0; i < stakers.length; i++) {
            if (_stakerSeenByEpoch[epoch][stakers[i]]) continue;
            _stakerSeenByEpoch[epoch][stakers[i]] = true;
            uint256 amount = amounts[i];
            if (hasVoted[i] && amount > 0) {
                lockedRewardByEpoch[epoch][stakers[i]] = amount;
                ITokenManager(tokenManager).mint(stakers[i], amount);
                emit RewardRegistered(epoch, stakers[i], amount);
            } else if (amount > 0) {
                unclaimableAmountByEpoch[epoch] += amount;
            }
        }
        _checkTotalSupply();
    }

    /// @inheritdoc IRewardsManager
    function withdrawUnclaimableRewardsForEpoch(uint16 epoch) external onlyRole(Roles.WITHDRAW_ROLE) {
        uint256 amount = unclaimableAmountByEpoch[epoch];
        if (amount > 0) {
            address sender = _msgSender();
            delete unclaimableAmountByEpoch[epoch];
            IERC20Upgradeable(token).safeTransfer(sender, amount);
        } else revert Errors.NothingToWithdraw();
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}

    function _checkTotalSupply() internal {
        address minime = ITokenManager(tokenManager).token();
        if (IERC20Upgradeable(minime).totalSupply() > maxTotalSupply) {
            revert Errors.MaxTotalSupplyExceeded();
        }
    }

    function _getEpochTimestamps(uint16 epoch) private view returns (uint256, uint256) {
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint256 startFirstEpochTimestamp = IEpochsManager(epochsManager).startFirstEpochTimestamp();
        uint256 epochStartTimestamp = startFirstEpochTimestamp + (epoch * epochDuration);
        uint256 epochEndTimestamp = epochStartTimestamp + epochDuration - 1;
        return (epochStartTimestamp, epochEndTimestamp);
    }

    function _getVotesAndBalancesForEpoch(
        uint16 epoch,
        address[] memory stakers
    ) private returns (bool[] memory, uint256[] memory) {
        IDandelionVoting votingContract = IDandelionVoting(dandelionVoting);
        IMinimeToken minime = IMinimeToken(ITokenManager(tokenManager).token());

        uint256 numberOfVotes = votingContract.votesLength();
        uint64 voteDuration = votingContract.duration();
        (uint256 epochStartTimestamp, uint256 epochEndTimestamp) = _getEpochTimestamps(epoch);

        uint64 lastVoteSnapshotBlock;
        uint256 supply;

        bool[] memory hasVoted = new bool[](stakers.length);
        uint256[] memory amounts = new uint256[](stakers.length);

        for (uint256 voteId = numberOfVotes; voteId >= 1; voteId--) {
            (, , uint64 startTimestamp, , uint64 snapshotBlock, , , , , , ) = votingContract.getVote(voteId);
            uint64 voteEndTimestamp = startTimestamp + voteDuration;
            if (voteEndTimestamp <= epochEndTimestamp) {
                if (voteEndTimestamp < epochStartTimestamp) break;
                if (lastVoteSnapshotBlock == 0) {
                    lastVoteSnapshotBlock = snapshotBlock;
                    supply = minime.totalSupplyAt(lastVoteSnapshotBlock);
                }
                for (uint256 i = 0; i < stakers.length; i++) {
                    if (
                        !hasVoted[i] &&
                        (votingContract.getVoterState(voteId, stakers[i]) != IDandelionVoting.VoterState.Absent)
                    ) hasVoted[i] = true;
                }
            }
        }

        if (lastVoteSnapshotBlock == 0) {
            revert Errors.NoVoteInEpoch();
        }

        for (uint256 i = 0; i < stakers.length; i++) {
            uint256 balance = minime.balanceOfAt(stakers[i], lastVoteSnapshotBlock);
            amounts[i] = (depositedAmountByEpoch[epoch] * balance) / supply;
        }

        return (hasVoted, amounts);
    }
}
