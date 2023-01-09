// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IStakingManager} from "../interfaces/external/IStakingManager.sol";
import {IBorrowingManager} from "../interfaces/IBorrowingManager.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";

contract BorrowingManager is
    IBorrowingManager,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(uint256 => uint256) private _epochsTotalLendedAmount;
    mapping(uint256 => uint256) private _epochsTotalBorrowedAmount;

    mapping(address => mapping(uint256 => uint256)) private _lenderEpochsLendedAmount;
    mapping(address => mapping(uint256 => uint256)) private _userEpochsBorrowedAmount;

    mapping(address => uint256) private _lendersLoanEndEpoch;
    mapping(address => uint256) private _lendersLoanStartEpoch;

    mapping(address => mapping(uint256 => uint256)) private _totalEpochsAssetsInterestAmount;

    mapping(address => mapping(uint256 => mapping(address => uint256))) private _lendersEpochsAssetsInterestsClaim;

    mapping(uint256 => uint256) private _epochTotalEpochsLeft;
    mapping(uint256 => uint256) private _epochsNumberOfLends;

    address public stakingManager;
    address public token;
    address public epochsManager;

    function initialize(address stakingManager_, address token_, address epochsManager_) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        stakingManager = stakingManager_;
        token = token_;
        epochsManager = epochsManager_;
    }

    /// @inheritdoc IBorrowingManager
    function borrow(
        uint256 amount,
        uint256 numberOfEpochs,
        address borrower,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyRole(Roles.BORROW_ROLE) returns (uint256, uint256) {
        if (numberOfEpochs == 0) revert Errors.InvalidNumberOfEpochs();
        if (amount == 0) revert Errors.InvalidAmount();

        uint256 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint256 nextEpoch = currentEpoch + 1;
        uint256 endEpoch = nextEpoch + numberOfEpochs - 1;

        for (uint256 epoch = nextEpoch; epoch <= endEpoch; ) {
            if (_epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch] >= amount) {
                _epochsTotalBorrowedAmount[epoch] += amount;
                _userEpochsBorrowedAmount[borrower][epoch] += amount;
                uint256 _userBorrowedEpochAmount = _userEpochsBorrowedAmount[borrower][epoch];

                if (_userBorrowedEpochAmount < minAmount || _userBorrowedEpochAmount > maxAmount) {
                    revert Errors.InvalidAmount();
                }
            } else {
                revert Errors.AmountNotAvailableInEpoch(epoch);
            }

            unchecked {
                ++epoch;
            }
        }

        emit Borrowed(borrower, nextEpoch, numberOfEpochs, amount);
        return (nextEpoch, endEpoch);
    }

    /// @inheritdoc IBorrowingManager
    function borrowableAmountByEpoch(uint256 epoch) external view returns (uint256) {
        return _epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function borrowedAmountByEpochOf(address borrower, uint256 epoch) external view returns (uint256) {
        return _userEpochsBorrowedAmount[borrower][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function claimableAssetAmountByEpochOf(address lender, address asset, uint256 epoch) public view returns (uint256) {
        uint256 size = _epochsTotalLendedAmount[epoch];
        uint256 amountWeight = size > 0 ? (_lenderEpochsLendedAmount[lender][epoch] * 10 ** 18) / size : 0;

        uint256 lenderLoanEndEpoch = _lendersLoanEndEpoch[lender];
        if (epoch > lenderLoanEndEpoch) return 0;

        uint256 lenderEpochsLeft = 1 + lenderLoanEndEpoch - epoch;
        uint256 totalEpochsLeft = _epochTotalEpochsLeft[epoch];
        uint256 epochsWeight = totalEpochsLeft > 0 ? (lenderEpochsLeft * 10 ** 18) / totalEpochsLeft : 0;

        uint256 weight = (amountWeight + epochsWeight) / 2;

        return
            ((_totalEpochsAssetsInterestAmount[asset][epoch] * weight) / 10 ** 18) -
            _lendersEpochsAssetsInterestsClaim[lender][epoch][asset];
    }

    /// @inheritdoc IBorrowingManager
    function claimableAssetsAmountByEpochsRangeOf(
        address lender,
        address[] memory assets,
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[]((endEpoch - startEpoch + 1) * assets.length);
        for (uint256 epoch = startEpoch; epoch <= endEpoch; epoch++) {
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
    function claimInterest(address asset, uint256 epoch) external {
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
    function depositInterest(address asset, uint256 epoch, uint256 amount) external onlyRole(Roles.DEPOSIT_INTEREST) {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        _totalEpochsAssetsInterestAmount[asset][epoch] += amount;
        emit InterestDeposited(asset, amount, epoch);
    }

    /// @inheritdoc IBorrowingManager
    function lendedAmountByEpochOf(address lender, uint256 epoch) external view returns (uint256) {
        return _lenderEpochsLendedAmount[lender][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function lendedAmountByEpochsRangeOf(
        address lender,
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](endEpoch - startEpoch + 1);
        for (uint256 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _lenderEpochsLendedAmount[lender][epoch];
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function loanStartEpochOf(address lender) external view returns (uint256) {
        return _lendersLoanStartEpoch[lender];
    }

    /// @inheritdoc IBorrowingManager
    function loanEndEpochOf(address lender) external view returns (uint256) {
        return _lendersLoanEndEpoch[lender];
    }

    /// @inheritdoc IBorrowingManager
    function totalBorrowedAmountByEpoch(uint256 epoch) external view returns (uint256) {
        return _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalLendedAmountByEpoch(uint256 epoch) external view returns (uint256) {
        return _epochsTotalLendedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalLendedAmountByEpochsRange(
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](endEpoch - startEpoch + 1);
        for (uint256 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _epochsTotalLendedAmount[epoch];
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function lend(uint256 amount, uint64 lockTime, address receiver) external {
        address lender = _msgSender();
        IERC20Upgradeable(token).safeTransferFrom(lender, address(this), amount);
        IERC20Upgradeable(token).approve(stakingManager, amount);
        IStakingManager(stakingManager).stake(amount, lockTime, receiver);
        _increaseLendedAmountByLockTime(lender, amount, lockTime);
    }

    /// @inheritdoc IBorrowingManager
    function release(address borrower, uint256 epoch) external onlyRole(Roles.RELEASE_ROLE) {
        _release(borrower, epoch);
    }

    /// @inheritdoc IBorrowingManager
    function totalAssetInterestAmountByEpoch(address asset, uint256 epoch) external view returns (uint256) {
        return _totalEpochsAssetsInterestAmount[asset][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalEpochsLeftByEpoch(uint256 epoch) external view returns (uint256) {
        return _epochTotalEpochsLeft[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function utilizationRatioByEpoch(uint256 epoch) public view returns (uint256) {
        uint256 size = _epochsTotalLendedAmount[epoch];
        return size > 0 ? (_epochsTotalBorrowedAmount[epoch] * 10 ** 18) / size : 0;
    }

    /// @inheritdoc IBorrowingManager
    function utilizationRatioByEpochsRange(
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](endEpoch - startEpoch + 1);
        for (uint256 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = utilizationRatioByEpoch(epoch);
        }
        return result;
    }

    function _increaseLendedAmountByLockTime(address lender, uint256 amount, uint256 lockTime) internal {
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint256 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        uint256 startEpoch = currentEpoch + 1;
        uint256 numberOfEpochs = lockTime / epochDuration;
        uint256 endEpoch = currentEpoch + numberOfEpochs - 1;
        uint256 lenderCurrentLoanEndEpoch = _lendersLoanEndEpoch[lender];
        uint256 lenderCurrentLoanStartEpoch = _lendersLoanStartEpoch[lender];

        uint256 effectiveStartEpoch = startEpoch;
        // if a lender increases his position where the currentEpoch is less than the current
        // end epoch, the start epoch should be preserved when updating the _epochTotalEpochsLeft
        if (currentEpoch < lenderCurrentLoanEndEpoch && currentEpoch >= lenderCurrentLoanStartEpoch) {
            // if a lender increase his position where the currentEpoch is less than the current end epoch
            // we have to reset  _epochTotalEpochsLeft[epoch] based on lender's previous start & end epochs
            // in order to don't update twice the _epochTotalEpochsLeft[epoch]
            if (
                startEpoch >= lenderCurrentLoanStartEpoch &&
                endEpoch >= lenderCurrentLoanEndEpoch &&
                //currentEpoch <= lenderCurrentLoanEndEpoch &&
                (lenderCurrentLoanEndEpoch - lenderCurrentLoanStartEpoch > 0)
            ) {
                for (uint256 epoch = lenderCurrentLoanStartEpoch; epoch <= lenderCurrentLoanEndEpoch; ) {
                    _epochTotalEpochsLeft[epoch] -= (lenderCurrentLoanEndEpoch - epoch) + 1;
                    unchecked {
                        ++epoch;
                    }
                }
            }

            effectiveStartEpoch = lenderCurrentLoanStartEpoch;
        }

        if (endEpoch >= lenderCurrentLoanEndEpoch) {
            for (uint256 epoch = effectiveStartEpoch; epoch <= endEpoch; ) {
                _epochTotalEpochsLeft[epoch] += (endEpoch - epoch) + 1;
                unchecked {
                    ++epoch;
                }
            }
        }

        // the _epochsTotalLendedAmount instead, should be updated by using the new start & end epoch
        for (uint256 epoch = startEpoch; epoch <= endEpoch; ) {
            _epochsTotalLendedAmount[epoch] += amount;
            _lenderEpochsLendedAmount[lender][epoch] += amount;

            emit LendedAmountIncreased(epoch, amount);
            unchecked {
                ++epoch;
            }
        }

        if (startEpoch > lenderCurrentLoanEndEpoch) {
            _lendersLoanStartEpoch[lender] = startEpoch;
        }

        if (endEpoch > lenderCurrentLoanEndEpoch) {
            _lendersLoanEndEpoch[lender] = endEpoch;
        }
    }

    function _release(address borrower, uint256 epoch) internal {
        uint256 userBorrowedAmount = _userEpochsBorrowedAmount[borrower][epoch];
        if (userBorrowedAmount == 0) revert Errors.NothingToRelease(borrower, epoch);
        delete _userEpochsBorrowedAmount[borrower][epoch];
        _epochsTotalLendedAmount[epoch] += userBorrowedAmount;
        emit Released(borrower, epoch, userBorrowedAmount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
