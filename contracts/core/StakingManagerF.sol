// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IStakingManagerF} from "../interfaces/IStakingManagerF.sol";
import {IForwarderHost} from "../interfaces/IForwarderHost.sol";
import {ITokenManager} from "../interfaces/external/ITokenManager.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/Constants.sol";
import {Roles} from "../libraries/Roles.sol";

contract StakingManagerF is
    IStakingManagerF,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => Stake) private _stakes;

    address public token;
    address public tokenManager;
    address public forwarderHost;

    function initialize(address _token, address _tokenManager) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        token = _token;
        tokenManager = _tokenManager;
    }

    /// @inheritdoc IStakingManagerF
    function increaseDuration(uint64 duration) external {
        address owner = _msgSender();

        Stake storage st = _stakes[owner];
        uint64 startDate = st.startDate;
        uint64 endDate = st.endDate;
        uint64 blockTimestamp = uint64(block.timestamp);

        if (st.amount == 0) {
            revert Errors.NothingAtStake();
        }

        if (endDate < blockTimestamp) {
            st.startDate = blockTimestamp;
            st.endDate = blockTimestamp + duration;
        } else {
            st.endDate = startDate + (endDate - startDate) + duration;
        }

        emit DurationIncreased(owner, duration);
    }

    /// @inheritdoc IStakingManagerF
    function setForwarderHost(address _forwarderHost) external onlyRole(Roles.SET_FORWARDER_HOST_ROLE) {
        forwarderHost = _forwarderHost;
    }

    /// @inheritdoc IStakingManagerF
    function stake(uint256 amount, uint64 duration, address receiver) external {
        if (duration < Constants.MIN_STAKE_DURATION) {
            revert Errors.InvalidDuration();
        }

        if (amount == 0) {
            revert Errors.InvalidAmount();
        }

        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);

        Stake storage st = _stakes[receiver];
        uint64 blockTimestamp = uint64(block.timestamp);
        uint64 currentEndDate = st.endDate;
        uint64 newEndDate = blockTimestamp + duration;

        st.amount += amount;
        st.endDate = newEndDate >= currentEndDate ? newEndDate : currentEndDate;
        st.startDate = blockTimestamp;

        ITokenManager(tokenManager).mint(receiver, amount);

        emit Staked(receiver, amount, duration);
    }

    /// @inheritdoc IStakingManagerF
    function stakeOf(address owner) external view returns (Stake memory) {
        return _stakes[owner];
    }

    /// @inheritdoc IStakingManagerF
    function unstake(uint256 amount) external {
        address owner = _msgSender();
        Stake storage st = _stakes[owner];
        uint256 stAmount = st.amount;

        if (st.endDate > block.timestamp) {
            revert Errors.UnfinishedStakingPeriod();
        }

        if (amount > stAmount) {
            revert Errors.InvalidAmount();
        }

        uint256 newStakeAmount = stAmount -= amount;
        if (newStakeAmount == 0) {
            delete st.startDate;
            delete st.endDate;
            delete st.amount;
        } else {
            st.amount = newStakeAmount;
        }

        ITokenManager(tokenManager).burn(owner, amount);
        IERC20Upgradeable(token).approve(forwarderHost, amount);
        IForwarderHost(forwarderHost).unstake(amount, owner);

        emit Unstaked(owner, amount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
