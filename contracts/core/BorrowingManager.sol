// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IStakingManager} from "../interfaces/IStakingManager.sol";
import {IBorrowingManager} from "../interfaces/IBorrowingManager.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/Constants.sol";
import {Helpers} from "../libraries/Helpers.sol";

contract BorrowingManager is
    IBorrowingManager,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => uint32[]) private _lendersEpochsWeight;
    mapping(address => mapping(uint256 => uint256)) private _totalEpochsAssetsInterestAmount;
    mapping(address => mapping(uint256 => mapping(address => uint256))) private _lendersEpochsAssetsInterestsClaim;

    uint24[] private _epochsTotalLendedAmount;
    uint24[] private _epochsTotalBorrowedAmount;
    uint32[] private _epochTotalWeight;

    address public stakingManager;
    address public token;
    address public epochsManager;
    uint16 public lendMaxEpochs;

    function initialize(
        address _stakingManager,
        address _token,
        address _epochsManager,
        uint16 _lendMaxEpochs
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        stakingManager = _stakingManager;
        token = _token;
        epochsManager = _epochsManager;
        lendMaxEpochs = _lendMaxEpochs;

        _epochsTotalLendedAmount = new uint24[](100);
        _epochsTotalBorrowedAmount = new uint24[](100);
        _epochTotalWeight = new uint32[](100);
    }

    /// @inheritdoc IBorrowingManager
    function borrow(
        uint256 amount,
        uint16 numberOfEpochs,
        address borrower
    ) external onlyRole(Roles.BORROW_ROLE) returns (uint16, uint16) {
        if (numberOfEpochs == 0) revert Errors.InvalidNumberOfEpochs();
        if (amount == 0) revert Errors.InvalidAmount();

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint16 nextEpoch = currentEpoch + 1;
        uint16 endEpoch = nextEpoch + numberOfEpochs - 1;
        uint24 truncatedAmount = Helpers.truncate(amount, 0);

        for (uint16 epoch = nextEpoch; epoch <= endEpoch; ) {
            if (_epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch] >= truncatedAmount) {
                _epochsTotalBorrowedAmount[epoch] += truncatedAmount;
            } else {
                revert Errors.AmountNotAvailableInEpoch(epoch);
            }

            unchecked {
                ++epoch;
            }
        }

        emit Borrowed(borrower, nextEpoch, endEpoch, amount);
        return (nextEpoch, endEpoch);
    }

    /// @inheritdoc IBorrowingManager
    function borrowableAmountByEpoch(uint16 epoch) external view returns (uint24) {
        return _epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function claimableAssetAmountByEpochOf(address lender, address asset, uint16 epoch) public view returns (uint256) {
        if (_lendersEpochsWeight[lender].length == 0) return 0;
        uint256 percentage = (uint256(_lendersEpochsWeight[lender][epoch]) * Constants.DECIMALS_PRECISION) /
            _epochTotalWeight[epoch];

        return
            ((_totalEpochsAssetsInterestAmount[asset][epoch] * percentage) / Constants.DECIMALS_PRECISION) -
            _lendersEpochsAssetsInterestsClaim[lender][epoch][asset];
    }

    /// @inheritdoc IBorrowingManager
    function claimableAssetsAmountByEpochsRangeOf(
        address lender,
        address[] calldata assets,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[]((endEpoch - startEpoch + 1) * assets.length);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            for (uint i = 0; i < assets.length; i++) {
                result[((epoch - startEpoch) * assets.length) + i] = claimableAssetAmountByEpochOf(
                    lender,
                    assets[i],
                    epoch
                );
            }
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function claimInterestByEpoch(address asset, uint16 epoch) external {
        address lender = _msgSender();

        if (epoch > IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        uint256 amount = claimableAssetAmountByEpochOf(lender, asset, epoch);
        if (amount == 0) {
            revert Errors.NothingToClaim();
        }

        _lendersEpochsAssetsInterestsClaim[lender][epoch][asset] += amount;
        IERC20Upgradeable(asset).safeTransfer(lender, amount);

        emit InterestClaimed(lender, asset, epoch, amount);
    }

    /// @inheritdoc IBorrowingManager
    function claimInterestByEpochsRange(address asset, uint16 startEpoch, uint16 endEpoch) external {
        address lender = _msgSender();
        uint256 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        if (startEpoch > currentEpoch || endEpoch > currentEpoch) {
            revert Errors.InvalidEpoch();
        }

        uint256 cumulativeAmount = 0;
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            uint256 amount = claimableAssetAmountByEpochOf(lender, asset, epoch);
            if (amount == 0) {
                continue;
            }

            _lendersEpochsAssetsInterestsClaim[lender][epoch][asset] += amount;
            cumulativeAmount += amount;
            emit InterestClaimed(lender, asset, epoch, amount);

            unchecked {
                ++epoch;
            }
        }

        IERC20Upgradeable(asset).safeTransfer(lender, cumulativeAmount);
    }

    /// @inheritdoc IBorrowingManager
    function depositInterest(
        address asset,
        uint16 epoch,
        uint256 amount
    ) external onlyRole(Roles.DEPOSIT_INTEREST_ROLE) {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        _totalEpochsAssetsInterestAmount[asset][epoch] += amount;
        emit InterestDeposited(asset, epoch, amount);
    }

    /// @inheritdoc IBorrowingManager
    function lend(uint256 amount, uint64 lockTime, address receiver) external {
        address lender = _msgSender();
        IERC20Upgradeable(token).safeTransferFrom(lender, address(this), amount);

        IERC20Upgradeable(token).approve(stakingManager, amount);
        IStakingManager(stakingManager).stake(amount, lockTime, lender);

        _updateWeights(receiver, amount, lockTime);
    }

    /// @inheritdoc IBorrowingManager
    function totalBorrowedAmountByEpoch(uint16 epoch) external view returns (uint24) {
        return _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalBorrowedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint24[] memory) {
        uint24[] memory result = new uint24[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochsTotalBorrowedAmount[epoch];
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function totalLendedAmountByEpoch(uint16 epoch) external view returns (uint24) {
        return _epochsTotalLendedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalLendedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint24[] memory) {
        uint24[] memory result = new uint24[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochsTotalLendedAmount[epoch];
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function release(address borrower, uint16 epoch, uint256 amount) external onlyRole(Roles.RELEASE_ROLE) {
        _epochsTotalLendedAmount[epoch] += uint24(Helpers.truncate(amount, 0));
        emit Released(borrower, epoch, amount);
    }

    /// @inheritdoc IBorrowingManager
    function totalAssetInterestAmountByEpoch(address asset, uint16 epoch) external view returns (uint256) {
        return _totalEpochsAssetsInterestAmount[asset][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalWeightByEpoch(uint16 epoch) external view returns (uint32) {
        return _epochTotalWeight[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalWeightByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochTotalWeight[epoch];
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function utilizationRatioByEpoch(uint16 epoch) public view returns (uint24) {
        uint24 size = _epochsTotalLendedAmount[epoch];
        return
            size > 0 ? uint24((uint256(_epochsTotalBorrowedAmount[epoch]) * Constants.DECIMALS_PRECISION) / size) : 0;
    }

    /// @inheritdoc IBorrowingManager
    function utilizationRatioByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint24[] memory) {
        uint24[] memory result = new uint24[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = utilizationRatioByEpoch(epoch);
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function weightByEpochOf(address lender, uint16 epoch) external view returns (uint32) {
        return _lendersEpochsWeight[lender][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function weightByEpochsRangeOf(
        address lender,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint32[] memory) {
        uint32[] memory result = new uint32[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _lendersEpochsWeight[lender][epoch];
        }
        return result;
    }

    /*function _prepareLend(
        address lender,
        uint64 lockTime,
        uint16 currentEpoch,
        uint256 epochDuration,
        uint256 startFirstEpochTimestamp
    ) internal {
        IStakingManager.Stake memory stake = IStakingManager(stakingManager).stakeOf(lender);
        if (stake.amount == 0) return;

        uint16 stakeEpoch = uint16((stake.startDate - startFirstEpochTimestamp) / epochDuration);
        uint16 oldEndEpoch = (stakeEpoch +
            uint16((stake.endDate - startFirstEpochTimestamp) / epochDuration) -
            1);
        uint16 newStartEpoch = currentEpoch + 1;
        uint16 newEndEpoch = (currentEpoch + uint16(lockTime / epochDuration)) - 1;

        uint24 truncatedLockAmount = Helpers.truncate(stake.amount, 0);
        if (newStartEpoch <= oldEndEpoch && newEndEpoch >= oldEndEpoch) {
            for (uint16 epoch = newStartEpoch; epoch <= oldEndEpoch; ) {
                _epochsTotalLendedAmount[epoch] -= truncatedLockAmount;
                _epochTotalWeight[epoch] -= _lendersEpochsWeight[lender][epoch];
                unchecked {
                    ++epoch;
                }
            }
        }
    }*/

    function _updateWeights(address lender, uint256 amount, uint64 lockTime) internal {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();

        uint16 startEpoch = currentEpoch + 1;
        uint16 numberOfEpochs = uint16(lockTime / epochDuration);
        uint16 endEpoch = uint16(currentEpoch + numberOfEpochs - 1);

        if (endEpoch - startEpoch > lendMaxEpochs) {
            revert Errors.LendPeriodTooBig();
        }

        if (_lendersEpochsWeight[lender].length == 0) {
            _lendersEpochsWeight[lender] = new uint32[](36);
        }

        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            uint24 weight = Helpers.truncate(amount, 0) * ((endEpoch - epoch) + 1);
            _epochTotalWeight[epoch] += weight;
            _lendersEpochsWeight[lender][epoch] += weight;
            _epochsTotalLendedAmount[epoch] += Helpers.truncate(amount, 0);

            unchecked {
                ++epoch;
            }
        }

        emit Lended(lender, startEpoch, endEpoch, amount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
