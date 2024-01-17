// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ForwarderRecipientUpgradeable} from "../forwarder/ForwarderRecipientUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IBaseStakingManager} from "../interfaces/IBaseStakingManager.sol";
import {ITokenManager} from "../interfaces/external/ITokenManager.sol";
import {IPToken} from "../interfaces/external/IPToken.sol";
import {Helpers} from "../libraries/Helpers.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/Constants.sol";
import {Roles} from "../libraries/Roles.sol";

abstract contract BaseStakingManager is IBaseStakingManager, Initializable, ForwarderRecipientUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => Stake) private _stakes;
    address public token;
    address public tokenManager;
    uint256 public maxTotalSupply;

    function __BaseStakingManager_init(
        address _token,
        address _tokenManager,
        uint256 _maxTotalSupply
    ) internal onlyInitializing {
        __BaseStakingManager_init_unchained(_token, _tokenManager, _maxTotalSupply);
    }

    function __BaseStakingManager_init_unchained(
        address _token,
        address _tokenManager,
        uint256 _maxTotalSupply
    ) internal onlyInitializing {
        token = _token;
        tokenManager = _tokenManager;
        maxTotalSupply = _maxTotalSupply;
    }

    /// @inheritdoc IBaseStakingManager
    function changeToken(address token_) external onlyRole(Roles.CHANGE_TOKEN_ROLE) {
        address previousToken = token;
        token = token_;
        emit TokenChanged(previousToken, token);
    }

    function changeMaxTotalSupply(uint256 _maxTotalSupply) external onlyRole(Roles.CHANGE_MAX_TOTAL_SUPPLY_ROLE) {
        maxTotalSupply = _maxTotalSupply;
        emit MaxTotalSupplyChanged(_maxTotalSupply);
    }

    /// @inheritdoc IBaseStakingManager
    function slash(address owner, uint256 amount, address receiver) external onlyRole(Roles.SLASH_ROLE) {
        Stake storage stake = _stakes[owner];
        uint256 stakedAmount = stake.amount;
        address stakedToken = stake.token;

        if (amount > stakedAmount || amount == 0) {
            revert Errors.InvalidAmount();
        }

        stake.amount -= amount;

        if (stakedAmount - amount == 0) {
            delete _stakes[owner];
        }

        ITokenManager(tokenManager).burn(owner, amount);
        IERC20Upgradeable(stakedToken).safeTransfer(receiver, amount);
        emit Slashed(owner, amount, receiver);
    }

    /// @inheritdoc IBaseStakingManager
    function stakeOf(address owner) external view returns (Stake memory) {
        return _stakes[owner];
    }

    /// @inheritdoc IBaseStakingManager
    function unstake(uint256 amount, bytes4 chainId) external {
        address msgSender = _msgSender();
        _unstake(msgSender, amount, chainId);
    }

    /// @inheritdoc IBaseStakingManager
    function unstake(address owner, uint256 amount, bytes4 chainId) external onlyForwarder {
        _unstake(owner, amount, chainId);
    }

    function _checkTotalSupply() internal {
        address minime = ITokenManager(tokenManager).token();
        if (IERC20Upgradeable(minime).totalSupply() > maxTotalSupply) {
            revert Errors.MaxTotalSupplyExceeded();
        }
    }

    function _increaseAmount(address owner, uint256 amount) internal {
        if (amount == 0) {
            revert Errors.InvalidAmount();
        }

        Stake storage st = _stakes[owner];
        if (st.amount == 0) {
            revert Errors.NothingAtStake();
        }

        uint64 endDate = st.endDate;
        uint64 blockTimestamp = uint64(block.timestamp);

        if (endDate <= blockTimestamp || endDate - blockTimestamp < Constants.MIN_STAKE_DURATION) {
            revert Errors.InvalidDuration();
        }
        st.amount += amount;

        if (st.token != token) revert Errors.InvalidToken(token, st.token);
        IERC20Upgradeable(st.token).safeTransferFrom(_msgSender(), address(this), amount);
        ITokenManager(tokenManager).mint(owner, amount);

        _checkTotalSupply();
        emit AmountIncreased(owner, amount);
    }

    function _increaseDuration(address owner, uint64 duration) internal {
        Stake storage st = _stakes[owner];
        uint64 endDate = st.endDate;
        uint64 blockTimestamp = uint64(block.timestamp);

        if (st.amount == 0) {
            revert Errors.NothingAtStake();
        }

        if (endDate < blockTimestamp) {
            st.startDate = blockTimestamp;
            st.endDate = blockTimestamp + duration;
        } else {
            st.endDate = endDate + duration;
        }

        emit DurationIncreased(owner, duration);
    }

    function _stake(address receiver, uint256 amount, uint64 duration) internal {
        if (duration < Constants.MIN_STAKE_DURATION) {
            revert Errors.InvalidDuration();
        }

        if (amount == 0) {
            revert Errors.InvalidAmount();
        }

        Stake storage st = _stakes[receiver];
        uint64 blockTimestamp = uint64(block.timestamp);
        uint64 currentEndDate = st.endDate;
        address currentToken = st.token;
        uint64 newEndDate = blockTimestamp + duration;

        if (currentToken == address(0)) {
            st.token = token;
        } else if (currentToken != token)
            revert Errors.InvalidToken(token, currentToken);

        st.amount += amount;
        st.endDate = newEndDate >= currentEndDate ? newEndDate : currentEndDate;
        st.startDate = blockTimestamp;

        IERC20Upgradeable(st.token).safeTransferFrom(_msgSender(), address(this), amount);
        ITokenManager(tokenManager).mint(receiver, amount);

        _checkTotalSupply();
        emit Staked(receiver, amount, duration);
    }

    function _unstake(address owner, uint256 amount, bytes4 chainId) internal {
        Stake storage st = _stakes[owner];
        uint256 stAmount = st.amount;
        address stToken = st.token;

        if (st.endDate > block.timestamp) {
            revert Errors.UnfinishedStakingPeriod();
        }

        if (amount > stAmount) {
            revert Errors.InvalidAmount();
        }

        uint256 newStakeAmount = stAmount -= amount;
        if (newStakeAmount == 0) {
            delete _stakes[owner];
        } else {
            st.amount = newStakeAmount;
        }

        ITokenManager(tokenManager).burn(owner, amount);

        if (chainId == 0x0075dd4c) {
            IERC20Upgradeable(stToken).safeTransfer(owner, amount);
        } else {
            IPToken(stToken).redeem(amount, "", Helpers.addressToAsciiString(owner), chainId);
        }
        emit Unstaked(owner, amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
