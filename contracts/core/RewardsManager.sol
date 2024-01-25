// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IDandelionVoting} from "../interfaces/external/IDandelionVoting.sol";
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

    mapping(uint16 => uint256) depositedAmountByEpoch;
    mapping(uint16 => mapping(address => uint256)) lockedRewardByEpoch;

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

    function claimReward(uint16 epoch) external {
        address sender = _msgSender();
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (currentEpoch - epoch < 12) revert Errors.TooEarly();
        uint256 amount = lockedRewardByEpoch[epoch][sender];
        if (amount > 0) {
            ITokenManager(tokenManager).burn(sender, amount);
            IERC20Upgradeable(token).safeTransfer(sender, amount);
            delete lockedRewardByEpoch[epoch][sender];
        }
    }

    function depositForEpoch(uint16 epoch, uint256 amount) external onlyRole(Roles.DEPOSIT_REWARD_ROLE) {
        address sender = _msgSender();
        IERC20Upgradeable(token).safeTransferFrom(sender, address(this), amount);
        depositedAmountByEpoch[epoch] += amount;
    }

    function registerRewards(uint16 epoch, address[] calldata stakers) external {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        if (epoch >= currentEpoch) revert Errors.InvalidEpoch();
        for (uint256 i = 0; i < stakers.length; ) {
            if (lockedRewardByEpoch[epoch][stakers[i]] > 0) continue;
            if (!_hasVotedInEpoch(epoch, stakers[i])) continue;
            uint256 amount = _calculateRewardForEpoch(epoch, stakers[i]);
            ITokenManager(tokenManager).mint(stakers[i], amount);
            _checkTotalSupply();
            lockedRewardByEpoch[epoch][stakers[i]] = amount;
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}

    function _calculateRewardForEpoch(uint16, address) private pure returns (uint256) {
        return 1;
    }

    function _checkTotalSupply() internal {
        address minime = ITokenManager(tokenManager).token();
        if (IERC20Upgradeable(minime).totalSupply() > maxTotalSupply) {
            revert Errors.MaxTotalSupplyExceeded();
        }
    }

    function _hasVotedInEpoch(uint16 epoch, address staker) private returns (bool) {
        address dandelionVotingAddress = dandelionVoting;
        uint256 numberOfVotes = IDandelionVoting(dandelionVotingAddress).votesLength();
        uint64 voteDuration = IDandelionVoting(dandelionVotingAddress).duration();

        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint256 startFirstEpochTimestamp = IEpochsManager(epochsManager).startFirstEpochTimestamp();

        uint256 epochStartDate = startFirstEpochTimestamp + (epoch * epochDuration);
        uint256 epochEndDate = epochStartDate + epochDuration - 1;

        for (uint256 voteId = numberOfVotes; voteId >= 1; ) {
            (, , uint64 voteStartDate, , , , , , , , ) = IDandelionVoting(dandelionVotingAddress).getVote(voteId);

            uint64 voteEndDate = voteStartDate + voteDuration;
            if (voteEndDate >= epochStartDate && voteEndDate <= epochEndDate) {
                if (
                    IDandelionVoting(dandelionVotingAddress).getVoterState(voteId, staker) !=
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
