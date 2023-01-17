// SPDX-License-Identifier: MIT
/*
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

    mapping(address => uint16) private _lendersLoanEndEpoch;
    mapping(address => uint16) private _lendersLoanStartEpoch;

    mapping(address => uint24[]) _lendersEpochsLendedAmount;
    mapping(address => uint24[]) _borrowersEpochsBorrowedAmount;

    mapping(address => mapping(uint256 => uint256)) private _totalEpochsAssetsInterestAmount;
    mapping(address => mapping(uint256 => mapping(address => uint256))) private _lendersEpochsAssetsInterestsClaim;

    uint16[] private _epochTotalEpochsLeft;
    uint24[] private _epochsTotalLendedAmount;
    uint24[] private _epochsTotalBorrowedAmount;

    address public stakingManager;
    address public token;
    address public epochsManager;
    uint16 public lendMaxEpochs;

    function initialize(
        address stakingManager_,
        address token_,
        address epochsManager_,
        uint16 _lendMaxEpochs
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        stakingManager = stakingManager_;
        token = token_;
        epochsManager = epochsManager_;
        lendMaxEpochs = _lendMaxEpochs;

        _epochTotalEpochsLeft = new uint16[](100);
        _epochsTotalLendedAmount = new uint24[](100);
        _epochsTotalBorrowedAmount = new uint24[](100);
    }

    /// @inheritdoc IBorrowingManager
    function borrow(
        uint256 amount,
        uint16 numberOfEpochs,
        address borrower,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyRole(Roles.BORROW_ROLE) returns (uint16, uint16) {
        if (numberOfEpochs == 0) revert Errors.InvalidNumberOfEpochs();
        if (amount == 0) revert Errors.InvalidAmount();

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint16 nextEpoch = currentEpoch + 1;
        uint16 endEpoch = nextEpoch + numberOfEpochs - 1;
        uint24 truncatedAmount = Helpers.truncate(amount, Constants.PRECISION);

        if (_borrowersEpochsBorrowedAmount[borrower].length == 0) {
            _borrowersEpochsBorrowedAmount[borrower] = new uint24[](100);
        }

        for (uint16 epoch = nextEpoch; epoch <= endEpoch; ) {
            if (_epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch] >= truncatedAmount) {
                _epochsTotalBorrowedAmount[epoch] += truncatedAmount;
                _borrowersEpochsBorrowedAmount[borrower][epoch] += truncatedAmount;
                uint256 _userBorrowedEpochAmount = _borrowersEpochsBorrowedAmount[borrower][epoch];

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

        emit Borrowed(borrower, nextEpoch, endEpoch, amount);
        return (nextEpoch, endEpoch);
    }

    /// @inheritdoc IBorrowingManager
    function borrowableAmountByEpoch(uint16 epoch) external view returns (uint24) {
        return _epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function borrowedAmountByEpochOf(address borrower, uint16 epoch) external view returns (uint24) {
        return _borrowersEpochsBorrowedAmount[borrower][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function claimableAssetAmountByEpochOf(address lender, address asset, uint16 epoch) public view returns (uint256) {
        uint24[] storage lenderEpochsLendedAmount = _lendersEpochsLendedAmount[lender];
        if (lenderEpochsLendedAmount.length == 0) return 0;

        uint256 size = _epochsTotalLendedAmount[epoch];
        uint256 amountWeight = size > 0 ? (uint256(lenderEpochsLendedAmount[epoch]) * 10 ** 18) / size : 0;

        uint16 lenderLoanEndEpoch = _lendersLoanEndEpoch[lender];
        if (epoch > lenderLoanEndEpoch) return 0;

        uint16 lenderEpochsLeft = 1 + lenderLoanEndEpoch - epoch;
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
    function depositInterest(address asset, uint16 epoch, uint256 amount) external onlyRole(Roles.DEPOSIT_INTEREST) {
        IERC20Upgradeable(asset).safeTransferFrom(_msgSender(), address(this), amount);
        _totalEpochsAssetsInterestAmount[asset][epoch] += amount;
        emit InterestDeposited(asset, epoch, amount);
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
    function lendedAmountByEpochOf(address lender, uint16 epoch) external view returns (uint256) {
        return _lendersEpochsLendedAmount[lender][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function lendedAmountByEpochsRangeOf(
        address lender,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint24[] memory) {
        uint24[] memory result = new uint24[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _lendersEpochsLendedAmount[lender][epoch];
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function loanStartEpochOf(address lender) external view returns (uint16) {
        return _lendersLoanStartEpoch[lender];
    }

    /// @inheritdoc IBorrowingManager
    function loanEndEpochOf(address lender) external view returns (uint16) {
        return _lendersLoanEndEpoch[lender];
    }

    /// @inheritdoc IBorrowingManager
    function totalBorrowedAmountByEpoch(uint16 epoch) external view returns (uint24) {
        return _epochsTotalBorrowedAmount[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalLendedAmountByEpoch(uint16 epoch) external view returns (uint256) {
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
    function release(address borrower, uint16 epoch) external onlyRole(Roles.RELEASE_ROLE) {
        _release(borrower, epoch);
    }

    /// @inheritdoc IBorrowingManager
    function totalAssetInterestAmountByEpoch(address asset, uint16 epoch) external view returns (uint256) {
        return _totalEpochsAssetsInterestAmount[asset][epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalEpochsLeftByEpoch(uint16 epoch) public view returns (uint16) {
        return _epochTotalEpochsLeft[epoch];
    }

    /// @inheritdoc IBorrowingManager
    function totalEpochsLeftByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint16[] memory) {
        uint16[] memory result = new uint16[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = totalEpochsLeftByEpoch(epoch);
        }
        return result;
    }

    /// @inheritdoc IBorrowingManager
    function utilizationRatioByEpoch(uint16 epoch) public view returns (uint256) {
        uint256 size = _epochsTotalLendedAmount[epoch];
        return size > 0 ? (_epochsTotalBorrowedAmount[epoch] * 10 ** 18) / size : 0;
    }

    /// @inheritdoc IBorrowingManager
    function utilizationRatioByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = utilizationRatioByEpoch(epoch);
        }
        return result;
    }

    function _increaseLendedAmountByLockTime(address lender, uint256 amount, uint256 lockTime) internal {
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        uint16 startEpoch = currentEpoch + 1;
        uint16 numberOfEpochs = uint16(lockTime / epochDuration);
        uint16 endEpoch = (currentEpoch + numberOfEpochs) - 1;
        uint16 lenderCurrentLoanEndEpoch = _lendersLoanEndEpoch[lender];
        uint16 lenderCurrentLoanStartEpoch = _lendersLoanStartEpoch[lender];

        if (endEpoch < startEpoch) {
            revert Errors.InvalidLockTime();
        }


        uint16 effectiveStartEpoch = startEpoch;
        // NOTE: if a lender increases his position when the currentEpoch is less than the current
        // end epoch, the start epoch should be preserved when updating the _epochTotalEpochsLeft
        if (currentEpoch < lenderCurrentLoanEndEpoch && currentEpoch >= lenderCurrentLoanStartEpoch) {
            // if a lender increase his position when the currentEpoch is less than the current end epoch
            // we have to reset  _epochTotalEpochsLeft[epoch] based on lender's previous start & end epochs
            // in order to don't update twice the _epochTotalEpochsLeft[epoch]
            if (
                startEpoch >= lenderCurrentLoanStartEpoch &&
                endEpoch >= lenderCurrentLoanEndEpoch &&
                (lenderCurrentLoanEndEpoch - lenderCurrentLoanStartEpoch > 0)
            ) {
                for (uint16 epoch = lenderCurrentLoanStartEpoch; epoch <= lenderCurrentLoanEndEpoch; ) {
                    _epochTotalEpochsLeft[epoch] -= (lenderCurrentLoanEndEpoch - epoch) + 1;
                    unchecked {
                        ++epoch;
                    }
                }
            }

            effectiveStartEpoch = lenderCurrentLoanStartEpoch;
        }

        if (endEpoch >= lenderCurrentLoanEndEpoch) {
            for (uint16 epoch = effectiveStartEpoch; epoch <= endEpoch; ) {
                _epochTotalEpochsLeft[epoch] += uint16((endEpoch - epoch) + 1);
                unchecked {
                    ++epoch;
                }
            }
        }

        if (_lendersEpochsLendedAmount[lender].length == 0) {
            _lendersEpochsLendedAmount[lender] = new uint24[](36);
        }


        // the _epochsTotalLendedAmount instead, should be updated by using the new start & end epoch
        uint24 truncatedValue = Helpers.truncate(amount, Constants.PRECISION);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            _epochsTotalLendedAmount[epoch] += truncatedValue;
            _lendersEpochsLendedAmount[lender][epoch] += truncatedValue;
            unchecked {
                ++epoch;
            }
        }

        if (startEpoch > lenderCurrentLoanEndEpoch) {
            lenderCurrentLoanStartEpoch = startEpoch;
            _lendersLoanStartEpoch[lender] = startEpoch;
        }

        if (endEpoch > lenderCurrentLoanEndEpoch) {
            lenderCurrentLoanEndEpoch = endEpoch;
            _lendersLoanEndEpoch[lender] = endEpoch;
        }

        if (lenderCurrentLoanEndEpoch - lenderCurrentLoanStartEpoch > lendMaxEpochs) {
            revert Errors.LendPeriodTooBig();
        }

        emit Lended(lender, startEpoch, endEpoch, amount);
    }

    function _release(address borrower, uint16 epoch) internal {
        uint256 userBorrowedAmount = _borrowersEpochsBorrowedAmount[borrower][epoch];
        if (userBorrowedAmount == 0) revert Errors.NothingToRelease(borrower, epoch);
        delete _borrowersEpochsBorrowedAmount[borrower][epoch];
        _epochsTotalLendedAmount[epoch] += uint24(userBorrowedAmount);
        // TODO: maybe multiply userBorrowedAmount x 10 ** (18 - precision)?
        emit Released(borrower, epoch, userBorrowedAmount);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
*/