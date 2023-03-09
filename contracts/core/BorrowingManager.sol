// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ForwarderRecipientUpgradeable} from "../forwarder/ForwarderRecipientUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IStakingManagerPermissioned} from "../interfaces/IStakingManagerPermissioned.sol";
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
    ForwarderRecipientUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => uint24[]) private _borrowersEpochsBorrowedAmount;
    mapping(address => uint32[]) private _lendersEpochsWeight;
    mapping(address => mapping(uint256 => mapping(address => bool))) private _lendersEpochsAssetsInterestsClaim;
    mapping(address => mapping(uint256 => uint256)) private _totalEpochsAssetsInterestAmount;

    uint24[] private _epochsTotalLendedAmount;
    uint24[] private _epochsTotalBorrowedAmount;
    uint32[] private _epochTotalWeight;

    address public stakingManager;
    address public token;
    address public epochsManager;
    uint16 public lendMaxEpochs;

    function initialize(
        address _token,
        address _stakingManager,
        address _epochsManager,
        address _forwarder,
        uint16 _lendMaxEpochs
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __ForwarderRecipientUpgradeable_init(_forwarder);

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        stakingManager = _stakingManager;
        token = _token;
        epochsManager = _epochsManager;
        lendMaxEpochs = _lendMaxEpochs;

        _epochsTotalLendedAmount = new uint24[](36);
        _epochsTotalBorrowedAmount = new uint24[](36);
        _epochTotalWeight = new uint32[](36);
    }

    /// @inheritdoc IBorrowingManager
    function borrow(uint256 amount, uint16 epoch, address borrower) external onlyRole(Roles.BORROW_ROLE) {
        if (amount == 0) revert Errors.InvalidAmount();
        uint24 truncatedAmount = Helpers.truncate(amount, 0);

        // TODO: is it possible to borrow in the current epoch?

        if (_borrowersEpochsBorrowedAmount[borrower].length == 0) {
            _borrowersEpochsBorrowedAmount[borrower] = new uint24[](36);
        }

        if (_epochsTotalLendedAmount[epoch] - _epochsTotalBorrowedAmount[epoch] < truncatedAmount) {
            revert Errors.AmountNotAvailableInEpoch(epoch);
        }

        _epochsTotalBorrowedAmount[epoch] += truncatedAmount;
        _borrowersEpochsBorrowedAmount[borrower][epoch] += truncatedAmount;

        emit Borrowed(borrower, epoch, amount);
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
    function claimableInterestByEpochOf(address lender, address asset, uint16 epoch) public view returns (uint256) {
        if (_lendersEpochsAssetsInterestsClaim[lender][epoch][asset]) return 0;

        uint256 totalWeight = _epochTotalWeight[epoch];
        if (_lendersEpochsWeight[lender].length == 0 || totalWeight == 0) return 0;
        uint256 percentage = (uint256(_lendersEpochsWeight[lender][epoch]) * Constants.DECIMALS_PRECISION) /
            totalWeight;

        return ((_totalEpochsAssetsInterestAmount[asset][epoch] * percentage) / Constants.DECIMALS_PRECISION);
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
            for (uint8 i = 0; i < assets.length; i++) {
                result[((epoch - startEpoch) * assets.length) + i] = claimableInterestByEpochOf(
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

        if (epoch >= IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        uint256 interest = claimableInterestByEpochOf(lender, asset, epoch);
        if (interest == 0) {
            revert Errors.NothingToClaim();
        }

        _lendersEpochsAssetsInterestsClaim[lender][epoch][asset] = true;
        IERC20Upgradeable(asset).safeTransfer(lender, interest);

        emit InterestClaimed(lender, asset, epoch, interest);
    }

    /// @inheritdoc IBorrowingManager
    function claimInterestByEpochsRange(address asset, uint16 startEpoch, uint16 endEpoch) external {
        address lender = _msgSender();

        if (endEpoch >= IEpochsManager(epochsManager).currentEpoch()) {
            revert Errors.InvalidEpoch();
        }

        uint256 cumulativeInterest = 0;
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            uint256 interest = claimableInterestByEpochOf(lender, asset, epoch);
            if (interest > 0) {
                _lendersEpochsAssetsInterestsClaim[lender][epoch][asset] = true;
                cumulativeInterest += interest;
                emit InterestClaimed(lender, asset, epoch, interest);
            }
            unchecked {
                ++epoch;
            }
        }

        if (cumulativeInterest == 0) {
            revert Errors.NothingToClaim();
        }

        IERC20Upgradeable(asset).safeTransfer(lender, cumulativeInterest);
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
    function increaseDuration(uint64 duration) external {
        _increaseDuration(_msgSender(), duration);
    }

    /// @inheritdoc IBorrowingManager
    function increaseDuration(address lender, uint64 duration) external onlyForwarder {
        _increaseDuration(lender, duration);
    }

    /// @inheritdoc IBorrowingManager
    function lend(address lender, uint256 amount, uint64 duration) external {
        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20Upgradeable(token).approve(stakingManager, amount);
        IStakingManagerPermissioned(stakingManager).stake(lender, amount, duration);
        _updateWeights(lender, amount, duration);
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
        uint24 truncatedAmount = uint24(Helpers.truncate(amount, 0));
        _epochsTotalBorrowedAmount[epoch] -= truncatedAmount;
        _borrowersEpochsBorrowedAmount[borrower][epoch] -= truncatedAmount;
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
        uint24 truncatedAmount = Helpers.truncate(stake.amount, 0);

        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            uint24 weight = truncatedAmount * ((endEpoch - epoch) + 1);

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
